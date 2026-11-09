"use client";

import { useEffect, useState } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// scroll/pointer events can fire hundreds of times per second; one refresh of the idle timer per
// second is plenty for a 30 minute timeout.
const ACTIVITY_THROTTLE_MS = 1000;

export function usePollingActivity() {
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    let lastMarked = 0;
    const markActive = (event?: Event) => {
      const now = Date.now();
      // Always honour the first event and tab-visibility changes; throttle the rest.
      if (event && event.type !== "visibilitychange" && now - lastMarked < ACTIVITY_THROTTLE_MS) return;
      lastMarked = now;
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
      lastMarked = 0;
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
