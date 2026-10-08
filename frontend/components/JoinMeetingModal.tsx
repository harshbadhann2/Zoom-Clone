"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ApiError, joinMeeting } from "@/lib/api";
import { CURRENT_USER, parseMeetingInput } from "@/lib/meeting";

interface JoinMeetingModalProps {
  open: boolean;
  /** "share" is the Share Screen tile: same form, then the room asks what to share. */
  mode: "join" | "share";
  onClose: () => void;
}

export function JoinMeetingModal({ open, mode, onClose }: JoinMeetingModalProps) {
  return (
    <Modal open={open} title={mode === "share" ? "Share screen" : "Join meeting"} onClose={onClose}>
      <JoinForm mode={mode} onCancel={onClose} />
    </Modal>
  );
}

type FieldErrors = { meeting?: string; name?: string; form?: string };

function JoinForm({ mode, onCancel }: { mode: "join" | "share"; onCancel: () => void }) {
  const router = useRouter();
  const [meetingInput, setMeetingInput] = useState("");
  const [name, setName] = useState(CURRENT_USER.name);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // 1. Validate in the browser first, so obvious mistakes don't need a server round-trip.
    const code = parseMeetingInput(meetingInput);
    const newErrors: FieldErrors = {};
    if (!meetingInput.trim()) newErrors.meeting = "Enter a Meeting ID or invite link.";
    else if (!code) newErrors.meeting = "Meeting ID should be 10 digits, or paste the full invite link.";
    if (!name.trim()) newErrors.name = "Enter your name.";
    setErrors(newErrors);
    if (!code || newErrors.name) return;

    // 2. The backend checks the meeting exists (404) and hasn't ended (409), then adds us as a participant.
    setSubmitting(true);
    try {
      const participant = await joinMeeting(code, name.trim());
      router.push(`/meeting/${code}?pid=${participant.id}${mode === "share" ? "&share=1" : ""}`);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 404
          ? "This Meeting ID is not valid. Please check and try again."
          : (error as Error).message;
      setErrors({ form: message });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field label="Meeting ID or invite link" htmlFor="meeting-id" error={errors.meeting}>
        <input
          id="meeting-id"
          autoFocus
          value={meetingInput}
          onChange={(e) => setMeetingInput(e.target.value)}
          placeholder="e.g. 614 838 5880"
          aria-invalid={Boolean(errors.meeting)}
          className={inputClass(errors.meeting)}
        />
      </Field>

      <Field label="Your name" htmlFor="display-name" error={errors.name}>
        <input
          id="display-name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          className={inputClass(errors.name)}
        />
      </Field>

      {errors.form && (
        <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-zoom-red">
          {errors.form}
        </p>
      )}

      <p className="text-xs text-ink-muted">You’ll join with your microphone muted and camera off.</p>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex min-w-20 items-center justify-center rounded-lg bg-zoom-blue px-4 py-2 text-sm font-semibold text-white hover:bg-zoom-blue-hover disabled:opacity-60"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : mode === "share" ? "Share" : "Join"}
        </button>
      </div>
    </form>
  );
}

// ---------- Small form helpers shared with the schedule form ----------

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-zoom-red">{error}</p>}
    </div>
  );
}

export function inputClass(error?: string) {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-muted/70 focus:border-zoom-blue focus:ring-2 focus:ring-zoom-blue/20 ${
    error ? "border-zoom-red" : "border-[#d5d9de]"
  }`;
}
