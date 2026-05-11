"""Sphinx documentation adapter.

Sphinx (https://www.sphinx-doc.org/) is the most common Python doc
generator and powers Odoo, Django, NumPy, Pandas, FastAPI, Pydantic,
LangChain, Read-the-Docs sites, and many more.

Detection signals (in order of confidence):
  - <meta name="generator" content="Sphinx ..."> (some sites strip this)
  - DOM contains `.toctree-wrapper` (Sphinx-generated TOC blocks)
  - Anchors with class="reference internal" (Sphinx convention)
  - Sidebar nav classes: bd-sidebar, sphinxsidebar, wy-nav-side

Leaf enumeration: walk every <a class="reference internal" href="..."> in
TOC blocks, deduplicate, resolve relative URLs against the base, drop
fragments-only and external links. TOC path is derived from the URL
relative to base (e.g. "applications/essentials/stages.html" →
"applications/essentials/stages").
"""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse, urldefrag

from bs4 import BeautifulSoup, Tag

from .base import DocumentationAdapter, LeafEntry


class SphinxAdapter(DocumentationAdapter):
    name = "sphinx"

    def detect(self, html: str, url: str) -> float:
        confidence = 0.0
        # Strong: explicit generator meta.
        if re.search(
            r'<meta[^>]+name=["\']generator["\'][^>]+content=["\'][^"\']*sphinx',
            html,
            re.IGNORECASE,
        ):
            confidence = max(confidence, 0.95)
        # Medium: toctree wrapper class is virtually unique to Sphinx.
        if "toctree-wrapper" in html or 'class="toctree' in html:
            confidence = max(confidence, 0.85)
        # Weaker: sidebar conventions used by common Sphinx themes.
        for marker in ("sphinxsidebar", "wy-nav-side", "bd-sidebar"):
            if marker in html:
                confidence = max(confidence, 0.65)
                break
        # Weakest: reference-internal anchors used by Sphinx pages.
        if 'class="reference internal"' in html or "reference internal" in html:
            confidence = max(confidence, 0.45)
        return confidence

    def extract_source_name(self, html: str, url: str) -> str:
        """Use <title> with version stripped, or fallback to host + path."""
        soup = BeautifulSoup(html, "html.parser")
        title_tag = soup.find("title")
        if title_tag and title_tag.text.strip():
            t = title_tag.text.replace("¶", "").replace("§", "")
            # Drop Mojibake replacement chars and control chars.
            t = re.sub(r"[\x00-\x1f�]", " ", t)
            t = re.sub(r"\s+", " ", t).strip()
            # Sphinx titles often look like "Documentation — Project 1.0"
            # or "Project 1.0 documentation". Normalize separators.
            t = re.sub(r"\s*[—\-–|]\s*", " — ", t)
            return t[:200] or _path_to_title(urlparse(url).path)
        # Fallback: host + first path segment.
        parsed = urlparse(url)
        first_seg = parsed.path.strip("/").split("/", 1)[0] or ""
        host = parsed.hostname or url
        return f"{host}/{first_seg}".rstrip("/")[:200]

    def enumerate_leaves(self, html: str, base_url: str) -> list[LeafEntry]:
        soup = BeautifulSoup(html, "html.parser")

        # Sphinx puts internal links everywhere — a global TOC, per-page
        # TOCs, breadcrumbs. To get the canonical leaf list we prefer the
        # toctree-wrapper blocks (Sphinx's recursive TOC). If none exist,
        # fall back to all reference-internal anchors.
        toc_blocks: list[Tag] = soup.select("div.toctree-wrapper, .toctree-l1, nav.bd-toc")
        if toc_blocks:
            anchors: list[Tag] = []
            for block in toc_blocks:
                anchors.extend(block.find_all("a", class_="reference internal"))
        else:
            anchors = soup.find_all("a", class_="reference internal")

        seen: dict[str, LeafEntry] = {}
        order = 0
        base_parsed = urlparse(base_url)
        base_host = base_parsed.hostname

        for a in anchors:
            href = a.get("href")
            if not href or not isinstance(href, str):
                continue
            href, _frag = urldefrag(href.strip())
            if not href or href in ("/", "#"):
                continue
            absolute = urljoin(base_url, href)
            ap = urlparse(absolute)
            # Skip cross-host (Sphinx sometimes links to external Python
            # docs etc. via reference internal — we don't follow).
            if ap.hostname != base_host:
                continue
            if absolute in seen:
                continue
            title = (a.get_text() or "").strip() or _path_to_title(ap.path)
            toc_path = _url_to_toc_path(absolute, base_url)
            parent = _parent_toc_path(toc_path)
            seen[absolute] = LeafEntry(
                url=absolute,
                title=title[:300],
                toc_path=toc_path,
                parent_toc_path=parent,
                toc_order=order,
            )
            order += 1
        return list(seen.values())


def _url_to_toc_path(url: str, base_url: str) -> str:
    """Derive a TOC path from the URL relative to base.

    https://x.com/docs/19/applications/essentials/stages.html
      base = https://x.com/docs/19/
      → "applications/essentials/stages"
    """
    base_path = urlparse(base_url).path.rstrip("/")
    target_path = urlparse(url).path
    if target_path.startswith(base_path):
        target_path = target_path[len(base_path):].lstrip("/")
    target_path = re.sub(r"\.(html?|xhtml)$", "", target_path)
    return target_path or "index"


def _parent_toc_path(toc_path: str) -> str | None:
    if "/" not in toc_path:
        return None
    return toc_path.rsplit("/", 1)[0]


def _path_to_title(path: str) -> str:
    last = path.rstrip("/").rsplit("/", 1)[-1] or "index"
    last = re.sub(r"\.(html?|xhtml)$", "", last)
    return last.replace("_", " ").replace("-", " ").title()
