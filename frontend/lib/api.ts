// All calls to the FastAPI backend live here, so components never build URLs themselves.

import type { Meeting, MeetingDetail, Participant, ScheduleMeetingInput } from "@/types/meeting";
import { CURRENT_USER } from "@/lib/meeting";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
    });
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

// ---------- Meetings ----------

export const getUpcomingMeetings = () => request<Meeting[]>("/api/meetings/upcoming");
export const getRecentMeetings = () => request<Meeting[]>("/api/meetings/recent");
export const getMeeting = (code: string) => request<MeetingDetail>(`/api/meetings/${code}`);
export const deleteMeeting = (code: string) => request<void>(`/api/meetings/${code}`, { method: "DELETE" });

export const createInstantMeeting = () =>
  post<Meeting>("/api/meetings", { meeting_type: "instant", host_name: CURRENT_USER.name });

export const scheduleMeeting = (input: ScheduleMeetingInput) =>
  post<Meeting>("/api/meetings", { ...input, meeting_type: "scheduled", host_name: CURRENT_USER.name });

// ---------- Participants ----------

export const joinMeeting = (code: string, displayName: string, asHost = false) =>
  post<Participant>(`/api/meetings/${code}/join`, { display_name: displayName, as_host: asHost });

export const setMuted = (code: string, participantId: number, isMuted: boolean) =>
  request<Participant>(`/api/meetings/${code}/participants/${participantId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_muted: isMuted }),
  });

export const leaveMeeting = (code: string, participantId: number) =>
  post<void>(`/api/meetings/${code}/participants/${participantId}/leave`);

// ---------- Host controls ----------

export const endMeeting = (code: string, hostId: number) =>
  post<void>(`/api/meetings/${code}/end`, { host_participant_id: hostId });

export const muteAll = (code: string, hostId: number) =>
  post<void>(`/api/meetings/${code}/mute-all`, { host_participant_id: hostId });

export const removeParticipant = (code: string, participantId: number, hostId: number) =>
  post<void>(`/api/meetings/${code}/participants/${participantId}/remove`, { host_participant_id: hostId });
