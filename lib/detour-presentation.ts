// Shared presentation logic for detour details.
// Used by BOTH the Leaflet popup (components/map/LongdoGisMap.tsx, HTML string) and the citizen
// detail sheet (app/page.tsx, React) so the two surfaces can never disagree about direction rules,
// advice steps or distance. This file has no React/Leaflet dependency on purpose.

export type DetourDirectionMode = "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
export type DetourDirection = "FORWARD" | "REVERSE";

const VALID_MODES: readonly string[] = ["TWO_WAY", "FORWARD_ONLY", "REVERSE_ONLY"];

/** True only for a direction value that was really recorded. Missing/legacy values are NOT two-way. */
export function isRecordedDetourDirection(mode: unknown): mode is DetourDirectionMode {
  return VALID_MODES.includes(String(mode ?? ""));
}

/** A direction is selectable only when the recorded mode allows it. Unknown mode allows neither. */
export function isDetourDirectionAllowed(mode: unknown, direction: DetourDirection): boolean {
  if (!isRecordedDetourDirection(mode)) return false;
  if (mode === "TWO_WAY") return true;
  return direction === "FORWARD" ? mode === "FORWARD_ONLY" : mode === "REVERSE_ONLY";
}

/** First selectable direction, or null when the record has no confirmed direction. */
export function defaultDetourDirection(mode: unknown): DetourDirection | null {
  if (isDetourDirectionAllowed(mode, "FORWARD")) return "FORWARD";
  if (isDetourDirectionAllowed(mode, "REVERSE")) return "REVERSE";
  return null;
}

export function detourDirectionBadge(mode: unknown): string {
  if (mode === "FORWARD_ONLY") return "A → B";
  if (mode === "REVERSE_ONLY") return "B → A";
  if (mode === "TWO_WAY") return "A ⇄ B";
  return "รอตรวจสอบทิศทาง";
}

/** Detailed badge matching Citizen Detour Modal visual contract */
export function detourDirectionDetailedBadge(mode: unknown): string {
  if (mode === "TWO_WAY") return "ไป-กลับ 2 ทิศทาง (A ⇄ B)";
  if (mode === "FORWARD_ONLY") return "เดินรถทางเดียว (A ➔ B)";
  if (mode === "REVERSE_ONLY") return "เดินรถทางเดียว (B ➔ A)";
  return "รอตรวจสอบทิศทาง";
}

/**
 * Split staff-written advice into numbered steps and side notes.
 * Never invents text: an empty input yields empty arrays.
 */
export function parseDetourAdvice(rawAdvice: string): { steps: string[]; notes: string[] } {
  const advice = (rawAdvice || "").trim();
  if (!advice) return { steps: [], notes: [] };
  const normalized = advice
    .replace(/\s+(?=\d+[.)]\s)/g, "\n")
    .replace(/\s+(?=[-•]\s)/g, "\n");
  const steps: string[] = [];
  const notes: string[] = [];
  for (const entry of normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean)) {
    if (/^={2,}\s*.+?\s*={2,}$/.test(entry) || /^(?:ทิศทาง)?ขา(?:ไป|กลับ)\s*[:：]$/.test(entry)) continue;
    if (/^[-•–]\s*/.test(entry) || /^(?:รวมระยะทาง|สภาพเส้นทาง|หมายเหตุ)/i.test(entry)) {
      notes.push(entry.replace(/^[-•–]\s*/, ""));
    } else {
      steps.push(entry.replace(/^\d+[.)]\s*/, ""));
    }
  }
  return { steps, notes };
}

/** Distance in metres for the chosen direction, only when a real recorded value exists. */
export function detourDistanceMeters(
  meta: { forward_distance_m?: number; forward_distance_km?: number; reverse_distance_m?: number; reverse_distance_km?: number } | null | undefined,
  direction: DetourDirection
): number | null {
  if (!meta) return null;
  const meters = direction === "FORWARD"
    ? meta.forward_distance_m ?? (meta.forward_distance_km != null ? meta.forward_distance_km * 1000 : undefined)
    : meta.reverse_distance_m ?? (meta.reverse_distance_km != null ? meta.reverse_distance_km * 1000 : undefined);
  return typeof meters === "number" && Number.isFinite(meters) && meters > 0 ? meters : null;
}

export function formatDetourDistanceKm(meters: number): string {
  return (meters / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 });
}

export interface DetourTimelineStep {
  stepNumber: number;
  iconType:
    | "start"
    | "turn_right"
    | "turn_left"
    | "slight_left"
    | "slight_right"
    | "uturn"
    | "roundabout"
    | "straight"
    | "instruction"
    | "end";
  title: string;
  detail: string;
  badge: string;
}

export interface DetourTimelinePresentation {
  steps: DetourTimelineStep[];
  totalDistanceKm: number;
  totalDistanceFormatted: string;
  estimatedMinutes: number | null;
  estimatedDurationText: string;
  roadCondition: string;
  directionNotice?: string;
}

function extractStartStepBadge(stepText: string): string {
  const kmMatch = stepText.match(/กม\.?\s*(\d+\+\d{1,3})/);
  return kmMatch ? `กม. ${kmMatch[1]}` : "0 กม.";
}

// Classify the leading instruction, not a road name or another maneuver mentioned later.
// Keep meaningful original wording (e.g. an exit number) in the step's description.
const STEP_PREFIXES: ReadonlyArray<{ prefix: RegExp; iconType: DetourTimelineStep["iconType"]; title?: string }> = [
  { prefix: /^(?:จุดเริ่มต้น|เริ่มต้น)(?=\s|[:：]|ขา(?:ไป|กลับ)|$)/, iconType: "start", title: "จุดเริ่มต้น" },
  { prefix: /^(?:จุดสิ้นสุด|สิ้นสุด(?=\s|[:：]|$)|ถึงจุดบรรจบทางหลวงสายหลัก|ถึงจุดบรรจบ|ถึงจุดหมาย)/, iconType: "end", title: "จุดสิ้นสุด" },
  { prefix: /^(?:สุดทาง[ \t]*)?(?:เลี้ยวซ้าย(?:หักศอก)?|หักซ้าย)/, iconType: "turn_left" },
  { prefix: /^(?:สุดทาง[ \t]*)?(?:เลี้ยวขวา(?:หักศอก)?|หักขวา)/, iconType: "turn_right" },
  { prefix: /^(?:สุดทาง[ \t]*)?(?:กลับรถ|ยูเทิร์น)/i, iconType: "uturn" },
  { prefix: /^(?:เข้าสู่วงเวียน|เมื่อถึงวงเวียน|ผ่านวงเวียน|ออกจากวงเวียน)/, iconType: "roundabout" },
  { prefix: /^(?:เบี่ยงซ้าย|ชิดซ้าย|ใช้ทางออก(?:ทาง)?ซ้าย|แยกซ้าย)/, iconType: "slight_left" },
  { prefix: /^(?:เบี่ยงขวา|ชิดขวา|ใช้ทางออก(?:ทาง)?ขวา|แยกขวา)/, iconType: "slight_right" },
  { prefix: /^(?:ตรงไป(?:ต่อเนื่อง)?|เดินทางต่อไป|ขับตรง(?:ไป)?|มุ่งหน้า)/, iconType: "straight" },
];

export function presentSavedDetourStep(raw: string, stepNumber: number): DetourTimelineStep {
  const distance = raw.match(/\s*\((?:ระยะทาง\s*)?([0-9.]+\s*(?:ม\.|กม\.))\)\s*$/);
  const text = (distance ? raw.slice(0, distance.index) : raw).trim();
  for (const { prefix, iconType, title } of STEP_PREFIXES) {
    const lead = text.match(prefix)?.[0];
    if (!lead) continue;
    let detail = text.slice(lead.length).replace(/^\s*[:：]\s*/, "").trim();
    // For a legacy arrival phrase, keep the original meaning underneath the common title.
    if (iconType === "end" && /^(?:ถึงจุดบรรจบ|ถึงจุดหมาย)/.test(lead)) detail = text;
    return {
      stepNumber,
      iconType,
      title: title || lead,
      detail,
      badge: iconType === "start" ? extractStartStepBadge(raw) :
        iconType === "end" ? "" : distance?.[1] || "",
    };
  }
  const labelled = text.match(/^(คำแนะนำ|ใช้ทางออก|ใช้ทางเชื่อม|เลี้ยว)\s*[:：]\s*(.+)$/);
  return { stepNumber, iconType: "instruction", title: labelled?.[1] || text, detail: labelled?.[2] || "", badge: distance?.[1] || "" };
}

/** Use the same leading labels for machine-generated instructions and the manual form. */
export function formatGeneratedDetourStep(text: string): string {
  const parsed = presentSavedDetourStep(text, 1);
  const sourceTitle = parsed.title;
  if (parsed.iconType === "start" || parsed.iconType === "end") return "";
  if (parsed.iconType === "instruction") {
    if (parsed.detail) return `${sourceTitle}: ${parsed.detail}`;
    return sourceTitle ? `คำแนะนำ: ${sourceTitle}` : "";
  }
  const title = parsed.iconType === "turn_left" ? "เลี้ยวซ้าย" :
    parsed.iconType === "turn_right" ? "เลี้ยวขวา" :
    parsed.iconType === "uturn" ? "กลับรถ" :
    parsed.iconType === "straight" ? "ตรงไป" :
    sourceTitle === "เมื่อถึงวงเวียน" ? "เข้าสู่วงเวียน" :
    sourceTitle;
  const qualifiers = [
    sourceTitle.startsWith("สุดทาง") && "ที่ปลายถนน",
    sourceTitle.includes("หักศอก") && "หักศอก",
    sourceTitle.endsWith("ต่อเนื่อง") && "ต่อเนื่อง",
  ].filter(Boolean);
  const detail = [...qualifiers, parsed.detail].filter(Boolean).join(" ");
  return detail ? `${title}: ${detail}` : title;
}

/** A lone route step covering the whole route should not repeat its total as a step badge. */
export function stepRepeatsRouteTotal(stepMeters: number, totalMeters: number): boolean {
  return stepMeters > 0 && totalMeters > 0 && Math.abs(stepMeters - totalMeters) < 1;
}

/**
 * Duration in seconds for the chosen direction when genuinely recorded in detour_meta.
 */
export function detourDurationSeconds(
  meta: {
    forward_duration_min?: number;
    reverse_duration_min?: number;
    forward_duration_s?: number;
    reverse_duration_s?: number;
  } | null | undefined,
  direction: DetourDirection
): number | null {
  if (!meta) return null;
  const seconds = direction === "FORWARD"
    ? meta.forward_duration_s ?? (meta.forward_duration_min != null ? meta.forward_duration_min * 60 : undefined)
    : meta.reverse_duration_s ?? (meta.reverse_duration_min != null ? meta.reverse_duration_min * 60 : undefined);
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * คำนวณระยะทางรวมตามแนวเส้นทาง GIS (ผลรวมระยะระหว่างจุดดัดทุกคู่ ไม่ใช่เส้นตรง A-B)
 */
export function calculatePolylineRoadDistanceKm(coordinatesJson: unknown): number {
  let coords: unknown = coordinatesJson;
  if (typeof coords === "string") {
    try {
      coords = JSON.parse(coords);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    if (!Array.isArray(p1) || !Array.isArray(p2)) continue;
    const lon1 = Number(p1[0]);
    const lat1 = Number(p1[1]);
    const lon2 = Number(p2[0]);
    const lat2 = Number(p2[1]);
    if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) continue;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Number.isFinite(total) && total > 0 ? Number(total.toFixed(2)) : 0;
}

/**
 * แปลงคำแนะนำเส้นทางเป็นไทม์ไลน์ (ไม่สมมติความเร็วหรือเวลาเดินทางเมื่อไม่มีข้อมูลจริง)
 */
export function getDetourTimelinePresentation(
  rawAdvice: string,
  recordedDistanceMeters: number | null = null,
  fallbackDistanceKm: number = 0,
  startLocationHint: string = "",
  endLocationHint: string = "",
  explicitRoadCondition?: string,
  recordedDurationSeconds: number | null = null
): DetourTimelinePresentation {
  const { steps: rawSteps } = parseDetourAdvice(rawAdvice);

  // 1. คำนวณระยะทางรวม (กม.) — ดึงจากความยาวของเส้นบนแผนที่จริงเป็นหลัก (fallback เมื่อไม่มีพิกัดเส้นเท่านั้น)
  let totalDistanceKm = 0;
  if (fallbackDistanceKm > 0) {
    totalDistanceKm = fallbackDistanceKm;
  } else if (recordedDistanceMeters && recordedDistanceMeters > 0) {
    totalDistanceKm = recordedDistanceMeters / 1000;
  } else {
    const distMatch = rawAdvice.match(/รวมระยะทาง(?:เลี่ยง)?:\s*(?:ประมาณ\s*)?([0-9.]+)\s*กม/);
    if (distMatch && !isNaN(parseFloat(distMatch[1]))) {
      totalDistanceKm = parseFloat(distMatch[1]);
    }
  }

  // 2. เวลาเดินทางโดยประมาณ — ใช้ข้อมูลที่แอดมินจัดเก็บจริงใน detour_meta เป็นหลัก ห้ามเดาเวลาเอง
  let estimatedMinutes: number | null = null;
  let estimatedDurationText = "ยังไม่มีข้อมูลเวลาเดินทาง";
  if (recordedDurationSeconds && recordedDurationSeconds > 0) {
    estimatedMinutes = Math.max(1, Math.round(recordedDurationSeconds / 60));
    estimatedDurationText = `เวลาประมาณ ${estimatedMinutes} นาที`;
  } else {
    const durMatch = rawAdvice.match(/ใช้เวลาเดินทาง(?:ประมาณ)?\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)\s*นาที/);
    if (durMatch) {
      const parsedMin = parseInt(durMatch[1], 10);
      if (!isNaN(parsedMin) && parsedMin > 0) {
        estimatedMinutes = parsedMin;
      }
      estimatedDurationText = `เวลาประมาณ ${durMatch[1].replace(/\s+/g, "")} นาที`;
    }
  }

  // 3. วิเคราะห์สภาพเส้นทาง
  let roadCondition = "ผิวทางลาดยาง สัญจรได้ตามปกติ";
  if (explicitRoadCondition && explicitRoadCondition.trim()) {
    roadCondition = explicitRoadCondition.trim();
  } else {
    const condMatch = rawAdvice.match(/สภาพเส้นทาง:\s*([^\n]+)/);
    if (condMatch && condMatch[1].trim()) {
      const c = condMatch[1].trim();
      if (c.includes("ลาดยาง")) {
        roadCondition = "ผิวทางลาดยาง สัญจรได้ตามปกติ";
      } else {
        roadCondition = c;
      }
    }
  }

  // 4. สร้างโครงสร้าง Steps
  const steps: DetourTimelineStep[] = [];
  let directionNotice: string | undefined;

  if (rawSteps.length === 0) {
    steps.push(
      { stepNumber: 1, iconType: "start", title: "จุดเริ่มต้น", detail: startLocationHint, badge: "0 กม." },
      { stepNumber: 2, iconType: "end", title: "จุดสิ้นสุด", detail: endLocationHint, badge: "" }
    );
  } else if (rawSteps.length === 1 && /^(?:เส้นทางเลี่ยงนี้เปิดใช้งานเฉพาะ|ยังไม่มีคำแนะนำ)/.test(rawSteps[0])) {
    directionNotice = rawSteps[0];
  } else {
    rawSteps.forEach((step, index) => {
      // Bare A/B labels in old saved advice identify the two endpoints by their
      // positions within the selected direction, not by a fixed meaning of A/B.
      const isEnd = index === rawSteps.length - 1;
      if (rawSteps.length > 1 && (index === 0 || isEnd) && /^จุด\s*[AB]$/i.test(step)) {
        steps.push({ stepNumber: index + 1, iconType: isEnd ? "end" : "start",
          title: isEnd ? "จุดสิ้นสุด" : "จุดเริ่มต้น", detail: step, badge: isEnd ? "" : "0 กม." });
      } else {
        steps.push(presentSavedDetourStep(step, index + 1));
      }
    });
  }

  const travelSteps = steps.filter(step => step.iconType !== "start" && step.iconType !== "end");
  if (travelSteps.length === 1 && travelSteps[0].badge === `${totalDistanceKm.toFixed(1)} กม.`) travelSteps[0].badge = "";

  return {
    steps,
    totalDistanceKm,
    totalDistanceFormatted: totalDistanceKm > 0 ? totalDistanceKm.toFixed(1) : "0.0",
    estimatedMinutes,
    estimatedDurationText,
    roadCondition,
    ...(directionNotice ? { directionNotice } : {}),
  };
}

/**
 * สร้างคำแนะนำเส้นทางแบบสั้นสำหรับ Accordion สถานะพับ โดยอ้างอิงเฉพาะข้อมูลที่บันทึกจริง (ไม่แต่งชื่อถนน/สถานที่ขึ้นเอง)
 */
export function getDetourShortSummary(rawAdvice: string): string {
  const { steps, notes } = parseDetourAdvice(rawAdvice);
  const isHeaderOrMeta = (line: string) =>
    /^(?:รวมระยะทาง|สภาพเส้นทาง|={2,}|(?:ทิศทาง)?(?:ขาไป|ขากลับ)(?:\s*\([^)]*\))?:?\s*$)/i.test(line.trim());
  const cleanSteps = steps.filter((s) => !isHeaderOrMeta(s));
  if (cleanSteps.length > 0) {
    if (cleanSteps.length >= 2) {
      const start = cleanSteps[0].replace(/^จุดเริ่มต้น:\s*/i, "").trim();
      const end = cleanSteps[cleanSteps.length - 1]
        .replace(/^(?:ถึงจุดบรรจบทางหลวงสายหลัก|ถึงจุดบรรจบ)\s*/i, "")
        .replace(/\s*สัญจรต่อได้ตามปกติ\s*$/i, "")
        .trim();
      if (start && end && start !== end) {
        return `${start} ➔ ${end}`;
      }
    }
    return cleanSteps[0].replace(/^จุดเริ่มต้น:\s*/i, "").trim();
  }
  const cleanNote = notes.find((n) => !isHeaderOrMeta(n));
  if (cleanNote) return cleanNote.replace(/^จุดเริ่มต้น:\s*/i, "").trim();
  const trimmed = (rawAdvice || "").trim();
  if (trimmed) {
    const candidate = trimmed
      .split(/\r?\n/)
      .map((line) => line.replace(/^={2,}\s*|\s*={2,}$/g, "").trim())
      .find((line) => line && !isHeaderOrMeta(line));
    if (candidate) {
      return candidate.replace(/^จุดเริ่มต้น:\s*/i, "").trim();
    }
  }
  return "กดขยายเพื่อดูรายละเอียดและเส้นทางแนะนำ";
}

/**
 * อ่านค่าลำดับทางเลี่ยงที่ผูกกับเหตุการณ์ (รองรับ event_orders รายเหตุการณ์ และ order_index ทั่วไป)
 */
export function getDetourOrderIndex(
  detour: { detour_meta?: Record<string, any> | null } | null | undefined,
  floodId?: string | null
): number {
  const meta = detour?.detour_meta;
  if (meta && typeof meta === "object") {
    if (floodId && meta.event_orders && typeof meta.event_orders === "object") {
      const perEvent = Number(meta.event_orders[floodId]);
      if (Number.isFinite(perEvent)) return perEvent;
    }
    const orderVal = Number(meta.order_index);
    if (Number.isFinite(orderVal)) return orderVal;
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * เรียงลำดับทางเลี่ยงตามลำดับที่เจ้าหน้าที่กำหนด (ค่าที่ยังไม่มี order_index จะคงลำดับเดิมต่อท้าย)
 */
export function sortDetoursByOrder<T extends { id: string; detour_meta?: Record<string, any> | null }>(
  detours: T[],
  floodId?: string | null
): T[] {
  return [...detours]
    .map((item, originalIdx) => ({
      item,
      order: getDetourOrderIndex(item, floodId),
      originalIdx,
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.originalIdx - b.originalIdx;
    })
    .map((entry) => entry.item);
}
