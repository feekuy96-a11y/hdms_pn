"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";
import styles from "./CitizenInstallPrompt.module.css";

interface InstallEvent extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const preferenceKey = `hdms:citizen-install:v1:${base || "/"}`;
const standaloneQuery = "(display-mode: standalone)";
type Platform = "ios" | "native" | null;

function isStandalone() {
  return window.matchMedia(standaloneQuery).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOSSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//i.test(ua);
}

function hiddenHere() {
  try { return localStorage.getItem(preferenceKey) !== null; } catch { return false; }
}

export function CitizenInstallPrompt({ blocked }: { blocked: boolean }) {
  const promptEvent = useRef<InstallEvent | null>(null);
  const pendingPrompt = useRef(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [suppressed, setSuppressed] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const helpId = useId();

  useEffect(() => {
    const standalone = window.matchMedia(standaloneQuery);
    const refresh = () => setSuppressed(isStandalone() || !navigator.onLine || hiddenHere());
    const initial = window.requestAnimationFrame(() => {
      refresh();
      if (isIOSSafari()) setPlatform("ios");
    });
    const onPrompt = (incoming: Event) => {
      const event = incoming as InstallEvent;
      if (typeof event.prompt !== "function" || !window.matchMedia("(max-width: 767px) and (min-height: 421px) and (pointer: coarse)").matches) return;
      if (isStandalone() || hiddenHere()) { event.preventDefault(); return; }
      event.preventDefault();
      promptEvent.current = event;
      setPlatform("native");
      refresh();
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setSuppressed(true);
      try { localStorage.setItem(preferenceKey, "installed"); } catch { /* no persistence required */ }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("storage", refresh);
    standalone.addEventListener("change", refresh);
    return () => {
      window.cancelAnimationFrame(initial);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("storage", refresh);
      standalone.removeEventListener("change", refresh);
    };
  }, []);

  const hide = (reason: "hidden" | "installed") => {
    promptEvent.current = null;
    setSuppressed(true);
    try { localStorage.setItem(preferenceKey, reason); } catch { /* current page still hides it */ }
  };

  const install = async () => {
    if (pendingPrompt.current) return;
    if (platform === "ios") { setShowHelp(value => !value); return; }
    const event = promptEvent.current;
    if (!event) { setShowHelp(value => !value); return; }
    promptEvent.current = null;
    pendingPrompt.current = true;
    setBusy(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      hide(outcome === "accepted" ? "installed" : "hidden");
    } catch {
      setShowHelp(true);
    } finally {
      pendingPrompt.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <link rel="manifest" href={base + "/citizen.webmanifest"} />
      <link rel="apple-touch-icon" sizes="180x180" href={base + "/app-icons/hdms-180.png"} />
      {!blocked && !suppressed && platform && (
        <aside className={styles.prompt} aria-label="เพิ่มทางลัดแผนที่ลงมือถือ">
          <div className={styles.summary}>
            <Image className={styles.symbol} src={base + "/app-icons/hdms-192.png"} width={30} height={30} alt="" unoptimized />
            <div><strong>เพิ่มแผนที่ไว้บนหน้าจอโฮม</strong><p>เปิดดูน้ำท่วมและทางเลี่ยงได้จากไอคอน</p></div>
            <button type="button" aria-label="ซ่อนคำเชิญติดตั้ง" onClick={() => hide("hidden")} className={styles.dismiss}><X size={19} aria-hidden="true" /></button>
          </div>
          <button type="button" onClick={install} disabled={busy} className={styles.action}
            aria-expanded={platform === "ios" || showHelp ? showHelp : undefined}
            aria-controls={showHelp ? helpId : undefined}>
            <Download size={16} aria-hidden="true" />{platform === "ios" ? "ดูวิธีเพิ่มไอคอน" : "ติดตั้งแอป"}
          </button>
          {showHelp && <p id={helpId} aria-live="polite" className={styles.help}>
            {platform === "ios" ? "ใน Safari กด แชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม ถ้ามีตัวเลือก เปิดเป็นเว็บแอป ให้เปิดไว้" :
              "เปิดเมนูเบราว์เซอร์ แล้วเลือก ติดตั้งแอป หรือ เพิ่มลงในหน้าจอหลัก หากมีตัวเลือก"}
          </p>}
        </aside>
      )}
    </>
  );
}
