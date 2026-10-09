"use client";

// Real audio/video between participants using WebRTC.
//
// How it works:
// - Every pair of participants gets one RTCPeerConnection (a "mesh"; fine for small meetings).
// - The newer participant (higher id) sends an "offer" to each older one; the older one replies
//   with an "answer". These two messages are relayed by our API (/signals), polled every second.
// - The STUN/TURN servers come from our API (/ice-servers), so TURN credentials never live in the code.
// - Each connection is created with one audio and one video "slot" (transceiver). Turning the mic,
//   camera or screen share on/off just swaps the track in that slot, so no renegotiation is needed.
// - Media flows directly between browsers. STUN helps them find each other; when a direct route is
//   impossible (often on mobile data) only a TURN relay works, if the server has one configured.

import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers, sendSignal, takeSignals } from "@/lib/api";

const SIGNAL_POLL_MS = 1000;
const ICE_GATHERING_TIMEOUT_MS = 2500;
const RETRY_AFTER_FAILURE_MS = 15_000;
// If there is no route at all, browsers can stay "connecting" forever instead of reporting "failed".
const CONNECT_TIMEOUT_MS = 20_000;

export type PeerStatus = "connecting" | "connected" | "failed";

export interface RemoteMedia {
  stream: MediaStream; // the other person's audio + video tracks
  videoOn: boolean; // true while video frames are actually arriving
}

interface Options {
  meetingCode: string;
  myId: number;
  peerIds: number[]; // everyone else currently in the meeting
  active: boolean; // false once we've left, were removed, or the meeting ended
  muted: boolean;
  outgoingVideo: MediaStreamTrack | null; // screen share if sharing, otherwise camera, otherwise none
}

export function useMeetingMedia({ meetingCode, myId, peerIds, active, muted, outgoingVideo }: Options) {
  const micTrack = useRef<MediaStreamTrack | null>(null); // our microphone, once permission is given
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [remote, setRemote] = useState<Record<number, RemoteMedia>>({});
  const [status, setStatus] = useState<Record<number, PeerStatus>>({});
  const [relayAvailable, setRelayAvailable] = useState(true); // until the server tells us otherwise

  const peers = useRef(new Map<number, RTCPeerConnection>());
  // Latest values for the polling loop, which outlives individual renders.
  const latest = useRef({ peerIds, outgoingVideo });
  useEffect(() => {
    latest.current = { peerIds, outgoingVideo };
  }, [peerIds, outgoingVideo]);

  /** Ask for the microphone (shows the browser permission prompt the first time). */
  const requestMicrophone = useCallback(async (): Promise<boolean> => {
    if (micTrack.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micTrack.current = stream.getAudioTracks()[0];
      setHasMicrophone(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Muting really stops sending your voice: a disabled track transmits silence.
  useEffect(() => {
    if (micTrack.current) micTrack.current.enabled = !muted;
  }, [hasMicrophone, muted]);

  // When the mic/camera/screen changes, put the new track into every existing connection.
  useEffect(() => {
    for (const pc of peers.current.values()) setOutgoingTracks(pc, micTrack.current, outgoingVideo);
  }, [hasMicrophone, outgoingVideo]);

  // Release the microphone when we leave the room.
  useEffect(() => {
    const track = micTrack;
    return () => {
      track.current?.stop();
      track.current = null;
    };
  }, []);

  // The connection loop: every second, connect to new people, drop people who left, and handle offers/answers.
  useEffect(() => {
    if (!active) return;
    const connections = peers.current;
    const failedAt = new Map<number, number>(); // when a connection last failed, to retry slowly
    let iceServers: RTCIceServer[] | null = null;
    let stopped = false;
    let busy = false;

    const setPeerStatus = (id: number, value: PeerStatus | null) =>
      setStatus((current) => {
        const next = { ...current };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      });

    const closePeer = (id: number, keepStatus = false) => {
      connections.get(id)?.close();
      connections.delete(id);
      if (!keepStatus) setPeerStatus(id, null);
      setRemote((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    };

    const createPeer = (id: number) => {
      const pc = new RTCPeerConnection({ iceServers: iceServers ?? [] });
      setPeerStatus(id, "connecting");
      const stream = new MediaStream();
      const publish = () => {
        const video = stream.getVideoTracks()[0];
        setRemote((current) => ({ ...current, [id]: { stream, videoOn: Boolean(video && !video.muted) } }));
      };
      pc.ontrack = ({ track }) => {
        stream.addTrack(track);
        track.onmute = publish; // the other person stopped sending video
        track.onunmute = publish; // video frames started arriving
        publish();
      };
      const markFailed = () => {
        if (connections.get(id) !== pc) return; // an older, replaced connection
        // No route between the two browsers. Show it, and let the newer participant try again later.
        failedAt.set(id, Date.now());
        setPeerStatus(id, "failed");
        closePeer(id, true);
      };
      const timeout = setTimeout(() => pc.connectionState !== "connected" && markFailed(), CONNECT_TIMEOUT_MS);
      pc.onconnectionstatechange = () => {
        if (connections.get(id) !== pc) return;
        if (pc.connectionState === "connected") {
          clearTimeout(timeout);
          setPeerStatus(id, "connected");
        }
        if (pc.connectionState === "failed") markFailed();
        if (pc.connectionState === "closed") clearTimeout(timeout);
      };
      connections.set(id, pc);
      return pc;
    };

    const callPeer = async (id: number) => {
      const pc = createPeer(id);
      pc.addTransceiver("audio", { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });
      setOutgoingTracks(pc, micTrack.current, latest.current.outgoingVideo);
      await pc.setLocalDescription(await pc.createOffer());
      await iceGatheringDone(pc);
      if (!stopped) await sendSignal(meetingCode, myId, id, "offer", pc.localDescription!.sdp);
    };

    const answerPeer = async (id: number, sdp: string) => {
      closePeer(id); // a new offer replaces any older connection with this person
      const pc = createPeer(id);
      await pc.setRemoteDescription({ type: "offer", sdp });
      for (const transceiver of pc.getTransceivers()) transceiver.direction = "sendrecv";
      setOutgoingTracks(pc, micTrack.current, latest.current.outgoingVideo);
      await pc.setLocalDescription(await pc.createAnswer());
      await iceGatheringDone(pc);
      if (!stopped) await sendSignal(meetingCode, myId, id, "answer", pc.localDescription!.sdp);
    };

    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        if (!iceServers) {
          const config = await getIceServers(meetingCode, myId);
          iceServers = config.ice_servers;
          setRelayAvailable(config.relay);
        }
        const wanted = new Set(latest.current.peerIds);
        for (const id of connections.keys()) if (!wanted.has(id)) closePeer(id); // they left
        for (const id of wanted) {
          const recentlyFailed = Date.now() - (failedAt.get(id) ?? 0) < RETRY_AFTER_FAILURE_MS;
          if (id < myId && !connections.has(id) && !recentlyFailed) await callPeer(id); // I'm newer: I call them
        }

        for (const signal of await takeSignals(meetingCode, myId)) {
          if (signal.kind === "offer") await answerPeer(signal.sender_id, signal.sdp);
          const pc = connections.get(signal.sender_id);
          if (signal.kind === "answer" && pc?.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          }
        }
      } catch {
        // Network hiccup or a peer that just left: try again on the next tick.
      } finally {
        busy = false;
      }
    };

    tick();
    const intervalId = setInterval(tick, SIGNAL_POLL_MS);
    return () => {
      // Left, removed, or the meeting ended: hang up every connection and release the microphone.
      stopped = true;
      clearInterval(intervalId);
      for (const pc of connections.values()) pc.close();
      connections.clear();
      setRemote({});
      setStatus({});
      micTrack.current?.stop();
      micTrack.current = null;
    };
  }, [active, meetingCode, myId]);

  return { remote, status, relayAvailable, hasMicrophone, requestMicrophone };
}

function setOutgoingTracks(pc: RTCPeerConnection, audio: MediaStreamTrack | null, video: MediaStreamTrack | null) {
  if (pc.signalingState === "closed") return;
  for (const transceiver of pc.getTransceivers()) {
    const kind = transceiver.receiver.track.kind;
    transceiver.sender.replaceTrack(kind === "audio" ? audio : video).catch(() => undefined);
  }
}

/** Wait until the browser has listed its network addresses (or give up after a short time). */
function iceGatheringDone(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
