"""Diag: count rows in pronunciation_clips for a given video_id."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv


async def main(video_id: str) -> int:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    conn = await asyncpg.connect(os.environ["DATABASE_URL"], statement_cache_size=0)
    try:
        clip_count = await conn.fetchval(
            "select count(*) from pronunciation_clips where video_id=$1", video_id
        )
        videos_row = await conn.fetchrow(
            "select status, error_reason, title, duration_s from videos where video_id=$1",
            video_id,
        )
        sample = await conn.fetch(
            "select sentence_start_ms, sentence_end_ms, left(sentence_text, 80) as text "
            "from pronunciation_clips where video_id=$1 order by sentence_start_ms limit 3",
            video_id,
        )
        print(f"video_id={video_id!r}")
        print(f"  videos row: {dict(videos_row) if videos_row else None}")
        print(f"  pronunciation_clips count: {clip_count}")
        for r in sample:
            print(f"    {r['sentence_start_ms']}–{r['sentence_end_ms']} ms: {r['text']}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "")))
