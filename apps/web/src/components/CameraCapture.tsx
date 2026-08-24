"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Upload, X } from "lucide-react";

/**
 * In-browser webcam capture.
 *
 * On phones the plain `<input capture>` is better (it hands over to the native
 * camera app), but desktop browsers ignore `capture` entirely and just open the
 * file dialog — so on desktop we drive the webcam ourselves.
 */
export function CameraCapture({
  onCapture,
  onClose,
  onUseGallery,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onUseGallery: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Browsers only expose the camera over https (or localhost).
    if (!window.isSecureContext) {
      setError(
        "The camera needs a secure (https) connection. Upload a photo from your device instead.",
      );
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access was blocked. Allow the camera in your browser, or upload a photo from your device instead."
            : "We couldn't find a camera on this device. Upload a photo instead.",
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The preview is mirrored for a natural selfie feel; the saved frame is not.
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(
          new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }),
        );
        onClose();
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-deep/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-base font-bold text-slate-deep">Take a photo</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-mutedText transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-slate-deep">
          {error ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-white/80">
              {error}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              {!ready && (
                <div className="absolute inset-0 grid place-items-center text-white/80">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <button
            type="button"
            onClick={onUseGallery}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-borderAccent px-4 py-2 text-sm font-bold text-slate-deep transition hover:border-brand-primary hover:text-brand-primary"
          >
            <Upload className="h-4 w-4" /> Upload instead
          </button>
          <button
            type="button"
            onClick={snap}
            disabled={!ready || Boolean(error)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Camera className="h-4 w-4" /> Capture
          </button>
        </div>
      </div>
    </div>
  );
}
