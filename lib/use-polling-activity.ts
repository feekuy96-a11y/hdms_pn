"use client";

import { useEffect, useState } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function usePollingActivity() {
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    const markActive = () => {
      setIsActive(true);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setIsActive(false), IDLE_TIMEOUT_MS);
    };

    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) =>
      window.addEventListener(eventName, markActive, { passive: true })
    );
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(idleTimer);
        setIsActive(false);
        return;
      }
      markActive();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    markActive();

    return () => {
      clearTimeout(idleTimer);
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) =>
        window.removeEventListener(eventName, markActive)
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return isActive;
}
