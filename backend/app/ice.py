"""Which STUN/TURN servers the browsers should use to connect their WebRTC audio/video.

- STUN (always): lets a browser learn its public address, enough for most home networks.
- TURN (optional): a relay that forwards the media when a direct connection is impossible.
  Credentials stay on the server; participants receive them only through an authenticated request.
"""

import json
import logging
import urllib.request

from app import config

STUN_SERVER = {"urls": ["stun:stun.l.google.com:19302"]}
CLOUDFLARE_URL = "https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers"
CREDENTIAL_TTL_SECONDS = 6 * 60 * 60

log = logging.getLogger(__name__)


def get_ice_servers() -> dict:
    """Return {"ice_servers": [...], "relay": bool}. Falls back to STUN only if no relay is configured or reachable."""
    if config.CLOUDFLARE_TURN_KEY_ID and config.CLOUDFLARE_TURN_API_TOKEN:
        try:
            return {"ice_servers": cloudflare_ice_servers(), "relay": True}
        except Exception:  # Cloudflare down or misconfigured: still let people connect where STUN works
            log.exception("Could not get TURN credentials from Cloudflare")
    if config.TURN_URLS:
        turn = {"urls": config.TURN_URLS, "username": config.TURN_USERNAME, "credential": config.TURN_CREDENTIAL}
        return {"ice_servers": [STUN_SERVER, turn], "relay": True}
    return {"ice_servers": [STUN_SERVER], "relay": False}


def cloudflare_ice_servers() -> list[dict]:
    """Ask Cloudflare for short-lived TURN credentials (Cloudflare Realtime TURN)."""
    request = urllib.request.Request(
        CLOUDFLARE_URL.format(key_id=config.CLOUDFLARE_TURN_KEY_ID),
        data=json.dumps({"ttl": CREDENTIAL_TTL_SECONDS}).encode(),
        headers={"Authorization": f"Bearer {config.CLOUDFLARE_TURN_API_TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        servers = json.load(response)["iceServers"]
    return servers if isinstance(servers, list) else [servers]
