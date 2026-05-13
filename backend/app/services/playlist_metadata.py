"""Playlist metadata extraction via yt-dlp.

Mirrors the style of pronunciation.fetch_video_metadata: subprocess to
yt-dlp CLI, --print or -J for JSON output, typed exceptions, no global
state. Two entry points:

  - parse_playlist_id(url): pure-Python URL parser, no network.
  - fetch_playlist_preview(playlist_id): yt-dlp --flat-playlist call,
    returns title/channel/thumb/count/duration/video list. Single
    network call, used both for the preview modal and the import worker.

Why --flat-playlist:
  Skips fetching each video's full metadata. A 50-video playlist resolves
  in ~3-5s instead of minutes. Loses some per-video fields (description,
  tags) but we don't need them at this stage — the worker calls the
  existing fetch_video_metadata per video at ingest time.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

MAX_PLAYLIST_VIDEOS = 50

# yt-dlp accepts both the short prefix codes (PL, UU, LL, etc.) and the
# longer auto-generated channel-upload IDs. The shortest legitimate
# playlist id (Watch Later before sign-in) is just "WL". The longest are
# 34 chars. We're permissive on the charset because YouTube IDs include
# - and _.
_PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{2,40}$")
_YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


class InvalidPlaylistUrlError(ValueError):
    """URL is not a recognizable YouTube playlist URL."""


class PlaylistNotFoundError(RuntimeError):
    """Playlist doesn't exist, is private, or yt-dlp can't reach it."""


class PlaylistTooLargeError(ValueError):
    """Playlist has more videos than MAX_PLAYLIST_VIDEOS."""

    def __init__(self, video_count: int):
        super().__init__(
            f"Playlist has {video_count} videos; limit is {MAX_PLAYLIST_VIDEOS}"
        )
        self.video_count = video_count


class PlaylistMetadataFailedError(RuntimeError):
    """Generic failure during yt-dlp invocation (timeout, parse, etc.)."""


@dataclass(frozen=True)
class PlaylistVideoEntry:
    """One video inside a playlist, from --flat-playlist output."""

    video_id: str
    title: str
    duration_s: int | None


@dataclass(frozen=True)
class PlaylistPreview:
    """Snapshot of a playlist at fetch time. The worker uses
    `entries` to drive ingest; the API endpoint slims it down for
    the preview modal (sample_titles + counts)."""

    playlist_id: str
    title: str
    channel: str | None
    thumbnail_url: str | None
    video_count: int
    total_duration_s: int | None
    entries: list[PlaylistVideoEntry]


def parse_playlist_id(url: str) -> str:
    """Extract the playlist id (the `list=` query param) from a YouTube
    URL. Accepts `?list=...` on watch URLs, playlist URLs, or share URLs.
    Raises InvalidPlaylistUrlError if absent or malformed."""
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise InvalidPlaylistUrlError(str(e)) from e

    if parsed.hostname not in _YT_HOSTS:
        raise InvalidPlaylistUrlError(
            f"not a youtube host: {parsed.hostname!r}"
        )

    qs = parse_qs(parsed.query)
    candidates = qs.get("list", [])
    if not candidates:
        raise InvalidPlaylistUrlError("no `list` query param in URL")
    pid = candidates[0]
    if not _PLAYLIST_ID_RE.match(pid):
        raise InvalidPlaylistUrlError(f"malformed playlist id: {pid!r}")
    return pid


def fetch_playlist_preview(playlist_id: str) -> PlaylistPreview:
    """Single yt-dlp call returning playlist metadata + flat list of
    videos. Used by both the /preview endpoint and the import worker.

    Raises:
      FileNotFoundError if yt-dlp is not on PATH.
      PlaylistNotFoundError if yt-dlp reports unavailable/private.
      PlaylistTooLargeError if entries > MAX_PLAYLIST_VIDEOS.
      PlaylistMetadataFailedError for any other failure.
    """
    yt_dlp = shutil.which("yt-dlp")
    if not yt_dlp:
        raise FileNotFoundError("yt-dlp not on PATH")

    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    try:
        result = subprocess.run(
            [yt_dlp, "--flat-playlist", "-J", "--no-warnings", url],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise PlaylistMetadataFailedError(
            f"yt-dlp timeout for playlist {playlist_id}"
        ) from e

    if result.returncode != 0:
        stderr = result.stderr or ""
        not_found_markers = (
            "playlist does not exist",
            "the playlist does not exist",
            "unavailable",
            "private",
            "no videos available",
            "this playlist is empty",
        )
        if any(m in stderr.lower() for m in not_found_markers):
            raise PlaylistNotFoundError(
                stderr.strip().splitlines()[-1] if stderr else playlist_id
            )
        raise PlaylistMetadataFailedError(
            f"yt-dlp failed (rc={result.returncode}): {stderr[:200]}"
        )

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise PlaylistMetadataFailedError(
            f"yt-dlp output not JSON: {result.stdout[:200]}"
        ) from e

    raw_entries = data.get("entries") or []
    if len(raw_entries) > MAX_PLAYLIST_VIDEOS:
        raise PlaylistTooLargeError(len(raw_entries))

    entries = [_parse_entry(e) for e in raw_entries]
    # Drop entries where yt-dlp couldn't even resolve an id (deleted,
    # region-locked, etc.). The worker can't ingest those anyway.
    entries = [e for e in entries if e is not None]

    total_duration = _sum_durations(entries)
    thumbnail = _pick_thumbnail(data, raw_entries)

    return PlaylistPreview(
        playlist_id=playlist_id,
        title=data.get("title") or f"Playlist {playlist_id}",
        channel=data.get("channel") or data.get("uploader"),
        thumbnail_url=thumbnail,
        video_count=len(entries),
        total_duration_s=total_duration,
        entries=entries,
    )


def _parse_entry(raw: dict) -> PlaylistVideoEntry | None:
    vid = raw.get("id")
    if not vid:
        return None
    duration = raw.get("duration")
    return PlaylistVideoEntry(
        video_id=vid,
        title=raw.get("title") or vid,
        duration_s=int(duration) if duration else None,
    )


def _sum_durations(entries: list[PlaylistVideoEntry]) -> int | None:
    durations = [e.duration_s for e in entries if e.duration_s]
    if not durations:
        return None
    return sum(durations)


def _pick_thumbnail(data: dict, raw_entries: list[dict]) -> str | None:
    """Playlist-level thumbnail when yt-dlp surfaces one, else the
    first video's thumbnail."""
    thumbs = data.get("thumbnails") or []
    if thumbs:
        best = max(thumbs, key=lambda t: t.get("width") or 0)
        if best.get("url"):
            return best["url"]
    for e in raw_entries:
        vid = e.get("id")
        if vid:
            return f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
    return None
