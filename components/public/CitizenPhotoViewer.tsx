"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";

export function publicPhotoSource(value: unknown) {
  const url = normalizeMediaUrl(value).trim();
  return /^(?:https?:\/\/[^\s]+$|data:image\/(?:png|jpe?g|webp|gif|avif);base64,|\/(?!\/)[^\s]+$)/i.test(url) ? url : "";
}

export type CitizenPhoto = { src: string; alt: string; trigger: HTMLElement };

export function CitizenPhotoViewer({ photo, onClose }: { photo: CitizenPhoto; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
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
  return (
    <dialog ref={dialog}
      aria-label="ภาพถ่ายสถานการณ์ขนาดเต็ม"
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-slate-950/90"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") onClose();
        }
      }}>
      <div className="flex h-full items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <button ref={close} type="button" aria-label="ปิดภาพขนาดเต็ม" onClick={onClose}
          className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-[#223548] text-[#fff] hover:bg-[#30475b]">
          <X className="size-5" aria-hidden="true" />
        </button>
        {state === "loading" && <p role="status" className="absolute rounded-lg bg-[#223548] p-3 text-[#fff]">กำลังโหลดภาพขนาดเต็ม…</p>}
        {state === "failed" ? <p role="alert" className="rounded-xl bg-surface-panel p-4 text-slate-100">โหลดภาพไม่สำเร็จ กรุณาปิดแล้วลองเปิดอีกครั้ง</p> : (
          <img src={photo.src} alt={photo.alt} onLoad={() => setState("loaded")} onError={() => setState("failed")}
            className="max-h-[85dvh] max-w-[92vw] rounded-xl bg-slate-900 object-contain" />
        )}
      </div>
    </dialog>
  );
}
