export type TrafficStatus =
  | "CLOSED"
  | "WARNING"
  | "PASSABLE"
  | "LIGHT_VEHICLES_ONLY"
  | "ONE_LANE"
  | "PENDING_VERIFICATION";

export type StatusColor = "red" | "orange" | "amber" | "sky" | "emerald" | "slate";

export interface TrafficPresentation {
  label: string;
  detail: string;
  icon: string;
  color: StatusColor;
  hex: string;
  badgeClass: string;
  popupBadgeClass: string;
  capsuleClass: string;
  dotClass: string;
}

export const TRAFFIC_STATUS_OPTIONS: ReadonlyArray<{
  value: Exclude<TrafficStatus, "PENDING_VERIFICATION">;
  label: string;
}> = [
  { value: "PASSABLE", label: "ผ่านได้ปกติ" },
  { value: "LIGHT_VEHICLES_ONLY", label: "รถเล็กผ่านได้" },
  { value: "ONE_LANE", label: "รถเล็กผ่านได้ ๑ ช่องทาง" },
  { value: "WARNING", label: "รถเล็กผ่านไม่ได้" },
  { value: "CLOSED", label: "ผ่านไม่ได้" },
];

/**
 * Single canonical source of truth for flood traffic status labels, colors, icons,
 * and CSS badge/map classes across public citizen UI, map markers/popups, and admin console (R1).
 */
export function getTrafficPresentation(
  status?: string,
  waterLevelCm: number = 0,
  detailStatus?: string
): TrafficPresentation {
  if (detailStatus === "PENDING_VERIFICATION" || status === "PENDING_VERIFICATION") {
    return {
      label: "รอตรวจสอบสถานะ",
      detail: "อยู่ระหว่างตรวจสอบสถานการณ์หน้างาน",
      icon: "⏳",
      color: "slate",
      hex: "#64748b",
      badgeClass: "bg-slate-900/80 text-slate-300 border border-slate-600/50",
      popupBadgeClass: "bg-slate-600/80 text-white border border-slate-400/50",
      capsuleClass: "doh-capsule-tag doh-capsule-slate",
      dotClass: "bg-slate-400",
    };
  }

  if (detailStatus === "NO_SMALL_VEHICLES" || status === "NO_SMALL_VEHICLES") {
    return {
      label: "รถเล็กไม่สามารถผ่านได้",
      detail: `ระดับน้ำ ${waterLevelCm} ซม. รถเล็กผ่านไม่ได้`,
      icon: "🚗",
      color: "orange",
      hex: "#f97316",
      badgeClass: "bg-orange-950/80 text-orange-200 border border-orange-500/50",
      popupBadgeClass: "bg-orange-500 text-slate-950 font-black",
      capsuleClass: "doh-capsule-tag doh-capsule-orange",
      dotClass: "bg-orange-500",
    };
  }

  switch (status) {
    case "CLOSED":
      return {
        label: "ผ่านไม่ได้",
        detail: "รถทุกชนิดผ่านไม่ได้",
        icon: "⛔",
        color: "red",
        hex: "#dc2626",
        badgeClass: "bg-red-950/80 text-red-300 border border-red-500/50",
        popupBadgeClass: "bg-red-600 text-white font-black",
        capsuleClass: "doh-capsule-tag doh-capsule-red",
        dotClass: "bg-red-500 animate-pulse",
      };
    case "LIGHT_VEHICLES_ONLY":
      return {
        label: "รถเล็กผ่านได้",
        detail: "อนุญาตเฉพาะรถขนาดเล็ก",
        icon: "🚗",
        color: "sky",
        hex: "#0ea5e9",
        badgeClass: "bg-sky-950/80 text-sky-300 border border-sky-500/50",
        popupBadgeClass: "bg-sky-500 text-slate-950 font-black",
        capsuleClass: "doh-capsule-tag doh-capsule-sky",
        dotClass: "bg-sky-400",
      };
    case "ONE_LANE":
      return {
        label: "รถเล็กผ่านได้ ๑ ช่องทาง",
        detail: "เปิดการจราจรหนึ่งช่องทาง",
        icon: "↔️",
        color: "amber",
        hex: "#f59e0b",
        badgeClass: "bg-amber-950/80 text-amber-200 border border-amber-500/50",
        popupBadgeClass: "bg-amber-400 text-slate-950 font-black",
        capsuleClass: "doh-capsule-tag doh-capsule-amber",
        dotClass: "bg-amber-500",
      };
    case "WARNING":
    case "CAUTION":
      return {
        label: "รถเล็กผ่านไม่ได้",
        detail: `ระดับน้ำ ${waterLevelCm} ซม.`,
        icon: "⚠️",
        color: "amber",
        hex: "#f59e0b",
        badgeClass: "bg-amber-950/80 text-amber-200 border border-amber-500/50",
        popupBadgeClass: "bg-amber-400 text-slate-950 font-black",
        capsuleClass: "doh-capsule-tag doh-capsule-amber",
        dotClass: "bg-amber-500",
      };
    case "PASSABLE":
      return {
        label: "ผ่านได้ปกติ",
        detail: "การจราจรผ่านได้ตามปกติ",
        icon: "✅",
        color: "emerald",
        hex: "#10b981",
        badgeClass: "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50",
        popupBadgeClass: "bg-emerald-500 text-white font-black",
        capsuleClass: "doh-capsule-tag doh-capsule-green",
        dotClass: "bg-emerald-500",
      };
    default:
      if (detailStatus === "CAUTION") {
        return {
          label: "รถเล็กผ่านไม่ได้",
          detail: `ระดับน้ำ ${waterLevelCm} ซม.`,
          icon: "⚠️",
          color: "amber",
          hex: "#f59e0b",
          badgeClass: "bg-amber-950/80 text-amber-200 border border-amber-500/50",
          popupBadgeClass: "bg-amber-400 text-slate-950 font-black",
          capsuleClass: "doh-capsule-tag doh-capsule-amber",
          dotClass: "bg-amber-500",
        };
      }
      // External imports and older records can contain an unsupported value.
      // Never present it as safe traffic until an officer verifies it.
      return {
        label: "รอตรวจสอบสถานะ",
        detail: "ไม่พบสถานะการจราจรที่ยืนยันได้",
        icon: "⏳",
        color: "slate",
        hex: "#64748b",
        badgeClass: "bg-slate-900/80 text-slate-300 border border-slate-600/50",
        popupBadgeClass: "bg-slate-600/80 text-white border border-slate-400/50",
        capsuleClass: "doh-capsule-tag doh-capsule-slate",
        dotClass: "bg-slate-400",
      };
  }
}

export function formatRelativeUpdateTime(iso?: string | null): string {
  if (!iso) return "อัปเดต ไม่ระบุเวลา";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "อัปเดต ไม่ระบุเวลา";
  const diffMs = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "อัปเดต เมื่อสักครู่";
  if (mins < 60) return `อัปเดต ${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `อัปเดต ${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `อัปเดต ${days} วันที่แล้ว`;
  return `อัปเดต ${new Date(ts).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}`;
}
