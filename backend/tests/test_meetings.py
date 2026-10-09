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


def test_only_the_signed_in_owner_becomes_host(client, auth_headers):
    code = create_instant(client, auth_headers)["meeting_code"]
    assert join(client, code, HOST, headers=auth_headers).json()["is_host"] is True
    assert join(client, code, HOST).json()["is_host"] is False  # same name, but not signed in


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
    host = join(client, code, HOST, headers=auth_headers).json()
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
    host = join(client, code, HOST, headers=auth_headers).json()
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
    host = join(client, code, HOST, headers=auth_headers).json()

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
