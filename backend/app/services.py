"""Business logic for meetings. Routes call these functions; these talk to the database."""

import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, Participant, utc_now
from app.schemas import MeetingCreate

RECENT_MEETINGS_LIMIT = 10


def generate_meeting_code(db: Session) -> str:
    """Random 10-digit Meeting ID (no leading zero), e.g. 8342195674.

    We check for an existing code first; the UNIQUE constraint on the column is the final guard.
    """
    while True:
        code = str(secrets.randbelow(9_000_000_000) + 1_000_000_000)
        if db.scalar(select(Meeting.id).where(Meeting.meeting_code == code)) is None:
            return code


def create_meeting(db: Session, data: MeetingCreate) -> Meeting:
    if data.meeting_type == "instant":
        # An instant meeting starts now and is live straight away.
        scheduled_at = utc_now()
        title = data.title or f"{data.host_name}'s Zoom Meeting"
        status = "live"
    else:
        scheduled_at = data.scheduled_at
        title = data.title
        status = "scheduled"

    meeting = Meeting(
        meeting_code=generate_meeting_code(db),
        title=title,
        description=data.description,
        meeting_type=data.meeting_type,
        status=status,
        host_name=data.host_name,
        scheduled_at=scheduled_at,
        duration_minutes=data.duration_minutes,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def is_upcoming(meeting: Meeting) -> bool:
    """Upcoming = not ended by the host and its time slot hasn't finished yet."""
    return meeting.status != "ended" and meeting.ends_at > utc_now()


def list_upcoming(db: Session) -> list[Meeting]:
    meetings = db.scalars(select(Meeting).where(Meeting.status != "ended").order_by(Meeting.scheduled_at))
    # ponytail: time filter runs in Python (fine for hundreds of rows); store an ends_at column to filter in SQL.
    return [m for m in meetings if is_upcoming(m)]


def list_recent(db: Session) -> list[Meeting]:
    """Recent = ended by the host, or its scheduled time slot is over."""
    meetings = db.scalars(select(Meeting).order_by(Meeting.scheduled_at.desc()))
    return [m for m in meetings if not is_upcoming(m)][:RECENT_MEETINGS_LIMIT]


def get_meeting_or_404(db: Session, meeting_code: str) -> Meeting:
    meeting = db.scalar(select(Meeting).where(Meeting.meeting_code == meeting_code))
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found. Please check the Meeting ID.")
    return meeting


def get_participant_or_404(meeting: Meeting, participant_id: int) -> Participant:
    for participant in meeting.participants:
        if participant.id == participant_id:
            return participant
    raise HTTPException(status_code=404, detail="Participant not found in this meeting.")


def require_host(meeting: Meeting, host_participant_id: int) -> Participant:
    host = get_participant_or_404(meeting, host_participant_id)
    if not host.is_host or host.left_at is not None:
        raise HTTPException(status_code=403, detail="Only the host can do this.")
    return host


def join_meeting(db: Session, meeting: Meeting, display_name: str, as_host: bool) -> Participant:
    if meeting.status == "ended":
        raise HTTPException(status_code=409, detail="This meeting has already ended.")

    participant = Participant(meeting=meeting, display_name=display_name, is_host=as_host)
    meeting.status = "live"  # the first person to join starts a scheduled meeting
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def leave_meeting(db: Session, participant: Participant) -> None:
    if participant.left_at is None:
        participant.left_at = utc_now()
        db.commit()


def end_meeting(db: Session, meeting: Meeting) -> None:
    now = utc_now()
    meeting.status = "ended"
    meeting.ended_at = now
    for participant in meeting.active_participants:
        participant.left_at = now
    db.commit()


def mute_all(db: Session, meeting: Meeting) -> None:
    for participant in meeting.active_participants:
        if not participant.is_host:
            participant.is_muted = True
    db.commit()
