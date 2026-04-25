from functools import lru_cache

import httpx
from fastapi import Header, HTTPException
from jose import JWTError, jwt

from app.core.config import settings


def _jwks_url() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _fetch_jwks() -> dict:
    r = httpx.get(_jwks_url(), timeout=10.0)
    r.raise_for_status()
    return r.json()


def _find_key(kid: str) -> dict | None:
    jwks = _fetch_jwks()
    return next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)


async def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]

    try:
        unverified_headers = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(401, f"Malformed token: {e}") from e

    alg = unverified_headers.get("alg", "ES256")
    kid = unverified_headers.get("kid")

    if alg == "HS256":
        # Legacy projects with shared JWT secret.
        if not settings.SUPABASE_JWT_SECRET:
            raise HTTPException(
                401, "Token signed HS256 but SUPABASE_JWT_SECRET not configured"
            )
        key: dict | str = settings.SUPABASE_JWT_SECRET
    else:
        # Modern projects: asymmetric signing (ES256/RS256) via JWKS.
        if not kid:
            raise HTTPException(401, "Token has no kid header")
        jwk = _find_key(kid)
        if jwk is None:
            _fetch_jwks.cache_clear()
            jwk = _find_key(kid)
        if jwk is None:
            raise HTTPException(401, f"Unknown signing key kid={kid}")
        key = jwk

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
        )
    except JWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e

    return payload["sub"]
