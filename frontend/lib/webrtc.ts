// Small WebRTC building blocks used by useMeetingMedia.
//
// Words you'll see:
//   SDP   - a text description of a connection (which audio/video it carries, network addresses).
//   offer / answer - the two SDP messages two browsers exchange to set up a connection.
//   ICE   - how browsers find a network route to each other (with STUN/TURN servers' help).
//   transceiver - one audio or video "slot" in a connection; we put a track (mic, camera, screen) in it.

const ICE_GATHERING_TIMEOUT_MS = 2500;

/** The caller side: create the audio + video slots and return the offer to send. */
export async function createOffer(pc: RTCPeerConnection, audio: MediaStreamTrack | null, video: MediaStreamTrack | null) {
  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
  setOutgoingTracks(pc, audio, video);
  await pc.setLocalDescription(await pc.createOffer());
  await iceGatheringDone(pc);
  return pc.localDescription!.sdp;
}

/** The receiving side: accept an offer (it creates the same two slots) and return the answer to send. */
export async function createAnswer(pc: RTCPeerConnection, offerSdp: string, audio: MediaStreamTrack | null, video: MediaStreamTrack | null) {
  await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
  for (const transceiver of pc.getTransceivers()) transceiver.direction = "sendrecv"; // we send too, not only receive
  setOutgoingTracks(pc, audio, video);
  await pc.setLocalDescription(await pc.createAnswer());
  await iceGatheringDone(pc);
  return pc.localDescription!.sdp;
}

/** Put our current mic and video track (or nothing) into the connection's audio and video slots. */
export function setOutgoingTracks(pc: RTCPeerConnection, audio: MediaStreamTrack | null, video: MediaStreamTrack | null) {
  if (pc.signalingState === "closed") return;
  for (const transceiver of pc.getTransceivers()) {
    const kind = transceiver.receiver.track.kind;
    transceiver.sender.replaceTrack(kind === "audio" ? audio : video).catch(() => undefined);
  }
}

/**
 * Wait until the browser has listed its network addresses, so they are included in the offer/answer
 * (one message each way instead of many). Give up after a short time and send what we have.
 */
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
