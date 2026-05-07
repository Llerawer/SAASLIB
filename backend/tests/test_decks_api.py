"""Decks API -- unit tests on Supabase mock."""
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


def test_would_create_cycle_detects_self_parent():
    from app.api.v1.decks import _would_create_cycle
    rows = [
        {"id": "a", "parent_id": None},
        {"id": "b", "parent_id": "a"},
    ]
    assert _would_create_cycle(rows, deck_id="b", new_parent_id="b") is True


def test_would_create_cycle_detects_descendant_parent():
    from app.api.v1.decks import _would_create_cycle
    rows = [
        {"id": "a", "parent_id": None},
        {"id": "b", "parent_id": "a"},
        {"id": "c", "parent_id": "b"},
    ]
    assert _would_create_cycle(rows, deck_id="a", new_parent_id="c") is True


def test_would_not_cycle_for_unrelated_parent():
    from app.api.v1.decks import _would_create_cycle
    rows = [
        {"id": "a", "parent_id": None},
        {"id": "b", "parent_id": "a"},
        {"id": "c", "parent_id": None},
    ]
    assert _would_create_cycle(rows, deck_id="b", new_parent_id="c") is False


def test_would_not_cycle_for_root_move():
    from app.api.v1.decks import _would_create_cycle
    rows = [
        {"id": "a", "parent_id": "x"},
    ]
    assert _would_create_cycle(rows, deck_id="a", new_parent_id=None) is False


def test_delete_check_empty_deck():
    from app.api.v1.decks import _check_deck_empty
    client = MagicMock()
    # The implementation calls .eq().limit(1).execute(); mock at .limit.return_value.
    chain = client.table.return_value.select.return_value.eq.return_value.limit.return_value
    chain.execute.side_effect = [
        MagicMock(data=[]),  # children check
        MagicMock(data=[]),  # cards check
    ]
    _check_deck_empty(client, deck_id="d1", is_inbox=False)
    # Did not raise.


def test_delete_blocks_inbox():
    from fastapi import HTTPException
    from app.api.v1.decks import _check_deck_empty
    client = MagicMock()
    try:
        _check_deck_empty(client, deck_id="d1", is_inbox=True)
        assert False, "should have raised"
    except HTTPException as e:
        assert e.status_code == 409
        assert "Inbox" in e.detail


def test_delete_blocks_with_children():
    from fastapi import HTTPException
    from app.api.v1.decks import _check_deck_empty
    client = MagicMock()
    chain = client.table.return_value.select.return_value.eq.return_value.limit.return_value
    chain.execute.side_effect = [
        MagicMock(data=[{"id": "child1"}]),  # children present
    ]
    try:
        _check_deck_empty(client, deck_id="d1", is_inbox=False)
        assert False, "should have raised"
    except HTTPException as e:
        assert e.status_code == 409
        assert "subdecks" in e.detail


def test_delete_blocks_with_cards():
    from fastapi import HTTPException
    from app.api.v1.decks import _check_deck_empty
    client = MagicMock()
    chain = client.table.return_value.select.return_value.eq.return_value.limit.return_value
    chain.execute.side_effect = [
        MagicMock(data=[]),                          # children empty
        MagicMock(data=[{"id": "card1"}]),           # but cards present
    ]
    try:
        _check_deck_empty(client, deck_id="d1", is_inbox=False)
        assert False, "should have raised"
    except HTTPException as e:
        assert e.status_code == 409
        assert "cards" in e.detail


def test_cards_in_deck_direct_only():
    from app.api.v1.decks import _list_cards_in_deck
    client = MagicMock()
    # Mock chain matches the actual implementation:
    # .table("cards").select("*").in_("deck_id", ids).order(...).range(...).execute()
    chain = (
        client.table.return_value
        .select.return_value
        .in_.return_value
        .order.return_value
        .range.return_value
    )
    chain.execute.return_value.data = [
        {"id": "c1", "deck_id": "d1", "due_at": "2026-05-08", "user_id": "u1"}
    ]
    cards = _list_cards_in_deck(
        client, deck_ids=["d1"], limit=200, offset=0
    )
    assert len(cards) == 1
    assert cards[0]["deck_id"] == "d1"


def test_cards_in_deck_subtree_uses_rpc():
    from app.api.v1.decks import _resolve_subtree_ids
    client = MagicMock()
    client.rpc.return_value.execute.return_value.data = [
        {"id": "d1"}, {"id": "d2"}, {"id": "d3"}
    ]
    ids = _resolve_subtree_ids(client, root_id="d1")
    assert ids == ["d1", "d2", "d3"]
    client.rpc.assert_called_with("decks_subtree_ids", {"root_id": "d1"})


def test_queue_filters_by_deck_subtree(monkeypatch):
    """If deck_id is passed, queue must use _resolve_subtree_ids."""
    from app.api.v1 import reviews as reviews_module
    called = {}

    def fake_subtree(client, root_id):
        called["root_id"] = root_id
        return [root_id, "d-child"]

    monkeypatch.setattr(reviews_module, "_resolve_subtree_ids", fake_subtree)
    ids = reviews_module._build_queue_filter(client=MagicMock(), deck_id="d1")
    assert ids == ["d1", "d-child"]
    assert called["root_id"] == "d1"


def test_queue_no_deck_id_returns_none():
    from app.api.v1 import reviews as reviews_module
    ids = reviews_module._build_queue_filter(client=MagicMock(), deck_id=None)
    assert ids is None


def test_promote_auto_assigns_book_deck():
    from app.api.v1.captures import _ensure_book_deck
    client = MagicMock()
    sel = client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value
    sel.execute.return_value.data = []
    ins = client.table.return_value.insert.return_value
    ins.execute.return_value.data = [{"id": "deck-new"}]
    deck_id = _ensure_book_deck(
        client, user_id="u1", book_id="b1", book_title="Sherlock"
    )
    assert deck_id == "deck-new"


def test_promote_no_book_uses_inbox():
    from app.api.v1.captures import _ensure_inbox_deck
    client = MagicMock()
    sel = client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value
    sel.execute.return_value.data = [{"id": "inbox-id"}]
    deck_id = _ensure_inbox_deck(client, user_id="u1")
    assert deck_id == "inbox-id"
