"""Ingest pronunciation captions from a curated corpus CSV.

Usage:
    PYTHONPATH=. py -3.11 -m poetry run python scripts/ingest_pronunciation.py
    # or with custom CSV path:
    PYTHONPATH=. py -3.11 -m poetry run python scripts/ingest_pronunciation.py path/to/file.csv

CSV format (header required):
    video_id,channel,accent,license,note

Idempotent: skips videos already present in pronunciation_clips. Re-running
after expanding the CSV only ingests the new rows.

Polite to YouTube: 2 s sleep between videos.
"""
from __future__ import annotations

import csv
import sys
import time
from pathlib import Path

from app.services import pronunciation as pron

DEFAULT_CSV = Path(__file__).resolve().parent / "pronunciation_corpus.csv"
POLITE_DELAY_SECONDS = 2.0


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.exists():
        print(f"[ingest] ERROR: CSV not found at {csv_path}", file=sys.stderr)
        print(
            f"[ingest] Tip: copy the template + edit it.",
            file=sys.stderr,
        )
        return 1

    print(f"[ingest] Reading corpus from {csv_path}")
    rows = list(csv.DictReader(csv_path.open(encoding="utf-8")))
    print(f"[ingest] {len(rows)} entries to process")

    summary = {
        "videos_total": 0,
        "videos_ingested": 0,
        "videos_skipped_existing": 0,
        "videos_failed": 0,
        "cues_kept": 0,
        "cues_garbage": 0,
        "word_index_rows": 0,
    }

    for i, row in enumerate(rows, 1):
        # Skip blank or comment lines.
        video_id = (row.get("video_id") or "").strip()
        if not video_id or video_id.startswith("#") or "REPLACE" in video_id.upper():
            print(f"[ingest] {i}/{len(rows)}: SKIP (placeholder/blank): {row}")
            continue

        channel = (row.get("channel") or "").strip() or "unknown"
        accent = (row.get("accent") or "").strip().upper() or None
        license_str = (row.get("license") or "").strip() or "unknown"
        note = (row.get("note") or "").strip()
        summary["videos_total"] += 1

        if pron._video_already_ingested(video_id):
            print(
                f"[ingest] {i}/{len(rows)}: SKIP (already in DB) {video_id} — {note}"
            )
            summary["videos_skipped_existing"] += 1
            continue

        print(f"[ingest] {i}/{len(rows)}: {video_id} ({channel}/{accent}) — {note}")

        # 1. Download captions.
        cap = pron.extract_captions(video_id)
        if cap is None:
            print(f"[ingest]   FAIL: no captions available for {video_id}")
            summary["videos_failed"] += 1
            time.sleep(POLITE_DELAY_SECONDS)
            continue

        print(
            f"[ingest]   captions: {cap.path.name} "
            f"({'manual' if cap.is_manual else 'auto-gen'})"
        )

        # 2. Parse + index.
        cues = pron.parse_vtt(cap.path)
        if not cues:
            print(f"[ingest]   FAIL: 0 cues parsed from {cap.path.name}")
            summary["videos_failed"] += 1
            time.sleep(POLITE_DELAY_SECONDS)
            continue

        try:
            stats = pron.index_video(
                video_id=video_id,
                channel=channel,
                accent=accent,
                license_str=license_str,
                cues=cues,
                is_manual=cap.is_manual,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[ingest]   FAIL: index error: {e}")
            summary["videos_failed"] += 1
            time.sleep(POLITE_DELAY_SECONDS)
            continue

        print(
            f"[ingest]   {stats.cues_kept} cues kept "
            f"({stats.cues_skipped_garbage} skipped as garbage), "
            f"{stats.word_index_rows} index rows"
        )
        summary["videos_ingested"] += 1
        summary["cues_kept"] += stats.cues_kept
        summary["cues_garbage"] += stats.cues_skipped_garbage
        summary["word_index_rows"] += stats.word_index_rows

        time.sleep(POLITE_DELAY_SECONDS)

    print()
    print("[ingest] ===== SUMMARY =====")
    for k, v in summary.items():
        print(f"[ingest]   {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
