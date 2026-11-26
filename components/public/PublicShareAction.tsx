"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Share2, X } from "lucide-react";
import { getPublicFloodShareUrl, sharePublicLink, type PublicFloodShareRef, type PublicShareResult } from "./public-share";

const FEEDBACK: Record<PublicShareResult, string> = {
  shared: "ส่งลิงก์ให้แอปที่เลือกแล้ว",
  cancelled: "ยกเลิกการแชร์แล้ว",
  copied: "คัดลอกลิงก์แล้ว",
  manual: "คัดลอกอัตโนมัติไม่ได้ คัดลอกลิงก์จากช่องด้านล่างได้เลย",
};

export function PublicShareAction({ shareRef }: { shareRef: PublicFloodShareRef }) {
  const inputId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const manualField = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [result, setResult] = useState<PublicShareResult>();
  const [manualUrl, setManualUrl] = useState("");
  useEffect(() => {
    if (manualUrl) manualField.current?.focus();
  }, [manualUrl]);

  useEffect(() => {
    if (!result || result === "manual") return;
    const timer = window.setTimeout(() => setResult(undefined), 4500);
    return () => window.clearTimeout(timer);
  }, [result]);

  async function onShare() {
    if (inFlight.current) return;
    inFlight.current = true;
    setResult(undefined);
    setManualUrl("");
    try {
      const url = getPublicFloodShareUrl(window.location.origin, shareRef);
      const outcome = await sharePublicLink(navigator, { title: "เหตุการณ์น้ำท่วมบนทางหลวง", url });
      setResult(outcome);
      if (outcome === "manual") setManualUrl(url);
    } finally {
      inFlight.current = false;
    }
  }

  function closeManual() {
    setManualUrl("");
    setResult(undefined);
    button.current?.focus();
  }

  return (
    <div className="min-w-0">
      <button
        ref={button}
        type="button"
        onClick={onShare}
        className="citizen-theme-button min-h-11 min-w-11 rounded-lg text-xs font-bold"
      >
        <Share2 size={17} aria-hidden="true" /> แชร์เหตุการณ์น้ำท่วม
      </button>
      <span
        role="status"
        className={result && result !== "manual" ? "ml-2 text-xs font-semibold" : "sr-only"}
      >
        {result ? FEEDBACK[result] : ""}
      </span>
      {manualUrl && (
        <div
          className="mt-2 rounded-xl border border-surface bg-surface-panel p-3 shadow-lg"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            closeManual();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={inputId} className="text-sm font-semibold">คัดลอกลิงก์เหตุการณ์ด้วยตนเอง</label>
            <button type="button" className="citizen-theme-button min-h-11 min-w-11" aria-label="ปิดช่องคัดลอกลิงก์" onClick={closeManual}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <input
            ref={manualField}
            id={inputId}
            type="url"
            readOnly
            value={manualUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-1.5 min-h-11 w-full rounded-lg border border-surface bg-surface-card px-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
