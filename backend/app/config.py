"""App settings, read from environment variables (see backend/.env.example)."""

import os

# SQLite file location. Relative paths are resolved from the folder uvicorn runs in.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./zoom_clone.db")

# Where the Next.js frontend lives. Used to build invite links and for CORS.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")

# Optional TURN relay for WebRTC. Browsers that can't connect directly (common on mobile data and
# strict firewalls) need one. Configure EITHER Cloudflare (short-lived credentials, generated here)...
CLOUDFLARE_TURN_KEY_ID = os.getenv("CLOUDFLARE_TURN_KEY_ID", "")
CLOUDFLARE_TURN_API_TOKEN = os.getenv("CLOUDFLARE_TURN_API_TOKEN", "")
# ...OR any TURN server with a fixed username/password (comma-separated URLs).
TURN_URLS = [url.strip() for url in os.getenv("TURN_URLS", "").split(",") if url.strip()]
TURN_USERNAME = os.getenv("TURN_USERNAME", "")
TURN_CREDENTIAL = os.getenv("TURN_CREDENTIAL", "")
