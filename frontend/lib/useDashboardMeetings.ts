"use client";

// Loads the dashboard's two lists: upcoming and recent meetings.
// Each list has its own data and error, so one failing request doesn't hide the other.

import { useEffect, useState } from "react";
import { ApiError, getRecentMeetings, getUpcomingMeetings } from "@/lib/api";
import type { Meeting } from "@/types/meeting";

const SLOW_LOAD_MS = 5000; // after this, say that the free backend host is probably waking up

export function useDashboardMeetings() {
  const [upcoming, setUpcoming] = useState<Meeting[] | null>(null); // null = still loading
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Meeting[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [waitedLong, setWaitedLong] = useState(false);
  // Changing this number re-runs the effect below, which re-fetches both lists.
  const [reloadCount, setReloadCount] = useState(0);

  // Both lists are requested at the same time; each one finishes (or fails) on its own.
  useEffect(() => {
    let current = true; // ignore answers that arrive after a newer reload started
    const onError = (setError: (message: string) => void) => (error: ApiError) => {
      if (current && error.status !== 401) setError(error.message); // 401: the page redirects to sign-in
    };
    getUpcomingMeetings()
      .then((list) => {
        if (!current) return;
        setUpcoming(list);
        setUpcomingError(null);
      })
      .catch(onError(setUpcomingError));
    getRecentMeetings()
      .then((list) => {
        if (!current) return;
        setRecent(list);
        setRecentError(null);
      })
      .catch(onError(setRecentError));
    return () => {
      current = false;
    };
  }, [reloadCount]);

  const loading = (upcoming === null && !upcomingError) || (recent === null && !recentError);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setWaitedLong(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  /** Re-fetch quietly (after scheduling, deleting or renaming): the lists stay on screen meanwhile. */
  const reload = () => setReloadCount((count) => count + 1);

  /** "Try again" after an error: show the loading skeletons again, then re-fetch. */
  function retry() {
    setUpcoming(null);
    setRecent(null);
    setUpcomingError(null);
    setRecentError(null);
    reload();
  }

  return { upcoming, upcomingError, recent, recentError, slowServer: loading && waitedLong, reload, retry };
}
