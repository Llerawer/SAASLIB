"""Force-reingest a video's clips. Use when the videos row exists but
pronunciation_clips is empty (e.g. webvtt-py was missing first time)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.services.video_ingest import ingest_video


def main(url: str) -> int:
    print(f"Re-ingesting {url}...")
    meta = ingest_video(url)
    print(f"OK: video_id={meta.video_id}, title={meta.title!r}, duration_s={meta.duration_s}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
