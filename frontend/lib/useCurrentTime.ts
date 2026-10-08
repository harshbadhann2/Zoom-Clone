"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every 10 seconds.
 *
 * Starts as null on purpose: the dashboard HTML is pre-rendered at build time, so a time
 * computed on the server would be the build time. We only read the clock in the browser.
 */
export function useCurrentTime(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const firstTick = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 10_000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(intervalId);
    };
  }, []);

  return now;
}
