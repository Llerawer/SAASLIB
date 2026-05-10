"""Article extraction — fetches a URL, runs trafilatura, returns
clean HTML + text + metadata. Used by POST /api/v1/articles."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl


# Common tracking params stripped from URLs before dedup hash.
_TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "ref", "ref_src", "mc_cid", "mc_eid",
    "_ga", "_gl", "igshid", "yclid",
})


def normalize_url(raw: str) -> tuple[str, str]:
    """Return (canonical_url, sha256_hex_hash).

    Canonicalization rules (matched in spec §2.1):
      - Strip leading/trailing whitespace.
      - Lowercase scheme + host.
      - Strip path trailing slash (unless path == "/").
      - Drop fragment entirely.
      - Drop tracking query params (utm_*, fbclid, gclid, ref, ref_src, etc.).
      - Sort remaining query params alphabetically for stable hash.

    The returned hash is the SHA256 of the canonical URL — used as the
    dedup key in articles.url_hash.
    """
    raw = raw.strip()
    parsed = urlparse(raw)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path
    if path.endswith("/") and path != "/":
        path = path.rstrip("/")
    pairs = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in _TRACKING_PARAMS
    ]
    pairs.sort()
    query = urlencode(pairs)
    canonical = urlunparse((scheme, netloc, path, "", query, ""))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return canonical, digest


@dataclass
class ExtractionResult:
    title: str
    author: str | None
    language: str | None
    html_clean: str
    text_clean: str
    word_count: int
    content_hash: str


class ExtractionError(Exception):
    """Raised when extraction yields no usable content (paywall, JS-only,
    PDF, network failure). The API layer maps these to HTTP 422."""


import re

import httpx
import trafilatura


_HTTP_TIMEOUT_S = 15.0
_MAX_HTML_BYTES = 5_000_000
_MIN_TEXT_LEN = 300

_USER_AGENT = "LinguaReader/1.0 (+articles; contact gerardo@nedi.mx)"


def _count_words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


async def extract(url: str) -> ExtractionResult:
    """Fetch `url`, run trafilatura, return cleaned content + metadata.

    Raises ExtractionError on:
      - network failure / timeout / HTTP error status
      - Content-Type indicates PDF or other non-HTML
      - HTML body exceeds _MAX_HTML_BYTES (likely garbage / DoS)
      - trafilatura returns < _MIN_TEXT_LEN chars (paywall, JS-only SPA,
        cookie banner, error page)
    """
    async with httpx.AsyncClient(
        timeout=_HTTP_TIMEOUT_S,
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ExtractionError(f"Fetch failed: {e}") from e

        ctype = resp.headers.get("content-type", "").lower()
        if "application/pdf" in ctype or url.lower().endswith(".pdf"):
            raise ExtractionError("PDFs are not supported yet")

        if "text/html" not in ctype and "application/xhtml" not in ctype:
            raise ExtractionError(
                f"Non-HTML content-type: {ctype or 'unknown'}"
            )

        html = resp.text
        if len(html) > _MAX_HTML_BYTES:
            raise ExtractionError("HTML payload too large")

    extracted_html = trafilatura.extract(
        html,
        output_format="html",
        with_metadata=True,
        include_links=False,
        include_images=False,
        include_tables=True,
        favor_recall=False,
    )
    extracted_text = trafilatura.extract(
        html,
        include_links=False,
        include_images=False,
        favor_recall=False,
    )

    if not extracted_text or len(extracted_text) < _MIN_TEXT_LEN:
        raise ExtractionError(
            "No readable content found (paywall, JS-only, or empty page)"
        )

    metadata = trafilatura.extract_metadata(html) or None
    title = (
        (metadata.title if metadata and metadata.title else None)
        or _fallback_title_from_html(html)
        or "Sin título"
    ).strip()[:500]

    author = None
    language = "en"
    if metadata is not None:
        author = (metadata.author or None)
        if author:
            author = author[:200]
        language = (metadata.language or "en")[:8]

    text_clean = extracted_text
    return ExtractionResult(
        title=title,
        author=author,
        language=language,
        html_clean=extracted_html or "",
        text_clean=text_clean,
        word_count=_count_words(text_clean),
        content_hash=hashlib.sha256(text_clean.encode("utf-8")).hexdigest(),
    )


def _fallback_title_from_html(html: str) -> str | None:
    """Last-ditch <title> regex if trafilatura's metadata extraction
    fails. Not robust against weird HTML but good enough for fallback."""
    match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return match.group(1).strip() if match else None
