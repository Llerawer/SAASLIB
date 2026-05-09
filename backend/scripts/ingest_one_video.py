"""Single-video ingestion for closing coverage gaps.

Daily-use script for the founder: identify a missing word in show_coverage,
find a YouTube video where it's clearly spoken, ingest with this command.

Usage:
    python scripts/ingest_one_video.py <url-or-id> --channel "TED" [--accent US]

Examples:
    python scripts/ingest_one_video.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
        --channel "Rick Astley" --accent UK

    python scripts/ingest_one_video.py dQw4w9WgXcQ --channel TED-Ed --accent US

Idempotent: if the video_id is already in pronunciation_clips, skips
re-ingest cleanly. After ingest, re-run show_coverage.py to see the
updated radar.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend/ to import path so we can import app.* from a script.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_BACKEND_ROOT / ".env")

from app.services.video_ingest import (  # noqa: E402
    InvalidUrlError,
    NoSubsError,
    NotFoundError,
    IngestFailedError,
    ingest_video,
)


def main() -> int:
    p = argparse.ArgumentParser(
        description="Ingest a single YouTube video for the pronounce corpus.",
    )
    p.add_argument(
        "url_or_id",
        help="Full YouTube URL or 11-char video ID",
    )
    p.add_argument(
        "--channel",
        required=True,
        help='Channel name (e.g., "TED-Ed", "Vox"). Used as metadata only.',
    )
    p.add_argument(
        "--accent",
        choices=["US", "UK", "AU", "NEUTRAL"],
        default="NEUTRAL",
        help="Speaker accent tag (default: NEUTRAL)",
    )
    p.add_argument(
        "--license",
        default="youtube-standard",
        help="License string for the clip rows (default: youtube-standard)",
    )
    args = p.parse_args()

    # Allow bare video IDs (11 chars) — wrap into a watch URL.
    arg = args.url_or_id.strip()
    if len(arg) == 11 and arg.isascii() and not arg.startswith("http"):
        url = f"https://www.youtube.com/watch?v={arg}"
    else:
        url = arg

    print(f"Ingesting {url} (channel={args.channel}, accent={args.accent})...")

    try:
        meta = ingest_video(
            url,
            channel=args.channel,
            accent=args.accent,
            license_str=args.license,
        )
    except InvalidUrlError as e:
        print(f"ERROR: invalid URL — {e}", file=sys.stderr)
        return 2
    except NotFoundError as e:
        print(f"ERROR: video not found / private — {e}", file=sys.stderr)
        return 3
    except NoSubsError as e:
        print(f"ERROR: no English subtitles — {e}", file=sys.stderr)
        print("Tip: try a different video. The pipeline needs captions.", file=sys.stderr)
        return 4
    except IngestFailedError as e:
        print(f"ERROR: ingest failed — {e}", file=sys.stderr)
        return 5

    print(f"OK: video_id={meta.video_id!r}")
    print(f"    title:    {meta.title}")
    print(f"    duration: {meta.duration_s}s")
    print()
    print("Re-run show_coverage.py to see updated radar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
