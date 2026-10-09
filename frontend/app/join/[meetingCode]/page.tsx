"use client";

// Pre-join screen, opened from an invite link like https://<app>/join/6148385880
// (or after entering a Meeting ID in the Join dialog). Laid out like Zoom's web client:
// camera preview with Mute / Start Video on the left, "Enter Meeting Info" on the right.

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Mic, MicOff, User, Video, VideoOff } from "lucide-react";
import { inputClass } from "@/components/JoinMeetingModal";
import { useToast } from "@/components/Toast";
import { ApiError, getMeeting, joinMeeting } from "@/lib/api";
import { formatDayLabel, formatMeetingCode, meetingTimeRange, parseMeetingInput } from "@/lib/meeting";
import type { MeetingDetail } from "@/types/meeting";

const SAVED_NAME_KEY = "zoom-clone-name";

interface JoinPageProps {
  params: Promise<{ meetingCode: string }>;
  searchParams: Promise<{ share?: string }>;
}

export default function JoinPage({ params, searchParams }: JoinPageProps) {
  const { meetingCode: rawCode } = use(params);
  const { share } = use(searchParams);
  const meetingCode = parseMeetingInput(rawCode); // null if the link is malformed
  const router = useRouter();
  const { toast, showToast } = useToast();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [name, setName] = useState("");
  const [rememberName, setRememberName] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!meetingCode) return;
    getMeeting(meetingCode)
      .then((data) => {
        setMeeting(data);
        // Pre-fill the name saved last time (the form only appears once the meeting has loaded).
        const savedName = readSavedName();
        if (savedName) {
          setName(savedName);
          setRememberName(true);
        }
      })
      .catch((error: ApiError) => setLoadError(error));
  }, [meetingCode]);

  // Turn the preview camera off when it's toggled off or when we leave this page.
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);

  async function toggleVideo() {
    if (cameraStream) return setCameraStream(null);
    try {
      setCameraStream(await navigator.mediaDevices.getUserMedia({ video: true }));
    } catch {
      showToast("Camera unavailable. Check your browser’s camera permission.");
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (!meetingCode || !name.trim()) return;
    saveName(rememberName ? name.trim() : null);
    setJoining(true);
    try {
      const participant = await joinMeeting(meetingCode, name.trim(), isMuted);
      // The room turns the camera back on if it was on here.
      const extras = `${cameraStream ? "&video=1" : ""}${share === "1" ? "&share=1" : ""}`;
      router.push(`/meeting/${meetingCode}?pid=${participant.id}${extras}`);
    } catch (error) {
      setJoinError((error as Error).message);
      setJoining(false);
    }
  }

  // ---------- Error / loading states ----------
  if (!meetingCode) {
    return <JoinMessage title="Invalid invite link" text="This link doesn’t contain a valid 10-digit Meeting ID." />;
  }
  if (loadError?.status === 404) {
    return <JoinMessage title="Meeting not found" text={`No meeting exists with ID ${formatMeetingCode(meetingCode)}. Check the link with the host.`} />;
  }
  if (loadError) return <JoinMessage title="Couldn’t load the meeting" text={loadError.message} />;
  if (!meeting) {
    return (
      <JoinShell>
        <Loader2 size={28} className="mx-auto animate-spin text-ink-muted" />
      </JoinShell>
    );
  }
  if (meeting.status === "ended") {
    return <JoinMessage title="This meeting has ended" text={`“${meeting.title}” was ended by the host.`} />;
  }

  // ---------- Pre-join screen ----------
  return (
    <JoinShell>
      {/* Side by side on desktop; stacked (preview on top, narrow form below) on tablets and phones, like Zoom. */}
      <div className="grid w-full items-center gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-10">
        {/* Preview: live camera if on, otherwise Zoom's grey silhouette */}
        <div className="relative mx-auto flex aspect-video w-full max-w-[448px] items-center justify-center overflow-hidden rounded-2xl bg-[#323337] lg:max-w-none">
          {cameraStream ? (
            <video
              ref={(video) => {
                if (video && video.srcObject !== cameraStream) video.srcObject = cameraStream;
              }}
              autoPlay
              muted
              playsInline
              className="h-full w-full -scale-x-100 object-cover"
            />
          ) : (
            <span className="-mt-10 flex h-[32%] aspect-[7/6] items-center justify-center rounded-[22%] bg-[#4a4b4f] text-[#323337] sm:mt-0 sm:h-[38%]">
              <User className="h-3/4 w-3/4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
            </span>
          )}

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 rounded-lg bg-black text-white">
            <PreviewButton label={isMuted ? "Unmute" : "Mute"} onClick={() => setIsMuted((muted) => !muted)}>
              {isMuted ? <MicOff size={20} className="text-zoom-red" /> : <Mic size={20} />}
            </PreviewButton>
            <PreviewButton label={cameraStream ? "Stop Video" : "Start Video"} onClick={toggleVideo}>
              {cameraStream ? <Video size={20} /> : <VideoOff size={20} className="text-zoom-red" />}
            </PreviewButton>
          </div>
        </div>

        <form onSubmit={handleJoin} noValidate className="mx-auto w-full max-w-[400px] space-y-4 lg:max-w-none">
          <h1 className="text-center text-2xl font-bold text-[#4a4a4a]">Enter Meeting Info</h1>

          <div className="rounded-xl bg-[#f1f4f6] px-4 py-3 text-sm">
            <p className="truncate font-semibold">{meeting.title}</p>
            <p className="mt-0.5 text-ink-muted">
              {formatDayLabel(new Date(meeting.scheduled_at))} · {meetingTimeRange(meeting)}
            </p>
            <p className="mt-0.5 text-ink-muted">
              Host: {meeting.host_name} · ID {formatMeetingCode(meeting.meeting_code)}
            </p>
            {meeting.status === "live" && (
              <p className="mt-1.5 font-medium text-[#0a6b2c]">In progress · {meeting.active_participants.length} in meeting</p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
              Your Name
            </label>
            <input id="name" autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass()} />
          </div>

          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={rememberName} onChange={(e) => setRememberName(e.target.checked)} className="h-4 w-4 accent-zoom-blue" />
            Remember my name for future meetings
          </label>

          {joinError && (
            <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-zoom-red">
              {joinError}
            </p>
          )}

          {/* Greyed out until a name is entered, like Zoom. */}
          <button type="submit" disabled={!name.trim() || joining} className="btn-primary h-10 w-full text-base">
            {joining ? <Loader2 size={18} className="animate-spin" /> : "Join"}
          </button>
        </form>
      </div>
      {toast}
    </JoinShell>
  );
}

function PreviewButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs hover:bg-white/10">
      {children}
      {label}
    </button>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-6 py-6 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-0.5 py-1 text-sm text-zoom-blue hover:underline">
          <ChevronLeft size={16} /> Back
        </Link>
      </div>
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 pb-16 sm:px-10">{children}</main>
    </div>
  );
}

function JoinMessage({ title, text }: { title: string; text: string }) {
  return (
    <JoinShell>
      <div className="w-full py-10 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{text}</p>
        <Link href="/" className="btn-primary mt-6 h-10 px-6">
          Back to home
        </Link>
      </div>
    </JoinShell>
  );
}

// "Remember my name" is a small per-browser convenience, so localStorage is fine (wrapped: it can throw).
function readSavedName(): string | null {
  try {
    return localStorage.getItem(SAVED_NAME_KEY);
  } catch {
    return null;
  }
}

function saveName(name: string | null) {
  try {
    if (name) localStorage.setItem(SAVED_NAME_KEY, name);
    else localStorage.removeItem(SAVED_NAME_KEY);
  } catch {
    // ignore
  }
}
