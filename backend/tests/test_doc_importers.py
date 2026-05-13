"""Documentation importer + Sphinx adapter unit tests.

HTML fixtures are minimal Sphinx-shaped pages — enough to exercise
detection signals and TOC parsing without requiring network."""
from __future__ import annotations

import pytest

from app.services.doc_importers.base import LeafEntry
from app.services.doc_importers.importer import (
    ADAPTERS,
    pick_adapter,
    preview,
)
from app.services.doc_importers.sphinx import (
    SphinxAdapter,
    _parent_toc_path,
    _url_to_toc_path,
)


SPHINX_INDEX_HTML = """<!doctype html>
<html>
<head>
  <meta name="generator" content="Sphinx 7.2.6">
  <title>Example Project Documentation</title>
</head>
<body>
  <nav class="bd-sidebar">
    <div class="toctree-wrapper">
      <ul>
        <li class="toctree-l1">
          <a class="reference internal" href="apps/intro.html">Introduction</a>
        </li>
        <li class="toctree-l1">
          <a class="reference internal" href="apps/install.html">Install</a>
          <ul>
            <li class="toctree-l2">
              <a class="reference internal" href="apps/install/linux.html">Linux</a>
            </li>
            <li class="toctree-l2">
              <a class="reference internal" href="apps/install/windows.html">Windows</a>
            </li>
          </ul>
        </li>
        <li class="toctree-l1">
          <a class="reference internal" href="#">(self)</a>
        </li>
      </ul>
    </div>
  </nav>
  <main><p>Welcome to Example Project documentation.</p></main>
</body>
</html>"""


GENERIC_BLOG_HTML = """<!doctype html>
<html>
<head><title>My Blog</title></head>
<body>
  <article>
    <h1>Hello world</h1>
    <p>Just a regular post, not documentation.</p>
  </article>
</body>
</html>"""


def test_sphinx_detects_with_meta_generator():
    adapter = SphinxAdapter()
    assert adapter.detect(SPHINX_INDEX_HTML, "https://x.com/docs/") >= 0.9


def test_sphinx_detects_without_meta_via_toctree_class():
    """Odoo strips the meta generator but keeps toctree-wrapper. Adapter
    must still detect at high confidence."""
    html = SPHINX_INDEX_HTML.replace(
        '<meta name="generator" content="Sphinx 7.2.6">', ""
    )
    adapter = SphinxAdapter()
    assert adapter.detect(html, "https://x.com/docs/") >= 0.85


def test_sphinx_does_not_detect_blog():
    adapter = SphinxAdapter()
    assert adapter.detect(GENERIC_BLOG_HTML, "https://x.com/blog/") == 0.0


def test_sphinx_extract_source_name():
    adapter = SphinxAdapter()
    name = adapter.extract_source_name(SPHINX_INDEX_HTML, "https://x.com/docs/")
    assert "Example Project" in name


def test_sphinx_enumerate_leaves_basic():
    adapter = SphinxAdapter()
    leaves = adapter.enumerate_leaves(SPHINX_INDEX_HTML, "https://x.com/docs/")
    # 4 internal anchors, 1 is "#" (skipped) → 4 unique leaves
    assert len(leaves) == 4
    urls = [le.url for le in leaves]
    assert "https://x.com/docs/apps/intro.html" in urls
    assert "https://x.com/docs/apps/install.html" in urls
    assert "https://x.com/docs/apps/install/linux.html" in urls
    assert "https://x.com/docs/apps/install/windows.html" in urls


def test_sphinx_enumerate_dedupes_repeated_links():
    """Sphinx puts each leaf in multiple places (global TOC + per-section).
    Adapter must dedupe by canonical URL."""
    html = """<html><body>
      <div class="toctree-wrapper">
        <a class="reference internal" href="a.html">A</a>
        <a class="reference internal" href="b.html">B</a>
      </div>
      <div class="toctree-wrapper">
        <a class="reference internal" href="a.html">A again</a>
      </div>
    </body></html>"""
    adapter = SphinxAdapter()
    leaves = adapter.enumerate_leaves(html, "https://x.com/docs/")
    assert len(leaves) == 2


def test_sphinx_enumerate_skips_cross_host_links():
    html = """<html><body>
      <div class="toctree-wrapper">
        <a class="reference internal" href="local.html">Local</a>
        <a class="reference internal" href="https://other.com/page.html">External</a>
      </div>
    </body></html>"""
    adapter = SphinxAdapter()
    leaves = adapter.enumerate_leaves(html, "https://x.com/docs/")
    assert len(leaves) == 1
    assert leaves[0].url == "https://x.com/docs/local.html"


def test_sphinx_leaf_toc_path_derivation():
    leaves = SphinxAdapter().enumerate_leaves(
        SPHINX_INDEX_HTML, "https://x.com/docs/"
    )
    by_url = {le.url: le for le in leaves}
    intro = by_url["https://x.com/docs/apps/intro.html"]
    assert intro.toc_path == "apps/intro"
    assert intro.parent_toc_path == "apps"
    linux = by_url["https://x.com/docs/apps/install/linux.html"]
    assert linux.toc_path == "apps/install/linux"
    assert linux.parent_toc_path == "apps/install"


def test_sphinx_leaf_toc_order_preserved():
    leaves = SphinxAdapter().enumerate_leaves(
        SPHINX_INDEX_HTML, "https://x.com/docs/"
    )
    orders = [le.toc_order for le in leaves]
    assert orders == sorted(orders)
    assert orders == [0, 1, 2, 3]


def test_url_to_toc_path_strips_html():
    p = _url_to_toc_path(
        "https://x.com/docs/19/apps/foo.html", "https://x.com/docs/19/"
    )
    assert p == "apps/foo"


def test_url_to_toc_path_index_returns_index():
    p = _url_to_toc_path("https://x.com/docs/", "https://x.com/docs/")
    assert p == "index"


def test_parent_toc_path_root():
    assert _parent_toc_path("intro") is None
    assert _parent_toc_path("apps/intro") == "apps"
    assert _parent_toc_path("apps/install/linux") == "apps/install"


def test_pick_adapter_picks_max_confidence():
    pick = pick_adapter(SPHINX_INDEX_HTML, "https://x.com/docs/")
    assert pick.adapter is not None
    assert pick.name == "sphinx"
    assert pick.confidence >= 0.9


def test_pick_adapter_returns_none_below_threshold():
    pick = pick_adapter(GENERIC_BLOG_HTML, "https://x.com/blog/")
    assert pick.adapter is None


def test_preview_returns_full_payload():
    pick, name, leaves = preview(SPHINX_INDEX_HTML, "https://x.com/docs/")
    assert pick.adapter is not None
    assert "Example Project" in name
    assert len(leaves) == 4
    assert all(isinstance(le, LeafEntry) for le in leaves)


def test_preview_unknown_returns_empty():
    pick, name, leaves = preview(GENERIC_BLOG_HTML, "https://x.com/")
    assert pick.adapter is None
    assert name == ""
    assert leaves == []


def test_stub_adapters_return_zero_confidence():
    """Docusaurus + MkDocs are scaffolded but not implemented. They must
    return 0.0 so the importer never tries to call enumerate_leaves on them."""
    html = '<meta name="generator" content="Docusaurus 3.0">'
    for ad in ADAPTERS:
        if ad.name in ("docusaurus", "mkdocs"):
            assert ad.detect(html, "https://x.com/") == 0.0
