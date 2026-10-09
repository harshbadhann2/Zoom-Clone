from datetime import datetime, timedelta, timezone

from app.seed import DEMO_EMAIL, DEMO_PASSWORD, seed_sample_data

HOST = "Harsh Badhan"


def iso_in(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def create_instant(client, headers):
    response = client.post("/api/meetings", json={"meeting_type": "instant"}, headers=headers)
    assert response.status_code == 201
    return response.json()


def schedule(client, headers, **overrides):
    body = {
        "meeting_type": "scheduled",
        "title": "Design Review",
        "description": "Review mockups",
        "scheduled_at": iso_in(3),
        "duration_minutes": 45,
        **overrides,
    }
    return client.post("/api/meetings", json=body, headers=headers)


def join(client, code, name="Guest", headers=None, **extra):
    return client.post(f"/api/meetings/{code}/join", json={"display_name": name, **extra}, headers=headers)


def start(client, code, headers, name=HOST):
    """The host's way in (dashboard Start / New meeting): requires signing in as the owner."""
    return client.post(f"/api/meetings/{code}/start", json={"display_name": name}, headers=headers)


def as_participant(participant: dict) -> dict:
    """The header that proves who a participant is (returned only to them when they joined)."""
    return {"X-Participant-Token": participant["token"]}


# ---------- Creation ----------

def test_instant_meeting_gets_id_link_and_is_live(client, auth_headers):
    meeting = create_instant(client, auth_headers)

    assert len(meeting["meeting_code"]) == 10 and meeting["meeting_code"].isdigit()
    assert meeting["invite_link"].endswith(f"/join/{meeting['meeting_code']}")
    assert meeting["status"] == "live"
    assert meeting["host_name"] == HOST
    assert meeting["title"] == f"{HOST}'s Zoom Meeting"


def test_meeting_codes_are_unique(client, auth_headers):
    codes = {create_instant(client, auth_headers)["meeting_code"] for _ in range(25)}
    assert len(codes) == 25


def test_creating_a_meeting_requires_sign_in(client):
    response = client.post("/api/meetings", json={"meeting_type": "instant"})
    assert response.status_code == 401


# ---------- Retrieval ----------

def test_get_meeting_returns_stored_meeting(client, auth_headers):
    created = create_instant(client, auth_headers)
    response = client.get(f"/api/meetings/{created['meeting_code']}")  # public: guests need it too

    assert response.status_code == 200
    assert response.json()["title"] == created["title"]
    assert response.json()["active_participants"] == []
    assert response.json()["messages"] == []


def test_unknown_meeting_returns_404(client):
    response = client.get("/api/meetings/1234567890")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ---------- Scheduling ----------

def test_scheduled_meeting_appears_in_upcoming(client, auth_headers):
    response = schedule(client, auth_headers)
    assert response.status_code == 201
    meeting = response.json()
    assert meeting["status"] == "scheduled"
    assert meeting["duration_minutes"] == 45

    upcoming_codes = [m["meeting_code"] for m in client.get("/api/meetings/upcoming", headers=auth_headers).json()]
    assert meeting["meeting_code"] in upcoming_codes


def test_each_user_only_sees_their_own_meetings(client, auth_headers):
    schedule(client, auth_headers)
    other = client.post("/api/auth/signup", json={"name": "Other", "email": "o@example.com", "password": "secret123"})
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}

    assert client.get("/api/meetings/upcoming", headers=other_headers).json() == []


def test_schedule_converts_timezone_to_utc(client, auth_headers):
    # 10:00 in India (UTC+5:30) is 04:30 UTC.
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    response = schedule(client, auth_headers, scheduled_at=f"{tomorrow}T10:00:00+05:30")
    assert response.json()["scheduled_at"] == f"{tomorrow}T04:30:00Z"


def test_schedule_validation_errors(client, auth_headers):
    assert schedule(client, auth_headers, title="   ").status_code == 422
    assert schedule(client, auth_headers, scheduled_at=None).status_code == 422
    assert schedule(client, auth_headers, scheduled_at=iso_in(-2)).status_code == 422
    assert schedule(client, auth_headers, duration_minutes=5).status_code == 422
    assert schedule(client, auth_headers, duration_minutes=2000).status_code == 422

    response = schedule(client, auth_headers, scheduled_at=iso_in(-2))
    assert response.json()["detail"] == "Meeting time must be in the future"


# ---------- Joining ----------

def test_guest_can_join_without_an_account(client, auth_headers):
    code = schedule(client, auth_headers).json()["meeting_code"]

    response = join(client, code, "Priya")
    assert response.status_code == 201
    assert response.json()["display_name"] == "Priya"
    assert response.json()["is_host"] is False
    assert response.json()["is_muted"] is True  # muted by default
    assert len(response.json()["token"]) >= 30  # secret for this participant only

    meeting = client.get(f"/api/meetings/{code}").json()
    assert meeting["status"] == "live"  # first join starts a scheduled meeting
    assert [p["display_name"] for p in meeting["active_participants"]] == ["Priya"]
    assert "token" not in meeting["active_participants"][0]  # never exposed to others


def test_join_with_microphone_on(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    assert join(client, code, "Priya", is_muted=False).json()["is_muted"] is False


def test_only_start_by_the_signed_in_owner_makes_a_host(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    other = client.post("/api/auth/signup", json={"name": "Other", "email": "o@example.com", "password": "secret123"})

    assert start(client, code, auth_headers).json()["is_host"] is True
    assert start(client, code, {}).status_code == 401  # signed out
    assert start(client, code, {"Authorization": f"Bearer {other.json()['token']}"}).status_code == 403  # not the owner
    assert join(client, code, HOST).json()["is_host"] is False  # same name, but not signed in


def test_joining_by_invite_link_never_makes_you_host(client, auth_headers):
    """Regression: a browser still signed in as the owner joined via the invite link as host and ended the meeting."""
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()
    jiji = join(client, code, "Jiji", headers=auth_headers, as_host=True, is_host=True).json()  # extra fields ignored

    assert jiji["is_host"] is False
    assert client.post(f"/api/meetings/{code}/end", headers=as_participant(jiji)).status_code == 403
    assert client.post(f"/api/meetings/{code}/mute-all", headers=as_participant(jiji)).status_code == 403
    remove_host = f"/api/meetings/{code}/participants/{host['id']}/remove"
    assert client.post(remove_host, headers=as_participant(jiji)).status_code == 403
    meeting = client.get(f"/api/meetings/{code}").json()
    assert meeting["status"] == "live" and len(meeting["active_participants"]) == 2  # nothing happened

    assert client.post(f"/api/meetings/{code}/participants/me/leave", headers=as_participant(jiji)).status_code == 204
    assert client.post(f"/api/meetings/{code}/end", headers=as_participant(host)).status_code == 204


def test_starting_again_moves_the_host_role(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    laptop = start(client, code, auth_headers).json()
    phone = start(client, code, auth_headers, name="Harsh (phone)").json()

    hosts = [p["id"] for p in client.get(f"/api/meetings/{code}").json()["active_participants"] if p["is_host"]]
    assert hosts == [phone["id"]]  # only one host at a time
    assert client.post(f"/api/meetings/{code}/end", headers=as_participant(laptop)).status_code == 403


def test_join_validation(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    assert join(client, code, name="   ").status_code == 422
    assert join(client, "0000000000").status_code == 404


def test_leave_meeting_removes_from_active_list(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    participant = join(client, code).json()

    assert client.post(f"/api/meetings/{code}/participants/me/leave", headers=as_participant(participant)).status_code == 204
    assert client.get(f"/api/meetings/{code}").json()["active_participants"] == []


# ---------- Chat ----------

def test_chat_messages_are_shared_with_the_meeting(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    alex = join(client, code, "Alex").json()

    response = client.post(f"/api/meetings/{code}/messages", json={"text": " Hello! "}, headers=as_participant(alex))
    assert response.status_code == 201

    messages = client.get(f"/api/meetings/{code}").json()["messages"]
    assert [(m["sender_name"], m["text"]) for m in messages] == [("Alex", "Hello!")]


def test_chat_rejects_empty_messages_and_people_who_left(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    alex = join(client, code, "Alex").json()
    url = f"/api/meetings/{code}/messages"

    assert client.post(url, json={"text": "   "}, headers=as_participant(alex)).status_code == 422
    client.post(f"/api/meetings/{code}/participants/me/leave", headers=as_participant(alex))
    assert client.post(url, json={"text": "hi"}, headers=as_participant(alex)).status_code == 403


# ---------- Host controls ----------

def test_host_can_mute_all_and_remove(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()
    guest = join(client, code, "Alex").json()
    client.patch(f"/api/meetings/{code}/participants/me", json={"is_muted": False}, headers=as_participant(guest))

    assert client.post(f"/api/meetings/{code}/mute-all", headers=as_participant(host)).status_code == 204
    people = client.get(f"/api/meetings/{code}").json()["active_participants"]
    assert all(p["is_muted"] for p in people if not p["is_host"])

    remove_url = f"/api/meetings/{code}/participants/{guest['id']}/remove"
    assert client.post(remove_url, headers=as_participant(host)).status_code == 204
    people = client.get(f"/api/meetings/{code}").json()["active_participants"]
    assert [p["id"] for p in people] == [host["id"]]


def test_guest_cannot_use_host_controls(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    guest = join(client, code, "Alex").json()

    assert client.post(f"/api/meetings/{code}/mute-all", headers=as_participant(guest)).status_code == 403
    assert client.post(f"/api/meetings/{code}/end", headers=as_participant(guest)).status_code == 403


def test_outsider_cannot_act_with_public_ids(client, auth_headers):
    """Regression test: participant IDs are public, so they must not be enough to act."""
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()
    guest = join(client, code, "Alex").json()
    other_code = create_instant(client, auth_headers)["meeting_code"]
    stranger = join(client, other_code, "Stranger").json()

    # No token at all
    assert client.post(f"/api/meetings/{code}/end").status_code == 401
    assert client.post(f"/api/meetings/{code}/messages", json={"text": "spoof"}).status_code == 401
    assert client.post(f"/api/meetings/{code}/participants/{guest['id']}/remove").status_code == 401
    # A real token, but for a different meeting
    assert client.post(f"/api/meetings/{code}/end", headers=as_participant(stranger)).status_code == 401
    # A made-up token
    assert client.post(f"/api/meetings/{code}/end", headers={"X-Participant-Token": "guess"}).status_code == 401

    meeting = client.get(f"/api/meetings/{code}").json()
    assert meeting["status"] == "live" and meeting["messages"] == []
    assert {p["id"] for p in meeting["active_participants"]} == {host["id"], guest["id"]}


def test_ended_meeting_moves_to_recent_and_cannot_be_joined(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()

    assert client.post(f"/api/meetings/{code}/end", headers=as_participant(host)).status_code == 204

    assert code in [m["meeting_code"] for m in client.get("/api/meetings/recent", headers=auth_headers).json()]
    assert code not in [m["meeting_code"] for m in client.get("/api/meetings/upcoming", headers=auth_headers).json()]
    assert join(client, code).status_code == 409


def test_only_the_host_can_delete_a_meeting(client, auth_headers):
    code = schedule(client, auth_headers).json()["meeting_code"]
    other = client.post("/api/auth/signup", json={"name": "Other", "email": "o@example.com", "password": "secret123"})

    assert client.delete(f"/api/meetings/{code}", headers={"Authorization": f"Bearer {other.json()['token']}"}).status_code == 403
    assert client.delete(f"/api/meetings/{code}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/meetings/{code}").status_code == 404


# ---------- Sample data ----------

def test_seed_creates_demo_user_with_upcoming_and_recent(client, db_session_factory):
    with db_session_factory() as db:
        seed_sample_data(db)
        seed_sample_data(db)  # second call must not duplicate

    login = client.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    assert len(client.get("/api/meetings/upcoming", headers=headers).json()) == 4
    recent = client.get("/api/meetings/recent", headers=headers).json()
    assert len(recent) == 4
    assert all(m["participant_count"] >= 2 for m in recent)


def test_renaming_the_host_updates_their_meetings(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    client.patch("/api/auth/me", json={"name": "Harsh B."}, headers=auth_headers)
    assert client.get(f"/api/meetings/{code}").json()["host_name"] == "Harsh B."  # host name comes from users.name


def test_meeting_lists_do_not_query_once_per_meeting(client, auth_headers, db_session_factory):
    """The dashboard lists load participant counts in one extra query, not one per meeting."""
    from sqlalchemy import event

    for _ in range(6):
        schedule(client, auth_headers)
    engine = db_session_factory.kw["bind"]
    statements = []
    listener = lambda *args: statements.append(args[2])  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        assert len(client.get("/api/meetings/upcoming", headers=auth_headers).json()) == 6
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    assert len(statements) <= 4, statements  # session lookup + user + meetings + participants



# ---------- WebRTC signaling ----------

def test_signals_are_relayed_once_between_participants(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()
    guest = join(client, code, "Guest").json()

    offer = {"to": host["id"], "kind": "offer", "sdp": "v=0 fake-offer"}
    assert client.post(f"/api/meetings/{code}/signals", json=offer, headers=as_participant(guest)).status_code == 204

    received = client.get(f"/api/meetings/{code}/signals", headers=as_participant(host)).json()
    assert [(s["sender_id"], s["kind"], s["sdp"]) for s in received] == [(guest["id"], "offer", "v=0 fake-offer")]
    assert client.get(f"/api/meetings/{code}/signals", headers=as_participant(host)).json() == []  # delivered once
    assert client.get(f"/api/meetings/{code}/signals", headers=as_participant(guest)).json() == []  # not for the guest


def test_signals_require_membership(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()
    other_code = create_instant(client, auth_headers)["meeting_code"]
    stranger = join(client, other_code, "Stranger").json()
    offer = {"to": host["id"], "kind": "offer", "sdp": "x"}

    assert client.post(f"/api/meetings/{code}/signals", json=offer).status_code == 401
    assert client.post(f"/api/meetings/{code}/signals", json=offer, headers=as_participant(stranger)).status_code == 401
    assert client.get(f"/api/meetings/{code}/signals").status_code == 401
    guest = join(client, code, "Guest").json()
    bad_kind = {**offer, "kind": "hack"}
    assert client.post(f"/api/meetings/{code}/signals", json=bad_kind, headers=as_participant(guest)).status_code == 422


def test_leaving_clears_pending_signals(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    host = start(client, code, auth_headers).json()
    guest = join(client, code, "Guest").json()
    to_host = {"to": host["id"], "kind": "offer", "sdp": "x"}
    client.post(f"/api/meetings/{code}/signals", json=to_host, headers=as_participant(guest))
    client.post(f"/api/meetings/{code}/participants/me/leave", headers=as_participant(guest))

    assert client.get(f"/api/meetings/{code}/signals", headers=as_participant(host)).json() == []
    to_guest = {"to": guest["id"], "kind": "answer", "sdp": "x"}
    assert client.post(f"/api/meetings/{code}/signals", json=to_guest, headers=as_participant(host)).status_code == 404


# ---------- STUN/TURN servers ----------

def test_ice_servers_default_to_stun_only(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    guest = join(client, code, "Guest").json()

    assert client.get(f"/api/meetings/{code}/ice-servers").status_code == 401  # members only
    body = client.get(f"/api/meetings/{code}/ice-servers", headers=as_participant(guest)).json()
    assert body == {"ice_servers": [{"urls": ["stun:stun.l.google.com:19302"]}], "relay": False}


def test_ice_servers_include_a_configured_turn_relay(client, auth_headers, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "TURN_URLS", ["turn:turn.example.com:3478"])
    monkeypatch.setattr(config, "TURN_USERNAME", "user")
    monkeypatch.setattr(config, "TURN_CREDENTIAL", "pass")
    code = create_instant(client, auth_headers)["meeting_code"]
    guest = join(client, code, "Guest").json()

    body = client.get(f"/api/meetings/{code}/ice-servers", headers=as_participant(guest)).json()
    assert body["relay"] is True
    assert {"urls": ["turn:turn.example.com:3478"], "username": "user", "credential": "pass"} in body["ice_servers"]


def test_ice_servers_from_cloudflare_and_fallback(client, auth_headers, monkeypatch):
    from app import config, ice
    monkeypatch.setattr(config, "CLOUDFLARE_TURN_KEY_ID", "key")
    monkeypatch.setattr(config, "CLOUDFLARE_TURN_API_TOKEN", "token")
    code = create_instant(client, auth_headers)["meeting_code"]
    guest = join(client, code, "Guest").json()
    url = f"/api/meetings/{code}/ice-servers"

    cloudflare = [{"urls": ["turn:turn.cloudflare.com:3478"], "username": "u", "credential": "c"}]
    monkeypatch.setattr(ice, "cloudflare_ice_servers", lambda: cloudflare)
    assert client.get(url, headers=as_participant(guest)).json() == {"ice_servers": cloudflare, "relay": True}

    def unreachable():
        raise OSError("network down")
    monkeypatch.setattr(ice, "cloudflare_ice_servers", unreachable)
    assert client.get(url, headers=as_participant(guest)).json()["relay"] is False  # falls back to STUN
