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
    if (/^={2,}\s*.+?\s*={2,}$/.test(entry)) continue;
    if (/^[-•–]\s*/.test(entry)) notes.push(entry.replace(/^[-•–]\s*/, ""));
    else steps.push(entry.replace(/^\d+[.)]\s*/, ""));
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
  iconType: "start" | "turn_right" | "turn_left" | "straight" | "end";
  title: string;
  detail: string;
  badge: string;
}

export interface DetourTimelinePresentation {
  steps: DetourTimelineStep[];
  totalDistanceKm: number;
  totalDistanceFormatted: string;
  estimatedMinutes: number;
  roadCondition: string;
}

/**
 * แปลงคำแนะนำเส้นทางเป็นไทม์ไลน์ตามภาพ Citizen Detour Modal 100%
 */
export function getDetourTimelinePresentation(
  rawAdvice: string,
  recordedDistanceMeters: number | null = null,
  fallbackDistanceKm: number = 0,
  startLocationHint: string = "",
  endLocationHint: string = "",
  explicitRoadCondition?: string
): DetourTimelinePresentation {
  const { steps: rawSteps, notes } = parseDetourAdvice(rawAdvice);

  // 1. คำนวณระยะทางรวม (กม.)
  let totalDistanceKm = 0;
  if (recordedDistanceMeters && recordedDistanceMeters > 0) {
    totalDistanceKm = recordedDistanceMeters / 1000;
  } else {
    // ลองหาจากข้อความโน้ต
    const distMatch = rawAdvice.match(/รวมระยะทาง(?:เลี่ยง)?:\s*(?:ประมาณ\s*)?([0-9.]+)\s*กม/);
    if (distMatch && !isNaN(parseFloat(distMatch[1]))) {
      totalDistanceKm = parseFloat(distMatch[1]);
    } else if (fallbackDistanceKm > 0) {
      totalDistanceKm = fallbackDistanceKm;
    }
  }

  // 2. คำนวณเวลาเดินทางโดยประมาณ (นาที)
  let estimatedMinutes = 0;
  const durMatch = rawAdvice.match(/ใช้เวลาเดินทางประมาณ\s*([0-9]+)\s*นาที/);
  if (durMatch && !isNaN(parseInt(durMatch[1], 10))) {
    estimatedMinutes = parseInt(durMatch[1], 10);
  } else if (totalDistanceKm > 0) {
    estimatedMinutes = Math.max(1, Math.round((totalDistanceKm / 40) * 60));
  } else {
    estimatedMinutes = 2;
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

  if (rawSteps.length === 0) {
    // กรณีไม่มีบันทึกขั้นตอน สร้างขั้นตอนมาตรฐาน 2 จุด
    steps.push({
      stepNumber: 1,
      iconType: "start",
      title: "จุดเริ่มต้น",
      detail: startLocationHint ? `บริเวณ ${startLocationHint}` : "จุดเริ่มต้นเส้นทางเลี่ยง",
      badge: "กม. 0+000",
    });
    steps.push({
      stepNumber: 2,
      iconType: "turn_right",
      title: "ถึงจุดบรรจบทางหลวงสายหลัก",
      detail: endLocationHint ? `${endLocationHint} สัญจรต่อได้ตามปกติ` : "สัญจรต่อได้ตามปกติ",
      badge: totalDistanceKm > 0 ? `${totalDistanceKm.toFixed(1)} กม.` : "ปลายทาง",
    });
  } else if (rawSteps.length === 1) {
    const single = rawSteps[0];
    steps.push({
      stepNumber: 1,
      iconType: "start",
      title: "จุดเริ่มต้น",
      detail: single.replace(/^จุดเริ่มต้น:\s*/, "") || (startLocationHint ? `บริเวณ ${startLocationHint}` : "จุดเริ่มต้นเส้นทางเลี่ยง"),
      badge: "กม. 0+000",
    });
    steps.push({
      stepNumber: 2,
      iconType: "turn_right",
      title: "ถึงจุดบรรจบทางหลวงสายหลัก",
      detail: endLocationHint ? `${endLocationHint} สัญจรต่อได้ตามปกติ` : "สัญจรต่อได้ตามปกติ",
      badge: totalDistanceKm > 0 ? `${totalDistanceKm.toFixed(1)} กม.` : "ปลายทาง",
    });
  } else {
    // มีตั้งแต่ 2 ขั้นตอนขึ้นไป
    rawSteps.forEach((rawStep, index) => {
      const isFirst = index === 0;
      const isLast = index === rawSteps.length - 1;

      if (isFirst) {
        let detail = rawStep;
        if (/^จุดเริ่มต้น:\s*/.test(detail)) {
          detail = detail.replace(/^จุดเริ่มต้น:\s*/, "");
        }
        steps.push({
          stepNumber: 1,
          iconType: "start",
          title: "จุดเริ่มต้น",
          detail: detail || (startLocationHint ? `บริเวณ ${startLocationHint}` : "จุดเริ่มต้น"),
          badge: "กม. 0+000",
        });
      } else if (isLast) {
        let detail = rawStep;
        if (detail.includes("ถึงจุดบรรจบทางหลวงสายหลัก")) {
          detail = detail.replace(/^(ถึงจุดบรรจบทางหลวงสายหลัก|ถึงจุดบรรจบ)\s*/, "");
        }
        steps.push({
          stepNumber: index + 1,
          iconType: "turn_right",
          title: "ถึงจุดบรรจบทางหลวงสายหลัก",
          detail: detail.trim() || (endLocationHint ? `${endLocationHint} สัญจรต่อได้ตามปกติ` : "สัญจรต่อได้ตามปกติ"),
          badge: totalDistanceKm > 0 ? `${totalDistanceKm.toFixed(1)} กม.` : "ปลายทาง",
        });
      } else {
        // ขั้นตอนตรงกลาง (เลี้ยว/ตรงไป/ผ่านแยก)
        let iconType: DetourTimelineStep["iconType"] = "straight";
        if (rawStep.includes("เลี้ยวขวา")) iconType = "turn_right";
        else if (rawStep.includes("เลี้ยวซ้าย")) iconType = "turn_left";

        // แยก badge ระยะทาง เช่น (ระยะทาง 500 ม.)
        let badge = "";
        let cleanText = rawStep;
        const stepDistMatch = rawStep.match(/\((?:ระยะทาง\s*)?([0-9.]+\s*(?:ม\.|กม\.))\)/);
        if (stepDistMatch) {
          badge = stepDistMatch[1];
          cleanText = rawStep.replace(stepDistMatch[0], "").trim();
        }

        // แยก title กับ detail
        let title = cleanText;
        let detail = "";
        const colonIdx = cleanText.indexOf(":");
        if (colonIdx !== -1) {
          title = cleanText.substring(0, colonIdx).trim();
          detail = cleanText.substring(colonIdx + 1).trim();
        } else {
          // หากไม่มี colon ให้ใช้คำกริยาแรก
          const matchVerb = cleanText.match(/^(ตรงไป|เลี้ยวขวา|เลี้ยวซ้าย|เบี่ยงเข้าสู่|กลับรถ)[^\s]*/);
          if (matchVerb) {
            title = matchVerb[0];
            detail = cleanText.substring(matchVerb[0].length).trim();
          }
        }

        steps.push({
          stepNumber: index + 1,
          iconType,
          title: title || `ขั้นตอนที่ ${index + 1}`,
          detail: detail || cleanText,
          badge: badge || `${index + 1}`,
        });
      }
    });
  }

  return {
    steps,
    totalDistanceKm,
    totalDistanceFormatted: totalDistanceKm.toFixed(1),
    estimatedMinutes,
    roadCondition,
  };
}
