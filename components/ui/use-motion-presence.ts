"use client";

import { useEffect, useState } from "react";

/** Retain only the visual shell while the caller immediately makes it inert. */
export function useMotionPresence(open: boolean, exitMs: number) {
  const [painted, setPainted] = useState(open);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(() => setPainted(open), open || reduced.matches ? 0 : exitMs);
    const stop = () => {
      if (!open && reduced.matches) {
        window.clearTimeout(timer);
        setPainted(false);
      }
    };
    reduced.addEventListener("change", stop);
    return () => {
      window.clearTimeout(timer);
      reduced.removeEventListener("change", stop);
    };
  }, [open, exitMs]);

  return open || painted;
}
