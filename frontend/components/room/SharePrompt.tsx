import { MonitorUp } from "lucide-react";

/** Shown after using the dashboard's "Share screen" tile: a click here is needed to open the browser's picker. */
export function SharePrompt({ onShare, onDismiss }: { onShare: () => void; onDismiss: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
      <div className="animate-pop-in w-full max-w-sm rounded-2xl bg-room-panel p-6 text-center shadow-2xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#0e8a3a]">
          <MonitorUp size={24} />
        </span>
        <h2 className="mt-4 font-semibold">Share your screen</h2>
        <p className="mt-1 text-sm text-white/65">Pick a window, tab or your entire screen. Everyone in the meeting will see it.</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onDismiss} className="flex-1 rounded-lg bg-room-hover py-2 text-sm font-medium">
            Not now
          </button>
          <button type="button" onClick={onShare} className="flex-1 rounded-lg bg-zoom-blue py-2 text-sm font-semibold">
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
