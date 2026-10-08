"""Sample data so the dashboard isn't empty on first run.

Runs on startup only when the meetings table is empty. Times are relative to "now",
so there are always meetings in both Upcoming and Recent.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, Participant, utc_now
from app.services import generate_meeting_code

HOST_NAME = "Harsh Badhan"

# (title, description, hours from now, duration in minutes)
UPCOMING = [
    ("Team Standup", "Daily sync: yesterday, today, blockers.", 2, 15),
    ("Product Design Review", "Walk through the new onboarding flow mockups.", 26, 60),
    ("Engineering Sync", "Sprint planning and API contract review.", 50, 45),
    ("Project Discussion", "Q4 roadmap priorities with stakeholders.", 98, 30),
]

# (title, description, hours ago, duration in minutes, other participants)
RECENT = [
    ("Client Demo Rehearsal", "Dry run before Friday's client demo.", 22, 30, ["Priya Sharma", "Alex Chen"]),
    ("Sprint Retrospective", "What went well, what didn't, action items.", 48, 60,
     ["Priya Sharma", "Rahul Verma", "Emily Davis"]),
    ("Weekly 1:1", "Career goals and project check-in.", 75, 30, ["Neha Gupta"]),
    ("Architecture Deep Dive", "Discussed the move to an event-driven notifications service.", 120, 90,
     ["Alex Chen", "Rahul Verma", "Emily Davis", "Neha Gupta"]),
]


def seed_sample_data(db: Session) -> None:
    if db.scalar(select(Meeting.id).limit(1)) is not None:
        return

    # Round to the hour so sample times look like real calendar slots.
    this_hour = utc_now().replace(minute=0, second=0, microsecond=0)

    for title, description, hours_ahead, duration in UPCOMING:
        db.add(Meeting(
            meeting_code=generate_meeting_code(db), title=title, description=description,
            meeting_type="scheduled", status="scheduled", host_name=HOST_NAME,
            scheduled_at=this_hour + timedelta(hours=hours_ahead), duration_minutes=duration,
        ))
        db.flush()  # so the next generate_meeting_code() sees this code

    for title, description, hours_ago, duration, guests in RECENT:
        start = this_hour - timedelta(hours=hours_ago)
        end = start + timedelta(minutes=duration)
        meeting = Meeting(
            meeting_code=generate_meeting_code(db), title=title, description=description,
            meeting_type="scheduled", status="ended", host_name=HOST_NAME,
            scheduled_at=start, duration_minutes=duration, ended_at=end, created_at=start - timedelta(days=1),
        )
        meeting.participants = [
            Participant(display_name=name, is_host=(name == HOST_NAME), joined_at=start, left_at=end)
            for name in [HOST_NAME, *guests]
        ]
        db.add(meeting)
        db.flush()

    db.commit()
