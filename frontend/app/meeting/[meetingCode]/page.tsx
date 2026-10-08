"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Info, Loader2, MonitorUp, ShieldCheck, WifiOff } from "lucide-react";
import { VideoTile } from "@/components/room/VideoTile";
import { ControlBar } from "@/components/room/ControlBar";
import { ParticipantsPanel } from "@/components/room/ParticipantsPanel";
import { ChatPanel } from "@/components/room/ChatPanel";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  endMeeting,
  getMeeting,
  leaveMeeting,
  muteAll,
  removeParticipant,
  sendMessage,
  setMuted,
} from "@/lib/api";
import { formatMeetingCode } from "@/lib/meeting";
import type { MeetingDetail, Participant } from "@/types/meeting";

// No WebSockets: every few seconds we re-fetch the meeting to see who joined, left, or was muted.
const POLL_INTERVAL_MS = 3000;

interface MeetingRoomProps {
  params: Promise<{ meetingCode: string }>;
  searchParams: Promise<{ pid?: string; new?: string; share?: string; video?: string }>;
}

export default function MeetingRoomPage({ params, searchParams }: MeetingRoomProps) {
  const { meetingCode } = use(params);
  const query = use(searchParams);
  const myId = Number(query.pid); // our participant id, returned by the join API
  const router = useRouter();
  const { toast, showToast } = useToast();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [wasInMeeting, setWasInMeeting] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sidePanel, setSidePanel] = useState<"participants" | "chat" | null>(null);
  const [seenMessageCount, setSeenMessageCount] = useState(0); // for the unread badge on Chat
  const [showInfo, setShowInfo] = useState(query.new === "1"); // show the invite link right after creating
  const [showSharePrompt, setShowSharePrompt] = useState(query.share === "1");

  // ---------- Keep meeting data fresh ----------
  useEffect(() => {
    const poll = () =>
      getMeeting(meetingCode)
        .then((data) => {
          setMeeting(data);
          setLoadError(null);
          if (data.active_participants.some((p) => p.id === myId)) setWasInMeeting(true);
        })
        .catch((error: ApiError) => setLoadError(error));

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [meetingCode, myId, refreshCount]);

  const refreshNow = () => setRefreshCount((count) => count + 1);

  // If the camera was on in the pre-join preview, turn it on again in the room.
  useEffect(() => {
    if (query.video !== "1") return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) stream.getTracks().forEach((track) => track.stop());
        else setCameraStream(stream);
      })
      .catch(() => undefined); // permission denied: just stay with video off
    return () => {
      cancelled = true;
    };
  }, [query.video]);

  // Stop the camera / screen share when it's turned off or when we leave the page.
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);
  useEffect(() => () => screenStream?.getTracks().forEach((track) => track.stop()), [screenStream]);

  // ---------- Screens shown instead of the room ----------
  if (leaving) return <RoomMessage title="Leaving meeting…" spinner />;

  if (!meeting) {
    if (loadError?.status === 404) {
      return <RoomMessage title="Meeting not found" text="This Meeting ID is not valid. Please check the link and try again." />;
    }
    if (loadError) return <RoomMessage title="Couldn’t connect to the meeting" text={loadError.message} />;
    return <RoomMessage title="Connecting…" spinner />;
  }

  const me = meeting.active_participants.find((p) => p.id === myId);

  if (meeting.status === "ended") {
    return <RoomMessage title="This meeting has been ended by the host" text={meeting.title} />;
  }
  if (!me) {
    return wasInMeeting ? (
      <RoomMessage title="You were removed from this meeting" text={`The host removed you from “${meeting.title}”.`} />
    ) : (
      <RoomMessage title="You’re not in this meeting yet" text="Enter your name to join." joinCode={meetingCode} />
    );
  }

  // ---------- Actions ----------
  async function handleToggleMute() {
    if (!me) return;
    const nextMuted = !me.is_muted;
    // Update the screen immediately, then tell the server.
    setMeeting((current) =>
      current && {
        ...current,
        active_participants: current.active_participants.map((p) => (p.id === me.id ? { ...p, is_muted: nextMuted } : p)),
      },
    );
    try {
      await setMuted(meetingCode, me.id, nextMuted);
    } catch (error) {
      showToast((error as Error).message);
      refreshNow();
    }
  }

  async function handleToggleVideo() {
    if (cameraStream) return setCameraStream(null);
    try {
      setCameraStream(await navigator.mediaDevices.getUserMedia({ video: true }));
    } catch {
      showToast("Camera unavailable. Check your browser’s camera permission.");
    }
  }

  async function handleToggleShare() {
    setShowSharePrompt(false);
    if (screenStream) return setScreenStream(null);
    if (!navigator.mediaDevices?.getDisplayMedia) return showToast("Screen sharing isn’t supported on this device.");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      // The browser's own "Stop sharing" button ends the track; clear our state when that happens.
      stream.getVideoTracks()[0].addEventListener("ended", () => setScreenStream(null));
      setScreenStream(stream);
    } catch {
      // The user closed the browser's share picker; nothing to do.
    }
  }

  async function handleLeave(endForAll: boolean) {
    if (!me) return;
    setLeaving(true);
    try {
      if (endForAll) await endMeeting(meetingCode, me.id);
      else await leaveMeeting(meetingCode, me.id);
    } finally {
      router.push("/");
    }
  }

  /** Open/close a side panel. Opening or closing marks all chat messages as read. */
  function togglePanel(panel: "participants" | "chat") {
    setSeenMessageCount(meeting!.messages.length);
    setSidePanel((current) => (current === panel ? null : panel));
  }

  async function handleSendMessage(text: string) {
    try {
      await sendMessage(meetingCode, me!.id, text);
      refreshNow(); // fetch right away so the message appears without waiting for the next poll
    } catch (error) {
      showToast((error as Error).message);
      throw error; // keep the draft in the input
    }
  }

  async function runHostAction(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      showToast(successMessage);
    } catch (error) {
      showToast((error as Error).message);
    }
    refreshNow();
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(meeting!.invite_link);
    showToast("Invite link copied");
  }

  const participants = meeting.active_participants;
  const gridColumns =
    participants.length === 1 ? "max-w-4xl grid-cols-1" : participants.length <= 4 ? "max-w-6xl grid-cols-1 sm:grid-cols-2" : "max-w-7xl grid-cols-2 lg:grid-cols-3";

  const tiles = participants.map((person: Participant) => (
    <VideoTile
      key={person.id}
      name={person.display_name}
      isMe={person.id === me.id}
      isMuted={person.is_muted}
      stream={person.id === me.id ? cameraStream : null}
      compact={Boolean(screenStream)}
    />
  ));

  return (
    <div className="flex h-dvh flex-col bg-room text-white">
      {/* Top bar */}
      <header className="relative flex h-11 shrink-0 items-center gap-2 px-3">
        <ShieldCheck size={18} className="text-zoom-green" aria-label="Secure meeting" />
        <button
          type="button"
          onClick={() => setShowInfo((open) => !open)}
          aria-expanded={showInfo}
          aria-label="Meeting information"
          className="rounded-md p-1 text-white/80 hover:bg-room-hover hover:text-white"
        >
          <Info size={18} />
        </button>
        <h1 className="min-w-0 truncate text-sm font-medium text-white/90">{meeting.title}</h1>
        {loadError && (
          <span className="ml-auto flex items-center gap-1.5 rounded-md bg-[#5c1f1f] px-2 py-1 text-xs">
            <WifiOff size={14} /> Reconnecting…
          </span>
        )}

        {showInfo && (
          <div className="animate-pop-in absolute left-3 top-11 z-20 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-room-panel p-4 shadow-2xl ring-1 ring-white/10">
            <p className="font-semibold">{meeting.title}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-white/55">Meeting ID</dt>
              <dd>{formatMeetingCode(meeting.meeting_code)}</dd>
              <dt className="text-white/55">Host</dt>
              <dd>{meeting.host_name}</dd>
              <dt className="text-white/55">Invite link</dt>
              <dd className="truncate text-[#7aa7ff]">{meeting.invite_link}</dd>
            </dl>
            <button
              type="button"
              onClick={copyInviteLink}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zoom-blue py-2 text-sm font-semibold hover:bg-zoom-blue-hover"
            >
              <Copy size={15} /> Copy invite link
            </button>
          </div>
        )}
      </header>

      {screenStream && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-[#0e8a3a] py-1.5 text-sm font-medium">
          You are screen sharing
          <button type="button" onClick={handleToggleShare} className="rounded-md bg-zoom-red px-3 py-0.5 text-xs font-semibold hover:bg-[#c81f1f]">
            Stop Share
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 p-2 sm:p-3">
          {screenStream ? (
            // Sharing layout: shared screen large, participants in a strip beside it.
            <div className="flex min-h-0 w-full flex-col gap-2 lg:flex-row">
              <video
                ref={(video) => {
                  if (video && video.srcObject !== screenStream) video.srcObject = screenStream;
                }}
                autoPlay
                muted
                playsInline
                className="min-h-0 flex-1 rounded-xl bg-black object-contain"
              />
              <div className="flex shrink-0 gap-2 overflow-auto lg:w-56 lg:flex-col">{tiles.map((tile) => <div key={tile.key} className="w-40 shrink-0 lg:w-full">{tile}</div>)}</div>
            </div>
          ) : (
            <div className="flex w-full items-center justify-center overflow-y-auto">
              <div className={`grid w-full gap-2 ${gridColumns}`}>{tiles}</div>
            </div>
          )}

          {showSharePrompt && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
              <div className="animate-pop-in w-full max-w-sm rounded-2xl bg-room-panel p-6 text-center shadow-2xl">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#0e8a3a]">
                  <MonitorUp size={24} />
                </span>
                <h2 className="mt-4 font-semibold">Share your screen</h2>
                <p className="mt-1 text-sm text-white/65">Pick a window, tab or your entire screen to share.</p>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setShowSharePrompt(false)} className="flex-1 rounded-lg bg-room-hover py-2 text-sm font-medium">
                    Not now
                  </button>
                  <button type="button" onClick={handleToggleShare} className="flex-1 rounded-lg bg-zoom-blue py-2 text-sm font-semibold">
                    Share
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {sidePanel === "chat" && (
          <ChatPanel messages={meeting.messages} myId={me.id} onSend={handleSendMessage} onClose={() => togglePanel("chat")} />
        )}
        {sidePanel === "participants" && (
          <ParticipantsPanel
            participants={participants}
            myId={me.id}
            isHost={me.is_host}
            onClose={() => togglePanel("participants")}
            onInvite={copyInviteLink}
            onMuteAll={() => runHostAction(() => muteAll(meetingCode, me.id), "Everyone has been muted")}
            onRemove={(person) =>
              runHostAction(() => removeParticipant(meetingCode, person.id, me.id), `${person.display_name} was removed`)
            }
          />
        )}
      </div>

      <ControlBar
        isMuted={me.is_muted}
        isVideoOn={Boolean(cameraStream)}
        isSharing={Boolean(screenStream)}
        isHost={me.is_host}
        participantCount={participants.length}
        unreadMessages={sidePanel === "chat" ? 0 : meeting.messages.length - seenMessageCount}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onToggleShare={handleToggleShare}
        onToggleParticipants={() => togglePanel("participants")}
        onToggleChat={() => togglePanel("chat")}
        onLeave={handleLeave}
      />
      {toast}
    </div>
  );
}

/** Full-screen dark message used for loading, errors, and "meeting ended" states. */
function RoomMessage({ title, text, spinner, joinCode }: { title: string; text?: string; spinner?: boolean; joinCode?: string }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-room px-6 text-center text-white">
      {spinner && <Loader2 size={32} className="mb-4 animate-spin text-white/70" />}
      <h1 className="text-xl font-semibold">{title}</h1>
      {text && <p className="mt-2 max-w-md text-sm text-white/65">{text}</p>}
      {!spinner && (
        <div className="mt-6 flex gap-2">
          {joinCode && (
            <Link href={`/join/${joinCode}`} className="rounded-lg bg-zoom-blue px-4 py-2 text-sm font-semibold hover:bg-zoom-blue-hover">
              Join meeting
            </Link>
          )}
          <Link href="/" className="rounded-lg bg-room-hover px-4 py-2 text-sm font-semibold hover:bg-[#4a4a4a]">
            Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
