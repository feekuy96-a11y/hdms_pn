"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertTriangle, Trash2, X, Info } from "lucide-react";

export interface AnimatedStatusModalProps {
  isOpen: boolean;
  type?: "success" | "delete" | "error" | "confirm" | "info";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  autoCloseMs?: number;
}

export function AnimatedStatusModal({
  isOpen,
  type = "success",
  title,
  message,
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  onConfirm,
  onClose,
  autoCloseMs,
}: AnimatedStatusModalProps) {
  useEffect(() => {
    if (!isOpen || !autoCloseMs || type === "confirm") return;
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [isOpen, autoCloseMs, type, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-body">
      <div
        className="relative w-full max-w-md bg-slate-900 border-2 rounded-2xl p-6 shadow-2xl transform transition-all animate-scale-up"
        style={{
          borderColor:
            type === "success"
              ? "#10b981"
              : type === "delete"
              ? "#ef4444"
              : type === "error"
              ? "#dc2626"
              : type === "confirm"
              ? "#f59e0b"
              : "#0284c7",
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon with pulsing background circle */}
        <div className="flex justify-center mb-4">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
              type === "success"
                ? "bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/30"
                : type === "delete" || type === "error"
                ? "bg-red-500/20 text-red-400 ring-4 ring-red-500/30"
                : type === "confirm"
                ? "bg-amber-500/20 text-amber-300 ring-4 ring-amber-500/30"
                : "bg-sky-500/20 text-sky-400 ring-4 ring-sky-500/30"
            }`}
          >
            {type === "success" && <CheckCircle2 className="w-9 h-9 animate-bounce" />}
            {(type === "delete" || type === "error") && <Trash2 className="w-9 h-9 animate-pulse" />}
            {type === "confirm" && <AlertTriangle className="w-9 h-9 animate-pulse" />}
            {type === "info" && <Info className="w-9 h-9" />}
          </div>
        </div>

        {/* Title and Message */}
        <div className="text-center space-y-2">
          <h3 className="font-heading font-black text-lg sm:text-xl text-white">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          {type === "confirm" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-heading font-semibold py-2.5 rounded-xl text-xs sm:text-sm transition"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition"
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`w-full font-heading font-bold py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition text-slate-950 ${
                type === "success"
                  ? "bg-emerald-400 hover:bg-emerald-300"
                  : type === "delete" || type === "error"
                  ? "bg-red-400 hover:bg-red-300"
                  : "bg-amber-400 hover:bg-amber-300"
              }`}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
