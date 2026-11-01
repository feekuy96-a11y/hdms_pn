/**
 * สไตล์เส้นบนแผนที่ — เก็บใน system_settings.map_style (JSON) แอดมินปรับได้ที่เมนู "สไตล์เส้น"
 * มีการ sanitize ทุกค่า (สี/ตัวเลขนอกช่วงจะถูกแทนด้วยค่าเริ่มต้น) เพื่อไม่ให้ค่าเพี้ยนทำให้แผนที่พัง
 */
export type FxKind = "none" | "chaser" | "arrows" | "pulse" | "blink";
export type DashKind = "solid" | "dashed" | "dotted";

export interface LineStyle {
  color: string; width: number; opacity: number;                         // เส้นหลัก
  casingColor: string; casingWidth: number;                              // ขอบเส้น (px ต่อข้าง)
  glow: boolean; glowColor: string; glowWidth: number; glowOpacity: number; // รัศมีเรือง
  dash: DashKind; dashLen: number; gapLen: number;                       // รูปแบบเส้น (เมตร)
  fx: FxKind; fxColor: string; fxSize: number; fxSpacing: number; fxSpeed: number; // เอฟเฟกต์เคลื่อนไหว
}

export interface MapStyle {
  primary: LineStyle; secondary: LineStyle; flood: LineStyle; detour: LineStyle;
  fxEnabled: boolean;   // เปิด/ปิดเอฟเฟกต์เคลื่อนไหวทั้งหมด
  pinPulse: boolean;    // วงแหวนกระพริบที่หมุดน้ำท่วม
}

const base: LineStyle = {
  color: "#1B5E20", width: 5, opacity: 1, casingColor: "#FFFFFF", casingWidth: 2,
  glow: false, glowColor: "#1B5E20", glowWidth: 10, glowOpacity: 0.25,
  dash: "solid", dashLen: 14, gapLen: 9,
  fx: "none", fxColor: "#FFFFFF", fxSize: 8, fxSpacing: 28, fxSpeed: 2,
};

export const DEFAULT_STYLE: MapStyle = {
  primary: { ...base },
  secondary: { ...base, color: "#81C784", width: 3.5, casingWidth: 1.5, glowColor: "#81C784" },
  flood: { ...base, color: "#D32F2F", width: 7, casingWidth: 1.5, glow: true, glowColor: "#D32F2F", glowWidth: 14, glowOpacity: 0.3,
    fx: "chaser", fxColor: "#FFFFFF", fxSize: 7, fxSpacing: 26, fxSpeed: 1.6 },
  detour: { ...base, color: "#FBC02D", width: 5, casingColor: "#111111", casingWidth: 2.2, dash: "dashed", dashLen: 14, gapLen: 9,
    fx: "arrows", fxColor: "#111111", fxSize: 10, fxSpacing: 34, fxSpeed: 1.8 },
  fxEnabled: true,
  pinPulse: true,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: any, d: number, min: number, max: number) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const oneOf = <T extends string>(v: any, list: readonly T[], d: T): T => (list.includes(v) ? v : d);
const col = (v: any, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);

function mergeLine(d: LineStyle, v: any): LineStyle {
  v = v && typeof v === "object" ? v : {};
  return {
    color: col(v.color, d.color), width: num(v.width, d.width, 1, 24), opacity: num(v.opacity, d.opacity, 0.1, 1),
    casingColor: col(v.casingColor, d.casingColor), casingWidth: num(v.casingWidth, d.casingWidth, 0, 8),
    glow: typeof v.glow === "boolean" ? v.glow : d.glow, glowColor: col(v.glowColor, d.glowColor),
    glowWidth: num(v.glowWidth, d.glowWidth, 2, 40), glowOpacity: num(v.glowOpacity, d.glowOpacity, 0.05, 0.8),
    dash: oneOf(v.dash, ["solid", "dashed", "dotted"] as const, d.dash),
    dashLen: num(v.dashLen, d.dashLen, 2, 120), gapLen: num(v.gapLen, d.gapLen, 2, 120),
    fx: oneOf(v.fx, ["none", "chaser", "arrows", "pulse", "blink"] as const, d.fx),
    fxColor: col(v.fxColor, d.fxColor), fxSize: num(v.fxSize, d.fxSize, 4, 20),
    fxSpacing: num(v.fxSpacing, d.fxSpacing, 12, 120), fxSpeed: num(v.fxSpeed, d.fxSpeed, 0.6, 6),
  };
}

export function mergeStyle(v: any): MapStyle {
  v = v && typeof v === "object" ? v : {};
  return {
    primary: mergeLine(DEFAULT_STYLE.primary, v.primary), secondary: mergeLine(DEFAULT_STYLE.secondary, v.secondary),
    flood: mergeLine(DEFAULT_STYLE.flood, v.flood), detour: mergeLine(DEFAULT_STYLE.detour, v.detour),
    fxEnabled: typeof v.fxEnabled === "boolean" ? v.fxEnabled : DEFAULT_STYLE.fxEnabled,
    pinPulse: typeof v.pinPulse === "boolean" ? v.pinPulse : DEFAULT_STYLE.pinPulse,
  };
}

export function rgba(hex: string, a: number) {
  const h = HEX.test(hex) ? hex : "#000000";
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
}
