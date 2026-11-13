"use client";

import React from "react";
import { ArrowRightLeft, Navigation, Sparkles } from "lucide-react";
import { AdviceText } from "@/components/AdviceText";
import { FormSection } from "@/components/admin/ui";
import { buildGoogleMapsDirectionsUrl } from "@/lib/advice-format";
import { DETOUR_ADVICE_PRESETS } from "@/lib/detour-advice-presets";
import { extractDirectionalAdvice } from "@/lib/gis-utils";

interface DetourAdviceSectionProps {
  detourDesc: string;
  setDetourDesc: (value: string) => void;
  detourAdviceView: "FORWARD" | "REVERSE" | "COMBINED";
  setDetourAdviceView: React.Dispatch<React.SetStateAction<"FORWARD" | "REVERSE" | "COMBINED">>;
  detourRoadCondition: string;
  setDetourRoadCondition: (value: string) => void;
  detourGoogleMapsUrlFwd: string;
  setDetourGoogleMapsUrlFwd: (value: string) => void;
  detourGoogleMapsUrlRev: string;
  setDetourGoogleMapsUrlRev: (value: string) => void;
  draftCoordinates: [number, number][];
  onGenerateAdvice: () => void;
}

export const DetourAdviceSection = React.memo(function DetourAdviceSection({
  detourDesc,
  setDetourDesc,
  detourAdviceView,
  setDetourAdviceView,
  detourRoadCondition,
  setDetourRoadCondition,
  detourGoogleMapsUrlFwd,
  setDetourGoogleMapsUrlFwd,
  detourGoogleMapsUrlRev,
  setDetourGoogleMapsUrlRev,
  draftCoordinates,
  onGenerateAdvice,
}: DetourAdviceSectionProps) {
  // Defer parsing of the live citizen preview so typing in the textarea never blocks the main thread.
  const deferredDetourDesc = React.useDeferredValue(detourDesc);

  const googleCompareLinks = React.useMemo(() => {
    if (draftCoordinates.length < 2) return null;
    const first = draftCoordinates[0];
    const last = draftCoordinates[draftCoordinates.length - 1];
    const middle = draftCoordinates.slice(1, -1);
    return {
      forward: buildGoogleMapsDirectionsUrl(first, last, middle),
      reverse: buildGoogleMapsDirectionsUrl(last, first, middle.slice().reverse()),
    };
  }, [draftCoordinates]);

  const currentParts = React.useMemo(() => extractDirectionalAdvice(detourDesc), [detourDesc]);
  const previewParts = React.useMemo(() => extractDirectionalAdvice(deferredDetourDesc), [deferredDetourDesc]);
  const advicePreviewText =
    detourAdviceView === "FORWARD"
      ? [previewParts.forwardHeader, previewParts.forward].filter(Boolean).join("\n")
      : detourAdviceView === "REVERSE"
        ? [previewParts.reverseHeader, previewParts.reverse].filter(Boolean).join("\n")
        : deferredDetourDesc;

  const handleApplyAdvicePreset = (presetId: string) => {
    const preset = DETOUR_ADVICE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    if (detourDesc.trim() && !window.confirm("แทนที่ข้อความคำแนะนำเดิมด้วยข้อความตัวอย่างนี้ใช่หรือไม่?")) return;
    setDetourDesc(preset.text);
    setDetourAdviceView("COMBINED");
  };

  return (
    <FormSection step={3} tone="amber" title="คำแนะนำสำหรับประชาชน" description="ข้อความที่ประชาชนจะเห็นในหน้าหลัก แยกทิศทางขาไปและขากลับ">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-heading font-bold text-amber-300">
            คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน
          </label>
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-heading font-bold">
            <button
              type="button"
              onClick={() => setDetourAdviceView("FORWARD")}
              className={`px-2 py-0.5 rounded transition ${
                detourAdviceView === "FORWARD" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              🚗 ขาไป (A → B)
            </button>
            <button
              type="button"
              onClick={() => setDetourAdviceView("REVERSE")}
              className={`px-2 py-0.5 rounded transition ${
                detourAdviceView === "REVERSE" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              🚙 ขากลับ (B → A)
            </button>
            <button
              type="button"
              onClick={() => setDetourAdviceView("COMBINED")}
              className={`px-2 py-0.5 rounded transition ${
                detourAdviceView === "COMBINED" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              📋 ทั้ง ๒ ทิศทาง
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onGenerateAdvice}
          className="text-[10px] bg-amber-500 text-slate-950 font-heading font-bold px-2.5 py-1 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
        >
          <Sparkles className="w-3 h-3" /> วิเคราะห์คำแนะนำ (ไป-กลับ)
        </button>
      </div>

      <textarea
        rows={8}
        value={
          detourAdviceView === "FORWARD"
            ? currentParts.forward
            : detourAdviceView === "REVERSE"
              ? currentParts.reverse
              : detourDesc
        }
        onChange={(e) => {
          const val = e.target.value;
          if (detourAdviceView === "FORWARD" || detourAdviceView === "REVERSE") {
            const forwardHeader = currentParts.forwardHeader || "=== ทิศทางขาไป: จุด A → จุด B ===";
            const reverseHeader = currentParts.reverseHeader || "=== ทิศทางขากลับ: จุด B → จุด A ===";
            const forwardText = detourAdviceView === "FORWARD" ? val : currentParts.hasBoth ? currentParts.forward : "";
            const reverseText = detourAdviceView === "REVERSE" ? val : currentParts.hasBoth ? currentParts.reverse : "";
            setDetourDesc(`${forwardHeader}\n${forwardText}\n\n${reverseHeader}\n${reverseText}`);
          } else {
            setDetourDesc(val);
          }
        }}
        placeholder="วิเคราะห์คำแนะนำอัตโนมัติ หรือกรอกคำแนะนำทั้ง ๒ ทิศทาง..."
        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="detour-advice-preset" className="text-xs text-slate-300">
            ใช้ข้อความตัวอย่างสไตล์มาตรฐาน
          </label>
          <select
            id="detour-advice-preset"
            value=""
            onChange={(event) => handleApplyAdvicePreset(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white"
          >
            <option value="">เลือกตัวอย่าง...</option>
            {DETOUR_ADVICE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.title} — {preset.hint}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">ตัวอย่างเป็นแนวทางรูปแบบ ต้องตรวจชื่อถนน ระยะทาง และเวลากับเส้นที่วาดจริงก่อนบันทึก</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-300">เทียบกับ Google Maps</p>
          {googleCompareLinks ? (
            <div className="flex flex-wrap gap-2">
              <a
                href={googleCompareLinks.forward}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-heading font-bold text-sky-300 hover:bg-slate-700"
              >
                ขาไป A → B ↗
              </a>
              <a
                href={googleCompareLinks.reverse}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-heading font-bold text-sky-300 hover:bg-slate-700"
              >
                ขากลับ B → A ↗
              </a>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">วาดหรือเลือกจุด A และ B ก่อน แล้วลิงก์เทียบเส้นทางจะปรากฏที่นี่</p>
          )}
          <p className="text-[11px] text-slate-500">เปิดในแท็บใหม่ ใช้ดูระยะทาง เวลา และชื่อถนนเปรียบเทียบด้วยตา (ระบบไม่ดึงข้อความจาก Google มาใส่ให้อัตโนมัติ)</p>
        </div>
      </div>

      {deferredDetourDesc.trim() && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-400">ตัวอย่างที่ประชาชนจะเห็น</p>
          <AdviceText text={advicePreviewText} className="text-slate-200" />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>💡 ประชาชนสามารถสลับทิศทางเดินทางได้ทันทีในหน้าหลัก</span>
        <button
          type="button"
          onClick={() => {
            setDetourAdviceView((prev) => (prev === "FORWARD" ? "REVERSE" : prev === "REVERSE" ? "FORWARD" : "FORWARD"));
          }}
          className="text-amber-400 hover:underline flex items-center gap-1 font-heading"
        >
          <ArrowRightLeft className="w-3 h-3" /> สลับมุมมองทิศทาง
        </button>
      </div>

      <div className="pt-2 border-t border-slate-800/80 space-y-3">
        <div>
          <label className="text-xs text-slate-300 block mb-1">สภาพผิวทาง (Road Surface Condition)</label>
          <input
            type="text"
            value={detourRoadCondition}
            onChange={(e) => setDetourRoadCondition(e.target.value)}
            placeholder="เช่น ผิวทางลาดยาง สัญจรได้ตามปกติ หรือ ทางลูกรัง/หินคลุก"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>

        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-bold text-emerald-400 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" />
              <span>Google Maps URL ที่เจ้าหน้าที่อนุมัติแล้ว (Optional)</span>
            </span>
            <span className="text-[10px] text-slate-400">หากระบุ จะใช้นำทางแทนการคำนวณอัตโนมัติ</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-slate-300 block mb-1">ลิงก์ขาไป (A → B):</span>
              <input
                type="url"
                value={detourGoogleMapsUrlFwd}
                onChange={(e) => setDetourGoogleMapsUrlFwd(e.target.value)}
                placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>
            <div>
              <span className="text-[11px] text-slate-300 block mb-1">ลิงก์ขากลับ (B → A):</span>
              <input
                type="url"
                value={detourGoogleMapsUrlRev}
                onChange={(e) => setDetourGoogleMapsUrlRev(e.target.value)}
                placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </FormSection>
  );
});

