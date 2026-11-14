from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .ai import AIError
from .config import get_settings
from .db import close_pool, init_pool
from .routers import auth, closet, insights, outfits

s = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(s.upload_dir).mkdir(parents=True, exist_ok=True)
    await init_pool(s.database_url)
    yield
    await close_pool()


app = FastAPI(title="Stylist AI API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "project": "OutFitLab API"}

@app.exception_handler(AIError)
async def ai_error_handler(_: Request, exc: AIError):
    return JSONResponse(status_code=502, content={"detail": f"AI-сервис: {exc}"})


for r in (auth.router, closet.router, outfits.router, insights.router):
    app.include_router(r, prefix="/api/v1")

import os

# Автоматически создаем папку для загрузок, если её нет
os.makedirs(s.upload_dir, exist_ok=True)

app.mount("/media", StaticFiles(directory=s.upload_dir), name="media")


@app.get("/health")
async def health():
    return {"ok": True}
