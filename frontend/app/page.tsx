"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, MonitorUp, Plus, Video } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { UpcomingMeetings } from "@/components/UpcomingMeetings";
import { RecentMeetings } from "@/components/RecentMeetings";
import { JoinMeetingModal } from "@/components/JoinMeetingModal";
import { ScheduleMeetingModal } from "@/components/ScheduleMeetingModal";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  createInstantMeeting,
  deleteMeeting,
  getMe,
  getRecentMeetings,
  getUpcomingMeetings,
  joinMeeting,
  logOut,
} from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { buildInvitation } from "@/lib/meeting";
import { useCurrentTime } from "@/lib/useCurrentTime";
import type { Meeting, User } from "@/types/meeting";

type OpenModal = "join" | "share" | "schedule" | null;

export default function DashboardPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const now = useCurrentTime();

  const [user, setUser] = useState<User | null>(null);
  const [upcoming, setUpcoming] = useState<Meeting[] | null>(null); // null = loading
  const [recent, setRecent] = useState<Meeting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  // Which meeting is being started ("new" for New Meeting), so we can show a spinner and block double clicks.
  const [startingCode, setStartingCode] = useState<string | null>(null);

  // Bumping this number re-runs the effect below, which re-fetches the dashboard lists.
  const [reloadCount, setReloadCount] = useState(0);
  const reloadMeetings = () => setReloadCount((count) => count + 1);

  // Who is signed in? Without a valid token the server answers 401 and we go to the sign-in page.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((error: ApiError) => {
        if (error.status === 401) router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    Promise.all([getUpcomingMeetings(), getRecentMeetings()])
      .then(([upcomingList, recentList]) => {
        setUpcoming(upcomingList);
        setRecent(recentList);
        setLoadError(null);
      })
      .catch((error: ApiError) => {
        if (error.status !== 401) setLoadError(error.message); // 401 is handled by the redirect above
      });
  }, [reloadCount]);

  async function handleSignOut() {
    await logOut().catch(() => undefined); // sign out locally even if the server is unreachable
    clearToken();
    router.replace("/login");
  }

  /** Join our own meeting. The server sees our sign-in token and makes us the host. */
  async function enterAsHost(code: string, isNewMeeting = false) {
    const me = await joinMeeting(code, user?.name ?? "Host");
    router.push(`/meeting/${code}?pid=${me.id}${isNewMeeting ? "&new=1" : ""}`);
  }

  async function handleNewMeeting() {
    setStartingCode("new");
    try {
      const meeting = await createInstantMeeting();
      await enterAsHost(meeting.meeting_code, true);
    } catch (error) {
      showToast((error as Error).message);
      setStartingCode(null);
    }
  }

  async function handleStart(code: string) {
    setStartingCode(code);
    try {
      await enterAsHost(code);
    } catch (error) {
      showToast((error as Error).message);
      setStartingCode(null);
    }
  }

  async function handleCopyInvitation(meeting: Meeting) {
    await navigator.clipboard.writeText(buildInvitation(meeting));
    showToast("Invitation copied to clipboard");
  }

  async function handleDelete(meeting: Meeting) {
    if (!window.confirm(`Delete "${meeting.title}"?`)) return;
    try {
      await deleteMeeting(meeting.meeting_code);
      showToast("Meeting deleted");
      reloadMeetings();
    } catch (error) {
      showToast((error as Error).message);
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onPlaceholderClick={(feature) => showToast(`${feature} isn’t available in this demo`)}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_420px] lg:gap-12">
          {/* Left: greeting + the four big action tiles */}
          <section aria-label="Meeting actions" className="flex flex-col items-center lg:pt-10">
            <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              {now && user ? `${greeting(now)}, ${user.name.split(" ")[0]}` : "\u00a0"}
            </h1>
            <p className="mt-2 text-center text-sm text-ink-muted">Start, join or schedule a meeting.</p>

            <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8 sm:gap-x-14">
              <ActionTile
                label="New meeting"
                color="orange"
                onClick={handleNewMeeting}
                disabled={startingCode !== null}
                icon={startingCode === "new" ? <Loader2 size={34} className="animate-spin" /> : <Video size={36} fill="currentColor" strokeWidth={1.4} />}
              />
              <ActionTile label="Join" onClick={() => setOpenModal("join")} icon={<Plus size={40} strokeWidth={2.2} />} />
              <ActionTile label="Schedule" onClick={() => setOpenModal("schedule")} icon={<CalendarDays size={34} strokeWidth={1.8} />} />
              <ActionTile label="Share screen" onClick={() => setOpenModal("share")} icon={<MonitorUp size={34} strokeWidth={1.8} />} />
            </div>
          </section>

          {/* Right: clock + upcoming meetings */}
          <UpcomingMeetings
            meetings={upcoming}
            error={loadError}
            startingCode={startingCode}
            onStart={handleStart}
            onCopyInvitation={handleCopyInvitation}
            onDelete={handleDelete}
            onSchedule={() => setOpenModal("schedule")}
            onRetry={reloadMeetings}
          />
        </div>

        <div className="mt-10">
          <RecentMeetings meetings={recent} error={loadError} onRetry={reloadMeetings} onRejoin={handleStart} />
        </div>
      </main>

      <JoinMeetingModal open={openModal === "join" || openModal === "share"} mode={openModal === "share" ? "share" : "join"} onClose={() => setOpenModal(null)} />
      <ScheduleMeetingModal
        open={openModal === "schedule"}
        hostName={user?.name ?? ""}
        onClose={() => setOpenModal(null)}
        onScheduled={() => {
          showToast("Meeting scheduled");
          reloadMeetings();
        }}
      />
      {toast}
    </div>
  );
}

interface ActionTileProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: "orange" | "blue";
  disabled?: boolean;
}

/** The big rounded-square buttons from the Zoom home screen. */
function ActionTile({ label, icon, onClick, color = "blue", disabled }: ActionTileProps) {
  const colors =
    color === "orange"
      ? "bg-zoom-orange hover:bg-zoom-orange-hover shadow-[0_8px_20px_-8px_rgba(255,116,46,0.7)]"
      : "bg-zoom-blue hover:bg-zoom-blue-hover shadow-[0_8px_20px_-8px_rgba(13,107,222,0.7)]";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group flex flex-col items-center gap-2.5 disabled:cursor-wait">
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-[22px] text-white transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0 sm:h-[88px] sm:w-[88px] ${colors}`}
      >
        {icon}
      </span>
      <span className="text-[13px] font-medium text-ink">{label}</span>
    </button>
  );
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
