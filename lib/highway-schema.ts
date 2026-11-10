/**
 * =============================================================================
 * DOH Pattani Highway Network Schema & Parent-Child Management (Phase 1)
 * แขวงทางหลวงปัตตานี กรมทางหลวง กระทรวงคมนาคม
 * =============================================================================
 * โครงสร้างข้อมูลสายทางแบบลำดับชั้น:
 * ทางหลวง (Highway) → ตอนควบคุมหลัก (Parent Control Section) → เส้นทางแยกตามทิศทาง/ทางขนาน (Child Branches)
 * - คันทางหลัก A → B (ตามหลัก กม.)
 * - คันทางหลัก B → A (ย้อนหลัก กม.)
 * - ทางคู่ขนาน / ทางบริการ (Frontage / Parallel / Service Roads)
 * - จุดสอบเทียบหลักกิโลเมตรจริง (KM Calibration Points)
 */

export type HighwayBranchType =
  | "MAIN_CARRIAGEWAY" // คันทางหลัก
  | "FRONTAGE_ROAD"    // ทางคู่ขนาน / ทางบริการ
  | "PARALLEL_ROAD"    // ทางขนานอิสระ
  | "RAMP";            // ทางเชื่อม / ทางลาด

export type HighwayDirectionCode =
  | "A_TO_B" // ตามหลักกิโลเมตร (ขาไป A -> B)
  | "B_TO_A" // ย้อนหลักกิโลเมตร (ขากลับ B -> A)
  | "BOTH";  // ถนนคันทางเดี่ยว ๒ ทิศทางสวนกัน (Two-way single centerline)

export interface KmCalibrationPoint {
  id: string;
  km: string; // เช่น "12+500"
  meters: number; // 12500
  coord: [number, number]; // [lon, lat]
  label?: string; // เช่น "ป้ายหลัก กม. 12+500 หน้า รร."
  verified_at?: string;
}

export interface HighwayFeatureProperties {
  feature_id: string; // Stable ID ประจำเส้นย่อย (ไม่เปลี่ยนตาม array index)
  section_group_id: string; // Parent ID ตอนควบคุมหลัก
  branch_type: HighwayBranchType;
  direction_code: HighwayDirectionCode;
  branch_label: string;
  route_no: string;
  route_code?: string;
  section_name: string;
  route_name?: string;
  km_start: string;
  km_end: string;
  length_km?: number | string;
  geometric_length_km?: number;
  responsible_office?: string;
  highway_type?: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
  lanes?: string;
  surface?: string;
  remarks?: string;
  is_visible?: boolean;
  carriageway_type?: "SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY";
  arrow_direction?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
  show_arrows?: boolean;
  direction_verified?: boolean;
  km_calibration?: KmCalibrationPoint[];
  [key: string]: any;
}

export interface HighwayBranchItem {
  featureIdx: number;
  featureId: string;
  sectionGroupId: string;
  branchType: HighwayBranchType;
  directionCode: HighwayDirectionCode;
  branchLabel: string;
  coordinates: [number, number][];
  properties: HighwayFeatureProperties;
  geometricLengthKm: number;
  kmDistanceKm: number;
  isOrientationReversed: boolean;
}

export interface HighwaySectionGroup {
  groupId: string;
  layerId: string;
  layerName: string;
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  lengthKm: string;
  geometricLengthKm: number;
  responsibleOffice: string;
  highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
  lanes: string;
  surface: string;
  remarks: string;
  isVisible: boolean;
  branches: HighwayBranchItem[];
  primaryBranch: HighwayBranchItem;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * คำนวณระยะทาง Haversine ระหว่างสองจุดพิกัด (เมตร)
 */
export function haversineDistanceMeters(p1: [number, number], p2: [number, number]): number {
  const dLat = toRad(p2[1] - p1[1]);
  const dLon = toRad(p2[0] - p1[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1[1])) * Math.cos(toRad(p2[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * คำนวณความยาวรวมของแนวเส้น Geometry (กิโลเมตร)
 */
export function calculateGeodesicLengthKm(coords: [number, number][]): number {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < coords.length; i++) {
    meters += haversineDistanceMeters(coords[i - 1], coords[i]);
  }
  return Number((meters / 1000).toFixed(3));
}

/**
 * แปลงข้อความหลักกิโลเมตร เช่น "12+500" หรือ "12.5" เป็นระยะเมตร (12500)
 */
export function parseKmPostMeters(value: unknown): number | null {
  const raw = String(value ?? "").replace(/กม\.?/gi, "").replace(/,/g, "").trim();
  if (!raw || raw === "-") return null;
  const match = raw.match(/^(\d+)\s*\+\s*(\d{1,3})$/);
  if (match) return Number(match[1]) * 1000 + Number(match[2]);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.round(Number.isInteger(numeric) && numeric >= 1000 ? numeric : numeric * 1000) : null;
}

/**
 * จัดรูปแบบระยะเมตรเป็นข้อความหลัก กม. มาตรฐาน เช่น 12500 -> "12+500"
 */
export function formatKmPostString(value: unknown): string {
  const meters = parseKmPostMeters(value);
  if (meters === null) return "";
  return `${Math.floor(meters / 1000)}+${String(meters % 1000).padStart(3, "0")}`;
}

/**
 * คำนวณระยะห่างระหว่างหลักกิโลเมตรเริ่มต้นและสิ้นสุด (กิโลเมตร)
 */
export function calculateKmDistanceKm(start: unknown, end: unknown): string {
  const s = parseKmPostMeters(start);
  const e = parseKmPostMeters(end);
  return s === null || e === null ? "" : (Math.abs(e - s) / 1000).toFixed(3);
}

/**
 * สร้าง Stable Section Group ID (สำหรับจัดกลุ่ม Parent Control Section)
 */
export function generateSectionGroupId(
  layerId: string,
  routeNo: string,
  sectionName: string,
  kmStart?: string,
  kmEnd?: string
): string {
  const cleanRoute = String(routeNo || "").replace(/^ทล\.?/i, "").trim().replace(/\s+/g, "");
  const cleanSection = String(sectionName || "")
    .replace(/\s*\(ขาไป.*\)|\s*\(ขากลับ.*\)|\s*\(ส่วนที่.*\)|\s*\(ทางขนาน.*\)/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const sKm = formatKmPostString(kmStart);
  const eKm = formatKmPostString(kmEnd);
  const kmPart = sKm && eKm ? `_${sKm}-${eKm}` : "";
  return `SEC_${cleanRoute || "HWY"}_${cleanSection || "LINE"}${kmPart}`;
}

/**
 * สร้าง Stable Feature ID สำหรับแต่ละเส้นย่อย
 */
export function generateStableFeatureId(
  sectionGroupId: string,
  branchType: HighwayBranchType,
  directionCode: HighwayDirectionCode,
  idx: number = 0
): string {
  return `${sectionGroupId}_${branchType}_${directionCode}_${idx}`;
}

/**
 * ปรับปรุงและเติมเต็มคุณสมบัติมาตรฐาน Parent-Child ให้กับ Feature
 */
export function normalizeHighwayFeature(
  feature: any,
  layerId: string,
  featureIdx: number
): { feature: any; isModified: boolean } {
  if (!feature || typeof feature !== "object") return { feature, isModified: false };
  const props = { ...(feature.properties || {}) };
  let isModified = false;

  const routeNo = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || `${featureIdx + 1}`;
  const sectionName = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || "สายทาง";
  const kmStart = props.km_start || "";
  const kmEnd = props.km_end || "";

  // 1. Group ID
  if (!props.section_group_id) {
    props.section_group_id = generateSectionGroupId(layerId, routeNo, sectionName, kmStart, kmEnd);
    isModified = true;
  }

  // 2. Direction Code
  if (!props.direction_code) {
    const sName = String(sectionName).toLowerCase();
    if (sName.includes("ขากลับ") || sName.includes("b→a") || sName.includes("b->a")) {
      props.direction_code = "B_TO_A";
    } else if (sName.includes("ขาไป") || sName.includes("a→b") || sName.includes("a->b")) {
      props.direction_code = "A_TO_B";
    } else if (props.carriageway_type === "DUAL_CARRIAGEWAY") {
      props.direction_code = "A_TO_B";
    } else {
      props.direction_code = "BOTH";
    }
    isModified = true;
  }

  // 3. Branch Type
  if (!props.branch_type) {
    const sName = String(sectionName).toLowerCase();
    if (sName.includes("ทางขนาน") || sName.includes("frontage") || sName.includes("service road")) {
      props.branch_type = "FRONTAGE_ROAD";
    } else {
      props.branch_type = "MAIN_CARRIAGEWAY";
    }
    isModified = true;
  }

  // 4. Branch Label
  if (!props.branch_label) {
    if (props.branch_type === "FRONTAGE_ROAD") {
      props.branch_label = props.direction_code === "B_TO_A" ? "ทางขนานฝั่งขวา (B → A)" : "ทางขนานฝั่งซ้าย (A → B)";
    } else if (props.direction_code === "A_TO_B") {
      props.branch_label = "คันทางหลัก ขาไป (A → B)";
    } else if (props.direction_code === "B_TO_A") {
      props.branch_label = "คันทางหลัก ขากลับ (B → A)";
    } else {
      props.branch_label = "คันทางเดี่ยว ๒ ทิศทาง (A ⇄ B)";
    }
    isModified = true;
  }

  // 5. Stable Feature ID
  if (!props.feature_id) {
    props.feature_id = generateStableFeatureId(props.section_group_id, props.branch_type, props.direction_code, featureIdx);
    isModified = true;
  }

  // 6. Geometric length
  const coords: [number, number][] =
    feature.geometry?.type === "LineString"
      ? feature.geometry.coordinates
      : feature.geometry?.type === "MultiLineString"
      ? feature.geometry.coordinates.flat(1)
      : [];
  if (coords.length >= 2 && !props.geometric_length_km) {
    props.geometric_length_km = calculateGeodesicLengthKm(coords);
    isModified = true;
  }

  if (isModified) {
    feature.properties = props;
  }
  return { feature, isModified };
}

/**
 * จัดกลุ่มรายการ Feature ทั้งหมดใน Layer ให้เป็น Parent Control Sections (HighwaySectionGroup)
 */
export function groupHighwayFeatures(highwayLayers: any[]): HighwaySectionGroup[] {
  const groupMap = new Map<string, HighwaySectionGroup>();

  (highwayLayers || []).forEach((layer) => {
    const isSec = layer.layer_id === "SECOND_HIGHWAY";
    const features = layer.geojson_data?.features;
    if (!Array.isArray(features)) return;

    features.forEach((rawFeature: any, idx: number) => {
      const { feature } = normalizeHighwayFeature(rawFeature, layer.layer_id, idx);
      const props: HighwayFeatureProperties = feature.properties || {};
      const groupId = props.section_group_id || `GRP_${layer.layer_id}_${idx}`;

      const coords: [number, number][] =
        feature.geometry?.type === "LineString"
          ? feature.geometry.coordinates
          : feature.geometry?.type === "MultiLineString"
          ? feature.geometry.coordinates.flat(1)
          : [];

      const geoKm = calculateGeodesicLengthKm(coords);
      const kmDistKm = Number(calculateKmDistanceKm(props.km_start, props.km_end)) || 0;

      // Check if coordinates order matches A->B or B->A
      let isOrientationReversed = false;
      if (props.direction_code === "B_TO_A") {
        isOrientationReversed = false; // B->A naturally flows B to A
      }

      const branchItem: HighwayBranchItem = {
        featureIdx: idx,
        featureId: props.feature_id || `FEAT_${idx}`,
        sectionGroupId: groupId,
        branchType: props.branch_type || "MAIN_CARRIAGEWAY",
        directionCode: props.direction_code || "BOTH",
        branchLabel: props.branch_label || "คันทางหลัก",
        coordinates: coords,
        properties: props,
        geometricLengthKm: geoKm,
        kmDistanceKm: kmDistKm,
        isOrientationReversed,
      };

      if (!groupMap.has(groupId)) {
        const baseSection = String(props.section_name || layer.layer_name)
          .replace(/\s*\(ขาไป.*\)|\s*\(ขากลับ.*\)|\s*\(ส่วนที่.*\)|\s*\(ทางขนาน.*\)/g, "")
          .trim();

        groupMap.set(groupId, {
          groupId,
          layerId: layer.layer_id,
          layerName: layer.layer_name,
          routeNo: String(props.route_no || layer.layer_name.match(/\d+/)?.[0] || "-"),
          sectionName: baseSection || "สายทาง",
          kmStart: formatKmPostString(props.km_start) || "-",
          kmEnd: formatKmPostString(props.km_end) || "-",
          lengthKm: calculateKmDistanceKm(props.km_start, props.km_end) || String(props.length_km || "-"),
          geometricLengthKm: geoKm,
          responsibleOffice: props.responsible_office || layer.metadata?.responsibleOffice || "",
          highwayType: props.highway_type || (isSec ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY"),
          lanes: props.lanes || layer.metadata?.lanes || "4 ช่องจราจร",
          surface: props.surface || layer.metadata?.surface || "AC.",
          remarks: props.remarks || layer.metadata?.remarks || "-",
          isVisible: props.is_visible !== false,
          branches: [branchItem],
          primaryBranch: branchItem,
        });
      } else {
        const existing = groupMap.get(groupId)!;
        existing.branches.push(branchItem);
        // Choose primary branch: prefer MAIN_CARRIAGEWAY A_TO_B or BOTH
        if (
          branchItem.branchType === "MAIN_CARRIAGEWAY" &&
          (branchItem.directionCode === "A_TO_B" || branchItem.directionCode === "BOTH")
        ) {
          existing.primaryBranch = branchItem;
        }
      }
    });
  });

  return Array.from(groupMap.values()).sort((a, b) => {
    const aNum = parseInt(a.routeNo, 10);
    const bNum = parseInt(b.routeNo, 10);
    if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    return a.routeNo.localeCompare(b.routeNo, "th", { numeric: true });
  });
}

/**
 * คำนวณหาหลักกิโลเมตรประมาณการจากพิกัดเป้าหมายบนแนวเส้น โดยอิงจุดสอบเทียบ (Calibration Points)
 */
export function interpolateKmFromCoordinate(
  coords: [number, number][],
  targetCoord: [number, number],
  startKmStr: string,
  endKmStr: string,
  calibrations?: KmCalibrationPoint[]
): { estimatedKm: string; estimatedMeters: number; confidence: "CALIBRATED" | "INTERPOLATED" } {
  const startMeters = parseKmPostMeters(startKmStr) ?? 0;
  const endMeters = parseKmPostMeters(endKmStr) ?? startMeters;

  if (coords.length < 2) {
    return { estimatedKm: formatKmPostString(startMeters), estimatedMeters: startMeters, confidence: "INTERPOLATED" };
  }

  // 1. Check exact match with calibration points (within 20 meters)
  if (Array.isArray(calibrations) && calibrations.length > 0) {
    for (const cal of calibrations) {
      if (haversineDistanceMeters(targetCoord, cal.coord) <= 20) {
        return { estimatedKm: formatKmPostString(cal.meters), estimatedMeters: cal.meters, confidence: "CALIBRATED" };
      }
    }
  }

  // 2. Project targetCoord onto polyline
  let totalMeters = 0;
  const segmentLengths: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const len = haversineDistanceMeters(coords[i - 1], coords[i]);
    segmentLengths.push(len);
    totalMeters += len;
  }

  if (totalMeters === 0) {
    return { estimatedKm: formatKmPostString(startMeters), estimatedMeters: startMeters, confidence: "INTERPOLATED" };
  }

  // Find nearest segment
  let minDistance = Infinity;
  let metersAlongPolyline = 0;
  let accumulated = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const segLen = segmentLengths[i];
    if (segLen === 0) continue;

    // Approximate projection ratio
    const d1 = haversineDistanceMeters(targetCoord, p1);
    const d2 = haversineDistanceMeters(targetCoord, p2);
    const ratio = Math.max(0, Math.min(1, (d1 * d1 - d2 * d2 + segLen * segLen) / (2 * segLen * segLen)));
    const segDist = Math.min(d1, d2);

    if (segDist < minDistance) {
      minDistance = segDist;
      metersAlongPolyline = accumulated + ratio * segLen;
    }
    accumulated += segLen;
  }

  const fraction = Math.max(0, Math.min(1, metersAlongPolyline / totalMeters));
  const kmDelta = endMeters - startMeters;
  const calculatedMeters = Math.round(startMeters + fraction * kmDelta);

  return {
    estimatedKm: formatKmPostString(calculatedMeters),
    estimatedMeters: calculatedMeters,
    confidence: "INTERPOLATED",
  };
}

