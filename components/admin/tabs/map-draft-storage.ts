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
  saveAsDraft: boolean;
  draftCoordinates: [number, number][];
  draftWaypoints: [number, number][];
  draftReverseCoordinates: [number, number][];
  draftReverseWaypoints: [number, number][];
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
    snapshot.draftReverseCoordinates.length >= 2
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
    // Ignore storage quota or private browsing restrictions.
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
