// All calls to the FastAPI backend live here, so components never build URLs themselves.

import type {
  AuthResponse,
  Meeting,
  MeetingDetail,
  Message,
  Participant,
  ScheduleMeetingInput,
  User,
} from "@/types/meeting";
import { getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`; // tells the server who is signed in

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  if (!response.ok) {
    // The backend always sends { "detail": "readable message" } for errors.
    const body = await response.json().catch(() => null);
    const message = typeof body?.detail === "string" ? body.detail : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

const post = <T>(path: string, body: object = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

// ---------- Auth ----------

export const signUp = (name: string, email: string, password: string) =>
  post<AuthResponse>("/api/auth/signup", { name, email, password });
export const logIn = (email: string, password: string) => post<AuthResponse>("/api/auth/login", { email, password });
export const logOut = () => post<void>("/api/auth/logout");
export const getMe = () => request<User>("/api/auth/me");

// ---------- Meetings ----------

export const getUpcomingMeetings = () => request<Meeting[]>("/api/meetings/upcoming");
export const getRecentMeetings = () => request<Meeting[]>("/api/meetings/recent");
export const getMeeting = (code: string) => request<MeetingDetail>(`/api/meetings/${code}`);
export const deleteMeeting = (code: string) => request<void>(`/api/meetings/${code}`, { method: "DELETE" });

export const createInstantMeeting = () => post<Meeting>("/api/meetings", { meeting_type: "instant" });

export const scheduleMeeting = (input: ScheduleMeetingInput) =>
  post<Meeting>("/api/meetings", { ...input, meeting_type: "scheduled" });

// ---------- Participants ----------

/** If the signed-in host joins their own meeting, the server makes them host. */
export const joinMeeting = (code: string, displayName: string, isMuted = true) =>
  post<Participant>(`/api/meetings/${code}/join`, { display_name: displayName, is_muted: isMuted });

export const setMuted = (code: string, participantId: number, isMuted: boolean) =>
  request<Participant>(`/api/meetings/${code}/participants/${participantId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_muted: isMuted }),
  });

export const leaveMeeting = (code: string, participantId: number) =>
  post<void>(`/api/meetings/${code}/participants/${participantId}/leave`);

export const sendMessage = (code: string, participantId: number, text: string) =>
  post<Message>(`/api/meetings/${code}/messages`, { participant_id: participantId, text });

// ---------- Host controls ----------

export const endMeeting = (code: string, hostId: number) =>
  post<void>(`/api/meetings/${code}/end`, { host_participant_id: hostId });

export const muteAll = (code: string, hostId: number) =>
  post<void>(`/api/meetings/${code}/mute-all`, { host_participant_id: hostId });

export const removeParticipant = (code: string, participantId: number, hostId: number) =>
  post<void>(`/api/meetings/${code}/participants/${participantId}/remove`, { host_participant_id: hostId });
