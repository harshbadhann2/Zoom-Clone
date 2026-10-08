"""App settings, read from environment variables (see backend/.env.example)."""

import os

# SQLite file location. Relative paths are resolved from the folder uvicorn runs in.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./zoom_clone.db")

# Where the Next.js frontend lives. Used to build invite links and for CORS.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
