"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ApiError, getMeeting } from "@/lib/api";
import { parseMeetingInput } from "@/lib/meeting";

interface JoinMeetingModalProps {
  open: boolean;
  /** "share" is the Share Screen tile: same form, then the room asks what to share. */
  mode: "join" | "share";
  onClose: () => void;
}

/**
 * Like Zoom: this dialog only asks for the Meeting ID. Your name, microphone and camera
 * are chosen on the next screen (the pre-join page at /join/{id}).
 */
export function JoinMeetingModal({ open, mode, onClose }: JoinMeetingModalProps) {
  return (
    <Modal open={open} title={mode === "share" ? "Share Screen" : "Join Meeting"} onClose={onClose}>
      <JoinForm mode={mode} onCancel={onClose} />
    </Modal>
  );
}

function JoinForm({ mode, onCancel }: { mode: "join" | "share"; onCancel: () => void }) {
  const router = useRouter();
  const [meetingInput, setMeetingInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // 1. Check the format in the browser first: no server round-trip for obvious mistakes.
    const code = parseMeetingInput(meetingInput);
    if (!code) return setError("Meeting ID should be 10 digits, or paste the full invite link.");

    // 2. Ask the server whether the meeting exists and is still open.
    setChecking(true);
    try {
      const meeting = await getMeeting(code);
      if (meeting.status === "ended") throw new Error("This meeting has already ended.");
      router.push(`/join/${code}${mode === "share" ? "?share=1" : ""}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This Meeting ID is not valid. Please check and try again."
          : (err as Error).message,
      );
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field label="Meeting ID or Invite Link" htmlFor="meeting-id" error={error ?? undefined}>
        <input
          id="meeting-id"
          autoFocus
          value={meetingInput}
          onChange={(e) => {
            setMeetingInput(e.target.value);
            setError(null);
          }}
          placeholder="e.g. 614 838 5880"
          aria-invalid={Boolean(error)}
          className={inputClass(error ?? undefined)}
        />
      </Field>

      <div className="mt-8 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        {/* Greyed out until something is typed, like Zoom's Join button. */}
        <button type="submit" disabled={!meetingInput.trim() || checking} className="btn-primary min-w-16">
          {checking ? <Loader2 size={16} className="animate-spin" /> : mode === "share" ? "Share" : "Join"}
        </button>
      </div>
    </form>
  );
}

// ---------- Small form helpers shared with the other forms ----------

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-[13px] text-zoom-red">
          {error}
        </p>
      )}
    </div>
  );
}

/** Zoom's text inputs: 40px tall, 12px corners, grey border, red border on error. */
export function inputClass(error?: string) {
  return `h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-colors placeholder:text-ink-muted/70 focus:border-zoom-blue focus:ring-2 focus:ring-zoom-blue/20 ${
    error ? "border-zoom-red" : "border-[#c1c6ce]"
  }`;
}
