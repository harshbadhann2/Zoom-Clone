// Shapes of the JSON returned by the FastAPI backend (see backend/app/schemas.py).

export type MeetingStatus = "scheduled" | "live" | "ended";

export interface Participant {
  id: number;
  display_name: string;
  is_host: boolean;
  is_muted: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface Meeting {
  meeting_code: string;
  title: string;
  description: string;
  meeting_type: "instant" | "scheduled";
  status: MeetingStatus;
  host_name: string;
  scheduled_at: string; // ISO date in UTC
  duration_minutes: number;
  created_at: string;
  ended_at: string | null;
  participant_count: number;
  invite_link: string;
}

export interface MeetingDetail extends Meeting {
  active_participants: Participant[];
}

export interface ScheduleMeetingInput {
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
}
