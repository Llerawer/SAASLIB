"""Admin gating: only users listed in ADMIN_USER_IDS can hit /api/v1/admin/*.

Reuses the existing JWT auth (get_current_user_id). On top of that, checks
the user_id against a whitelist from env. Fails closed: empty whitelist
rejects everyone.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from app.core.auth import get_current_user_id
from app.core.config import settings


def _allowed_user_ids() -> set[str]:
    raw = settings.ADMIN_USER_IDS or ""
    return {part.strip() for part in raw.split(",") if part.strip()}


def require_admin(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    """FastAPI dependency. Returns user_id if admin; raises 403 otherwise."""
    allowed = _allowed_user_ids()
    if current_user_id not in allowed:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user_id
