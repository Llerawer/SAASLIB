"""Coverage service — status derivation, summary aggregation, query shape."""
from unittest.mock import MagicMock


def test_derive_status_thresholds():
    from app.services.coverage import derive_status
    assert derive_status(0) == "missing"
    assert derive_status(1) == "thin"
    assert derive_status(2) == "thin"
    assert derive_status(3) == "ok"
    assert derive_status(9) == "ok"
    assert derive_status(10) == "dense"
    assert derive_status(150) == "dense"


def test_summary_counts_by_status():
    from app.services.coverage import build_summary
    rows = [
        {"word": "a", "category": "pain", "priority": 10, "clips_count": 0,  "distinct_videos": 0},
        {"word": "b", "category": "pain", "priority": 10, "clips_count": 0,  "distinct_videos": 0},
        {"word": "c", "category": "pain", "priority": 20, "clips_count": 1,  "distinct_videos": 1},
        {"word": "d", "category": "pain", "priority": 20, "clips_count": 4,  "distinct_videos": 3},
        {"word": "e", "category": "pain", "priority": 20, "clips_count": 30, "distinct_videos": 12},
    ]
    summary = build_summary(rows)
    assert summary == {
        "total_words": 5,
        "missing": 2,
        "thin": 1,
        "ok": 1,
        "dense": 1,
    }


def test_attach_status_appends_status_field():
    from app.services.coverage import attach_status
    rows = [
        {"word": "a", "clips_count": 0},
        {"word": "b", "clips_count": 5},
    ]
    enriched = attach_status(rows)
    assert enriched[0]["status"] == "missing"
    assert enriched[1]["status"] == "ok"
    # Original fields preserved
    assert enriched[0]["word"] == "a"


def test_filter_rows_by_category():
    from app.services.coverage import filter_rows
    rows = [
        {"word": "a", "category": "pain"},
        {"word": "b", "category": "academic"},
    ]
    out = filter_rows(rows, category="pain", status=None)
    assert len(out) == 1
    assert out[0]["word"] == "a"


def test_filter_rows_by_status():
    from app.services.coverage import filter_rows
    rows = [
        {"word": "a", "status": "missing"},
        {"word": "b", "status": "ok"},
    ]
    out = filter_rows(rows, category=None, status="missing")
    assert len(out) == 1
    assert out[0]["word"] == "a"


def test_fetch_coverage_rows_query_shape():
    """Calls Supabase RPC with the join — verify the call surface."""
    from app.services.coverage import fetch_coverage_rows
    client = MagicMock()
    client.rpc.return_value.execute.return_value.data = [
        {"word": "x", "category": "frequency", "priority": 10,
         "clips_count": 5, "distinct_videos": 3},
    ]
    rows = fetch_coverage_rows(client)
    assert len(rows) == 1
    assert rows[0]["word"] == "x"
    client.rpc.assert_called_once()
    call_args = client.rpc.call_args
    assert call_args[0][0] == "coverage_rows"
