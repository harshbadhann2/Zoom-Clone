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
  createInstantMeeting,
  deleteMeeting,
  getRecentMeetings,
  getUpcomingMeetings,
  joinMeeting,
} from "@/lib/api";
import { buildInvitation, CURRENT_USER } from "@/lib/meeting";
import type { Meeting } from "@/types/meeting";

type OpenModal = "join" | "share" | "schedule" | null;

export default function DashboardPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();

  const [upcoming, setUpcoming] = useState<Meeting[] | null>(null); // null = loading
  const [recent, setRecent] = useState<Meeting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  // Which meeting is being started ("new" for New Meeting), so we can show a spinner and block double clicks.
  const [startingCode, setStartingCode] = useState<string | null>(null);

  // Bumping this number re-runs the effect below, which re-fetches the dashboard lists.
  const [reloadCount, setReloadCount] = useState(0);
  const reloadMeetings = () => setReloadCount((count) => count + 1);

  useEffect(() => {
    Promise.all([getUpcomingMeetings(), getRecentMeetings()])
      .then(([upcomingList, recentList]) => {
        setUpcoming(upcomingList);
        setRecent(recentList);
        setLoadError(null);
      })
      .catch((error: Error) => setLoadError(error.message));
  }, [reloadCount]);

  /** Join a meeting as the host (the default user) and open the meeting room. */
  async function enterAsHost(code: string, isNewMeeting = false) {
    const me = await joinMeeting(code, CURRENT_USER.name, true);
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
      <Navbar onPlaceholderClick={(feature) => showToast(`${feature} isn’t available in this demo`)} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_420px] lg:gap-12">
          {/* Left: greeting + the four big action tiles */}
          <section aria-label="Meeting actions" className="flex flex-col items-center lg:pt-10">
            <h1 suppressHydrationWarning className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting()}, {CURRENT_USER.name.split(" ")[0]}
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
      : "bg-zoom-blue hover:bg-zoom-blue-hover shadow-[0_8px_20px_-8px_rgba(11,92,255,0.7)]";

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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
