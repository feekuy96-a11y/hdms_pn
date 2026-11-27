"use client";

import React from "react";
import { Clock, Navigation, Route, Signpost, X } from "lucide-react";
import { AdviceText } from "@/components/AdviceText";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import type { DetourRoute, FloodRoute } from "@/db/default-data";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  detourDurationSeconds as readDetourDurationSeconds,
  isDetourDirectionAllowed,
} from "@/lib/detour-presentation";
import type { LinkedFloodEventEntry } from "@/lib/event-detour-links";
import { extractDirectionalAdvice, splitDetourAdviceByDirection } from "@/lib/gis-utils";

export interface DetourViewModalProps {
  viewingDetour: DetourRoute | null;
  viewingDetourDir: "FORWARD" | "REVERSE";
  setViewingDetourDir: (dir: "FORWARD" | "REVERSE") => void;
  linkedEventsByDetourId: Map<string, LinkedFloodEventEntry[]>;
  floodList: FloodRoute[];
  dialog: {
    dialogRef: React.RefObject<HTMLDivElement | null>;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  onClose: () => void;
  onManageLinks: (detourId: string) => void;
  onEdit: (item: DetourRoute) => void;
  onDelete: (item: DetourRoute) => void;
}

/** Modal แสดงรายละเอียดเส้นทางเลี่ยง, SVG Mini-Map Preview, คำแนะนำตามทิศทาง และลิงก์ทดสอบ Google Maps */
export function DetourViewModal({
  viewingDetour,
  viewingDetourDir,
  setViewingDetourDir,
  linkedEventsByDetourId,
  floodList,
  dialog,
  onClose,
  onManageLinks,
  onEdit,
  onDelete,
}: DetourViewModalProps) {
  if (!viewingDetour) return null;

  const linkedEvents = linkedEventsByDetourId.get(viewingDetour.id) || [];

  const rawCoords =
    viewingDetourDir === "REVERSE" &&
    Array.isArray(viewingDetour.reverse_coordinates_json) &&
    viewingDetour.reverse_coordinates_json.length >= 2
      ? viewingDetour.reverse_coordinates_json
      : viewingDetour.coordinates_json;
  const coords = Array.isArray(rawCoords)
    ? rawCoords.filter(
        (pt): pt is [number, number] =>
          Array.isArray(pt) &&
          pt.length >= 2 &&
          Number.isFinite(Number(pt[0])) &&
          Number.isFinite(Number(pt[1]))
      )
    : [];

  let miniMapSvg: React.ReactNode = null;
  if (coords.length >= 2) {
    const lats = coords.map((c) => Number(c[0]));
    const lons = coords.map((c) => Number(c[1]));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const spanLat = Math.max(0.0005, maxLat - minLat);
    const spanLon = Math.max(0.0005, maxLon - minLon);
    const W = 280;
    const H = 88;
    const PAD = 14;
    const toPt = (lat: number, lon: number) => {
      const x = PAD + ((lon - minLon) / spanLon) * (W - PAD * 2);
      const y = H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);
      return [Number(x.toFixed(1)), Number(y.toFixed(1))];
    };
    const points = coords.map((c) => toPt(Number(c[0]), Number(c[1])));
    const polylineStr = points.map((p) => p.join(",")).join(" ");
    const startPt = points[0];
    const endPt = points[points.length - 1];
    miniMapSvg = (
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>พรีวิวรูปทรงแนวเส้นทาง ({viewingDetourDir === "FORWARD" ? "A → B" : "B → A"})</span>
          <span className="font-mono">{coords.length} จุดพิกัด</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-22 w-full rounded-lg bg-slate-900/90"
          role="img"
          aria-label={`แผนที่ย่อแนวเส้นทาง ${viewingDetour.route_name}`}
        >
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineStr}
          />
          <circle cx={startPt[0]} cy={startPt[1]} r="5" fill="#10b981" stroke="#0f172a" strokeWidth="1.5" />
          <circle cx={endPt[0]} cy={endPt[1]} r="5" fill="#f43f5e" stroke="#0f172a" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }

  const fwdKm = calculatePolylineRoadDistanceKm(viewingDetour.coordinates_json);
  const revKm = calculatePolylineRoadDistanceKm(
    viewingDetour.reverse_coordinates_json || viewingDetour.coordinates_json
  );
  const polyKm = viewingDetourDir === "REVERSE" ? revKm : fwdKm;
  const durSec = readDetourDurationSeconds(viewingDetour.detour_meta, viewingDetourDir);
  const durMin = durSec ? Math.max(1, Math.round(durSec / 60)) : null;

  const ext = extractDirectionalAdvice(viewingDetour.description || "");
  const parsed = splitDetourAdviceByDirection(viewingDetour.description || "", viewingDetour.direction_mode);
  const adviceText =
    ext.hasBoth &&
    viewingDetour.direction_mode !== "FORWARD_ONLY" &&
    viewingDetour.direction_mode !== "REVERSE_ONLY"
      ? viewingDetourDir === "FORWARD"
        ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
        : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
      : viewingDetourDir === "FORWARD"
        ? parsed.forwardText
        : parsed.reverseText;

  const nav = resolveDetourGoogleMapsNavigation(viewingDetour, viewingDetourDir, floodList);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/75 backdrop-blur-sm p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialog.dialogRef}
        role="dialog"
        data-hdms-popup="panel"
        aria-modal="true"
        aria-label="รายละเอียดเส้นทางเลี่ยง"
        tabIndex={-1}
        onKeyDown={dialog.onKeyDown}
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-heading font-black text-white flex items-center gap-2">
              <Signpost className="w-5 h-5 text-amber-400" />
              <span>{viewingDetour.route_name}</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {viewingDetour.direction_mode === "FORWARD_ONLY"
                ? "เฉพาะขาไป (A → B)"
                : viewingDetour.direction_mode === "REVERSE_ONLY"
                  ? "เฉพาะขากลับ (B → A)"
                  : viewingDetour.direction_mode === "TWO_WAY"
                    ? "เดินรถ ๒ ทิศทาง (A ⇄ B)"
                    : "ไม่ระบุทิศทาง (ต้องตรวจสอบ)"}
            </p>
          </div>
          <button
            type="button"
            aria-label="ปิดรายละเอียด" data-hdms-popup-close
            onClick={onClose}
            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl p-2 hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
            <dt className="text-slate-400">สถานะการใช้งาน</dt>
            <dd className="font-bold text-white mt-0.5">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                  viewingDetour.is_active
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-600"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {viewingDetour.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
              </span>
            </dd>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-slate-400">จุดน้ำท่วมที่ผูกไว้</dt>
              <button
                type="button"
                onClick={() => {
                  const detourId = viewingDetour.id;
                  onClose();
                  onManageLinks(detourId);
                }}
                className="text-[11px] font-heading font-bold text-sky-300 hover:text-sky-200 underline cursor-pointer"
              >
                จัดการความสัมพันธ์
              </button>
            </div>
            <dd className="font-bold text-amber-300 mt-1 space-y-1">
              {linkedEvents.length === 0
                ? "ทางเลี่ยงอิสระ (ไม่ผูกจุดน้ำท่วม)"
                : linkedEvents.map((ev) => (
                    <div key={ev.eventId} className="text-xs text-amber-300">
                      • ทล.{ev.routeNo} {ev.sectionName}
                      {ev.kmRangeLabel ? ` (${ev.kmRangeLabel})` : ""}
                    </div>
                  ))}
            </dd>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
            <dt className="text-slate-400 font-sans">พิกัดจุด A (เริ่มต้น)</dt>
            <dd className="text-white mt-0.5">
              {viewingDetour.lat_start}, {viewingDetour.lon_start}
            </dd>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
            <dt className="text-slate-400 font-sans">พิกัดจุด B (สิ้นสุด)</dt>
            <dd className="text-white mt-0.5">
              {viewingDetour.lat_end}, {viewingDetour.lon_end}
            </dd>
          </div>
        </dl>

        {/* Lightweight SVG Route Shape Mini-Map Preview */}
        {miniMapSvg}

        {/* Directional Tabs for Turn-by-Turn Advice */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-heading font-bold text-amber-300">
              คำแนะนำการเดินทางทีละขั้นตอน:
            </span>
            <DirectionSwitch
              size="sm"
              ariaLabel="เลือกทิศทางคำแนะนำการเดินทาง"
              value={viewingDetourDir}
              onChange={setViewingDetourDir}
              options={[
                {
                  value: "FORWARD",
                  label: "ขาไป (A → B)",
                  ariaLabel: "ขาไป A → B",
                  disabled: !isDetourDirectionAllowed(viewingDetour.direction_mode, "FORWARD"),
                },
                {
                  value: "REVERSE",
                  label: "ขากลับ (B → A)",
                  ariaLabel: "ขากลับ B → A",
                  disabled: !isDetourDirectionAllowed(viewingDetour.direction_mode, "REVERSE"),
                },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-amber-300" />
              <span>ระยะทางตามแนวเส้น:</span>
              <strong className="text-white font-mono">
                {polyKm > 0 ? `${polyKm.toFixed(1)} กม.` : "ไม่ระบุ"}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-300" />
              <span>เวลาโดยประมาณ:</span>
              <strong className="text-white font-mono">
                {durMin ? `ประมาณ ${durMin} นาที` : "ยังไม่มีข้อมูลเวลาเดินทาง"}
              </strong>
            </span>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-slate-950/80 p-3 text-xs text-[color:var(--text-primary)] leading-relaxed max-h-48 overflow-y-auto font-sans">
            {adviceText ? <AdviceText text={adviceText} /> : "ไม่มีคำแนะนำการเดินทางเฉพาะทิศทาง"}
          </div>
        </div>

        {/* Google Maps Test Navigation */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-heading text-slate-300">
              {nav.source === "APPROVED_URL"
                ? "✅ ใช้ลิงก์ที่เจ้าหน้าที่อนุมัติไว้"
                : "🧭 สร้างเส้นทางและจุดผ่านทางอัตโนมัติ"}
            </span>
            {nav.isValid && nav.url ? (
              <a
                href={nav.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-heading font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 shadow transition"
              >
                <Navigation className="w-3.5 h-3.5" aria-hidden="true" /> ทดสอบเปิด Google Maps (
                {viewingDetourDir === "FORWARD" ? "A → B" : "B → A"})
              </a>
            ) : (
              <span className="text-xs text-rose-400 font-medium">⚠️ {nav.warning}</span>
            )}
          </div>
          {nav.disclaimer && <p className="text-[10px] text-slate-400">{nav.disclaimer}</p>}
        </div>

        <div className="pt-3 border-t border-slate-800 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              const item = viewingDetour;
              onClose();
              onEdit(item);
            }}
            className="min-h-10 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-heading font-bold text-slate-950 transition"
          >
            แก้ไขข้อมูล
          </button>
          <button
            type="button"
            onClick={() => {
              const item = viewingDetour;
              onClose();
              onDelete(item);
            }}
            className="min-h-10 rounded-xl border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900 px-4 py-2 text-xs font-heading font-bold text-rose-300 transition"
          >
            ลบทางเลี่ยง
          </button>
        </div>
      </div>
    </div>
  );
}
