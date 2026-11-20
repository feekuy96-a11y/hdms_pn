"use client";

import React from "react";

export interface DirectionSwitchOption<T extends string = string> {
  value: T;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
}

interface DirectionSwitchProps<T extends string = string> {
  value: T;
  options: readonly DirectionSwitchOption<NoInfer<T>>[];
  onChange: (nextValue: NoInfer<T>) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Shared Segmented Switch for directional selection across Citizen Portal, Map, and Admin Console.
 * Uses a single track container with equal-width toggle segments for consistent switch UX.
 */
export function DirectionSwitch<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel = "เลือกทิศทาง",
  size = "md",
  fullWidth = false,
  className = "",
}: DirectionSwitchProps<T>) {
  const sizeClass =
    size === "sm"
      ? "min-h-8 px-[0.833em] py-[0.333em] text-[0.75rem] sm:text-xs"
      : "min-h-10 px-[1em] py-[0.5em] text-xs sm:px-[0.857em] sm:py-[0.429em] sm:text-sm";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${fullWidth ? "grid w-full" : "inline-grid"} rounded-xl border border-slate-700/80 bg-[#060d1b] p-[0.25em] gap-[0.25em] ${className}`}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            title={option.title}
            aria-label={option.ariaLabel}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`${sizeClass} cursor-pointer rounded-lg font-heading transition flex items-center justify-center gap-[0.333em] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-35 ${
              isActive
                ? "bg-[#f59e0b] text-slate-950 font-black shadow-sm"
                : "text-slate-300 font-semibold hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
