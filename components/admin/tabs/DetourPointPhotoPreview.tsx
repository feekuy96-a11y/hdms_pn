"use client";

import { useEffect, useRef, useState } from "react";
import { getAdminOperationalDataAction } from "@/app/actions/doh-actions";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";

function recoverable(src: string) {
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;
  try { return new URL(src).protocol === "https:"; } catch { return false; }
}

export function DetourPointPhotoPreview({ recordId, endpoint, source, alt, onRecovered }: {
  recordId: string;
  endpoint: "START" | "END";
  source: string;
  alt: string;
  onRecovered: (url: string) => void;
}) {
  const [image, setImage] = useState(() => ({ src: normalizeMediaUrl(source), attempt: 0 }));
  const [state, setState] = useState<"image" | "recovering" | "failed">("image");
  const mounted = useRef(true);
  const automaticUsed = useRef(false);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function recover(explicit: boolean) {
    if (busy.current) return;
    busy.current = true;
    setState("recovering");
    let next = image.src;
    // The queue can promote a staging URL while the edit dialog still holds it.
    // Refresh the selected link only; the parent preserves an unsaved replacement and no data is saved.
    if (recoverable(source)) {
      try {
        const data = await getAdminOperationalDataAction();
        const record = data.detourRoutes?.find((row) => row.id === recordId);
        const url = endpoint === "START" ? record?.detour_meta?.start_point_photo?.url : record?.detour_meta?.end_point_photo?.url;
        const normalized = normalizeMediaUrl(url);
        if (recoverable(normalized)) next = normalized;
      } catch { /* The existing URL remains available for an explicit retry. */ }
    }
    busy.current = false;
    if (!mounted.current) return;
    if (explicit || next !== image.src) {
      setImage(({ attempt }) => ({ src: next, attempt: attempt + 1 }));
      setState("image");
    } else {
      setState("failed");
    }
  }

  if (state === "recovering") {
    return <p role="status" className="grid min-h-28 place-items-center rounded-md bg-[var(--bg-input)] px-4 text-center text-xs text-[var(--text-primary)]">กำลังตรวจลิงก์รูปภาพล่าสุด…</p>;
  }
  if (state === "failed" || !image.src) {
    return <div role="status" className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-md bg-[var(--bg-input)] px-5 text-center text-xs text-[var(--text-primary)]">
      <p>โหลดรูปไม่สำเร็จ ข้อมูลรูปเดิมและพิกัดยังอยู่</p>
      <button type="button" className="min-h-10 rounded-md border border-[var(--border-subtle)] px-2 font-semibold" onClick={() => void recover(true)}>ลองโหลดรูปอีกครั้ง</button>
    </div>;
  }
  return <img key={image.attempt} src={image.src} alt={alt}
    className="h-28 w-full rounded-md object-contain bg-slate-900"
    onLoad={() => { if (image.src !== normalizeMediaUrl(source)) onRecovered(image.src); }}
    onError={() => {
      if (!automaticUsed.current && recoverable(source)) {
        automaticUsed.current = true;
        void recover(false);
      } else {
        setState("failed");
      }
    }} />;
}
