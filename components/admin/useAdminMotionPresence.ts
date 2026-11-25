"use client";

import { useEffect, useState } from "react";

/** Keep a closing surface painted briefly after it has left the focus and pointer order. */
export function useAdminMotionPresence(open: boolean) {
  const [exiting, setExiting] = useState(open);

  useEffect(() => {
    // Schedule outside the render/effect phase and cancel stale exits on reopening.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setExiting(open), open || reduced ? 0 : 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  return open || exiting;
}
