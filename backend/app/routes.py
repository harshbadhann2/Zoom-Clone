"""HTTP endpoints for meetings. Each route validates input (via schemas) and calls a service."""

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from app import services
from app.auth import get_current_user, get_optional_user
from app.database import get_db
from app.models import Participant, User
from app.schemas import (
    JoinRequest,
    JoinResponse,
    MeetingCreate,
    MeetingDetail,
    MeetingOut,
    MessageCreate,
    MessageOut,
    ParticipantOut,
    ParticipantUpdate,
)

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def current_participant(
    meeting_code: str, x_participant_token: str | None = Header(default=None), db: Session = Depends(get_db)
) -> Participant:
    """The participant making this request, proven by the X-Participant-Token header."""
    return services.get_participant_by_token(db, meeting_code, x_participant_token)


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(data: MeetingCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create an instant meeting (starts now) or a scheduled one, hosted by the signed-in user."""
    return services.create_meeting(db, data, user)


@router.get("/upcoming", response_model=list[MeetingOut])
def upcoming_meetings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return services.list_upcoming(db, user)


@router.get("/recent", response_model=list[MeetingOut])
def recent_meetings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return services.list_recent(db, user)


@router.get("/{meeting_code}", response_model=MeetingDetail)
def get_meeting(meeting_code: str, db: Session = Depends(get_db)):
    """Meeting details, people currently in it and the chat. Public, so guests can see it; the room polls this."""
    return services.get_meeting_or_404(db, meeting_code)


@router.delete("/{meeting_code}", status_code=204)
def delete_meeting(meeting_code: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    meeting = services.get_meeting_or_404(db, meeting_code)
    if meeting.host_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the host can delete this meeting.")
    if meeting.status == "live":
        raise HTTPException(status_code=409, detail="A meeting in progress can't be deleted.")
    db.delete(meeting)
    db.commit()
    return Response(status_code=204)


@router.post("/{meeting_code}/join", response_model=JoinResponse, status_code=201)
def join_meeting(
    meeting_code: str, data: JoinRequest, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)
):
    """Anyone can join (no account needed). If the signed-in owner joins, they become the host.

    The response includes a secret token; the browser sends it back as X-Participant-Token.
    """
    meeting = services.get_meeting_or_404(db, meeting_code)
    return services.join_meeting(db, meeting, data.display_name, user, data.is_muted)


# ---------- Actions by a participant (identified by their token) ----------

@router.patch("/{meeting_code}/participants/me", response_model=ParticipantOut)
def update_me(data: ParticipantUpdate, me: Participant = Depends(current_participant), db: Session = Depends(get_db)):
    """Mute or unmute yourself."""
    me.is_muted = data.is_muted
    db.commit()
    return me


@router.post("/{meeting_code}/participants/me/leave", status_code=204)
def leave_meeting(me: Participant = Depends(current_participant), db: Session = Depends(get_db)):
    services.leave_meeting(db, me)
    return Response(status_code=204)


@router.post("/{meeting_code}/messages", response_model=MessageOut, status_code=201)
def send_message(data: MessageCreate, me: Participant = Depends(current_participant), db: Session = Depends(get_db)):
    """In-meeting chat. Other participants receive it on their next poll of GET /{meeting_code}."""
    return services.send_message(db, me, data.text)


# ---------- Host controls (the token must belong to the host) ----------

@router.post("/{meeting_code}/end", status_code=204)
def end_meeting(me: Participant = Depends(current_participant), db: Session = Depends(get_db)):
    services.require_host(me)
    services.end_meeting(db, me.meeting)
    return Response(status_code=204)


@router.post("/{meeting_code}/mute-all", status_code=204)
def mute_all(me: Participant = Depends(current_participant), db: Session = Depends(get_db)):
    services.require_host(me)
    services.mute_all(db, me.meeting)
    return Response(status_code=204)


@router.post("/{meeting_code}/participants/{participant_id}/remove", status_code=204)
def remove_participant(participant_id: int, me: Participant = Depends(current_participant), db: Session = Depends(get_db)):
    services.require_host(me)
    if participant_id == me.id:
        raise HTTPException(status_code=400, detail="The host can't remove themselves.")
    services.leave_meeting(db, services.get_participant_or_404(me.meeting, participant_id))
    return Response(status_code=204)
