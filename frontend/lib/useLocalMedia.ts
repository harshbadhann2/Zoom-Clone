"use client";

// Your own camera and screen share. (useMeetingMedia is what sends them to the other participants.)

import { useEffect, useRef, useState } from "react";
import { screenShareErrorMessage } from "@/lib/meeting";

export function useLocalMedia(startWithCamera: boolean, showToast: (message: string) => void) {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const sharePickerOpen = useRef(false); // true while the browser's "choose what to share" window is open

  // If the camera was on in the pre-join preview, turn it on again in the room.
  useEffect(() => {
    if (!startWithCamera) return;
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
  }, [startWithCamera]);

  // Stop the camera / screen share when it's turned off or when we leave the page.
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);
  useEffect(() => () => screenStream?.getTracks().forEach((track) => track.stop()), [screenStream]);

  async function toggleCamera() {
    if (cameraStream) return setCameraStream(null);
    try {
      setCameraStream(await navigator.mediaDevices.getUserMedia({ video: true }));
    } catch {
      showToast("Camera unavailable. Check your browser’s camera permission.");
    }
  }

  async function toggleScreenShare() {
    if (screenStream) return setScreenStream(null); // stopping: the cleanup effect above stops the tracks
    if (sharePickerOpen.current) return; // a second click while the picker is open would open another one
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return showToast("Screen sharing isn’t supported in this browser or on this device.");
    }
    sharePickerOpen.current = true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      // The browser's own "Stop sharing" button ends the track; clear our state when that happens.
      stream.getVideoTracks()[0].addEventListener("ended", () => setScreenStream(null));
      setScreenStream(stream);
    } catch (error) {
      showToast(screenShareErrorMessage(error)); // cancelled, blocked by the OS, or no screen available
    } finally {
      sharePickerOpen.current = false;
    }
  }

  return { cameraStream, screenStream, toggleCamera, toggleScreenShare };
}
