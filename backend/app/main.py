from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

import asyncio

from app.api.v1 import books, captures, cards, dictionary, reviews, stats
from app.core.auth import get_current_user_id
from app.core.config import settings
from app.core.http import close_client
from app.core.rate_limit import limiter
from app.services.gutenberg import warmup_popular


_background_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm cache for popular categories so the first user click is instant.
    # KEEP the reference — asyncio holds only weak refs; otherwise the task
    # can be garbage-collected mid-execution.
    task = asyncio.create_task(warmup_popular(), name="gutenberg-warmup")
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    yield
    # Cancel warmup if still running, then close pool.
    for t in list(_background_tasks):
        if not t.done():
            t.cancel()
    await close_client()


app = FastAPI(title="LinguaReader API", version="0.1.0", lifespan=lifespan)

# Rate limiting (slowapi).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — explicit method/header allowlist instead of "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Cache", "X-Cache-Age"],
    max_age=600,
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Defense-in-depth headers. CSP belongs on the frontend (Next.js
    config); these protect API responses against MIME sniffing, clickjacking
    and over-shared referrers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        if settings.ENVIRONMENT == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/v1/me")
async def me(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}


app.include_router(books.router)
app.include_router(captures.router)
app.include_router(cards.router)
app.include_router(dictionary.router)
app.include_router(reviews.router)
app.include_router(stats.router)
