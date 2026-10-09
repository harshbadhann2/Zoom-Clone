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

export interface JoinResponse extends Participant {
  token: string; // secret: only the person who joined receives it
}

export interface IceConfig {
  ice_servers: RTCIceServer[];
  relay: boolean; // false = no TURN relay configured on the server
}

export interface Signal {
  id: number;
  sender_id: number;
  kind: "offer" | "answer";
  sdp: string;
}

export interface Message {
  id: number;
  participant_id: number;
  sender_name: string;
  text: string;
  sent_at: string;
}

export interface MeetingDetail extends Meeting {
  active_participants: Participant[];
  messages: Message[];
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ScheduleMeetingInput {
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
}
