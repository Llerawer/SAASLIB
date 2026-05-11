"""article_sources API + source_importer unit tests.

Pattern: mock supabase client like tests/test_decks_api.py + assert pure
helper logic. The background task is exercised in isolation via
import_source() with a mock client + handcrafted leaves."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.doc_importers.base import LeafEntry


def _supabase_mock(data=None):
    client = MagicMock()
    chain = client.table.return_value
    for method in (
        "select", "insert", "update", "delete", "eq", "order",
        "single", "limit",
    ):
        getattr(chain, method).return_value = chain
    chain.execute.return_value.data = data
    return client, chain


def test_hash_url_is_deterministic():
    from app.api.v1.article_sources import _hash_url
    a = _hash_url("https://example.com/docs/")
    b = _hash_url("https://example.com/docs/")
    assert a == b
    assert len(a) == 64


def test_to_source_out_round_trip():
    from app.api.v1.article_sources import _to_source_out
    row = {
        "id": "s1",
        "user_id": "u1",
        "name": "Odoo 19",
        "root_url": "https://www.odoo.com/documentation/19.0/",
        "generator": "sphinx",
        "import_status": "importing",
        "discovered_pages": 487,
        "queued_pages": 487,
        "processed_pages": 12,
        "failed_pages": 1,
        "started_at": "2026-05-09T00:00:00Z",
        "finished_at": None,
        "error_message": None,
    }
    out = _to_source_out(row)
    assert out.name == "Odoo 19"
    assert out.import_status == "importing"
    assert out.processed_pages == 12


@pytest.mark.asyncio
async def test_import_source_empty_leaves_marks_done_immediately():
    from app.services.source_importer import import_source
    client, chain = _supabase_mock(data=[])
    await import_source(
        client=client,
        source_id="s1",
        user_id="u1",
        leaves=[],
        source_name="Empty",
    )
    # Should have called update with done status, no inserts.
    update_calls = [
        c for c in chain.update.call_args_list
        if c.args and c.args[0].get("import_status") == "done"
    ]
    assert len(update_calls) == 1


@pytest.mark.asyncio
async def test_import_source_processes_leaves_and_finalizes_done(monkeypatch):
    """Happy path: 3 leaves all extract OK → status='done', counters
    reflect 3 processed."""
    from app.services import source_importer

    async def fake_extract(url, *, scraper=None, prefer_scraper=False):
        from app.services.article_extractor import ExtractionResult
        return ExtractionResult(
            title="t", author=None, language="en",
            html_clean=f"<p>{url}</p>", text_clean=f"text from {url}",
            word_count=3, content_hash="h",
        )
    monkeypatch.setattr(source_importer, "extract", fake_extract)

    client, chain = _supabase_mock(data=[])
    leaves = [
        LeafEntry(url=f"https://x.com/p/{i}", title=f"L{i}",
                  toc_path=f"p/{i}", parent_toc_path="p", toc_order=i)
        for i in range(3)
    ]
    await source_importer.import_source(
        client=client, source_id="s1", user_id="u1",
        leaves=leaves, source_name="X",
    )

    # 3 inserts into articles + at least 1 final update with status='done'.
    inserts = [
        c for c in chain.insert.call_args_list if c.args
    ]
    assert len(inserts) == 3
    final_updates = [
        c for c in chain.update.call_args_list
        if c.args and c.args[0].get("import_status") == "done"
    ]
    assert len(final_updates) == 1
    assert final_updates[0].args[0]["processed_pages"] == 3
    assert final_updates[0].args[0]["failed_pages"] == 0


@pytest.mark.asyncio
async def test_import_source_marks_partial_on_some_failures(monkeypatch):
    """If some leaves fail extraction, final status should be 'partial'."""
    from app.services import source_importer
    from app.services.article_extractor import ExtractionError

    call_count = {"n": 0}

    async def flaky_extract(url, *, scraper=None, prefer_scraper=False):
        from app.services.article_extractor import ExtractionResult
        call_count["n"] += 1
        # Make the failure permanent so retries don't mask it.
        if "p/1" in url:
            raise ExtractionError("no readable content found")
        return ExtractionResult(
            title="t", author=None, language="en",
            html_clean="<p>ok</p>", text_clean="ok ok ok",
            word_count=3, content_hash="h",
        )
    monkeypatch.setattr(source_importer, "extract", flaky_extract)

    client, chain = _supabase_mock(data=[])
    leaves = [
        LeafEntry(url=f"https://x.com/p/{i}", title=f"L{i}",
                  toc_path=f"p/{i}", parent_toc_path="p", toc_order=i)
        for i in range(3)
    ]
    await source_importer.import_source(
        client=client, source_id="s1", user_id="u1",
        leaves=leaves, source_name="X",
    )

    final = [
        c for c in chain.update.call_args_list
        if c.args and c.args[0].get("import_status") == "partial"
    ]
    assert len(final) == 1
    assert final[0].args[0]["processed_pages"] == 2
    assert final[0].args[0]["failed_pages"] == 1


@pytest.mark.asyncio
async def test_import_source_dedupes_existing_articles(monkeypatch):
    """If the user already has an article with the same url_hash, the
    importer should NOT re-insert and count it as processed (silent skip)."""
    from app.services import source_importer

    async def fake_extract(url, *, scraper=None, prefer_scraper=False):
        raise AssertionError("Should not call extract for dedup hits")
    monkeypatch.setattr(source_importer, "extract", fake_extract)

    # Mock client returns existing article on the first select.
    client = MagicMock()
    chain = client.table.return_value
    for m in ("select", "insert", "update", "delete", "eq", "order", "limit"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value.data = [{"id": "existing"}]

    leaves = [
        LeafEntry(url="https://x.com/p/1", title="L1",
                  toc_path="p/1", parent_toc_path="p", toc_order=0),
    ]
    await source_importer.import_source(
        client=client, source_id="s1", user_id="u1",
        leaves=leaves, source_name="X",
    )

    # Final status='done', processed=1 (treated as success), no insert.
    final = [
        c for c in chain.update.call_args_list
        if c.args and c.args[0].get("import_status") == "done"
    ]
    assert len(final) == 1
    assert final[0].args[0]["processed_pages"] == 1
