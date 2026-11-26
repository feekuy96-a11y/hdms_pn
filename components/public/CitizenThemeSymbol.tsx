"use client";

import { useId } from "react";

/* Phosphor Icons v2.0.8, MIT; see phosphor-theme-LICENSE.txt.
   Sun: b56d1104c3384984bb81ba1d149eb480cb994323. MoonStars: 98c6f902f9d4b701e6cf426c62a05b780c927800.
   Upstream duotone path geometry retained, with locally adapted fills. */
const SUN = ["M184,128a56,56,0,1,1-56-56A56,56,0,0,1,184,128Z","M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"];
const MOON = ["M210.69,158.18A88,88,0,1,1,97.82,45.31,96.08,96.08,0,0,0,192,160,96.78,96.78,0,0,0,210.69,158.18Z","M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm72.77,97a8,8,0,0,1,1.43,8A96,96,0,1,1,95.07,37.8a8,8,0,0,1,10.6,9.06A88.07,88.07,0,0,0,209.14,150.33,8,8,0,0,1,216.77,153Zm-19.39,14.88c-1.79.09-3.59.14-5.38.14A104.11,104.11,0,0,1,88,64c0-1.79,0-3.59.14-5.38A80,80,0,1,0,197.38,167.86Z"];

export function CitizenThemeSymbol({ day }: { day: boolean }) {
  const id = useId();
  const [shade, outline] = day ? SUN : MOON;

  return (
    <svg className="citizen-themed-symbol" data-tone={day ? "sun" : "moon"} width="26" height="26" viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop offset="0%" className="citizen-theme-symbol-rim" />
          <stop offset="100%" className="citizen-theme-symbol-shadow" />
        </linearGradient>
      </defs>
      <path d={shade} fill={`url(#${id})`} />
      <path d={outline} fill="currentColor" />
    </svg>
  );
}
