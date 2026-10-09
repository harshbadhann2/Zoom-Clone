"""Business logic for meetings. Routes call these functions; these talk to the database."""

import secrets

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Meeting, Message, Participant, Signal, User, utc_now
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


def create_meeting(db: Session, data: MeetingCreate, host: User) -> Meeting:
    if data.meeting_type == "instant":
        # An instant meeting starts now and is live straight away.
        scheduled_at = utc_now()
        title = data.title or f"{host.name}'s Zoom Meeting"
        status = "live"
    else:
        scheduled_at = data.scheduled_at
        title = data.title
        status = "scheduled"

    meeting = Meeting(
        meeting_code=generate_meeting_code(db),
        host=host,
        title=title,
        description=data.description,
        meeting_type=data.meeting_type,
        status=status,
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


def list_upcoming(db: Session, user: User) -> list[Meeting]:
    meetings = db.scalars(
        select(Meeting)
        .where(Meeting.host_user_id == user.id, Meeting.status != "ended")
        .order_by(Meeting.scheduled_at)
        .options(selectinload(Meeting.participants))  # one query for all participant counts, not one per meeting
    )
    # ponytail: time filter runs in Python (fine for hundreds of rows); store an ends_at column to filter in SQL.
    return [m for m in meetings if is_upcoming(m)]


def list_recent(db: Session, user: User) -> list[Meeting]:
    """Recent = ended by the host, or its scheduled time slot is over."""
    meetings = db.scalars(
        select(Meeting)
        .where(Meeting.host_user_id == user.id)
        .order_by(Meeting.scheduled_at.desc())
        .options(selectinload(Meeting.participants))  # one query for all participant counts, not one per meeting
    )
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


def get_participant_by_token(db: Session, meeting_code: str, token: str | None) -> Participant:
    """Identify who is making a request from the secret token they got when joining."""
    participant = db.scalar(select(Participant).where(Participant.token == token)) if token else None
    if participant is None or participant.meeting.meeting_code != meeting_code:
        raise HTTPException(status_code=401, detail="You're not in this meeting. Please join again.")
    if participant.left_at is not None:
        raise HTTPException(status_code=403, detail="You're no longer in this meeting.")
    return participant


def require_host(participant: Participant) -> None:
    if not participant.is_host:
        raise HTTPException(status_code=403, detail="Only the host can do this.")


def join_meeting(db: Session, meeting: Meeting, display_name: str, is_muted: bool, as_host: bool = False) -> Participant:
    """Add someone to a meeting. Callers decide `as_host` only after checking ownership (see start_meeting)."""
    if meeting.status == "ended":
        raise HTTPException(status_code=409, detail="This meeting has already ended.")

    if as_host:
        # One host at a time: starting the meeting again (e.g. from another device) moves the host role here.
        for other in meeting.active_participants:
            other.is_host = False
    participant = Participant(meeting=meeting, display_name=display_name, is_host=as_host, is_muted=is_muted)
    meeting.status = "live"  # the first person to join starts a scheduled meeting
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def start_meeting(db: Session, meeting: Meeting, user: User, display_name: str, is_muted: bool) -> Participant:
    """Join as host. Only the signed-in owner of the meeting may do this."""
    if user.id != meeting.host_user_id:
        raise HTTPException(status_code=403, detail="Only the host can start this meeting.")
    return join_meeting(db, meeting, display_name, is_muted, as_host=True)


def leave_meeting(db: Session, participant: Participant) -> None:
    if participant.left_at is None:
        participant.left_at = utc_now()
        delete_signals_of(db, participant)
        meeting = participant.meeting
        if not meeting.active_participants:
            # The last person left: an instant meeting is over; a scheduled one can be started again later.
            if meeting.meeting_type == "instant":
                meeting.status = "ended"
                meeting.ended_at = participant.left_at
            else:
                meeting.status = "scheduled"
        db.commit()


def end_meeting(db: Session, meeting: Meeting) -> None:
    now = utc_now()
    meeting.status = "ended"
    meeting.ended_at = now
    for participant in meeting.active_participants:
        participant.left_at = now
    db.execute(delete(Signal).where(Signal.meeting_id == meeting.id))
    db.commit()


def mute_all(db: Session, meeting: Meeting) -> None:
    for participant in meeting.active_participants:
        if not participant.is_host:
            participant.is_muted = True
    db.commit()


def send_message(db: Session, sender: Participant, text: str) -> Message:
    message = Message(meeting=sender.meeting, sender=sender, text=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


# ---------- WebRTC signaling (the server only relays connection-setup messages) ----------

def send_signal(db: Session, sender: Participant, to: int, kind: str, sdp: str) -> None:
    recipient = get_participant_or_404(sender.meeting, to)
    if recipient.id == sender.id or recipient.left_at is not None:
        raise HTTPException(status_code=404, detail="That participant isn't in this meeting.")
    # Only the newest message per sender/recipient/kind matters; drop older undelivered ones.
    db.execute(delete(Signal).where(Signal.sender_id == sender.id, Signal.recipient_id == to, Signal.kind == kind))
    db.add(Signal(meeting_id=sender.meeting_id, sender_id=sender.id, recipient_id=to, kind=kind, sdp=sdp))
    db.commit()


def take_signals(db: Session, recipient: Participant) -> list[Signal]:
    """Return the messages waiting for this participant and delete them (each is delivered once)."""
    signals = list(db.scalars(select(Signal).where(Signal.recipient_id == recipient.id).order_by(Signal.id)))
    for signal in signals:
        db.delete(signal)
    db.commit()
    return signals


def delete_signals_of(db: Session, participant: Participant) -> None:
    db.execute(delete(Signal).where(or_(Signal.sender_id == participant.id, Signal.recipient_id == participant.id)))
