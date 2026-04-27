"""User stats calculation with timezone-aware bucketing.

In-memory TTL cache (5 min) per user. Invalidated implicitly when the TTL
expires; for explicit invalidation after a grade, the SRS endpoint can
call invalidate(user_id).
"""
from __future__ import annotations

import threading
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, date, timedelta, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.db.supabase_client import get_admin_client

_TTL = timedelta(minutes=5)


@dataclass
class _CacheEntry:
    value: dict
    expires_at: datetime


_cache: dict[str, _CacheEntry] = {}
_lock = threading.Lock()


def invalidate(user_id: str) -> None:
    with _lock:
        _cache.pop(user_id, None)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user_tz(client, user_id: str) -> str:
    rows = (
        client.table("profiles")
        .select("timezone")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return (rows[0].get("timezone") if rows else None) or "UTC"


def _to_user_date(ts_iso: str | datetime, tz: ZoneInfo) -> str:
    if isinstance(ts_iso, datetime):
        dt = ts_iso if ts_iso.tzinfo else ts_iso.replace(tzinfo=timezone.utc)
    else:
        dt = datetime.fromisoformat(str(ts_iso).replace("Z", "+00:00"))
    return dt.astimezone(tz).date().isoformat()


def compute(user_id: str) -> dict[str, Any]:
    with _lock:
        cached = _cache.get(user_id)
        if cached and cached.expires_at > _now():
            return cached.value

    client = get_admin_client()
    tz_name = _user_tz(client, user_id)
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")

    now_utc = _now()
    today_user = now_utc.astimezone(tz).date()
    cutoff_90 = (now_utc - timedelta(days=90)).isoformat()
    cutoff_30 = (now_utc - timedelta(days=30)).isoformat()

    # Reviews in last 90 days.
    reviews = (
        client.table("reviews")
        .select("grade, reviewed_at")
        .eq("user_id", user_id)
        .gte("reviewed_at", cutoff_90)
        .execute()
        .data
        or []
    )

    # Captures in last 90 days (for heatmap).
    captures_recent = (
        client.table("captures")
        .select("captured_at")
        .eq("user_id", user_id)
        .gte("captured_at", cutoff_90)
        .execute()
        .data
        or []
    )

    # Total counts (lifetime).
    total_captures = (
        client.table("captures")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
        .count
        or 0
    )
    total_cards = (
        client.table("cards")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
        .count
        or 0
    )
    total_reviews = (
        client.table("reviews")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
        .count
        or 0
    )

    # Cards due now / done today.
    cards_today_due = (
        client.table("card_schedule")
        .select("card_id", count="exact")
        .eq("user_id", user_id)
        .lte("due_at", now_utc.isoformat())
        .execute()
        .count
        or 0
    )
    today_iso = today_user.isoformat()
    cards_today_done = sum(
        1 for r in reviews if _to_user_date(r["reviewed_at"], tz) == today_iso
    )

    # Retention 30d (Good + Easy) / total
    reviews_30 = [r for r in reviews if r["reviewed_at"] >= cutoff_30]
    total_30 = len(reviews_30)
    correct_30 = sum(1 for r in reviews_30 if int(r["grade"]) in (3, 4))
    retention_30d: float | None = correct_30 / total_30 if total_30 > 0 else None

    # Heatmap 90d
    by_day_reviews: dict[str, int] = defaultdict(int)
    for r in reviews:
        by_day_reviews[_to_user_date(r["reviewed_at"], tz)] += 1
    by_day_captures: dict[str, int] = defaultdict(int)
    for c in captures_recent:
        by_day_captures[_to_user_date(c["captured_at"], tz)] += 1

    heatmap = []
    for i in range(89, -1, -1):
        d = (today_user - timedelta(days=i)).isoformat()
        heatmap.append(
            {
                "date": d,
                "reviews": by_day_reviews.get(d, 0),
                "captures": by_day_captures.get(d, 0),
            }
        )

    # Streak: consecutive days with at least 1 review (or capture) ending today.
    streak = 0
    for i in range(0, 365):
        d = (today_user - timedelta(days=i)).isoformat()
        if by_day_reviews.get(d, 0) > 0 or by_day_captures.get(d, 0) > 0:
            streak += 1
        else:
            break

    # Cards due tomorrow (user-local window, converted to UTC for the query).
    # due_at is timestamptz; we build explicit UTC boundaries from user-local midnight
    # so the window is accurate regardless of the server's system timezone.
    tomorrow_user = today_user + timedelta(days=1)
    day_after_user = tomorrow_user + timedelta(days=1)
    tomorrow_utc = datetime.combine(tomorrow_user, time.min, tzinfo=tz).astimezone(timezone.utc)
    day_after_utc = datetime.combine(day_after_user, time.min, tzinfo=tz).astimezone(timezone.utc)
    cards_tomorrow_due = (
        client.table("card_schedule")
        .select("card_id", count="exact")
        .eq("user_id", user_id)
        .is_("suspended_at", "null")
        .gte("due_at", tomorrow_utc.isoformat())
        .lt("due_at", day_after_utc.isoformat())
        .execute()
        .count
        or 0
    )

    result = {
        "cards_today_due": cards_today_due,
        "cards_today_done": cards_today_done,
        "retention_30d": retention_30d,
        "streak_days": streak,
        "cards_tomorrow_due": cards_tomorrow_due,
        "heatmap_90d": heatmap,
        "totals": {
            "captures": total_captures,
            "cards": total_cards,
            "reviews": total_reviews,
        },
    }

    with _lock:
        _cache[user_id] = _CacheEntry(value=result, expires_at=_now() + _TTL)
    return result
