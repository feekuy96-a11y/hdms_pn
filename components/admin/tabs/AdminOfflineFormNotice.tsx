"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function isAdminFormOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function useAdminOfflineForm(formId: string) {
  const offline = useSyncExternalStore(subscribe, isAdminFormOffline, () => false);
  const [heldForm, setHeldForm] = useState<string | null>(null);
  const [hasGoneOffline, setHasGoneOffline] = useState(false);
  const clear = useCallback(() => setHeldForm(null), []);
  useEffect(() => {
    if (offline) setHasGoneOffline(true);
  }, [offline]);
  return {
    offline,
    held: heldForm === formId,
    pauseLocalStorage: offline || hasGoneOffline,
    keepOpen: () => {
      setHasGoneOffline(true);
      setHeldForm(formId);
    },
    clear,
  };
}

export function AdminOfflineFormNotice({ offline, held }: { offline: boolean; held: boolean }) {
  if (!offline && !held) return null;
  return (
    <p role="status" className="col-span-full w-full basis-full text-xs leading-snug text-[var(--text-primary)]">
      {offline
        ? held
          ? "ยังไม่ได้ส่งการบันทึกครั้งนี้ ข้อมูลที่กรอกตอนออฟไลน์อยู่เฉพาะในฟอร์มที่เปิดอยู่ อย่าปิดหรือรีเฟรชหน้านี้"
          : "ออฟไลน์ ยังส่งการบันทึกครั้งนี้ไม่ได้ กรุณาเปิดฟอร์มนี้ไว้"
        : "เชื่อมต่อแล้ว แต่ยังไม่ได้ส่งข้อมูล ตรวจฟอร์มอีกครั้งแล้วกดบันทึกเอง หากข้อมูลเดิมอาจเปลี่ยน ให้ตรวจทะเบียนก่อนบันทึก"}
    </p>
  );
}
