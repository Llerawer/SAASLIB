"""Shared httpx.AsyncClient — one pool for the whole app.

Why: creating a new AsyncClient per request costs a fresh DNS+TCP+TLS
handshake (~200-400ms to gutenberg.org / api.deepl.com). With one pooled
client, those connections stay keep-alive between calls.

Lifecycle: lazily created on first use, closed in FastAPI's lifespan
shutdown so connections don't linger in TIME_WAIT.
"""
from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=50,
                keepalive_expiry=60.0,
            ),
            follow_redirects=True,
            headers={"User-Agent": "LinguaReader/0.1 (+https://linguareader.local)"},
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
