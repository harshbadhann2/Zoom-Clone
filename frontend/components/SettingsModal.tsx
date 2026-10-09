"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { Field, inputClass } from "@/components/JoinMeetingModal";
import { ApiError, updateProfile } from "@/lib/api";
import type { User } from "@/types/meeting";

interface SettingsModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: (user: User) => void;
  onSignOut: () => void;
  onSessionExpired: () => void;
}

/** Profile settings: change your display name (saved on the server). Email is your login, so it is read-only. */
export function SettingsModal({ open, user, onClose, onSaved, onSignOut, onSessionExpired }: SettingsModalProps) {
  return (
    <Modal open={open} title="Settings" onClose={onClose}>
      {user && <ProfileForm user={user} onClose={onClose} onSaved={onSaved} onSignOut={onSignOut} onSessionExpired={onSessionExpired} />}
    </Modal>
  );
}

function ProfileForm({ user, onClose, onSaved, onSignOut, onSessionExpired }: Omit<SettingsModalProps, "open" | "user"> & { user: User }) {
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unchanged = name.trim() === user.name;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Display name can't be empty.");
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateProfile(name.trim()));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onSessionExpired();
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="mb-3 text-sm font-semibold text-ink-muted">Profile</p>
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={name.trim() || user.name} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name.trim() || user.name}</p>
          <p className="truncate text-sm text-ink-muted">Basic</p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Display name" htmlFor="profile-name" error={error ?? undefined}>
          <input
            id="profile-name"
            value={name}
            maxLength={100}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            className={inputClass(error ?? undefined)}
          />
        </Field>
        <Field label="Email (used to sign in)" htmlFor="profile-email">
          <input id="profile-email" value={user.email} readOnly className={`${inputClass()} bg-canvas text-ink-muted`} />
        </Field>
        <p className="text-xs text-ink-muted">Your display name is shown to participants and on meetings you host.</p>
      </div>

      <div className="mt-8 flex items-center justify-between gap-2">
        <button type="button" onClick={onSignOut} className="text-sm font-medium text-zoom-red hover:underline">
          Sign out
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={unchanged || saving} className="btn-primary min-w-16">
            {saving ? <Loader2 size={16} className="animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
