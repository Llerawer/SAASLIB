"""Video ingest: pure function entrypoint, decoupled from FastAPI.

Wraps the existing pronunciation pipeline (yt-dlp + webvtt-py + clips
indexer) for a single video URL, returning metadata. Does NOT write to
the `videos` table — that's the handler's job (state machine for status,
stale-processing retry, etc. lives at the HTTP layer).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from app.services import pronunciation


# ---------- URL parsing ----------

_YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


class InvalidUrlError(ValueError):
    """URL is not a recognizable YouTube video URL."""


class NotFoundError(RuntimeError):
    """Video does not exist or is private."""


class NoSubsError(RuntimeError):
    """Video has no English subtitles available."""


class IngestFailedError(RuntimeError):
    """Generic catch-all for pipeline failures (logged, opaque to user)."""


def parse_video_id(url: str) -> str:
    """Extract the 11-char YouTube video ID from a URL.

    Accepts:
      - https://www.youtube.com/watch?v=ID
      - https://youtu.be/ID
      - https://youtube.com/shorts/ID
    Raises InvalidUrlError otherwise.
    """
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise InvalidUrlError(str(e)) from e

    if parsed.hostname not in _YT_HOSTS:
        raise InvalidUrlError(f"not a youtube host: {parsed.hostname!r}")

    # youtu.be/<id>
    if parsed.hostname == "youtu.be":
        candidate = parsed.path.lstrip("/")
    # youtube.com/shorts/<id>
    elif parsed.path.startswith("/shorts/"):
        candidate = parsed.path[len("/shorts/"):].split("/")[0]
    else:
        # youtube.com/watch?v=<id>
        qs = parse_qs(parsed.query)
        candidate = (qs.get("v") or [""])[0]

    if not _VIDEO_ID_RE.match(candidate):
        raise InvalidUrlError(f"invalid video id: {candidate!r}")

    return candidate


# ---------- Ingest entry point ----------


@dataclass
class VideoMeta:
    video_id: str
    title: str | None
    duration_s: int | None
    thumb_url: str | None


def ingest_video(
    url: str,
    *,
    channel: str = "",
    accent: str | None = None,
    license_str: str = "youtube-standard",
) -> VideoMeta:
    """Run the full ingest pipeline for one URL. Idempotent by video_id.

    Steps:
      1. parse_video_id(url) — InvalidUrlError if bad.
      2. extract_captions(video_id) via pronunciation pipeline — NoSubsError
         if yt-dlp returns no English track.
      3. parse_vtt() to get Cue objects from the downloaded .vtt file.
      4. index_video(video_id, ...) — populates pronunciation_clips +
         pronunciation_word_index tables (idempotent by video_id).
      5. fetch_video_metadata(video_id) — title, duration, thumb_url via yt-dlp.

    Returns VideoMeta. Raises one of: InvalidUrlError, NotFoundError,
    NoSubsError, IngestFailedError.
    """
    video_id = parse_video_id(url)

    try:
        extracted = pronunciation.extract_captions(video_id)
        if extracted is None:
            raise NoSubsError(f"no english subs for {video_id}")

        cues = pronunciation.parse_vtt(extracted.path)

        pronunciation.index_video(
            video_id,
            channel=channel,
            accent=accent,
            license_str=license_str,
            cues=cues,
            is_manual=extracted.is_manual,
        )

        meta = pronunciation.fetch_video_metadata(video_id)

    except NoSubsError:
        raise
    except FileNotFoundError as e:
        # yt-dlp not installed — operational, not user-facing.
        raise IngestFailedError(f"yt-dlp missing: {e}") from e
    except Exception as e:
        # Generic catch — log full trace, return opaque error to caller.
        raise IngestFailedError(str(e)) from e

    return VideoMeta(
        video_id=video_id,
        title=meta.get("title"),
        duration_s=meta.get("duration_s"),
        thumb_url=meta.get("thumb_url"),
    )
