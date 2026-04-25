"""Async-native Postgres pool via asyncpg.

Why: supabase-py is sync. Wrapping it with asyncio.to_thread is workable
but the default executor has 32 threads — 32 concurrent batches that all
hit the DB at the same time will saturate it and queue everything else.
asyncpg uses real cooperative IO, so 200 concurrent queries cost ~200
file descriptors and zero blocked threads.

Scope: ONLY hot-path public queries (gutenberg_reading_info SELECT/UPSERT)
go through asyncpg. User-data tables stay on supabase-py + RLS — switching
those would require re-implementing JWT-scoped queries.

Connection: uses settings.DATABASE_URL (Supabase pooler in prod,
transaction mode). statement_cache_size=0 is REQUIRED with the transaction
pooler — it doesn't support prepared statements across requests.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None and not _pool._closed:  # type: ignore[attr-defined]
        return _pool
    async with _pool_lock:
        if _pool is None or _pool._closed:  # type: ignore[attr-defined]
            if not settings.DATABASE_URL:
                raise RuntimeError(
                    "DATABASE_URL not configured — required for asyncpg pool."
                )
            _pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=2,
                max_size=10,
                statement_cache_size=0,  # transaction-mode pooler compat
                command_timeout=15.0,
            )
        return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None and not _pool._closed:  # type: ignore[attr-defined]
        await _pool.close()
    _pool = None


# ============================================================================
# gutenberg_reading_info — bulk async helpers
# ============================================================================


async def select_reading_info_many(ids: list[int]) -> dict[int, dict[str, Any]]:
    """Single SELECT IN with array binding. ~5-15ms vs 100ms+ for sync wrap."""
    if not ids:
        return {}
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT gutenberg_id, flesch_score, reading_grade, cefr
            FROM public.gutenberg_reading_info
            WHERE gutenberg_id = ANY($1::int[])
            """,
            ids,
        )
    return {
        r["gutenberg_id"]: {
            "reading_ease": float(r["flesch_score"])
            if r["flesch_score"] is not None
            else None,
            "grade": r["reading_grade"],
            "cefr": r["cefr"],
        }
        for r in rows
    }


async def upsert_reading_info_many(rows: list[dict[str, Any]]) -> None:
    """ONE INSERT with multi-row VALUES + ON CONFLICT. Single roundtrip."""
    if not rows:
        return
    pool = await get_pool()
    # Build flattened arg list and placeholders for a single INSERT statement.
    # Avoids executemany (which would prepared-statement under the hood).
    values_clauses: list[str] = []
    args: list[Any] = []
    for i, r in enumerate(rows):
        base = i * 4
        values_clauses.append(
            f"(${base + 1}::int, ${base + 2}::numeric, ${base + 3}::int, ${base + 4}::text)"
        )
        args.extend(
            [
                int(r["gutenberg_id"]),
                r.get("flesch_score"),
                r.get("reading_grade"),
                r.get("cefr"),
            ]
        )
    sql = f"""
        INSERT INTO public.gutenberg_reading_info
            (gutenberg_id, flesch_score, reading_grade, cefr)
        VALUES {",".join(values_clauses)}
        ON CONFLICT (gutenberg_id) DO UPDATE SET
            flesch_score = EXCLUDED.flesch_score,
            reading_grade = EXCLUDED.reading_grade,
            cefr = EXCLUDED.cefr,
            fetched_at = now()
    """
    async with pool.acquire() as conn:
        await conn.execute(sql, *args)


# ============================================================================
# gutendex_search_cache — persistent topic-search cache (survives restarts)
# ============================================================================


async def select_search_cache(topic: str) -> tuple[dict, float] | None:
    """Returns (response_json, age_seconds) or None if missing.
    Bumps hit_count atomically on read so we have a cheap signal for which
    topics are actually used (useful for future smart-warmup ranking)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE public.gutendex_search_cache
               SET hit_count = hit_count + 1
             WHERE topic = $1
         RETURNING response, EXTRACT(EPOCH FROM (now() - fetched_at)) AS age_seconds
            """,
            topic,
        )
    if row is None:
        return None
    raw = row["response"]
    response = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
    return response, float(row["age_seconds"])


async def upsert_search_cache(topic: str, response: dict) -> None:
    """Insert or refresh a topic's cached response. Resets fetched_at;
    leaves hit_count alone on conflict so accumulated usage stats survive."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO public.gutendex_search_cache (topic, response, fetched_at)
            VALUES ($1, $2::jsonb, now())
            ON CONFLICT (topic) DO UPDATE SET
                response = EXCLUDED.response,
                fetched_at = now()
            """,
            topic,
            json.dumps(response),
        )
