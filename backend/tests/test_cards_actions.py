"""Suspend/unsuspend logic — pure function tests on Supabase mock."""
from unittest.mock import MagicMock


def test_suspend_marks_schedule():
    client = MagicMock()
    eq_mock = client.table.return_value.update.return_value.eq.return_value.eq.return_value
    eq_mock.execute.return_value.data = [{"card_id": "abc", "suspended_at": "2026-04-25T12:00:00Z"}]

    from app.api.v1.cards import _suspend_schedule
    res = _suspend_schedule(client, "abc", "user-1")

    assert res["suspended_at"] is not None
    client.table.assert_called_with("card_schedule")


def test_unsuspend_clears_schedule():
    client = MagicMock()
    eq_mock = client.table.return_value.update.return_value.eq.return_value.eq.return_value
    eq_mock.execute.return_value.data = [{"card_id": "abc", "suspended_at": None}]

    from app.api.v1.cards import _unsuspend_schedule
    res = _unsuspend_schedule(client, "abc", "user-1")

    assert res is not None
    assert res["suspended_at"] is None
    client.table.assert_called_with("card_schedule")


def test_reset_returns_initial_snapshot_dict():
    from app.api.v1.cards import _reset_payload
    payload = _reset_payload()
    # FSRS v6 initial: state in {0,1}, stability/difficulty None.
    assert payload["fsrs_state"] in (0, 1)
    assert payload["fsrs_stability"] is None
    assert payload["fsrs_difficulty"] is None
    assert payload["last_reviewed_at"] is None
    assert "due_at" in payload


def test_move_card_to_deck_returns_updated_row():
    from app.api.v1.cards import _move_card_to_deck
    client = MagicMock()
    # Step 1: deck-exists check returns the deck.
    deck_check = client.table.return_value.select.return_value.eq.return_value.limit.return_value
    deck_check.execute.return_value.data = [{"id": "d1"}]
    # Step 2: update returns the updated card.
    upd = client.table.return_value.update.return_value.eq.return_value
    upd.execute.return_value.data = [
        {"id": "c1", "deck_id": "d1", "user_id": "u1"}
    ]
    res = _move_card_to_deck(client, card_id="c1", deck_id="d1")
    assert res["deck_id"] == "d1"


def test_move_card_to_deck_404_if_deck_missing():
    from fastapi import HTTPException
    from app.api.v1.cards import _move_card_to_deck
    client = MagicMock()
    deck_check = client.table.return_value.select.return_value.eq.return_value.limit.return_value
    deck_check.execute.return_value.data = []  # not found
    try:
        _move_card_to_deck(client, card_id="c1", deck_id="d1")
        assert False, "should have raised"
    except HTTPException as e:
        assert e.status_code == 404
