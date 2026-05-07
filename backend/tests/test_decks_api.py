"""Decks API — unit tests on Supabase mock."""
from unittest.mock import MagicMock


def test_list_decks_returns_tree_with_counts():
    from app.api.v1.decks import _build_deck_response
    rows = [
        {
            "id": "d1", "user_id": "u1", "parent_id": None,
            "name": "Inbox", "color_hue": 220, "icon": "inbox",
            "is_inbox": True, "created_at": "2026-05-07T00:00:00Z",
        },
        {
            "id": "d2", "user_id": "u1", "parent_id": None,
            "name": "English", "color_hue": 210, "icon": "book",
            "is_inbox": False, "created_at": "2026-05-07T00:00:00Z",
        },
        {
            "id": "d3", "user_id": "u1", "parent_id": "d2",
            "name": "Reading", "color_hue": None, "icon": None,
            "is_inbox": False, "created_at": "2026-05-07T00:00:00Z",
        },
    ]
    counts = {
        "d1": {"direct": 5, "due": 2},
        "d2": {"direct": 0, "due": 0},
        "d3": {"direct": 8, "due": 3},
    }
    out = _build_deck_response(rows, counts)
    assert len(out) == 3
    inbox = next(d for d in out if d["id"] == "d1")
    assert inbox["is_inbox"] is True
    assert inbox["direct_card_count"] == 5
    assert inbox["direct_due_count"] == 2
    english = next(d for d in out if d["id"] == "d2")
    assert english["direct_card_count"] == 0
    assert english["descendant_card_count"] == 8
    assert english["descendant_due_count"] == 3


def test_list_decks_isolated_per_user():
    from app.api.v1.decks import _fetch_user_decks
    client = MagicMock()
    client.table.return_value.select.return_value.order.return_value.execute.return_value.data = []
    result = _fetch_user_decks(client)
    assert result == []
    client.table.assert_called_with("decks")
