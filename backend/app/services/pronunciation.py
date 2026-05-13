"""Pronunciation module — caption ingest pipeline + DB writers.

Pipeline (per video):
  1. yt-dlp downloads the .vtt subtitle (manual track preferred, auto-gen
     fallback). Confidence reflects which we got.
  2. webvtt-py parses cues into (start, end, text) tuples.
  3. _is_garbage_cue + _clean_cue strip music markers, speaker tags,
     encoding artifacts, and skip cues that are too short / too long.
  4. _tokenize_for_index extracts indexable lemmas, dropping stop words
     and short tokens.
  5. DB writes are batched: one INSERT for the clip row, one bulk INSERT
     for all (word, clip_id) pairs of that clip.

Garbage filter is conservative on purpose — better to skip a borderline
cue than to pollute the index with [Music] noise. With 100+ videos the
corpus is robust against missing 5% of cues.
"""
from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from app.db.supabase_client import get_admin_client
from app.services.normalize import normalize

logger = logging.getLogger(__name__)


# ============================================================================
# Caption extraction (yt-dlp wrapper)
# ============================================================================


_CAPTIONS_DIR = Path(__file__).resolve().parents[2] / "data" / "captions"
_CAPTIONS_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class ExtractedCaption:
    path: Path
    is_manual: bool   # True if uploaded captions, False if auto-generated


def extract_captions(video_id: str) -> ExtractedCaption | None:
    """Download English subtitles for a YouTube video. Prefers manual
    (uploaded) captions; falls back to auto-generated if none exist.

    Returns None if neither is available. Idempotent: skips download if a
    .vtt for this video already exists in the local cache.
    """
    if shutil.which("yt-dlp") is None:
        logger.error(
            "yt-dlp binary not found on PATH. Install with: "
            "pip install yt-dlp (or via poetry)"
        )
        return None

    manual_path = _CAPTIONS_DIR / f"{video_id}.en.vtt"
    auto_path = _CAPTIONS_DIR / f"{video_id}.en.auto.vtt"

    # Cached?
    if manual_path.exists() and manual_path.stat().st_size > 0:
        return ExtractedCaption(path=manual_path, is_manual=True)
    if auto_path.exists() and auto_path.stat().st_size > 0:
        return ExtractedCaption(path=auto_path, is_manual=False)

    # Try manual first.
    _run_yt_dlp(video_id, auto=False)
    if manual_path.exists() and manual_path.stat().st_size > 0:
        return ExtractedCaption(path=manual_path, is_manual=True)

    # Fallback: auto-gen.
    _run_yt_dlp(video_id, auto=True)
    # yt-dlp names auto-captions as `{id}.en.vtt` too. Detect by lack of
    # manual flag — we just look for any .en.vtt that appeared after the
    # auto pass.
    fallback = _CAPTIONS_DIR / f"{video_id}.en.vtt"
    if fallback.exists() and fallback.stat().st_size > 0:
        return ExtractedCaption(path=fallback, is_manual=False)

    logger.warning("No captions found for video %s", video_id)
    return None


def _run_yt_dlp(video_id: str, *, auto: bool) -> None:
    """Run yt-dlp once. We swallow errors — the caller decides what to do
    based on whether a .vtt landed on disk."""
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--no-warnings",
        "--quiet",
        "--sub-format",
        "vtt",
        "--sub-langs",
        "en",
        "--output",
        str(_CAPTIONS_DIR / "%(id)s.%(ext)s"),
    ]
    cmd.append("--write-auto-sub" if auto else "--write-sub")
    cmd.append(f"https://www.youtube.com/watch?v={video_id}")
    try:
        subprocess.run(cmd, timeout=60, check=False)
    except subprocess.TimeoutExpired:
        logger.warning("yt-dlp timed out for %s", video_id)
    except Exception:  # noqa: BLE001
        logger.exception("yt-dlp failed for %s", video_id)


# ============================================================================
# .vtt parsing
# ============================================================================


@dataclass
class Cue:
    start_ms: int
    end_ms: int
    text: str


def parse_vtt(path: Path) -> list[Cue]:
    """Parse a .vtt file into Cue objects. Uses webvtt-py for robustness
    against the various dialects YouTube emits (auto-captions in
    particular have weird overlapping timestamps)."""
    try:
        import webvtt  # type: ignore[import-untyped]
    except ImportError:
        logger.error("webvtt-py not installed. pip install webvtt-py")
        return []

    cues: list[Cue] = []
    try:
        for c in webvtt.read(str(path)):
            start_ms = int(c.start_in_seconds * 1000)
            end_ms = int(c.end_in_seconds * 1000)
            # YouTube auto-captions emit dup cues with shifting timestamps —
            # just take the text as-is, deduplication happens at index time.
            text = " ".join(c.text.split())  # collapse newlines/tabs
            cues.append(Cue(start_ms=start_ms, end_ms=end_ms, text=text))
    except Exception:  # noqa: BLE001
        logger.exception("Failed to parse VTT %s", path)
    return cues


# ============================================================================
# Garbage filter — conservative cue cleanup
# ============================================================================


# Music / sfx / applause markers — these whole-cue tags are noise.
_BRACKETED_NOISE = re.compile(
    r"^\[\s*(music|applause|laughter|cheer\w*|crowd|inaudible|silence|"
    r"chuckles?|sighs?|noise|sound\s*effects?)\s*\]$",
    re.IGNORECASE,
)
# Inline parenthetical asides we strip but keep the rest of the cue.
_INLINE_NOISE = re.compile(
    r"\(\s*(music|applause|laughter|chuckles?|sighs?|cheers?)\s*\)",
    re.IGNORECASE,
)
# Speaker tags at the start of a cue: ">> SPEAKER:", ">> John:", etc.
_SPEAKER_PREFIX = re.compile(r"^(>>+|>+|\w+\s*:\s*)", re.IGNORECASE)
# Control / non-printable artifacts.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# Cues that are essentially just symbols / numbers / tags.
_LETTER_CHAR = re.compile(r"[a-zA-Z]")

_MIN_WORDS_PER_CUE = 3
_MAX_WORDS_PER_CUE = 50


def _clean_cue(text: str) -> str | None:
    """Returns sanitized text, or None if the cue is garbage and should be
    skipped entirely."""
    text = text.strip()
    if not text:
        return None

    # Drop control chars + collapse whitespace.
    text = _CONTROL_CHARS.sub("", text)
    text = " ".join(text.split())

    # Whole-cue music/sfx markers → drop.
    if _BRACKETED_NOISE.match(text):
        return None

    # Inline (Music) etc. → strip but keep rest.
    text = _INLINE_NOISE.sub("", text).strip()
    if not text:
        return None

    # Speaker tag at start? Strip it.
    text = _SPEAKER_PREFIX.sub("", text).strip()
    if not text:
        return None

    # Need at least one letter — pure punctuation/digits is noise.
    if not _LETTER_CHAR.search(text):
        return None

    # All-caps + many words = SHOUTING captions (low pronunciation value).
    word_count = len(text.split())
    if word_count > 5 and text == text.upper():
        return None

    # Length bounds. Auto-captions sometimes merge a whole paragraph into
    # one cue — those don't anchor to a single playback moment.
    if word_count < _MIN_WORDS_PER_CUE:
        return None
    if word_count > _MAX_WORDS_PER_CUE:
        return None

    return text


# ============================================================================
# Tokenization for the inverted index
# ============================================================================


_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'-]+")
_MIN_TOKEN_LEN = 3


# Curated function-word list: articles, pronouns, auxiliaries, modals,
# basic connectors. Deliberately DOES NOT include common content verbs
# like give/make/take/get/go/come/want — those are pronunciation targets
# for ESL learners. spaCy's default stop_words set (~326 words) is too
# aggressive for this domain: it filters out exactly the words learners
# come to a pronunciation app to study.
_INDEX_STOP_WORDS: set[str] = {
    "the", "a", "an", "and", "or", "but", "if", "then", "of", "in", "on",
    "at", "to", "for", "with", "by", "from", "as", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "did", "this", "that", "these", "those", "i", "you", "he", "she", "it",
    "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
    "their", "our", "what", "which", "who", "whom", "where", "when", "how",
    "why", "not", "no", "so", "very", "just", "can", "will", "would",
    "should", "could", "may", "might", "must", "shall", "there", "here",
}


def _tokenize_for_index(text: str) -> set[str]:
    """Extract lemmatized lowercase tokens for the inverted index.
    Drops stop words and short tokens. Returns a SET — we don't index a
    word twice for the same clip even if it appears multiple times."""
    tokens: set[str] = set()
    for m in _TOKEN_RE.finditer(text):
        raw = m.group(0).lower()
        if len(raw) < _MIN_TOKEN_LEN:
            continue
        if raw in _INDEX_STOP_WORDS:
            continue
        # Lemmatize via existing normalize() which uses spaCy.
        lemma = normalize(raw, "en")
        if not lemma or len(lemma) < _MIN_TOKEN_LEN:
            continue
        if lemma in _INDEX_STOP_WORDS:
            continue
        tokens.add(lemma)
    return tokens


# ============================================================================
# DB writers
# ============================================================================


@dataclass
class IngestStats:
    video_id: str
    cues_total: int
    cues_kept: int
    cues_skipped_garbage: int
    word_index_rows: int
    is_manual: bool


def _video_already_ingested(video_id: str) -> bool:
    res = (
        get_admin_client()
        .table("pronunciation_clips")
        .select("id")
        .eq("video_id", video_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def index_video(
    video_id: str,
    channel: str,
    accent: str | None,
    license_str: str,
    cues: Iterable[Cue],
    *,
    is_manual: bool,
) -> IngestStats:
    """Persist all cues of a video to pronunciation_clips +
    pronunciation_word_index. Idempotent: skips entirely if video_id is
    already in the DB.
    """
    client = get_admin_client()
    confidence = 1.0 if is_manual else 0.7

    if _video_already_ingested(video_id):
        return IngestStats(
            video_id=video_id,
            cues_total=0,
            cues_kept=0,
            cues_skipped_garbage=0,
            word_index_rows=0,
            is_manual=is_manual,
        )

    cues_list = list(cues)
    cues_total = len(cues_list)
    clip_rows: list[dict] = []
    pending_word_links: list[tuple[str, list[str]]] = []  # (clip-uuid placeholder, words)

    for c in cues_list:
        cleaned = _clean_cue(c.text)
        if cleaned is None:
            continue
        tokens = _tokenize_for_index(cleaned)
        if not tokens:
            continue
        clip_rows.append(
            {
                "video_id": video_id,
                "channel": channel,
                "language": "en",
                "accent": accent,
                "sentence_text": cleaned,
                "sentence_start_ms": c.start_ms,
                "sentence_end_ms": c.end_ms,
                "license": license_str,
                "confidence": confidence,
            }
        )
        pending_word_links.append(("", sorted(tokens)))

    if not clip_rows:
        return IngestStats(
            video_id=video_id,
            cues_total=cues_total,
            cues_kept=0,
            cues_skipped_garbage=cues_total,
            word_index_rows=0,
            is_manual=is_manual,
        )

    # Bulk insert clips, get back ids.
    inserted = client.table("pronunciation_clips").insert(clip_rows).execute()
    ids = [row["id"] for row in (inserted.data or [])]
    if len(ids) != len(clip_rows):
        logger.error(
            "clip insert mismatch for %s: expected %d, got %d",
            video_id,
            len(clip_rows),
            len(ids),
        )

    # Build (word, clip_id) pairs for the index.
    word_index_rows: list[dict] = []
    for clip_id, (_, tokens) in zip(ids, pending_word_links):
        for w in tokens:
            word_index_rows.append({"word": w, "clip_id": clip_id})

    if word_index_rows:
        # Postgrest payload limits: chunk if huge. 1000 per insert is safe.
        for chunk in _chunked(word_index_rows, 1000):
            client.table("pronunciation_word_index").insert(chunk).execute()

    return IngestStats(
        video_id=video_id,
        cues_total=cues_total,
        cues_kept=len(clip_rows),
        cues_skipped_garbage=cues_total - len(clip_rows),
        word_index_rows=len(word_index_rows),
        is_manual=is_manual,
    )


def _chunked(items: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


# ============================================================================
# Embed URL — single source of truth for the start/end math
# ============================================================================


class _VideoNotFoundOrPrivate(RuntimeError):
    """Sentinel: yt-dlp reports the video doesn't exist or is private. Caller
    should map this to a typed 'not_found' error. Marked with a leading
    underscore to flag it as internal to this module."""


def fetch_video_metadata(video_id: str) -> dict:
    """Fetch title, duration, thumb_url for a video via yt-dlp.

    Raises:
      FileNotFoundError if yt-dlp is not on PATH.
      _VideoNotFoundOrPrivate if yt-dlp reports 404/private/unavailable.
      Other exceptions for parse/transient failures (let caller bucket).
    """
    yt_dlp = shutil.which("yt-dlp")
    if not yt_dlp:
        raise FileNotFoundError("yt-dlp not on PATH")
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        result = subprocess.run(
            [yt_dlp, "--print", "%(.{title,duration,thumbnail})j", url],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,  # we inspect returncode + stderr ourselves
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"yt-dlp timeout for {video_id}") from e

    if result.returncode != 0:
        stderr = result.stderr or ""
        # Patterns yt-dlp emits for 404/private/removed videos.
        not_found_markers = (
            "Video unavailable",
            "Private video",
            "This video has been removed",
            "Video has been removed",
            "video is not available",
            "is no longer available",
        )
        if any(m.lower() in stderr.lower() for m in not_found_markers):
            raise _VideoNotFoundOrPrivate(stderr.strip().splitlines()[-1] if stderr else f"video {video_id}")
        raise RuntimeError(f"yt-dlp failed (rc={result.returncode}): {stderr[:200]}")

    try:
        data = json.loads(result.stdout.strip())
    except json.JSONDecodeError as e:
        raise RuntimeError(f"yt-dlp output not JSON: {result.stdout[:200]}") from e

    return {
        "title": data.get("title"),
        "duration_s": int(data["duration"]) if data.get("duration") else None,
        "thumb_url": data.get("thumbnail"),
    }


def build_embed_url(
    video_id: str, start_ms: int, end_ms: int, *, lead_in_s: int = 2,
    tail_s: int = 1,
) -> str:
    """youtube-nocookie.com avoids the EU GDPR cookie banner.
    `rel=0` keeps the user inside our gallery instead of YouTube's
    related-videos rabbit hole at the end of the clip.
    """
    start = max(0, start_ms // 1000 - lead_in_s)
    end = end_ms // 1000 + tail_s
    return (
        f"https://www.youtube-nocookie.com/embed/{video_id}"
        f"?start={start}&end={end}&rel=0"
    )
