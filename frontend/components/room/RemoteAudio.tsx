"use client";

import { useState } from "react";
import type { RemoteMedia } from "@/lib/useMeetingMedia";

/**
 * Plays the other participants' voices: one hidden <audio> player per person.
 * Browsers may block audio that starts without a click; then a button appears to turn it on.
 */
export function RemoteAudio({ remote }: { remote: Record<number, RemoteMedia> }) {
  const [blocked, setBlocked] = useState(false);

  function playAll() {
    document.querySelectorAll<HTMLAudioElement>("audio[data-remote]").forEach((audio) => audio.play().catch(() => undefined));
    setBlocked(false);
  }

  return (
    <>
      {Object.entries(remote).map(([id, media]) => (
        <audio
          key={id}
          data-remote
          autoPlay
          ref={(audio) => {
            if (!audio || audio.srcObject === media.stream) return;
            audio.srcObject = media.stream; // React has no prop for srcObject
            audio.play().catch(() => setBlocked(true));
          }}
        />
      ))}
      {blocked && (
        <button
          type="button"
          onClick={playAll}
          className="fixed left-1/2 top-14 z-30 -translate-x-1/2 rounded-lg bg-zoom-blue px-4 py-2 text-sm font-semibold shadow-lg"
        >
          Click to turn on meeting audio
        </button>
      )}
    </>
  );
}
