// Small pure helpers for meeting IDs, links and dates. Tested in meeting.test.ts.

import type { Meeting } from "@/types/meeting";

const MEETING_CODE_PATTERN = /^\d{10}$/;

/**
 * Turns what the user typed into a 10-digit meeting code, or null if it isn't valid.
 * Accepts "614 838 5880", "614-838-5880", "6148385880" or an invite link ".../join/6148385880".
 */
export function parseMeetingInput(input: string): string | null {
  const text = input.trim();
  const linkMatch = text.match(/\/join\/([^/?#]+)/);
  const code = (linkMatch ? linkMatch[1] : text).replace(/[\s-]/g, "");
  return MEETING_CODE_PATTERN.test(code) ? code : null;
}

/** "6148385880" -> "614 838 5880" (the way Zoom displays Meeting IDs). */
export function formatMeetingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

// ---------- Dates (always shown in the viewer's local time zone) ----------

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow" or e.g. "Sat, Oct 10". */
export function formatDayLabel(date: Date, now = new Date()): string {
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";
  if (dayDiff === -1) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function meetingTimeRange(meeting: Meeting): string {
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + meeting.duration_minutes * 60_000);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Zoom-style invitation text for the clipboard. */
export function buildInvitation(meeting: Meeting): string {
  const start = new Date(meeting.scheduled_at);
  return [
    `${meeting.host_name} is inviting you to a scheduled Zoom meeting.`,
    "",
    `Topic: ${meeting.title}`,
    `Time: ${start.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
    "",
    "Join Zoom Meeting",
    meeting.invite_link,
    "",
    `Meeting ID: ${formatMeetingCode(meeting.meeting_code)}`,
  ].join("\n");
}
