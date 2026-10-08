"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Field, inputClass } from "@/components/JoinMeetingModal";
import { scheduleMeeting } from "@/lib/api";
import { formatDayLabel, formatDuration, formatMeetingCode, meetingTimeRange } from "@/lib/meeting";
import type { Meeting } from "@/types/meeting";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

interface ScheduleMeetingModalProps {
  open: boolean;
  hostName: string;
  onClose: () => void;
  onScheduled: (meeting: Meeting) => void;
}

export function ScheduleMeetingModal({ open, hostName, onClose, onScheduled }: ScheduleMeetingModalProps) {
  const [scheduled, setScheduled] = useState<Meeting | null>(null);

  function close() {
    setScheduled(null);
    onClose();
  }

  return (
    <Modal open={open} title={scheduled ? "Meeting scheduled" : "Schedule meeting"} onClose={close}>
      {scheduled ? (
        <ScheduledSummary meeting={scheduled} onDone={close} />
      ) : (
        <ScheduleForm
          hostName={hostName}
          onCancel={close}
          onScheduled={(meeting) => {
            setScheduled(meeting);
            onScheduled(meeting);
          }}
        />
      )}
    </Modal>
  );
}

type FieldErrors = { title?: string; when?: string; form?: string };

interface ScheduleFormProps {
  hostName: string;
  onCancel: () => void;
  onScheduled: (meeting: Meeting) => void;
}

function ScheduleForm({ hostName, onCancel, onScheduled }: ScheduleFormProps) {
  const defaultStart = nextHalfHour();
  const [title, setTitle] = useState(`${hostName}'s Zoom Meeting`);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(toDateInputValue(defaultStart));
  const [time, setTime] = useState(toTimeInputValue(defaultStart));
  const [duration, setDuration] = useState(60);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // "2026-10-09" + "14:30" is read as the user's local time, then sent to the API in UTC.
    const startsAt = new Date(`${date}T${time}`);
    const newErrors: FieldErrors = {};
    if (!title.trim()) newErrors.title = "Topic is required.";
    if (!date || !time || Number.isNaN(startsAt.getTime())) newErrors.when = "Choose a date and time.";
    else if (startsAt.getTime() < Date.now()) newErrors.when = "Choose a time in the future.";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const meeting = await scheduleMeeting({
        title: title.trim(),
        description: description.trim(),
        scheduled_at: startsAt.toISOString(),
        duration_minutes: duration,
      });
      onScheduled(meeting);
    } catch (error) {
      setErrors({ form: (error as Error).message });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field label="Topic" htmlFor="topic" error={errors.title}>
        <input
          id="topic"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={Boolean(errors.title)}
          className={inputClass(errors.title)}
        />
      </Field>

      <Field label="Description (optional)" htmlFor="description">
        <textarea
          id="description"
          rows={3}
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add an agenda or notes for attendees"
          className={`${inputClass()} h-auto resize-none py-2`}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm">When</legend>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="date"
            aria-label="Date"
            value={date}
            min={toDateInputValue(new Date())}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={Boolean(errors.when)}
            className={inputClass(errors.when)}
          />
          <input
            type="time"
            aria-label="Time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-invalid={Boolean(errors.when)}
            className={inputClass(errors.when)}
          />
        </div>
        {errors.when ? (
          <p role="alert" className="mt-1.5 text-[13px] text-zoom-red">{errors.when}</p>
        ) : (
          <p className="mt-1.5 text-xs text-ink-muted">Time zone: {timeZone}</p>
        )}
      </fieldset>

      <Field label="Duration" htmlFor="duration">
        <select id="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass()}>
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatDuration(minutes)}
            </option>
          ))}
        </select>
      </Field>

      {errors.form && (
        <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-zoom-red">
          {errors.form}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-3">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary min-w-16">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : "Save"}
        </button>
      </div>
    </form>
  );
}

function ScheduledSummary({ meeting, onDone }: { meeting: Meeting; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(meeting.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <CheckCircle2 size={28} className="shrink-0 text-[#12a150]" />
        <div className="min-w-0">
          <p className="font-semibold">{meeting.title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatDayLabel(new Date(meeting.scheduled_at))} · {meetingTimeRange(meeting)}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">Meeting ID: {formatMeetingCode(meeting.meeting_code)}</p>
        </div>
      </div>

      <label htmlFor="invite-link" className="mb-1.5 mt-5 block text-sm">
        Invite link
      </label>
      <div className="flex gap-2">
        <input id="invite-link" readOnly value={meeting.invite_link} onFocus={(e) => e.target.select()} className={`${inputClass()} bg-canvas`} />
        <button type="button" onClick={copyLink} className="btn-secondary h-10 shrink-0">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="mt-8 flex justify-end">
        <button type="button" onClick={onDone} className="btn-primary">
          Done
        </button>
      </div>
    </div>
  );
}

// ---------- Date helpers for <input type="date"> / <input type="time"> (local time) ----------

function nextHalfHour(): Date {
  const date = new Date();
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60, 0, 0); // 60 rolls over to the next hour
  return date;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInputValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInputValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
