from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import books, captures, dictionary
from app.core.auth import get_current_user_id
from app.core.config import settings

app = FastAPI(title="LinguaReader API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/v1/me")
async def me(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}


app.include_router(books.router)
app.include_router(captures.router)
app.include_router(dictionary.router)
