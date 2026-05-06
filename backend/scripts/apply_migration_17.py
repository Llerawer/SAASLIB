"""One-shot: apply migration 17 (video_user_progress) to remote Supabase.

Idempotent — re-running is safe (migration uses IF NOT EXISTS / DROP IF EXISTS).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv


async def main() -> int:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not in .env", file=sys.stderr)
        return 1

    sql_path = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "00000000000017_video_user_progress.sql"
    )
    if not sql_path.exists():
        print(f"ERROR: migration not found at {sql_path}", file=sys.stderr)
        return 1

    sql = sql_path.read_text(encoding="utf-8")
    print(f"Applying {sql_path.name} ({len(sql)} chars)...")

    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()

    print("OK — migration applied. Verifying...")
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        exists = await conn.fetchval(
            "select to_regclass('public.video_user_progress') is not null"
        )
        rls = await conn.fetchval(
            "select relrowsecurity from pg_class where relname='video_user_progress'"
        )
        print(f"  table public.video_user_progress exists: {exists}")
        print(f"  RLS enabled:                              {rls}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
