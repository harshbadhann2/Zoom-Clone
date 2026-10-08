from datetime import datetime, timedelta, timezone

from app.seed import seed_sample_data

HOST = "Harsh Badhan"


def iso_in(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def create_instant(client):
    response = client.post("/api/meetings", json={"meeting_type": "instant", "host_name": HOST})
    assert response.status_code == 201
    return response.json()


def schedule(client, **overrides):
    body = {
        "meeting_type": "scheduled",
        "host_name": HOST,
        "title": "Design Review",
        "description": "Review mockups",
        "scheduled_at": iso_in(3),
        "duration_minutes": 45,
        **overrides,
    }
    return client.post("/api/meetings", json=body)


def join(client, code, name="Guest", as_host=False):
    return client.post(f"/api/meetings/{code}/join", json={"display_name": name, "as_host": as_host})


# ---------- Creation ----------

def test_instant_meeting_gets_id_link_and_is_live(client):
    meeting = create_instant(client)

    assert len(meeting["meeting_code"]) == 10 and meeting["meeting_code"].isdigit()
    assert meeting["invite_link"].endswith(f"/join/{meeting['meeting_code']}")
    assert meeting["status"] == "live"
    assert meeting["title"] == f"{HOST}'s Zoom Meeting"


def test_meeting_codes_are_unique(client):
    codes = {create_instant(client)["meeting_code"] for _ in range(25)}
    assert len(codes) == 25


# ---------- Retrieval ----------

def test_get_meeting_returns_stored_meeting(client):
    created = create_instant(client)
    response = client.get(f"/api/meetings/{created['meeting_code']}")

    assert response.status_code == 200
    assert response.json()["title"] == created["title"]
    assert response.json()["active_participants"] == []


def test_unknown_meeting_returns_404(client):
    response = client.get("/api/meetings/1234567890")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ---------- Scheduling ----------

def test_scheduled_meeting_appears_in_upcoming(client):
    response = schedule(client)
    assert response.status_code == 201
    meeting = response.json()
    assert meeting["status"] == "scheduled"
    assert meeting["duration_minutes"] == 45

    upcoming_codes = [m["meeting_code"] for m in client.get("/api/meetings/upcoming").json()]
    assert meeting["meeting_code"] in upcoming_codes


def test_schedule_converts_timezone_to_utc(client):
    # 10:00 in India (UTC+5:30) is 04:30 UTC.
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    response = schedule(client, scheduled_at=f"{tomorrow}T10:00:00+05:30")
    assert response.json()["scheduled_at"] == f"{tomorrow}T04:30:00Z"


def test_schedule_validation_errors(client):
    assert schedule(client, title="   ").status_code == 422
    assert schedule(client, scheduled_at=None).status_code == 422
    assert schedule(client, scheduled_at=iso_in(-2)).status_code == 422
    assert schedule(client, duration_minutes=5).status_code == 422
    assert schedule(client, duration_minutes=2000).status_code == 422

    response = schedule(client, scheduled_at=iso_in(-2))
    assert response.json()["detail"] == "Meeting time must be in the future"


# ---------- Joining ----------

def test_join_meeting_adds_participant(client):
    code = schedule(client).json()["meeting_code"]

    response = join(client, code, "Priya")
    assert response.status_code == 201
    assert response.json()["display_name"] == "Priya"
    assert response.json()["is_host"] is False

    meeting = client.get(f"/api/meetings/{code}").json()
    assert meeting["status"] == "live"  # first join starts a scheduled meeting
    assert [p["display_name"] for p in meeting["active_participants"]] == ["Priya"]


def test_join_validation(client):
    code = create_instant(client)["meeting_code"]
    assert join(client, code, name="   ").status_code == 422
    assert join(client, "0000000000").status_code == 404


def test_leave_meeting_removes_from_active_list(client):
    code = create_instant(client)["meeting_code"]
    participant = join(client, code).json()

    assert client.post(f"/api/meetings/{code}/participants/{participant['id']}/leave").status_code == 204
    assert client.get(f"/api/meetings/{code}").json()["active_participants"] == []


# ---------- Host controls ----------

def test_host_can_mute_all_and_remove(client):
    code = create_instant(client)["meeting_code"]
    host = join(client, code, HOST, as_host=True).json()
    guest = join(client, code, "Alex").json()
    client.patch(f"/api/meetings/{code}/participants/{guest['id']}", json={"is_muted": False})

    assert client.post(f"/api/meetings/{code}/mute-all", json={"host_participant_id": host["id"]}).status_code == 204
    people = client.get(f"/api/meetings/{code}").json()["active_participants"]
    assert all(p["is_muted"] for p in people if not p["is_host"])

    remove_url = f"/api/meetings/{code}/participants/{guest['id']}/remove"
    assert client.post(remove_url, json={"host_participant_id": host["id"]}).status_code == 204
    people = client.get(f"/api/meetings/{code}").json()["active_participants"]
    assert [p["id"] for p in people] == [host["id"]]


def test_guest_cannot_use_host_controls(client):
    code = create_instant(client)["meeting_code"]
    guest = join(client, code, "Alex").json()

    response = client.post(f"/api/meetings/{code}/mute-all", json={"host_participant_id": guest["id"]})
    assert response.status_code == 403


def test_ended_meeting_moves_to_recent_and_cannot_be_joined(client):
    code = create_instant(client)["meeting_code"]
    host = join(client, code, HOST, as_host=True).json()

    assert client.post(f"/api/meetings/{code}/end", json={"host_participant_id": host["id"]}).status_code == 204

    assert code in [m["meeting_code"] for m in client.get("/api/meetings/recent").json()]
    assert code not in [m["meeting_code"] for m in client.get("/api/meetings/upcoming").json()]
    assert join(client, code).status_code == 409


def test_delete_scheduled_meeting(client):
    code = schedule(client).json()["meeting_code"]
    assert client.delete(f"/api/meetings/{code}").status_code == 204
    assert client.get(f"/api/meetings/{code}").status_code == 404


# ---------- Sample data ----------

def test_seed_fills_upcoming_and_recent(client, db_session_factory):
    with db_session_factory() as db:
        seed_sample_data(db)
        seed_sample_data(db)  # second call must not duplicate

    assert len(client.get("/api/meetings/upcoming").json()) == 4
    recent = client.get("/api/meetings/recent").json()
    assert len(recent) == 4
    assert all(m["participant_count"] >= 2 for m in recent)
