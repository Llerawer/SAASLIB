"""article_extractor service unit tests."""
import pytest

from app.services.article_extractor import normalize_url


def test_normalize_lowercases_host():
    canonical, _ = normalize_url("https://Example.COM/path")
    assert canonical == "https://example.com/path"


def test_normalize_strips_trailing_slash():
    canonical, _ = normalize_url("https://example.com/path/")
    assert canonical == "https://example.com/path"


def test_normalize_preserves_root_slash():
    canonical, _ = normalize_url("https://example.com/")
    assert canonical == "https://example.com/"


def test_normalize_drops_fragment():
    canonical, _ = normalize_url("https://example.com/page#section-2")
    assert canonical == "https://example.com/page"


def test_normalize_strips_tracking_params():
    canonical, _ = normalize_url(
        "https://example.com/p?utm_source=twitter&id=42&fbclid=xyz"
    )
    assert "utm_source" not in canonical
    assert "fbclid" not in canonical
    assert "id=42" in canonical


def test_normalize_sorts_remaining_params():
    a, _ = normalize_url("https://example.com/p?z=1&a=2")
    b, _ = normalize_url("https://example.com/p?a=2&z=1")
    assert a == b


def test_normalize_returns_stable_hash():
    _, h1 = normalize_url("https://Example.com/p?utm_source=x")
    _, h2 = normalize_url("https://example.com/p")
    assert h1 == h2
    assert len(h1) == 64  # sha256 hex digest


def test_normalize_strips_whitespace():
    canonical, _ = normalize_url("  https://example.com/p  ")
    assert canonical == "https://example.com/p"


from unittest.mock import AsyncMock, MagicMock, patch

from app.services.article_extractor import ExtractionError, extract


_VALID_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta name="generator" content="Sphinx 7.2.6">
  <title>Example Article — A useful guide to widgets</title>
  <meta name="author" content="Jane Doe">
</head>
<body>
  <header>Site header that should be stripped</header>
  <main>
    <article>
      <h1>Example Article</h1>
      <p>Widgets are a fundamental concept in software engineering. They
      represent reusable units of UI that encapsulate state and behavior.</p>
      <h2>Getting started</h2>
      <p>To create your first widget, install the SDK and follow the
      tutorial. The SDK provides a CLI tool for scaffolding new widgets.</p>
      <pre><code>npm install widget-sdk</code></pre>
      <p>Once installed, you can create widgets with a single command. The
      tooling will generate the necessary boilerplate for you.</p>
    </article>
  </main>
  <footer>Footer that should be stripped</footer>
</body>
</html>"""


_PAYWALL_HTML = """<!doctype html>
<html><body>
  <h1>Subscribe to read</h1>
  <p>Sign in or subscribe to access this article.</p>
</body></html>"""


def _build_response_mock(text: str, content_type: str = "text/html"):
    resp = MagicMock()
    resp.text = text
    resp.raise_for_status = MagicMock(return_value=None)
    resp.status_code = 200
    resp.headers = {"content-type": content_type}
    return resp


def _build_client_mock(response):
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    client.get = AsyncMock(return_value=response)
    return client


@pytest.mark.asyncio
async def test_extract_returns_clean_content():
    client_mock = _build_client_mock(_build_response_mock(_VALID_HTML))
    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        result = await extract("https://example.com/article")

    assert "Example Article" in result.title
    assert "Widgets" in result.text_clean
    assert "Site header" not in result.text_clean
    assert "Footer" not in result.text_clean
    assert result.word_count > 30
    assert len(result.content_hash) == 64
    assert result.html_clean.startswith("<")  # has tags


@pytest.mark.asyncio
async def test_extract_rejects_paywall_short_content():
    client_mock = _build_client_mock(_build_response_mock(_PAYWALL_HTML))
    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        with pytest.raises(ExtractionError, match="readable content"):
            await extract("https://example.com/paywall")


@pytest.mark.asyncio
async def test_extract_raises_on_network_failure():
    client_mock = AsyncMock()
    client_mock.__aenter__.return_value = client_mock
    client_mock.__aexit__.return_value = False
    client_mock.get = AsyncMock(side_effect=httpx.ConnectError("network down"))

    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        with pytest.raises(ExtractionError, match="Fetch failed"):
            await extract("https://example.com/down")


@pytest.mark.asyncio
async def test_extract_rejects_pdf_content_type():
    client_mock = _build_client_mock(
        _build_response_mock("%PDF-1.4 garbage", content_type="application/pdf"),
    )
    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        with pytest.raises(ExtractionError, match="PDF"):
            await extract("https://example.com/file.pdf")


def test_extract_word_count_matches_re():
    """Sanity: count_words helper should match \\b\\w+\\b regex."""
    from app.services.article_extractor import _count_words
    assert _count_words("hello world") == 2
    assert _count_words("one,two; three!") == 3
    assert _count_words("") == 0
    assert _count_words("hyphen-word") == 2  # `\b\w+\b` splits on `-`


def test_looks_waf_blocked_status_codes():
    from app.services.article_extractor import _looks_waf_blocked
    # 403 / 429 / 503 always look WAF-y regardless of body.
    assert _looks_waf_blocked(403, "anything")
    assert _looks_waf_blocked(429, "anything")
    assert _looks_waf_blocked(503, "anything")
    # 200/404 don't trigger fallback even with empty body.
    assert not _looks_waf_blocked(200, "<html>real content</html>")
    assert not _looks_waf_blocked(404, "Not Found")


def test_looks_waf_blocked_body_markers():
    from app.services.article_extractor import _looks_waf_blocked
    # Cloudflare challenge interstitial.
    assert _looks_waf_blocked(200, "<html>Checking your browser before...</html>")
    assert _looks_waf_blocked(200, '<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1?ray=cf-chl"></script>')
    # Imperva.
    assert _looks_waf_blocked(200, "var _Incapsula_Resource = ...")
    # Plain content doesn't trigger.
    assert not _looks_waf_blocked(200, "<html><body><p>Real article text here.</p></body></html>")


import httpx  # noqa: E402  -- needed for the network failure test above
