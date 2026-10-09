"use client";

// The dashboard (home page): greeting, the four action tiles, upcoming and recent meetings.
// The lists are loaded by useDashboardMeetings; the dialogs live in components/.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, MonitorUp, Plus, Video } from "lucide-react";
import { ActionTile } from "@/components/ActionTile";
import { Navbar } from "@/components/Navbar";
import { UpcomingMeetings } from "@/components/UpcomingMeetings";
import { RecentMeetings } from "@/components/RecentMeetings";
import { JoinMeetingModal } from "@/components/JoinMeetingModal";
import { ScheduleMeetingModal } from "@/components/ScheduleMeetingModal";
import { SettingsModal } from "@/components/SettingsModal";
import { useToast } from "@/components/Toast";
import { ApiError, createInstantMeeting, deleteMeeting, getMe, logOut, startMeeting } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { buildInvitation } from "@/lib/meeting";
import { useCurrentTime } from "@/lib/useCurrentTime";
import { useDashboardMeetings } from "@/lib/useDashboardMeetings";
import type { Meeting, User } from "@/types/meeting";

type OpenModal = "join" | "share" | "schedule" | "settings" | null;

export default function DashboardPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const now = useCurrentTime();

  const [user, setUser] = useState<User | null>(null);
  const { upcoming, upcomingError, recent, recentError, slowServer, reload, retry } = useDashboardMeetings();
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  // Which meeting is being started ("new" for New Meeting), so we can show a spinner and block double clicks.
  const [startingCode, setStartingCode] = useState<string | null>(null);

  // Who is signed in? Without a valid token the server answers 401 and we go to the sign-in page.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((error: ApiError) => {
        if (error.status === 401) router.replace("/login");
      });
  }, [router]);

  async function handleSignOut() {
    await logOut().catch(() => undefined); // sign out locally even if the server is unreachable
    clearToken();
    router.replace("/login");
  }

  /** Start our own meeting as host. The server checks that we are the signed-in owner. */
  async function enterAsHost(code: string, isNewMeeting = false) {
    const me = await startMeeting(code, user?.name ?? "Host");
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
      reload();
    } catch (error) {
      showToast((error as Error).message);
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onOpenSettings={() => setOpenModal("settings")}
        onPlaceholderClick={(feature) => showToast(`${feature} isn’t available in this demo`)}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        {slowServer && (
          <p role="status" className="mb-6 rounded-xl bg-zoom-blue-soft px-4 py-3 text-sm text-ink">
            <Loader2 size={14} className="mr-2 inline animate-spin align-[-2px]" />
            Waking up the server… The backend runs on a free hosting plan that sleeps when idle, so the first load can take up to a minute.
          </p>
        )}
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
            error={upcomingError}
            startingCode={startingCode}
            onStart={handleStart}
            onCopyInvitation={handleCopyInvitation}
            onDelete={handleDelete}
            onSchedule={() => setOpenModal("schedule")}
            onRetry={retry}
          />
        </div>

        <div className="mt-10">
          <RecentMeetings meetings={recent} error={recentError} onRetry={retry} onRejoin={handleStart} />
        </div>
      </main>

      <JoinMeetingModal open={openModal === "join" || openModal === "share"} mode={openModal === "share" ? "share" : "join"} onClose={() => setOpenModal(null)} />
      <ScheduleMeetingModal
        open={openModal === "schedule"}
        hostName={user?.name ?? ""}
        onClose={() => setOpenModal(null)}
        onScheduled={() => {
          showToast("Meeting scheduled");
          reload();
        }}
      />
      <SettingsModal
        open={openModal === "settings"}
        user={user}
        onClose={() => setOpenModal(null)}
        onSaved={(updated) => {
          setUser(updated); // greeting, avatar and future meetings use the new name right away
          setOpenModal(null);
          showToast("Profile saved");
          reload(); // host names on the lists come from the server
        }}
        onSignOut={handleSignOut}
        onSessionExpired={() => router.replace("/login")}
      />
      {toast}
    </div>
  );
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
