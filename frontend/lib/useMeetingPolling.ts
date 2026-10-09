"use client";

// Keeps the meeting (status, participants, chat) fresh by re-fetching it every 3 seconds.
// No WebSockets: simple polling is easy to follow and fast enough for a small meeting.

import { useEffect, useState } from "react";
import { ApiError, getMeeting } from "@/lib/api";
import { getParticipantToken } from "@/lib/auth";
import type { MeetingDetail } from "@/types/meeting";

const POLL_INTERVAL_MS = 3000;

export function useMeetingPolling(meetingCode: string, myId: number) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  // Remembers that we were in the meeting, so later we can say "you were removed" instead of "not joined".
  const [wasInMeeting, setWasInMeeting] = useState(false);
  // Changing this number restarts the polling, which fetches immediately (used after our own actions).
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const poll = () =>
      getMeeting(meetingCode)
        .then((data) => {
          setMeeting(data);
          setLoadError(null);
          const iAmListed = data.active_participants.some((p) => p.id === myId);
          if (iAmListed && getParticipantToken(myId)) setWasInMeeting(true); // only this tab's own participant
        })
        .catch((error: ApiError) => setLoadError(error));

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [meetingCode, myId, refreshCount]);

  const refreshNow = () => setRefreshCount((count) => count + 1);

  return { meeting, setMeeting, loadError, wasInMeeting, refreshNow };
}
