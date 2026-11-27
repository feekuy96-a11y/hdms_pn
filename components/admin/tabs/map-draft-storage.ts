import type { DetourPhotoLocationState } from "@/components/admin/tabs/useMapRouteFormState";

// Unsaved work stays in the current page and never falls back to browser storage.
let currentPageDraft: AdminMapDraftSnapshot | null = null;

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
  carriagewayChoice?: "" | "SHARED" | "DIVIDED";
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
  return typeof window !== "undefined" && currentPageDraft ? structuredClone(currentPageDraft) : null;
}

export function writeAdminMapDraft(snapshot: AdminMapDraftSnapshot): void {
  if (typeof window !== "undefined") currentPageDraft = structuredClone(snapshot);
}

export function clearAdminMapDraft(): void {
  if (typeof window !== "undefined") currentPageDraft = null;
}
