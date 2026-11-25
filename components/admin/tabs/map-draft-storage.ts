import type { DetourPointLocationSource } from "@/db/default-data";
import type {
  AreaResolutionStatus,
  DetourPhotoLocationState,
} from "@/components/admin/tabs/useMapRouteFormState";

export const ADMIN_MAP_DRAFT_KEY = "hdms_admin_map_draft_v1";
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

export interface AdminMapDraftSnapshot {
  savedAt: number;
  routeMode: "FLOOD" | "DETOUR";
  routeNo: string;
  kmStart: string;
  kmEnd: string;
  sectionName: string;
  reporterName: string;
  routeWaterLevel: number | string;
  routeStatus: "WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";
  causeAndNote: string;
  villageOrLandmark: string;
  detourRefId: string;
  detourName: string;
  detourDesc: string;
  detourGoogleMapsUrlFwd: string;
  detourGoogleMapsUrlRev: string;
  detourRoadCondition: string;
  detourDurationMinFwd: string;
  detourDurationMinRev: string;
  detourDirectionMode: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  detourStartPhotoUrl: string;
  detourStartPhotoCaption: string;
  detourStartPhotoLocation: DetourPhotoLocationState;
  detourEndPhotoUrl: string;
  detourEndPhotoCaption: string;
  detourEndPhotoLocation: DetourPhotoLocationState;
  saveAsDraft: boolean;
  draftCoordinates: [number, number][];
  draftWaypoints: [number, number][];
  draftReverseCoordinates: [number, number][];
  draftReverseWaypoints: [number, number][];
}

function createEmptyDraftPhotoLocation(): DetourPhotoLocationState {
  return {
    lat: "",
    lon: "",
    subdistrict: "",
    district: "",
    province: "",
    locationSource: undefined,
    resolvedAt: undefined,
    areaStatus: "idle",
  };
}

function sanitizeDraftPhotoLocation(raw: unknown): DetourPhotoLocationState {
  if (!raw || typeof raw !== "object") return createEmptyDraftPhotoLocation();
  const obj = raw as Record<string, unknown>;
  const lat =
    typeof obj.lat === "string"
      ? obj.lat
      : typeof obj.lat === "number" && Number.isFinite(obj.lat)
        ? String(obj.lat)
        : "";
  const lon =
    typeof obj.lon === "string"
      ? obj.lon
      : typeof obj.lon === "number" && Number.isFinite(obj.lon)
        ? String(obj.lon)
        : "";
  const subdistrict = typeof obj.subdistrict === "string" ? obj.subdistrict : "";
  const district = typeof obj.district === "string" ? obj.district : "";
  const province = typeof obj.province === "string" ? obj.province : "";

  const locationSource: DetourPointLocationSource | undefined =
    obj.locationSource === "MAP" ||
    obj.locationSource === "MANUAL" ||
    obj.locationSource === "ROUTE_ENDPOINT"
      ? obj.locationSource
      : undefined;

  const resolvedAt =
    typeof obj.resolvedAt === "string" && obj.resolvedAt.trim()
      ? obj.resolvedAt
      : undefined;

  const hasCoords = Boolean(lat.trim() && lon.trim());
  const hasArea = Boolean(subdistrict.trim() || district.trim());
  let areaStatus: AreaResolutionStatus;
  if (
    obj.areaStatus === "idle" ||
    obj.areaStatus === "resolved" ||
    obj.areaStatus === "not_found"
  ) {
    areaStatus = obj.areaStatus;
  } else {
    // Normalize missing or stale in-flight "resolving" status after reload
    areaStatus = hasArea ? "resolved" : hasCoords ? "not_found" : "idle";
  }

  return {
    lat,
    lon,
    subdistrict,
    district,
    province,
    locationSource,
    resolvedAt,
    areaStatus,
  };
}

function hasDetourPointDraftData(
  url: string,
  caption: string,
  location: DetourPhotoLocationState
): boolean {
  if (url.trim() || caption.trim()) return true;
  return Boolean(
    (location.lat.trim() && location.lon.trim()) ||
    location.subdistrict.trim() ||
    location.district.trim()
  );
}

export function hasMeaningfulAdminMapDraft(snapshot: AdminMapDraftSnapshot): boolean {
  return Boolean(
    snapshot.routeNo.trim() ||
    snapshot.sectionName.trim() ||
    snapshot.kmStart.trim() ||
    snapshot.kmEnd.trim() ||
    snapshot.detourName.trim() ||
    snapshot.detourDesc.trim() ||
    snapshot.causeAndNote.trim() ||
    snapshot.villageOrLandmark.trim() ||
    snapshot.draftCoordinates.length >= 2 ||
    snapshot.draftReverseCoordinates.length >= 2 ||
    hasDetourPointDraftData(
      snapshot.detourStartPhotoUrl,
      snapshot.detourStartPhotoCaption,
      snapshot.detourStartPhotoLocation
    ) ||
    hasDetourPointDraftData(
      snapshot.detourEndPhotoUrl,
      snapshot.detourEndPhotoCaption,
      snapshot.detourEndPhotoLocation
    )
  );
}

export function readAdminMapDraft(): AdminMapDraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_MAP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminMapDraftSnapshot>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "number") {
      window.localStorage.removeItem(ADMIN_MAP_DRAFT_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
      window.localStorage.removeItem(ADMIN_MAP_DRAFT_KEY);
      return null;
    }
    if (parsed.routeMode !== "FLOOD" && parsed.routeMode !== "DETOUR") return null;
    const snapshot: AdminMapDraftSnapshot = {
      savedAt: parsed.savedAt,
      routeMode: parsed.routeMode,
      routeNo: typeof parsed.routeNo === "string" ? parsed.routeNo : "",
      kmStart: typeof parsed.kmStart === "string" ? parsed.kmStart : "",
      kmEnd: typeof parsed.kmEnd === "string" ? parsed.kmEnd : "",
      sectionName: typeof parsed.sectionName === "string" ? parsed.sectionName : "",
      reporterName: typeof parsed.reporterName === "string" ? parsed.reporterName : "",
      routeWaterLevel: typeof parsed.routeWaterLevel === "number" || typeof parsed.routeWaterLevel === "string" ? parsed.routeWaterLevel : "",
      routeStatus:
        parsed.routeStatus === "CLOSED" ||
        parsed.routeStatus === "PASSABLE" ||
        parsed.routeStatus === "LIGHT_VEHICLES_ONLY" ||
        parsed.routeStatus === "ONE_LANE"
          ? parsed.routeStatus
          : "WARNING",
      causeAndNote: typeof parsed.causeAndNote === "string" ? parsed.causeAndNote : "",
      villageOrLandmark: typeof parsed.villageOrLandmark === "string" ? parsed.villageOrLandmark : "",
      detourRefId: typeof parsed.detourRefId === "string" ? parsed.detourRefId : "",
      detourName: typeof parsed.detourName === "string" ? parsed.detourName : "",
      detourDesc: typeof parsed.detourDesc === "string" ? parsed.detourDesc : "",
      detourGoogleMapsUrlFwd: typeof parsed.detourGoogleMapsUrlFwd === "string" ? parsed.detourGoogleMapsUrlFwd : "",
      detourGoogleMapsUrlRev: typeof parsed.detourGoogleMapsUrlRev === "string" ? parsed.detourGoogleMapsUrlRev : "",
      detourRoadCondition: typeof parsed.detourRoadCondition === "string" ? parsed.detourRoadCondition : "",
      detourDurationMinFwd: typeof parsed.detourDurationMinFwd === "string" ? parsed.detourDurationMinFwd : "",
      detourDurationMinRev: typeof parsed.detourDurationMinRev === "string" ? parsed.detourDurationMinRev : "",
      detourDirectionMode:
        parsed.detourDirectionMode === "FORWARD_ONLY" || parsed.detourDirectionMode === "REVERSE_ONLY"
          ? parsed.detourDirectionMode
          : "TWO_WAY",
      detourStartPhotoUrl: typeof parsed.detourStartPhotoUrl === "string" ? parsed.detourStartPhotoUrl : "",
      detourStartPhotoCaption: typeof parsed.detourStartPhotoCaption === "string" ? parsed.detourStartPhotoCaption : "",
      detourStartPhotoLocation: sanitizeDraftPhotoLocation(parsed.detourStartPhotoLocation),
      detourEndPhotoUrl: typeof parsed.detourEndPhotoUrl === "string" ? parsed.detourEndPhotoUrl : "",
      detourEndPhotoCaption: typeof parsed.detourEndPhotoCaption === "string" ? parsed.detourEndPhotoCaption : "",
      detourEndPhotoLocation: sanitizeDraftPhotoLocation(parsed.detourEndPhotoLocation),
      saveAsDraft: Boolean(parsed.saveAsDraft),
      draftCoordinates: Array.isArray(parsed.draftCoordinates) ? parsed.draftCoordinates : [],
      draftWaypoints: Array.isArray(parsed.draftWaypoints) ? parsed.draftWaypoints : [],
      draftReverseCoordinates: Array.isArray(parsed.draftReverseCoordinates) ? parsed.draftReverseCoordinates : [],
      draftReverseWaypoints: Array.isArray(parsed.draftReverseWaypoints) ? parsed.draftReverseWaypoints : [],
    };
    return hasMeaningfulAdminMapDraft(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export function writeAdminMapDraft(snapshot: AdminMapDraftSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADMIN_MAP_DRAFT_KEY, JSON.stringify(snapshot));
  } catch {
    // Fallback when binary data-URL photos exceed localStorage quota so point metadata & text still survive.
    try {
      const compactSnapshot: AdminMapDraftSnapshot = {
        ...snapshot,
        detourStartPhotoUrl: snapshot.detourStartPhotoUrl.startsWith("data:") ? "" : snapshot.detourStartPhotoUrl,
        detourEndPhotoUrl: snapshot.detourEndPhotoUrl.startsWith("data:") ? "" : snapshot.detourEndPhotoUrl,
      };
      window.localStorage.setItem(ADMIN_MAP_DRAFT_KEY, JSON.stringify(compactSnapshot));
    } catch {
      // Ignore storage quota or private browsing restrictions.
    }
  }
}

export function clearAdminMapDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ADMIN_MAP_DRAFT_KEY);
  } catch {
    // Ignore storage access errors.
  }
}
