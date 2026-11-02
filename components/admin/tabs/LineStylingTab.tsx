"use client";

import React, { useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import { DEFAULT_MAP_STYLES, LINE_STYLE_PRESET_THEMES, LineStylePresetTheme, MapLineStyleItem } from "@/lib/constants";
import { Palette, Save, Sparkles } from "lucide-react";
import { updateMapStyleAction } from "@/app/actions/doh-actions";

interface LineStylingTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showSuccessModal: (title: string, message: string) => void;
}

export function LineStylingTab({
  systemData,
  onDataRefresh,
  onToast,
  showSuccessModal,
}: LineStylingTabProps) {
  const [lineStyles, setLineStyles] = useState<Record<string, MapLineStyleItem>>(
    systemData.mapStyles || DEFAULT_MAP_STYLES
  );
  const [selectedStyleKey, setSelectedStyleKey] = useState<"flood" | "detour" | "primary" | "secondary">("flood");

  const handleUpdateCurrentStyle = (patch: Partial<MapLineStyleItem>) => {
    const updated = {
      ...lineStyles,
      [selectedStyleKey]: {
        ...lineStyles[selectedStyleKey],
        ...patch,
      },
    };
    setLineStyles(updated);
    if (systemData) {
      systemData.mapStyles = updated as any;
    }
  };

  const handleApplyPresetTheme = (theme: LineStylePresetTheme) => {
    setLineStyles(theme.styles);
    if (systemData) {
      systemData.mapStyles = theme.styles as any;
    }
    showSuccessModal(
      "ปรับใช้ชุดสไตล์สำเร็จ",
      `เปิดใช้งาน "${theme.name}" แล้ว เส้นบนแผนที่จะสะท้อนผลทันที กรุณากด "บันทึกสไตล์เส้น" เพื่อจัดเก็บถาวร`
    );
  };

  const handleResetStylesToDefault = () => {
    setLineStyles(DEFAULT_MAP_STYLES);
    if (systemData) {
      systemData.mapStyles = DEFAULT_MAP_STYLES;
    }
    onToast("รีเซ็ตเป็นค่าเริ่มต้นกรมทางหลวงเรียบร้อย");
  };

  const handleSaveLineStyles = async () => {
    try {
      const res = await updateMapStyleAction(lineStyles);
      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal("บันทึกสไตล์เส้นสำเร็จ", "เส้นบนแผนที่ของหน้าประชาชนถูกอัปเดตทันที");
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  const currentItem = lineStyles[selectedStyleKey] || DEFAULT_MAP_STYLES[selectedStyleKey];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
            <Palette className="w-5 h-5 text-amber-400" /> สตูดิโอปรับแต่งสไตล์เส้น & เอฟเฟกต์อนิเมชัน
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ปรับสี ความหนา ขอบเส้น รัศมีเรืองแสง (Glow) และอนิเมชันไฟวิ่งตามเส้น ลิงก์ตรงกับแผนที่ทันที
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetStylesToDefault}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-heading font-semibold text-xs px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            รีเซ็ตค่าเริ่มต้น
          </button>
          <button
            type="button"
            onClick={handleSaveLineStyles}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-4 py-2 rounded-xl shadow transition flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" /> บันทึกสไตล์เส้น
          </button>
        </div>
      </div>

      {/* Preset Style Themes Bar */}
      <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
        <span className="text-xs font-bold font-heading text-amber-300 block">
          ชุดสไตล์สำเร็จรูป (Preset Themes):
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {LINE_STYLE_PRESET_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleApplyPresetTheme(theme)}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-400 text-left transition flex flex-col justify-between group"
            >
              <div>
                <strong className="text-xs text-white group-hover:text-amber-300 transition block">
                  {theme.name}
                </strong>
                <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                  {theme.description}
                </p>
              </div>
              <div className="flex gap-1.5 mt-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.flood.color }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.detour.color }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.primary.color }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.secondary.color }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Line Type Selector Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { key: "flood", label: "เส้นน้ำท่วม (Flood)" },
          { key: "detour", label: "ทางเลี่ยง (Detour)" },
          { key: "primary", label: "ทางหลวงสายหลัก (Main)" },
          { key: "secondary", label: "ทางหลวงสายรอง (Second)" },
        ].map((item) => {
          const currentItemColor = lineStyles[item.key as any]?.color || DEFAULT_MAP_STYLES[item.key as any]?.color;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedStyleKey(item.key as any)}
              className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                selectedStyleKey === item.key
                  ? "bg-slate-800 border-amber-400 text-white shadow-xl ring-2 ring-amber-400/20"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <span
                className="w-4 h-4 rounded-full border border-white/50 shadow-sm shrink-0 transition-colors"
                style={{ backgroundColor: currentItemColor }}
              />
              <span className="font-heading font-bold text-xs truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Interactive SVG Line Preview Box */}
      {currentItem && (
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-heading font-bold text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> ตัวอย่างเส้นจริงแบบ Real-time (Live SVG Preview):
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {selectedStyleKey.toUpperCase()} • {currentItem.color} • {currentItem.weight}px
            </span>
          </div>

          <div className="h-24 w-full bg-slate-900/90 rounded-xl border border-slate-800 relative flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:12px_12px]" />

            <svg className="w-full h-full" viewBox="0 0 600 90">
              <defs>
                {currentItem.glow && (
                  <filter id="preview-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur
                      stdDeviation={(currentItem.glowWidth || 8) / 2}
                      result="blur"
                    />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                )}
              </defs>

              {currentItem.borderActive && (
                <path
                  d="M 30 45 Q 160 10 300 45 T 570 45"
                  stroke={currentItem.borderColor || "#ffffff"}
                  strokeWidth={(currentItem.weight || 5) + (currentItem.borderWidth || 2) * 2}
                  strokeOpacity={currentItem.opacity ?? 0.9}
                  fill="none"
                  strokeLinecap="round"
                />
              )}

              <path
                d="M 30 45 Q 160 10 300 45 T 570 45"
                stroke={currentItem.color}
                strokeWidth={currentItem.weight || 5}
                strokeOpacity={currentItem.opacity ?? 0.9}
                strokeDasharray={
                  currentItem.pattern === "dash"
                    ? (currentItem.dashArray || "8, 6")
                    : currentItem.pattern === "dot"
                    ? "2, 6"
                    : currentItem.pattern === "long-dash-dot"
                    ? "14, 6, 3, 6"
                    : undefined
                }
                className={
                  currentItem.animation === "chaser"
                    ? "doh-line-chaser"
                    : currentItem.animation === "pulse"
                    ? "doh-line-pulse"
                    : currentItem.animation === "blink"
                    ? "doh-line-blink"
                    : currentItem.animation === "arrows"
                    ? "doh-line-arrows"
                    : ""
                }
                filter={currentItem.glow ? "url(#preview-glow)" : undefined}
                fill="none"
                strokeLinecap="round"
              />
            </svg>

            <div className="absolute bottom-2 right-3 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono border border-slate-800">
              เอฟเฟกต์: {currentItem.animation} • ลวดลาย: {currentItem.pattern}
            </div>
          </div>
        </div>
      )}

      {/* Style Controls Box */}
      {currentItem && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Color Picker & Quick Palettes */}
            <div className="space-y-2">
              <label className="text-xs text-slate-300 block font-heading font-medium">สีของเส้นทาง (Line Color)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentItem.color}
                  onChange={(e) => handleUpdateCurrentStyle({ color: e.target.value })}
                  className="w-10 h-10 rounded-xl cursor-pointer bg-slate-900 border border-slate-700 p-0.5"
                />
                <input
                  type="text"
                  value={currentItem.color}
                  onChange={(e) => handleUpdateCurrentStyle({ color: e.target.value.toUpperCase() })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono flex-1 uppercase"
                />
              </div>

              {/* Quick Palette Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  "#D32F2F", "#EF4444", "#B91C1C",
                  "#FBC02D", "#F59E0B", "#EAB308",
                  "#1B5E20", "#10B981", "#059669",
                  "#0284C7", "#0EA5E9", "#3B82F6",
                  "#8B5CF6", "#EC4899", "#FFFFFF"
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleUpdateCurrentStyle({ color: c })}
                    className="w-5 h-5 rounded-lg border border-slate-700 transition hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Line Weight & Opacity */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>ความหนาเส้น (Line Weight):</span>
                  <span className="font-mono text-amber-400 font-bold">{currentItem.weight} px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="16"
                  step="1"
                  value={currentItem.weight}
                  onChange={(e) => handleUpdateCurrentStyle({ weight: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>ความทึบแสง (Opacity):</span>
                  <span className="font-mono text-amber-400 font-bold">{Math.round((currentItem.opacity ?? 0.9) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={currentItem.opacity ?? 0.9}
                  onChange={(e) => handleUpdateCurrentStyle({ opacity: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Pattern & Animation Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
            <div>
              <label className="text-xs text-slate-300 block mb-1.5 font-heading font-medium">ลวดลายเส้น (Line Pattern)</label>
              <select
                value={currentItem.pattern}
                onChange={(e: any) => handleUpdateCurrentStyle({ pattern: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="solid">เส้นทึบมาตรฐาน (Solid)</option>
                <option value="dash">เส้นประ (Dashed Line)</option>
                <option value="dot">เส้นจุดไข่ปลา (Dotted Line)</option>
                <option value="long-dash-dot">เส้นประยาวสลับจุด (Long Dash Dot)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1.5 font-heading font-medium">อนิเมชันลูกเล่น (Animation Effect)</label>
              <select
                value={currentItem.animation}
                onChange={(e: any) => handleUpdateCurrentStyle({ animation: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="none">ไม่มีอนิเมชัน (Static)</option>
                <option value="chaser">ไฟวิ่งเลียบลายเส้น (Light Chaser)</option>
                <option value="pulse">กระพริบเตือนชีพจร (Pulsing)</option>
                <option value="blink">กระพริบฉุกเฉิน (Warning Blink)</option>
                <option value="arrows">ลูกศรไหลตามทิศทาง (Flowing Arrows)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1.5 font-heading font-medium">ความเร็วการเคลื่อนไหว (Speed)</label>
              <select
                value={currentItem.animationSpeed || "normal"}
                onChange={(e: any) => handleUpdateCurrentStyle({ animationSpeed: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="slow">ช้า นุ่มนวล (Slow)</option>
                <option value="normal">ปานกลาง เหมาะสม (Normal)</option>
                <option value="fast">เร็ว ฉุกเฉิน (Fast)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
