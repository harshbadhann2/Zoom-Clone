"""Database tables.

users 1 ──< sessions        (a user can be logged in on several devices)
users 1 ──< meetings        (the user who hosts the meeting)
meetings 1 ──< participants (everyone who joined, including guests without an account)
meetings 1 ──< messages     (in-meeting chat)
participants 1 ──< messages (who sent each message)
meetings 1 ──< signals      (WebRTC connection setup messages, deleted once delivered)

All datetimes are stored as UTC without timezone info (SQLite has no timezone type).
"""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)  # stored lowercase
    password_hash: Mapped[str] = mapped_column(String(200))  # "salt$hash", never the plain password
    created_at: Mapped[datetime] = mapped_column(default=utc_now)

    meetings: Mapped[list["Meeting"]] = relationship(back_populates="host")


class AuthSession(Base):
    """A login token. Logging out deletes the row, so the token stops working."""

    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)

    user: Mapped[User] = relationship()


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint("meeting_type IN ('instant', 'scheduled')", name="valid_meeting_type"),
        CheckConstraint("status IN ('scheduled', 'live', 'ended')", name="valid_status"),
        CheckConstraint("duration_minutes > 0", name="positive_duration"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # The public, shareable 10-digit "Meeting ID". UNIQUE is enforced by the database.
    meeting_code: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    meeting_type: Mapped[str] = mapped_column(String(20))  # "instant" or "scheduled"
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled -> live -> ended
    scheduled_at: Mapped[datetime]
    duration_minutes: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
    ended_at: Mapped[datetime | None]

    host: Mapped[User] = relationship(back_populates="meetings")
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="Participant.joined_at"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="Message.sent_at"
    )

    @property
    def host_name(self) -> str:
        return self.host.name

    @property
    def ends_at(self) -> datetime:
        return self.scheduled_at + timedelta(minutes=self.duration_minutes)

    @property
    def active_participants(self) -> list["Participant"]:
        return [p for p in self.participants if p.left_at is None]

    @property
    def participant_count(self) -> int:
        """Everyone who ever joined (used for the Recent Meetings list)."""
        return len(self.participants)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    is_host: Mapped[bool] = mapped_column(default=False)
    is_muted: Mapped[bool] = mapped_column(default=True)
    joined_at: Mapped[datetime] = mapped_column(default=utc_now)
    left_at: Mapped[datetime | None]  # NULL while the person is still in the meeting
    # Secret given only to this participant when they join. Every action they take must include it,
    # so knowing a meeting ID or participant ID is not enough to act as someone else.
    token: Mapped[str] = mapped_column(String(64), unique=True, default=lambda: secrets.token_urlsafe(24))

    meeting: Mapped[Meeting] = relationship(back_populates="participants")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(1000))
    sent_at: Mapped[datetime] = mapped_column(default=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="messages")
    sender: Mapped[Participant] = relationship()

    @property
    def sender_name(self) -> str:
        return self.sender.display_name


class Signal(Base):
    """A WebRTC connection-setup message (an SDP offer or answer) from one participant to another.

    The audio/video itself flows directly between browsers; the server only relays these small
    messages so two browsers can find each other. Each row is deleted as soon as it is delivered.
    """

    __tablename__ = "signals"
    __table_args__ = (CheckConstraint("kind IN ('offer', 'answer')", name="valid_signal_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"))
    recipient_id: Mapped[int] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    sdp: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
