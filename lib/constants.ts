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

export const DOH_SUBDIVISIONS = [
  { id: "SUB_PATTANI", name: "หมวดทางหลวงปัตตานี", chief: "นายช่างหัวหน้าหมวดทางหลวงปัตตานี", phone: "073-349041 ต่อ 102" },
  { id: "SUB_NONGCHIK", name: "หมวดทางหลวงหนองจิก", chief: "นายช่างหัวหน้าหมวดทางหลวงหนองจิก", phone: "073-349041 ต่อ 103" },
  { id: "SUB_YARANG", name: "หมวดทางหลวงยะรัง", chief: "นายช่างหัวหน้าหมวดทางหลวงยะรัง", phone: "073-349041 ต่อ 104" },
  { id: "SUB_KHOKPHO", name: "หมวดทางหลวงโคกโพธิ์", chief: "นายช่างหัวหน้าหมวดทางหลวงโคกโพธิ์", phone: "073-349041 ต่อ 105" },
  { id: "SUB_SAIBURI", name: "หมวดทางหลวงสายบุรี", chief: "นายช่างหัวหน้าหมวดทางหลวงสายบุรี", phone: "073-349041 ต่อ 106" },
] as const;

export const HIGHWAY_ROUTES = [
  { no: "42", name: "คลองแงะ - จุดผ่านแดนถาวรสุไหงโก-ลก (สายเอเชีย)", isMain: true },
  { no: "43", name: "หาดใหญ่ - ดอนยาง (สายหลัก)", isMain: true },
  { no: "418", name: "ทางเลี่ยงเมืองปัตตานี - ยะลา (สาย 418 ใหม่)", isMain: true },
  { no: "410", name: "ปัตตานี - ยะลา (สายเก่า)", isMain: true },
  { no: "409", name: "ปัตตานี - นาเกตุ - ยะลา", isMain: false },
  { no: "4061", name: "ยะหริ่ง - มายอ", isMain: false },
  { no: "4074", name: "ปะนาเระ - สายบุรี", isMain: false },
  { no: "4092", name: "หนองจิก - โคกโพธิ์", isMain: false },
] as const;

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

export const TRAFFIC_STATUS = {
  CLOSED: {
    code: "CLOSED",
    label: "รถเล็กผ่านไม่ได้ / ปิดการจราจรเด็ดขาด",
    shortLabel: "ผ่านไม่ได้ (ปิดการจราจร)",
    colorHex: "#dc2626",
    badgeClass: "bg-red-900/40 text-red-300 border border-red-500",
    dotClass: "bg-red-600 animate-ping",
  },
  WARNING: {
    code: "WARNING",
    label: "เฝ้าระวัง / น้ำท่วมผิวทาง / ผ่านได้ 1 ช่องทาง",
    shortLabel: "เฝ้าระวัง (ผ่านได้ 1 ช่องทาง)",
    colorHex: "#d97706",
    badgeClass: "bg-amber-900/40 text-amber-300 border border-amber-500",
    dotClass: "bg-amber-500",
  },
  PASSABLE: {
    code: "PASSABLE",
    label: "สถานการณ์คลี่คลาย / ระดับน้ำลดลง / ผ่านได้ปกติ",
    shortLabel: "ผ่านได้ปกติ",
    colorHex: "#059669",
    badgeClass: "bg-emerald-900/40 text-emerald-300 border border-emerald-500",
    dotClass: "bg-emerald-500",
  },
} as const;

export const SAFETY_MEASURES = [
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
  animation: "none" | "chaser" | "arrows" | "pulse" | "blink";
  animationSpeed?: "slow" | "normal" | "fast";
}

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
    animation: "pulse",
    animationSpeed: "normal",
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
    animation: "chaser",
    animationSpeed: "normal",
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

export const DEFAULT_DOH_OFFICES: DohOfficeLocation[] = [
  {
    id: "OFFICE_HQ",
    name: "แขวงทางหลวงปัตตานี (สำนักงานใหญ่)",
    type: "HEADQUARTERS",
    address: "เลขที่ ๑ ถนนปัตตานีภิรมย์ ต.อาเนาะรู อ.เมือง จ.ปัตตานี ๙๔๐๐๐",
    phone: "073-349041",
    lat: 6.8665,
    lon: 101.2505,
    is_active: true,
  },
  {
    id: "OFFICE_SUB_PT",
    name: "หมวดทางหลวงปัตตานี",
    type: "SUBDIVISION",
    address: "ต.รูสะมิแล อ.เมือง จ.ปัตตานี (ทล.42 กม. 100+000)",
    phone: "073-349041 ต่อ 102",
    lat: 6.852,
    lon: 101.235,
    is_active: true,
  },
  {
    id: "OFFICE_SUB_NJ",
    name: "หมวดทางหลวงหนองจิก",
    type: "SUBDIVISION",
    address: "ต.ดอนยาง อ.หนองจิก จ.ปัตตานี (ทล.43 กม. 53+000)",
    phone: "073-349041 ต่อ 103",
    lat: 6.822,
    lon: 101.185,
    is_active: true,
  },
  {
    id: "OFFICE_SUB_YR",
    name: "หมวดทางหลวงยะรัง",
    type: "SUBDIVISION",
    address: "ต.ยะรัง อ.ยะรัง จ.ปัตตานี (ทล.410 กม. 15+000)",
    phone: "073-349041 ต่อ 104",
    lat: 6.755,
    lon: 101.295,
    is_active: true,
  },
  {
    id: "OFFICE_SUB_KP",
    name: "หมวดทางหลวงโคกโพธิ์",
    type: "SUBDIVISION",
    address: "ต.โคกโพธิ์ อ.โคกโพธิ์ จ.ปัตตานี (ทล.409 กม. 18+500)",
    phone: "073-349041 ต่อ 105",
    lat: 6.728,
    lon: 101.135,
    is_active: true,
  },
  {
    id: "OFFICE_SUB_SB",
    name: "หมวดทางหลวงสายบุรี",
    type: "SUBDIVISION",
    address: "ต.ตะลุบัน อ.สายบุรี จ.ปัตตานี (ทล.42 กม. 140+000)",
    phone: "073-349041 ต่อ 106",
    lat: 6.702,
    lon: 101.615,
    is_active: true,
  },
];
