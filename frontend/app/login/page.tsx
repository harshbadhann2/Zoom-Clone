"use client";

// Sign in / sign up page, laid out like Zoom's web landing page.
// Guests can still join a meeting from here without an account.

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Field, inputClass, JoinMeetingModal } from "@/components/JoinMeetingModal";
import { getMe, logIn, signUp } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import type { AuthResponse } from "@/types/meeting";

// The default user from the assignment ("assume a default user is logged in"), created by the backend seed.
const DEMO_EMAIL = "demo@zoomclone.app";
const DEMO_PASSWORD = "zoomdemo123";

type View = "start" | "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("start");
  const [showJoin, setShowJoin] = useState(false);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    getMe()
      .then(() => router.replace("/"))
      .catch(() => undefined);
  }, [router]);

  function finishSignIn(auth: AuthResponse) {
    saveToken(auth.token);
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-white px-4">
      <div className="flex w-full max-w-[400px] flex-1 flex-col items-center justify-center py-12">
        <p className="text-5xl font-bold tracking-tight text-zoom-blue">zoom</p>
        <p className="text-4xl font-bold tracking-tight text-[#0b1a33]">Clone</p>

        <div className="mt-16 w-full">
          {view === "start" && (
            <div className="mx-auto flex w-60 flex-col gap-5">
              <button type="button" onClick={() => setView("signin")} className={bigButton(true)}>
                Sign In
              </button>
              <button type="button" onClick={() => setView("signup")} className={bigButton(false)}>
                Sign Up
              </button>
              <button type="button" onClick={() => setShowJoin(true)} className={bigButton(false)}>
                Join Meeting
              </button>
            </div>
          )}

          {view !== "start" && (
            <button type="button" onClick={() => setView("start")} className="mb-4 flex items-center gap-1 text-sm text-zoom-blue">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {view === "signin" && <SignInForm onSuccess={finishSignIn} onSwitch={() => setView("signup")} />}
          {view === "signup" && <SignUpForm onSuccess={finishSignIn} onSwitch={() => setView("signin")} />}
        </div>
      </div>

      <JoinMeetingModal open={showJoin} mode="join" onClose={() => setShowJoin(false)} />
    </main>
  );
}

function SignInForm({ onSuccess, onSwitch }: { onSuccess: (auth: AuthResponse) => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(emailValue: string, passwordValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      onSuccess(await logIn(emailValue, passwordValue));
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    submit(email.trim(), password);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold">Sign In</h1>
      <Field label="Email Address" htmlFor="email">
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass()} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass()} />
      </Field>
      <FormError message={error} />
      <button type="submit" disabled={submitting} className={`${bigButton(true)} w-full`}>
        {submitting ? <Loader2 size={18} className="animate-spin" /> : "Sign In"}
      </button>

      {/* One click for evaluators: the default user the assignment asks us to assume. */}
      <div className="rounded-xl bg-[#f1f4f6] p-4 text-sm">
        <p className="text-ink-muted">
          Demo account: <span className="font-medium text-ink">{DEMO_EMAIL}</span> / <span className="font-medium text-ink">{DEMO_PASSWORD}</span>
        </p>
        <button type="button" disabled={submitting} onClick={() => submit(DEMO_EMAIL, DEMO_PASSWORD)} className="btn-primary mt-3 w-full">
          Continue as demo user
        </button>
      </div>

      <p className="text-center text-sm text-ink-muted">
        New to Zoom Clone?{" "}
        <button type="button" onClick={onSwitch} className="font-medium text-zoom-blue hover:underline">
          Sign Up Free
        </button>
      </p>
    </form>
  );
}

function SignUpForm({ onSuccess, onSwitch }: { onSuccess: (auth: AuthResponse) => void; onSwitch: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setSubmitting(true);
    setError(null);
    try {
      onSuccess(await signUp(name.trim(), email.trim(), password));
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold">Sign Up</h1>
      <Field label="Full Name" htmlFor="name">
        <input id="name" autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass()} />
      </Field>
      <Field label="Email Address" htmlFor="email">
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass()} />
      </Field>
      <Field label="Password (at least 8 characters)" htmlFor="password">
        <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass()} />
      </Field>
      <FormError message={error} />
      <button type="submit" disabled={submitting} className={`${bigButton(true)} w-full`}>
        {submitting ? <Loader2 size={18} className="animate-spin" /> : "Create Account"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="font-medium text-zoom-blue hover:underline">
          Sign In
        </button>
      </p>
    </form>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-zoom-red">
      {message}
    </p>
  );
}

/** The 40px-tall buttons from Zoom's landing page (blue primary, or white with a grey border). */
function bigButton(primary: boolean) {
  return `flex h-10 items-center justify-center rounded-[10px] text-base font-medium transition-colors disabled:opacity-60 ${
    primary
      ? "bg-zoom-blue text-white hover:bg-zoom-blue-hover"
      : "border border-[#939ba4] bg-white text-ink hover:bg-[#f1f4f6]"
  }`;
}
