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
