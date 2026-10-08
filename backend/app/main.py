"""FastAPI entry point. Run with: uvicorn app.main:app --reload"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import auth
from app.config import FRONTEND_URL
from app.database import Base, SessionLocal, engine
from app.routes import router
from app.seed import seed_sample_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # On startup: create tables if they don't exist, then add sample meetings to an empty database.
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_sample_data(db)
    yield


app = FastAPI(title="Zoom Clone API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(router)


@app.exception_handler(RequestValidationError)
async def readable_validation_error(_request: Request, exc: RequestValidationError):
    """Turn FastAPI's detailed 422 list into one human-readable sentence for the UI."""
    error = exc.errors()[0]
    message = error["msg"].removeprefix("Value error, ")
    if error["type"] == "string_pattern_mismatch":  # only the email field uses a pattern
        message = "Enter a valid email address"
    field = error["loc"][-1] if len(error["loc"]) > 1 else None
    if isinstance(field, str):
        message = f"{field.replace('_', ' ').capitalize()}: {message}"
    return JSONResponse(status_code=422, content={"detail": message})


@app.get("/api/health")
def health():
    return {"status": "ok"}
