"""Unit tests for KeyPool — pure rotator with no I/O."""
from __future__ import annotations

import pytest

from app.services.enrichment.key_pool import KeyPool


class TestEmptyPool:
    def test_current_returns_none(self) -> None:
        assert KeyPool([]).current() is None

    def test_burn_is_noop(self) -> None:
        pool = KeyPool([])
        pool.burn_current()  # must not raise
        assert pool.current() is None

    def test_len_is_zero(self) -> None:
        assert len(KeyPool([])) == 0


class TestSingleKey:
    def test_current_returns_the_key(self) -> None:
        pool = KeyPool(["k1"])
        assert pool.current() == "k1"

    def test_current_is_idempotent(self) -> None:
        pool = KeyPool(["k1"])
        assert pool.current() == "k1"
        assert pool.current() == "k1"  # no advancement on read

    def test_burn_exhausts_pool(self) -> None:
        pool = KeyPool(["k1"])
        pool.burn_current()
        assert pool.current() is None

    def test_extra_burns_are_safe(self) -> None:
        pool = KeyPool(["k1"])
        pool.burn_current()
        pool.burn_current()  # already exhausted, must not raise
        assert pool.current() is None


class TestMultiKeyRotation:
    def test_burns_advance_in_order(self) -> None:
        pool = KeyPool(["k1", "k2", "k3"])
        assert pool.current() == "k1"
        pool.burn_current()
        assert pool.current() == "k2"
        pool.burn_current()
        assert pool.current() == "k3"
        pool.burn_current()
        assert pool.current() is None

    def test_len_reflects_capacity(self) -> None:
        assert len(KeyPool(["k1", "k2", "k3"])) == 3

    def test_capacity_is_stable_across_burns(self) -> None:
        # len() reports capacity (for the retry-loop bound), NOT remaining.
        pool = KeyPool(["k1", "k2"])
        pool.burn_current()
        assert len(pool) == 2


class TestReset:
    def test_reset_restores_first_key_after_full_burn(self) -> None:
        pool = KeyPool(["k1", "k2"])
        pool.burn_current()
        pool.burn_current()
        assert pool.current() is None
        pool.reset()
        assert pool.current() == "k1"

    def test_reset_on_partial_burn(self) -> None:
        pool = KeyPool(["k1", "k2"])
        pool.burn_current()
        pool.reset()
        assert pool.current() == "k1"

    def test_reset_on_empty_pool_is_safe(self) -> None:
        pool = KeyPool([])
        pool.reset()
        assert pool.current() is None


class TestKeyTrimming:
    def test_strips_whitespace_from_keys(self) -> None:
        # Real-world env vars often have stray whitespace around commas
        pool = KeyPool(["  k1 ", "k2"])
        assert pool.current() == "k1"
        pool.burn_current()
        assert pool.current() == "k2"

    def test_drops_empty_strings(self) -> None:
        # KeyPool(["k1", "", "k2"]) should expose 2 keys, not 3
        pool = KeyPool(["k1", "", "k2"])
        assert len(pool) == 2
        assert pool.current() == "k1"
        pool.burn_current()
        assert pool.current() == "k2"


class TestFromCsv:
    """`from_csv` is the convenience constructor consumers use directly
    against the env var string, so callers don't need to split themselves."""

    def test_from_empty_string_yields_empty_pool(self) -> None:
        pool = KeyPool.from_csv("")
        assert len(pool) == 0
        assert pool.current() is None

    def test_from_whitespace_only_yields_empty_pool(self) -> None:
        assert len(KeyPool.from_csv("   ")) == 0

    def test_from_csv_splits_and_trims(self) -> None:
        pool = KeyPool.from_csv(" k1 ,k2 , k3")
        assert len(pool) == 3
        assert pool.current() == "k1"

    def test_from_csv_drops_empty_segments(self) -> None:
        # ",k1,,k2," should yield 2 keys
        pool = KeyPool.from_csv(",k1,,k2,")
        assert len(pool) == 2
        assert pool.current() == "k1"


def test_concurrent_burns_do_not_double_advance() -> None:
    """Multiple threads burning the current key concurrently should not
    advance the pointer past the count of distinct burns. Without the
    lock, two threads could each read idx=0, both increment, and we'd
    skip k2 entirely."""
    import threading

    pool = KeyPool(["k1", "k2", "k3", "k4", "k5"])
    barrier = threading.Barrier(3)

    def burner() -> None:
        barrier.wait()
        pool.burn_current()

    threads = [threading.Thread(target=burner) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Three burns should land on k4 (not k5 or beyond).
    assert pool.current() == "k4"
