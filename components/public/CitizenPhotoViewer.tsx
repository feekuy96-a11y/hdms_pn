"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";

export function publicPhotoSource(value: unknown) {
  const url = normalizeMediaUrl(value).trim();
  return /^(?:https?:\/\/[^\s]+$|data:image\/(?:png|jpe?g|webp|gif|avif);base64,|\/(?!\/)[^\s]+$)/i.test(url) ? url : "";
}

export type CitizenPhoto = { src: string; alt: string; trigger: HTMLElement };

const SLOW_PHOTO_MS = 5_000;

export function CitizenPhotoViewer({ photo, onClose }: { photo: CitizenPhoto; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"loading" | "slow" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    close.current?.focus();
    return () => {
      element.close();
      if (photo.trigger.isConnected) photo.trigger.focus({ preventScroll: true });
    };
  }, [photo]);
  useEffect(() => {
    if (state !== "loading") return;
    const timer = window.setTimeout(() => setState(current => current === "loading" ? "slow" : current), SLOW_PHOTO_MS);
    return () => window.clearTimeout(timer);
  }, [state, attempt]);

  function showLoadedPhoto() {
    if (retry.current && document.activeElement === retry.current) close.current?.focus();
    setState("loaded");
  }

  function retryPhoto() {
    close.current?.focus();
    setState("loading");
    // Remount the browser image without altering the URL (including signed URLs).
    setAttempt(current => current + 1);
  }

  const canRetry = state === "slow" || state === "failed";
  return (
    <dialog data-hdms-popup="photo" ref={dialog}
      aria-label="ภาพถ่ายสถานการณ์ขนาดเต็ม"
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-slate-950/90"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") onClose();
          else if (retry.current && document.activeElement === close.current) retry.current.focus();
          else close.current?.focus();
        }
      }}>
      <div className="flex h-full items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <button ref={close} type="button" aria-label="ปิดภาพขนาดเต็ม" data-hdms-popup-close onClick={onClose}
          className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full">
          <X className="size-5" aria-hidden="true" />
        </button>
        {state !== "loaded" && (
          <div data-hdms-photo-status className="absolute max-w-[calc(100%-2rem)] rounded-xl p-4 text-center text-white">
            <p role={state === "failed" ? "alert" : "status"}>
              {state === "failed" ? "โหลดภาพไม่สำเร็จ" : state === "slow" ? "ภาพใช้เวลาโหลดนานกว่าปกติ" : "กำลังโหลดภาพขนาดเต็ม…"}
            </p>
            {canRetry && (
              <button ref={retry} type="button" onClick={retryPhoto}
                className="mt-3 min-h-11 rounded-lg bg-[var(--bg-input)] px-4 py-2 font-medium text-[var(--text-primary)] hover:bg-[var(--state-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                ลองโหลดภาพอีกครั้ง
              </button>
            )}
          </div>
        )}
        {state !== "failed" && (
          <img key={attempt} src={photo.src} alt={photo.alt} onLoad={showLoadedPhoto} onError={() => setState("failed")}
            className={`max-h-[85dvh] max-w-[92vw] rounded-xl bg-slate-900 object-contain ${state === "loaded" ? "" : "pointer-events-none opacity-0"}`} />
        )}
      </div>
    </dialog>
  );
}
