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
