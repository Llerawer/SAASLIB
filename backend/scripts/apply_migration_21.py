"""One-shot: apply migration 21 (core_vocabulary) to remote Supabase.

Idempotent — re-running is safe (migration uses IF NOT EXISTS).
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
        / "00000000000021_core_vocabulary.sql"
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

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
