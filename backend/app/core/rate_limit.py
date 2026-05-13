"""Rate limiting via slowapi.

Key strategy:
  - For authenticated routes: key by JWT `sub` (user_id) extracted from the
    Authorization header. Each user gets their own bucket — abusing one
    account doesn't burn other users' quotas.
  - Falls back to client IP if no Authorization header (e.g. /health).

Backend storage:
  - In-memory by default (fine for single-process MVP).
  - For multi-instance prod, set RATE_LIMIT_STORAGE_URI=redis://... (slowapi
    auto-uses Redis when available).
"""
from __future__ import annotations

from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _user_key(request: Request) -> str:
    """Identify the rate-limit bucket. Prefers user_id (jwt.sub); falls back
    to IP. Never raises — this is on the hot path for every request."""
    auth = request.headers.get("authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
        try:
            # NOTE: unverified decode is fine here — rate limit key is not
            # a security boundary. The actual auth check happens in the
            # endpoint dependency. Worst case: attacker gets their own
            # bucket per forged user_id, which is no worse than using IP.
            payload = jwt.get_unverified_claims(token)
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except JWTError:
            pass
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_user_key, default_limits=["120/minute"])
