"""Diag: re-run extract_captions + parse_vtt for a video to see where the chain broke."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Ensure backend env is loaded before importing pronunciation (it touches Settings).
os.environ.setdefault("SUPABASE_URL", os.environ.get("SUPABASE_URL", ""))

from app.services import pronunciation


async def main(video_id: str) -> int:
    print(f"=== Diagnosing pipeline for {video_id} ===\n")

    print("Step 1: extract_captions")
    extracted = pronunciation.extract_captions(video_id)
    if extracted is None:
        print("  -> returned None (no English subs found)")
        return 1
    print(f"  -> path = {extracted.path}")
    print(f"  -> is_manual = {extracted.is_manual}")
    print(f"  -> file exists = {extracted.path.exists()}")
    if extracted.path.exists():
        print(f"  -> file size = {extracted.path.stat().st_size} bytes")
        with extracted.path.open("r", encoding="utf-8", errors="ignore") as f:
            head = f.read(500)
        print(f"  -> first 500 chars:\n{head!r}\n")

    print("Step 2: parse_vtt")
    cues = pronunciation.parse_vtt(extracted.path)
    print(f"  -> {len(cues)} cues parsed")
    for i, c in enumerate(cues[:3]):
        print(f"    [{i}] {c}")
    if len(cues) > 3:
        print(f"    ... and {len(cues) - 3} more")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "")))
