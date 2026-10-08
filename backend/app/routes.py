"""HTTP endpoints for meetings. Each route validates input (via schemas) and calls a service."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app import services
from app.auth import get_current_user, get_optional_user
from app.database import get_db
from app.models import User
from app.schemas import (
    HostAction,
    JoinRequest,
    MeetingCreate,
    MeetingDetail,
    MeetingOut,
    MessageCreate,
    MessageOut,
    ParticipantOut,
    ParticipantUpdate,
)

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


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


@router.post("/{meeting_code}/join", response_model=ParticipantOut, status_code=201)
def join_meeting(
    meeting_code: str, data: JoinRequest, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)
):
    """Anyone can join (no account needed). If the signed-in owner joins, they become the host."""
    meeting = services.get_meeting_or_404(db, meeting_code)
    return services.join_meeting(db, meeting, data.display_name, user, data.is_muted)


@router.patch("/{meeting_code}/participants/{participant_id}", response_model=ParticipantOut)
def update_participant(
    meeting_code: str, participant_id: int, data: ParticipantUpdate, db: Session = Depends(get_db)
):
    """A participant mutes/unmutes themselves."""
    meeting = services.get_meeting_or_404(db, meeting_code)
    participant = services.get_participant_or_404(meeting, participant_id)
    participant.is_muted = data.is_muted
    db.commit()
    return participant


@router.post("/{meeting_code}/participants/{participant_id}/leave", status_code=204)
def leave_meeting(meeting_code: str, participant_id: int, db: Session = Depends(get_db)):
    meeting = services.get_meeting_or_404(db, meeting_code)
    services.leave_meeting(db, services.get_participant_or_404(meeting, participant_id))
    return Response(status_code=204)


@router.post("/{meeting_code}/messages", response_model=MessageOut, status_code=201)
def send_message(meeting_code: str, data: MessageCreate, db: Session = Depends(get_db)):
    """In-meeting chat. Other participants receive it on their next poll of GET /{meeting_code}."""
    meeting = services.get_meeting_or_404(db, meeting_code)
    return services.send_message(db, meeting, data.participant_id, data.text)


# ---------- Host controls ----------

@router.post("/{meeting_code}/end", status_code=204)
def end_meeting(meeting_code: str, data: HostAction, db: Session = Depends(get_db)):
    meeting = services.get_meeting_or_404(db, meeting_code)
    services.require_host(meeting, data.host_participant_id)
    services.end_meeting(db, meeting)
    return Response(status_code=204)


@router.post("/{meeting_code}/mute-all", status_code=204)
def mute_all(meeting_code: str, data: HostAction, db: Session = Depends(get_db)):
    meeting = services.get_meeting_or_404(db, meeting_code)
    services.require_host(meeting, data.host_participant_id)
    services.mute_all(db, meeting)
    return Response(status_code=204)


@router.post("/{meeting_code}/participants/{participant_id}/remove", status_code=204)
def remove_participant(meeting_code: str, participant_id: int, data: HostAction, db: Session = Depends(get_db)):
    meeting = services.get_meeting_or_404(db, meeting_code)
    services.require_host(meeting, data.host_participant_id)
    if participant_id == data.host_participant_id:
        raise HTTPException(status_code=400, detail="The host can't remove themselves.")
    services.leave_meeting(db, services.get_participant_or_404(meeting, participant_id))
    return Response(status_code=204)
