/**
 * =============================================================================
 * DOH Pattani Flood Monitoring & GIS System - Static Constants
 * แขวงทางหลวงปัตตานี กรมทางหลวง กระทรวงคมนาคม
 * =============================================================================
 */

export const APP_CONFIG = {
  NAME: "DOH_Pattani_Flood",
  TITLE: "ระบบสารสนเทศภูมิศาสตร์และรายงานสถานการณ์อุทกภัย แขวงทางหลวงปัตตานี",
  SHORT_TITLE: "ศภ.ขท.ปัตตานี (DOH Pattani Flood)",
  ORGANIZATION: "แขวงทางหลวงปัตตานี สำนักงานทางหลวงที่ 18 กรมทางหลวง",
  MINISTRY: "กระทรวงคมนาคม",
  HOTLINE: "1586",
  OFFICE_PHONE: "073-349041",
  VERSION: "2.1.0 (Government Standard)",
  DEFAULT_CENTER: {
    lat: 6.815,
    lon: 101.25,
  },
  DEFAULT_ZOOM: 11,
} as const;

export const LAYER_CONFIG = {
  FLOOD_RED_LINE: {
    id: "FLOOD_ROUTE",
    name: "เส้นทางน้ำท่วม (Red Line)",
    color: "#b91c1c",
    weight: 6,
    opacity: 0.95,
  },
  DETOUR_YELLOW_LINE: {
    id: "DETOUR_ROUTE",
    name: "เส้นทางเลี่ยง (Yellow Line)",
    color: "#d97706",
    weight: 5,
    dashArray: "8, 6",
    opacity: 0.95,
  },
  MAIN_HIGHWAY: {
    id: "MAIN_HIGHWAY",
    name: "ทางหลวงแผ่นดินสายหลัก (ทล.42, 43, 418, 410)",
    color: "#0f2347",
    weight: 5,
    opacity: 0.9,
  },
  SECONDARY_HIGHWAY: {
    id: "SECOND_HIGHWAY",
    name: "ทางหลวงแผ่นดินสายรอง (ทล.409, 4061, 4074, 4092)",
    color: "#0284c7",
    weight: 3,
    opacity: 0.85,
  },
} as const;

export const SAFETY_MEASURES = [
  "–",
  "ติดตั้งป้ายเตือนน้ำท่วมทางหลวงล่วงหน้า 500 ม.",
  "ติดตั้งป้ายไฟกระพริบพลังงานแสงอาทิตย์แจ้งเตือนกลางคืน",
  "ติดตั้งเสาวัดระดับน้ำ (Water Level Staff) ขอบทาง",
  "จัดเจ้าหน้าที่หมวดทางหลวงเฝ้าระวังตลอด 24 ชั่วโมง",
  "จัดรถบรรทุกยกสูงบริการรับ-ส่งช่วยเหลือประชาชน",
  "จัดกรวยยางและแบริเออร์ปิดช่องจราจรที่น้ำท่วมลึก",
  "ประสานงานตำรวจภูธรและฝ่ายปกครองอำนวยความสะดวก",
] as const;

export const MITIGATION_STATUS = {
  COMPLETED: {
    code: "COMPLETED",
    label: "ดำเนินการแก้ไขแล้วเสร็จ (ระบายน้ำสมบูรณ์)",
    colorHex: "#059669",
    badgeClass: "bg-emerald-900/40 text-emerald-300 border border-emerald-500",
  },
  PENDING_BUDGET: {
    code: "PENDING_BUDGET",
    label: "รอรับการจัดสรรงบประมาณ (แบบก่อสร้างพร้อม)",
    colorHex: "#d97706",
    badgeClass: "bg-amber-900/40 text-amber-300 border border-amber-500",
  },
} as const;

// UTM Zone 47N Ellipsoid Constants (WGS84, Zone 47, Central Meridian 99° E)
export const UTM_47N_PARAMS = {
  a: 6378137.0, // WGS84 Semi-major axis
  f: 1 / 298.257223563, // Flattening
  k0: 0.9996, // Scale factor
  lon0Rad: (99.0 * Math.PI) / 180.0, // Central meridian in radians
  falseEasting: 500000.0,
  falseNorthing: 0.0,
} as const;

export const OFFLINE_STORAGE = {
  DB_NAME: "DOH_PATTANI_OFFLINE_STORE",
  STORE_NAME: "offline_timeline_queue",
  VERSION: 1,
} as const;

export interface MapLineStyleItem {
  color: string;
  weight: number;
  opacity: number;
  borderColor?: string;
  borderWidth?: number;
  borderActive?: boolean;
  glow?: boolean;
  glowColor?: string;
  glowWidth?: number;
  pattern: "solid" | "dash" | "dot" | "long-dash-dot";
  dashArray?: string;
  animation: "none" | "chaser" | "arrows" | "pulse" | "blink" | "wave" | "flow" | "spotlight" | "chevrons" | "extent";
  animationEnabled?: boolean;
  animationSpeed?: number | "slow" | "normal" | "fast";
  showArrows?: boolean;
  arrowColor?: string;
  arrowSize?: number;
  arrowSpacingPx?: number;
  arrowMinZoom?: number;
}

export const ROAD_SIDE_OPTIONS = [
  { value: "BOTH", label: "ทั้งสองฝั่ง (ขาไปและขากลับ)" },
  { value: "LEFT", label: "ฝั่งซ้ายทาง (อ้างอิงตามทิศ กม. เพิ่มขึ้น)" },
  { value: "RIGHT", label: "ฝั่งขวาทาง (อ้างอิงตามทิศ กม. เพิ่มขึ้น)" },
  { value: "UNKNOWN", label: "ไม่ระบุ / ไม่ทราบฝั่ง" },
] as const;

export type RoadSideType = (typeof ROAD_SIDE_OPTIONS)[number]["value"];

export const AFFECTED_LANES_OPTIONS = [
  "ทุกช่องจราจร",
  "ช่องจราจรที่ 1 (ช่องซ้ายสุด)",
  "ช่องจราจรที่ 1 และ 2",
  "ช่องจราจรขวาสุด (ติดเกาะกลาง)",
  "เฉพาะไหล่ทาง / ทางคู่ขนาน",
  "ไม่ระบุช่องจราจร",
] as const;

export const AFFECTED_SHOULDER_OPTIONS = [
  { value: "NONE", label: "ไม่กระทบไหล่ทาง / ปกติ" },
  { value: "LEFT", label: "ท่วมไหล่ทางซ้าย" },
  { value: "RIGHT", label: "ท่วมไหล่ทางขวา" },
  { value: "BOTH", label: "ท่วมไหล่ทางทั้งสองฝั่ง" },
  { value: "AFFECTED", label: "ท่วมไหล่ทาง (ไม่ระบุฝั่ง)" },
  { value: "UNKNOWN", label: "ไม่ทราบสถานะไหล่ทาง" },
] as const;

export type AffectedShoulderType = (typeof AFFECTED_SHOULDER_OPTIONS)[number]["value"];

export const DETOUR_DIRECTION_MODES = [
  { value: "TWO_WAY", label: "ไป-กลับ ๒ ทิศทาง", desc: "คำนวณ A→B และ B→A แยกตามถนนจริง" },
  { value: "FORWARD_ONLY", label: "เฉพาะขาไป (A → B)", desc: "เดินรถทิศทางเดียวจากจุด A ไป B" },
  { value: "REVERSE_ONLY", label: "เฉพาะขากลับ (B → A)", desc: "เดินรถทิศทางเดียวจากจุด B ไป A" },
] as const;

export type DetourDirectionModeType = (typeof DETOUR_DIRECTION_MODES)[number]["value"];

export const DEFAULT_MAP_STYLES: Record<"flood" | "detour" | "primary" | "secondary", MapLineStyleItem> = {
  flood: {
    color: "#D32F2F",
    weight: 6,
    opacity: 0.95,
    borderActive: true,
    borderColor: "#ffffff",
    borderWidth: 1.5,
    glow: true,
    glowColor: "#D32F2F",
    glowWidth: 8,
    pattern: "solid",
    animation: "wave",
    animationSpeed: "normal",
    showArrows: false,
    arrowColor: "#ffffff",
    arrowSize: 12,
    arrowSpacingPx: 140,
    arrowMinZoom: 12,
  },
  detour: {
    color: "#FBC02D",
    weight: 5,
    opacity: 0.95,
    borderActive: true,
    borderColor: "#0f172a",
    borderWidth: 1,
    glow: false,
    glowColor: "#FBC02D",
    glowWidth: 6,
    pattern: "dash",
    dashArray: "8, 6",
    animation: "flow",
    animationSpeed: "normal",
    showArrows: true,
    arrowColor: "#0f172a",
    arrowSize: 13,
    arrowSpacingPx: 120,
    arrowMinZoom: 11,
  },
  primary: {
    color: "#1B5E20",
    weight: 5,
    opacity: 0.9,
    borderActive: false,
    borderColor: "#ffffff",
    borderWidth: 1,
    glow: false,
    glowColor: "#1B5E20",
    glowWidth: 6,
    pattern: "solid",
    animation: "none",
    animationSpeed: "normal",
    showArrows: true,
    arrowColor: "#ffffff",
    arrowSize: 11,
    arrowSpacingPx: 160,
    arrowMinZoom: 12,
  },
  secondary: {
    color: "#0284c7",
    weight: 3.5,
    opacity: 0.85,
    borderActive: false,
    borderColor: "#ffffff",
    borderWidth: 1,
    glow: false,
    glowColor: "#0284c7",
    glowWidth: 6,
    pattern: "solid",
    animation: "none",
    animationSpeed: "normal",
    showArrows: true,
    arrowColor: "#ffffff",
    arrowSize: 10,
    arrowSpacingPx: 180,
    arrowMinZoom: 13,
  },
};

export const LINE_STYLE_PRESET_THEMES = [
  {
    id: "doh_official",
    name: "มาตรฐานกรมทางหลวง (DOH Official)",
    description: "สีทางการกรมทางหลวง: น้ำท่วมแดง ทางเลี่ยงเหลือง สายประธานเขียวเข้ม สายรองฟ้า",
    styles: {
      flood: { color: "#D32F2F", weight: 6, opacity: 0.95, borderActive: true, borderColor: "#ffffff", borderWidth: 1.5, glow: true, glowColor: "#D32F2F", glowWidth: 8, pattern: "solid" as const, animation: "pulse" as const, animationSpeed: "normal" as const },
      detour: { color: "#FBC02D", weight: 5, opacity: 0.95, borderActive: true, borderColor: "#0f172a", borderWidth: 1, glow: false, glowColor: "#FBC02D", glowWidth: 6, pattern: "dash" as const, dashArray: "8, 6", animation: "chaser" as const, animationSpeed: "normal" as const },
      primary: { color: "#1B5E20", weight: 5, opacity: 0.9, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#1B5E20", glowWidth: 6, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
      secondary: { color: "#0284c7", weight: 3.5, opacity: 0.85, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#0284c7", glowWidth: 6, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
    },
  },
  {
    id: "doh_navy",
    name: "สีกรมทางหลวง-น้ำเงินสง่างาม (Navy Authority)",
    description: "เน้นโทนสีกรมท่าของกระทรวงคมนาคมและแขวงทางหลวงปัตตานี",
    styles: {
      flood: { color: "#DC2626", weight: 6.5, opacity: 0.95, borderActive: true, borderColor: "#ffffff", borderWidth: 1.5, glow: true, glowColor: "#DC2626", glowWidth: 10, pattern: "solid" as const, animation: "pulse" as const, animationSpeed: "normal" as const },
      detour: { color: "#EAB308", weight: 5, opacity: 0.95, borderActive: true, borderColor: "#0f172a", borderWidth: 1, glow: false, glowColor: "#EAB308", glowWidth: 6, pattern: "dash" as const, dashArray: "8, 6", animation: "chaser" as const, animationSpeed: "normal" as const },
      primary: { color: "#0B2A5B", weight: 5.5, opacity: 0.95, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#0B2A5B", glowWidth: 6, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
      secondary: { color: "#0284c7", weight: 3.5, opacity: 0.85, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#0284c7", glowWidth: 6, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
    },
  },
  {
    id: "night_neon",
    name: "โหมดกลางคืน คอนทราสต์สูง (Night Neon)",
    description: "สีนีออนเรืองแสงความคมชัดสูงสำหรับหน้าจอศูนย์บัญชาการตอนกลางคืน",
    styles: {
      flood: { color: "#FF1744", weight: 7, opacity: 1, borderActive: true, borderColor: "#ffffff", borderWidth: 2, glow: true, glowColor: "#FF1744", glowWidth: 16, pattern: "solid" as const, animation: "blink" as const, animationSpeed: "fast" as const },
      detour: { color: "#FFEA00", weight: 6, opacity: 1, borderActive: true, borderColor: "#000000", borderWidth: 1.5, glow: true, glowColor: "#FFEA00", glowWidth: 12, pattern: "dash" as const, dashArray: "10, 6", animation: "chaser" as const, animationSpeed: "fast" as const },
      primary: { color: "#00E5FF", weight: 5.5, opacity: 0.95, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: true, glowColor: "#00E5FF", glowWidth: 10, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
      secondary: { color: "#00E676", weight: 4, opacity: 0.9, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: true, glowColor: "#00E676", glowWidth: 8, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
    },
  },
  {
    id: "subdued_paper",
    name: "โหมดพิมพ์รายงานราชการ (Subdued Paper)",
    description: "สีคลาสสิกสำหรับจัดทำรายงานสรุปสถานการณ์และพิมพ์เอกสาร ไม่รบกวนสายตา",
    styles: {
      flood: { color: "#B91C1C", weight: 5, opacity: 0.9, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#B91C1C", glowWidth: 4, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
      detour: { color: "#B45309", weight: 4, opacity: 0.9, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#B45309", glowWidth: 4, pattern: "dash" as const, dashArray: "8, 4", animation: "none" as const, animationSpeed: "normal" as const },
      primary: { color: "#1E293B", weight: 4, opacity: 0.85, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#1E293B", glowWidth: 4, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
      secondary: { color: "#475569", weight: 3, opacity: 0.8, borderActive: false, borderColor: "#ffffff", borderWidth: 1, glow: false, glowColor: "#475569", glowWidth: 4, pattern: "solid" as const, animation: "none" as const, animationSpeed: "normal" as const },
    },
  },
];

export interface DohOfficeLocation {
  id: string;
  name: string;
  type: "HEADQUARTERS" | "SUBDIVISION" | "SERVICE_POINT";
  address: string;
  phone: string;
  lat: number;
  lon: number;
  is_active: boolean;
}
