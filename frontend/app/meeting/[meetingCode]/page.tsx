"use client";

// The meeting room. The work is split into small pieces:
//   useMeetingPolling - the meeting data (participants, chat, status), refreshed every 3 seconds
//   useLocalMedia     - your own camera and screen share
//   useMeetingMedia   - real audio/video with the other participants (WebRTC)
//   components/room/  - the header, video grid, toolbar, side panels, audio players and messages
// This file connects them and handles the buttons.

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ControlBar } from "@/components/room/ControlBar";
import { ChatPanel } from "@/components/room/ChatPanel";
import { ParticipantsPanel } from "@/components/room/ParticipantsPanel";
import { RemoteAudio } from "@/components/room/RemoteAudio";
import { RoomHeader } from "@/components/room/RoomHeader";
import { RoomMessage } from "@/components/room/RoomMessage";
import { SharePrompt } from "@/components/room/SharePrompt";
import { VideoGrid } from "@/components/room/VideoGrid";
import { VideoTile } from "@/components/room/VideoTile";
import { useToast } from "@/components/Toast";
import { endMeeting, leaveMeeting, muteAll, removeParticipant, sendMessage, setMuted } from "@/lib/api";
import { getParticipantToken } from "@/lib/auth";
import { useLocalMedia } from "@/lib/useLocalMedia";
import { useMeetingMedia } from "@/lib/useMeetingMedia";
import { useMeetingPolling } from "@/lib/useMeetingPolling";

const MIC_UNAVAILABLE = "Microphone unavailable. Check your browser’s microphone permission.";

interface MeetingRoomProps {
  params: Promise<{ meetingCode: string }>;
  // pid = our participant id (from the join API); new/share/video = choices made before entering
  searchParams: Promise<{ pid?: string; new?: string; share?: string; video?: string }>;
}

export default function MeetingRoomPage({ params, searchParams }: MeetingRoomProps) {
  const { meetingCode } = use(params);
  const query = use(searchParams);
  const myId = Number(query.pid);
  const router = useRouter();
  const { toast, showToast } = useToast();

  const { meeting, setMeeting, loadError, wasInMeeting, refreshNow } = useMeetingPolling(meetingCode, myId);
  const { cameraStream, screenStream, toggleCamera, toggleScreenShare } = useLocalMedia(query.video === "1", showToast);
  const [leaving, setLeaving] = useState(false);
  const [sidePanel, setSidePanel] = useState<"participants" | "chat" | null>(null);
  const [seenMessageCount, setSeenMessageCount] = useState(0); // for the unread badge on Chat
  const [showSharePrompt, setShowSharePrompt] = useState(query.share === "1");

  // ---------- Who am I? ----------
  // We are "in" the meeting only if the server lists us AND this tab holds our participant token
  // (a room URL copied into another browser has no token, so that person must join properly).
  const me = meeting && getParticipantToken(myId) ? meeting.active_participants.find((p) => p.id === myId) : undefined;
  const inRoom = Boolean(me) && meeting?.status !== "ended" && !leaving;

  // ---------- Audio/video with the other participants ----------
  const media = useMeetingMedia({
    meetingCode,
    myId,
    peerIds: inRoom ? meeting!.active_participants.filter((p) => p.id !== myId).map((p) => p.id) : [],
    active: inRoom,
    muted: me?.is_muted ?? true,
    // What the others see from us: the shared screen while sharing, otherwise the camera.
    outgoingVideo: screenStream?.getVideoTracks()[0] ?? cameraStream?.getVideoTracks()[0] ?? null,
  });

  // Joined unmuted (chosen on the pre-join screen): turn the microphone on, or fall back to muted.
  const micAsked = useRef(false);
  useEffect(() => {
    if (!inRoom || !me || me.is_muted || media.hasMicrophone || micAsked.current) return;
    micAsked.current = true;
    media.requestMicrophone().then((ok) => {
      if (ok) return;
      showToast(MIC_UNAVAILABLE);
      setMuted(meetingCode, myId, true).catch(() => undefined);
    });
  }, [inRoom, me, media, meetingCode, myId, showToast]);

  // ---------- Screens shown instead of the room ----------
  if (leaving) return <RoomMessage title="Leaving meeting…" spinner />;
  if (!meeting) {
    if (loadError?.status === 404) {
      return <RoomMessage title="Meeting not found" text="This Meeting ID is not valid. Please check the link and try again." />;
    }
    if (loadError) return <RoomMessage title="Couldn’t connect to the meeting" text={loadError.message} />;
    return <RoomMessage title="Connecting…" spinner />;
  }
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

  // ---------- Button handlers ----------
  async function handleToggleMute() {
    const nextMuted = !me!.is_muted;
    // Unmuting needs the microphone; the browser asks for permission the first time.
    if (!nextMuted && !(await media.requestMicrophone())) return showToast(MIC_UNAVAILABLE);
    // Update the screen immediately, then tell the server (everyone else sees it on their next refresh).
    setMeeting((current) =>
      current && {
        ...current,
        active_participants: current.active_participants.map((p) => (p.id === myId ? { ...p, is_muted: nextMuted } : p)),
      },
    );
    try {
      await setMuted(meetingCode, myId, nextMuted);
    } catch (error) {
      showToast((error as Error).message);
      refreshNow();
    }
  }

  function handleToggleShare() {
    setShowSharePrompt(false);
    toggleScreenShare();
  }

  async function handleLeave(endForAll: boolean) {
    if (endForAll) {
      try {
        await endMeeting(meetingCode, myId); // the server checks that we really are the host
      } catch (error) {
        return showToast((error as Error).message); // e.g. "Only the host can do this." — stay in the meeting
      }
    } else {
      await leaveMeeting(meetingCode, myId).catch(() => undefined); // leave locally even if the server is unreachable
    }
    setLeaving(true);
    router.push("/");
  }

  /** Open/close a side panel. Opening or closing marks all chat messages as read. */
  function togglePanel(panel: "participants" | "chat") {
    setSeenMessageCount(meeting!.messages.length);
    setSidePanel((current) => (current === panel ? null : panel));
  }

  async function handleSendMessage(text: string) {
    try {
      await sendMessage(meetingCode, myId, text);
      refreshNow(); // fetch right away so the message appears without waiting for the next refresh
    } catch (error) {
      showToast((error as Error).message);
      throw error; // keep the draft in the input
    }
  }

  /** Mute all / remove: the server checks we are the host; show the result either way. */
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

  // ---------- Layout ----------
  const participants = meeting.active_participants;
  const failedNames = participants.filter((p) => media.status[p.id] === "failed").map((p) => p.display_name);

  const tiles = participants.map((person) => {
    const isMe = person.id === myId;
    const remote = media.remote[person.id];
    return (
      <VideoTile
        key={person.id}
        name={person.display_name}
        isMe={isMe}
        isMuted={person.is_muted}
        stream={isMe ? cameraStream : remote?.videoOn ? remote.stream : null}
        mirrored={isMe}
        connection={isMe ? undefined : media.status[person.id]}
        compact={Boolean(screenStream)}
      />
    );
  });

  return (
    <div className="flex h-dvh flex-col bg-room text-white">
      <RoomHeader meeting={meeting} reconnecting={Boolean(loadError)} showInfoAtStart={query.new === "1"} onCopyInvite={copyInviteLink} />

      {failedNames.length > 0 && (
        <p role="status" className="shrink-0 bg-[#5c1f1f] px-4 py-2 text-center text-sm">
          Audio/video couldn’t connect with {failedNames.join(", ")}.{" "}
          {media.relayAvailable
            ? "Retrying…"
            : "A network is blocking direct connections (common on mobile data or strict Wi‑Fi), and no relay (TURN) server is set up for this demo. Chat and the participant list still work."}
        </p>
      )}

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
          <VideoGrid tiles={tiles} screenStream={screenStream} />
          {showSharePrompt && <SharePrompt onShare={handleToggleShare} onDismiss={() => setShowSharePrompt(false)} />}
        </main>

        {sidePanel === "chat" && (
          <ChatPanel messages={meeting.messages} myId={myId} onSend={handleSendMessage} onClose={() => togglePanel("chat")} />
        )}
        {sidePanel === "participants" && (
          <ParticipantsPanel
            participants={participants}
            myId={myId}
            isHost={me.is_host}
            onClose={() => togglePanel("participants")}
            onInvite={copyInviteLink}
            onMuteAll={() => runHostAction(() => muteAll(meetingCode, myId), "Everyone has been muted")}
            onRemove={(person) => runHostAction(() => removeParticipant(meetingCode, person.id, myId), `${person.display_name} was removed`)}
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
        onToggleVideo={toggleCamera}
        onToggleShare={handleToggleShare}
        onToggleParticipants={() => togglePanel("participants")}
        onToggleChat={() => togglePanel("chat")}
        onLeave={handleLeave}
      />
      <RemoteAudio remote={media.remote} />
      {toast}
    </div>
  );
}
