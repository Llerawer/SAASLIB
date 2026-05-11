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
    # The URL after all redirects. Always populated. Callers should use
    # this (not the input URL) when computing url_hash for dedup, so
    # that pasting an alias / http→https / trailing-slash variant of
    # an already-imported article hits the existing row.
    final_url: str


class ExtractionError(Exception):
    """Raised when extraction yields no usable content (paywall, JS-only,
    PDF, network failure). The API layer maps these to HTTP 422."""


import asyncio
import logging
import re

import cloudscraper
import httpx
import trafilatura

log = logging.getLogger(__name__)


_HTTP_TIMEOUT_S = 15.0
_CLOUDSCRAPER_TIMEOUT_S = 25.0  # Slower because it negotiates JS challenges.
_MAX_HTML_BYTES = 5_000_000
_MIN_TEXT_LEN = 300

# Use a real Chrome UA — many sites block "LinguaReader" outright. The
# attribution stays in the request via `Via` / contact info isn't standard
# enough to be worth a header (and would itself trigger more blocking).
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


def _count_words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def _looks_waf_blocked(status_code: int, body: str) -> bool:
    """Heuristic: response looks like a Cloudflare / WAF challenge page,
    not real content. Used to decide whether to retry via cloudscraper."""
    if status_code in (403, 429, 503):
        return True
    lower = body.lower()
    waf_markers = (
        "cf-chl",                # Cloudflare challenge
        "cf-ray:",
        "checking your browser", # Cloudflare interstitial
        "challenge-platform",    # Cloudflare turnstile
        "_incapsula_",           # Imperva/Incapsula
        "akamai",                # Akamai bot manager (when in body)
    )
    return any(m in lower for m in waf_markers)


def make_cloudscraper_session():
    """Create a cloudscraper session. Reuse this object across many fetches
    in the same import (the JS challenge cookie persists, dropping
    per-leaf time from ~20s to ~2s after the first request)."""
    return cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False},
    )


def _fetch_via_cloudscraper(url: str, scraper=None) -> tuple[str, str, str]:
    """Sync — runs in a thread from `extract()`. Returns (html, content_type, final_url).

    If `scraper` is None, creates a fresh one (single-paste flow).
    For bulk imports, the caller should pass a reused session so the
    Cloudflare challenge cookie is preserved across requests."""
    if scraper is None:
        scraper = make_cloudscraper_session()
    r = scraper.get(url, timeout=_CLOUDSCRAPER_TIMEOUT_S, allow_redirects=True)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "")
    # requests sometimes guesses the encoding wrong (defaults to ISO-8859-1
    # when no charset header) → titles get � for em-dash etc. Trust
    # apparent_encoding (chardet detection) which is much more accurate
    # for Sphinx/Docusaurus pages that don't always send charset header.
    if r.encoding and r.encoding.lower() in ("iso-8859-1", "latin-1"):
        r.encoding = r.apparent_encoding or "utf-8"
    final_url = str(r.url) if hasattr(r, "url") else url
    return r.text, ctype, final_url


async def fetch_html(
    url: str, *, scraper=None, prefer_scraper: bool = False,
) -> tuple[str, str, str]:
    """Public re-export for the source importer (which needs raw HTML
    before adapter detection). The bulk importer passes its shared
    cloudscraper session via `scraper` to keep cookies warm, and
    `prefer_scraper=True` to skip the httpx attempt for known-WAF sources.

    Returns (html, content_type, final_url)."""
    return await _fetch_html(url, scraper=scraper, prefer_scraper=prefer_scraper)


async def _fetch_html(
    url: str, *, scraper=None, prefer_scraper: bool = False,
) -> tuple[str, str, str]:
    """Two-stage fetch: httpx first (fast), cloudscraper on timeout / 403 /
    429 / WAF challenge body (slower but bypasses Cloudflare basic).

    Returns (html, content_type). Raises ExtractionError with a message a
    human can act on.
    """
    # Fast-path skip: known-WAF sources (bulk importer passes prefer_scraper)
    # save 15s of dead httpx timeout per leaf.
    if prefer_scraper:
        try:
            html, ctype, final_url = await asyncio.to_thread(
                _fetch_via_cloudscraper, url, scraper,
            )
            if _looks_waf_blocked(200, html):
                raise ExtractionError(
                    "Este sitio tiene protección WAF avanzada que cloudscraper "
                    "no logra pasar."
                )
            return html, ctype, final_url
        except ExtractionError:
            raise
        except Exception as e:
            raise ExtractionError(f"Fetch failed (cloudscraper-direct): {e}") from e

    waf_blocked = False
    httpx_err: Exception | None = None

    try:
        async with httpx.AsyncClient(
            timeout=_HTTP_TIMEOUT_S,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            resp = await client.get(url)
        # Don't raise_for_status here — let the WAF check decide.
        final_url = str(resp.url)
        if _looks_waf_blocked(resp.status_code, resp.text):
            log.info("[extract] httpx %s → WAF body markers, falling back to cloudscraper for %s", resp.status_code, url)
            waf_blocked = True
        elif 400 <= resp.status_code < 600:
            log.info("[extract] httpx %s → hard error (no fallback) for %s", resp.status_code, url)
            raise ExtractionError(
                f"El sitio devolvió HTTP {resp.status_code}. "
                f"Probablemente requiere login, está caído, o bloquea bots."
            )
        else:
            log.info("[extract] httpx %s → OK fast path (%d bytes) for %s", resp.status_code, len(resp.text), url)
            return resp.text, resp.headers.get("content-type", ""), final_url
    except ExtractionError:
        raise
    except httpx.TimeoutException as e:
        log.info("[extract] httpx timeout, falling back to cloudscraper for %s", url)
        httpx_err = e
        waf_blocked = True
    except httpx.HTTPError as e:
        log.info("[extract] httpx HTTPError %s (no fallback) for %s", type(e).__name__, url)
        httpx_err = e

    if waf_blocked:
        try:
            html, ctype, final_url = await asyncio.to_thread(
                _fetch_via_cloudscraper, url, scraper,
            )
            log.info("[extract] cloudscraper → OK (%d bytes) for %s", len(html), url)
            # Even cloudscraper can hit a hard JS challenge — check the body.
            if _looks_waf_blocked(200, html):
                raise ExtractionError(
                    "Este sitio tiene protección WAF avanzada (Cloudflare "
                    "Turnstile o similar) que cloudscraper no logra pasar. "
                    "Necesitaríamos un browser headless o una extensión."
                )
            return html, ctype, final_url
        except ExtractionError:
            raise
        except Exception as e:
            log.info("[extract] cloudscraper FAILED (%s: %s) for %s", type(e).__name__, e, url)
            raise ExtractionError(
                f"Fetch failed (httpx + cloudscraper): {e}"
            ) from e

    msg = str(httpx_err) or (type(httpx_err).__name__ if httpx_err else "unknown")
    raise ExtractionError(f"Fetch failed: {msg}")


async def extract(
    url: str, *, scraper=None, prefer_scraper: bool = False,
) -> ExtractionResult:
    """Fetch `url`, run trafilatura, return cleaned content + metadata.

    Two-stage fetch: httpx (fast) → cloudscraper fallback on Cloudflare /
    timeout / 4xx-5xx-marked-as-WAF. Then content-type / size guards, then
    trafilatura extraction.

    For bulk imports against a WAF-protected source, pass:
      - `scraper`: a shared cloudscraper session (kept across many calls
        so the Cloudflare cookie persists)
      - `prefer_scraper=True`: skip the httpx attempt entirely. Otherwise
        every leaf eats a 15s httpx timeout before falling back, which
        dominates the per-leaf cost (~18s vs ~2s).

    Raises ExtractionError on any failure with a message safe to surface
    to the user (mapped to HTTP 422 by the API layer).
    """
    html, ctype, final_url = await _fetch_html(
        url, scraper=scraper, prefer_scraper=prefer_scraper,
    )
    ctype = ctype.lower()

    if "application/pdf" in ctype or url.lower().endswith(".pdf"):
        raise ExtractionError("PDFs are not supported yet")

    if ctype and "text/html" not in ctype and "application/xhtml" not in ctype:
        raise ExtractionError(f"Non-HTML content-type: {ctype}")

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
        log.info(
            "[extract] trafilatura returned %d chars (need %d) for %s",
            len(extracted_text or ""), _MIN_TEXT_LEN, url,
        )
        raise ExtractionError(
            "No readable content found (paywall, JS-only, or empty page)"
        )
    log.info("[extract] trafilatura → %d chars OK for %s", len(extracted_text), url)

    metadata = trafilatura.extract_metadata(html) or None
    title = _clean_title(
        (metadata.title if metadata and metadata.title else None)
        or _fallback_title_from_html(html)
        or "Sin título"
    )

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
        final_url=final_url,
    )


def _clean_title(raw: str) -> str:
    """Strip Sphinx pilcrow anchors (¶), normalize whitespace, cap length.
    Sphinx adds ¶ as the heading-anchor link character; trafilatura
    sometimes lifts it into the title. Other docs use § similarly. We
    drop both, plus any control characters and excessive whitespace."""
    cleaned = raw.replace("¶", "").replace("§", "")
    # Drop Mojibake-replacement char and other control chars.
    cleaned = re.sub(r"[\x00-\x1f�]", " ", cleaned)
    # Collapse whitespace.
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:500] or "Sin título"


def _fallback_title_from_html(html: str) -> str | None:
    """Last-ditch <title> regex if trafilatura's metadata extraction
    fails. Not robust against weird HTML but good enough for fallback."""
    match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return match.group(1).strip() if match else None
