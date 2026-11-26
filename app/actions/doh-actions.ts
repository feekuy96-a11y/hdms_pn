import type { SystemDataPayload, MapLineStyleItem, DohOfficeLocation, SystemSettingsConfig } from "@/db/default-data";
import { invokeHdms } from "@/lib/hdms-api";
import type { EventDetourLink, SaveEventDetourLinks } from "@/lib/event-detour-links";

export type ExternalJobStatus = "pending" | "processing" | "done" | "failed";
export type ExternalJobKind = "MEDIA" | "REPORT";
export interface ExternalJobItem {
  id: string;
  kind: ExternalJobKind;
  status: ExternalJobStatus;
  recordId: string;
  attempts: number;
  lastError: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
}
export interface ExternalJobsResult {
  jobs: ExternalJobItem[];
  counts: Record<ExternalJobStatus, number>;
}

export async function getExternalJobsAction(): Promise<ExternalJobsResult> {
  return invokeHdms("getExternalJobsAction", []);
}

export async function retryExternalJobAction(jobId: string): Promise<{ success: boolean }> {
  return invokeHdms("retryExternalJobAction", [jobId]);
}

export async function restoreRouteAction(recordType: "FLOOD" | "DETOUR", id: string) {
  return invokeHdms("restoreRouteAction", [recordType, id]);
}

export async function getDeletedRoutesAction() {
  return invokeHdms("getDeletedRoutesAction", []);
}

export async function snapRouteAction(start: [number, number], end: [number, number]) {
  return invokeHdms("snapRouteAction", [start, end]);
}

export interface GoogleReverseGeocodeResult {
  configured: boolean;
  available: boolean;
  found?: boolean;
  status?: number;
  road?: string;
  village?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  formattedAddress?: string;
  placeId?: string;
}

export interface GoogleRouteStep {
  maneuver: string;
  instructions: string;
  distanceMeters: number;
  durationSeconds: number;
  startLocation: [number, number] | null;
}

export interface GoogleDetourRouteResult {
  configured: boolean;
  available: boolean;
  found?: boolean;
  status?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  encodedPolyline?: string;
  steps?: GoogleRouteStep[];
}

export async function reverseGeocodeGoogleAction(lon: number, lat: number): Promise<GoogleReverseGeocodeResult> {
  return invokeHdms("reverseGeocodeGoogleAction", [lon, lat]);
}

export async function computeGoogleDetourRouteAction(payload: {
  origin: [number, number];
  destination: [number, number];
  intermediates?: [number, number][];
  routingPreference?: "TRAFFIC_UNAWARE" | "TRAFFIC_AWARE";
}): Promise<GoogleDetourRouteResult> {
  return invokeHdms("computeGoogleDetourRouteAction", [payload]);
}

export interface OsrmProxyRouteResult {
  available: boolean;
  found?: boolean;
  status?: number;
  data?: any;
}

export async function proxyOsrmRouteAction(payload: {
  coords: [number, number][];
  overview?: "full" | "simplified" | "false";
  steps?: boolean;
}): Promise<OsrmProxyRouteResult> {
  return invokeHdms("proxyOsrmRouteAction", [payload]);
}

export interface ReverseGeocodeProxyResult {
  available: boolean;
  found?: boolean;
  status?: number;
  address?: Record<string, any>;
}

export async function proxyReverseGeocodeAction(
  lon: number,
  lat: number
): Promise<ReverseGeocodeProxyResult> {
  return invokeHdms("proxyReverseGeocodeAction", [lon, lat]);
}

export async function getSystemDataAction(): Promise<SystemDataPayload> {
  return invokeHdms("getSystemDataAction", []);
}

export type AdminOperationalDataPayload = Pick<
  SystemDataPayload,
  "updatedAt" | "floodRoutes" | "detourRoutes" | "timelineUpdates" | "mitigationProjects" | "eventDetourLinks" | "eventSegments" | "floodEvents"
>;

export type AdminStaticGisDataPayload = Pick<
  SystemDataPayload,
  "updatedAt" | "highwayLayers" | "offices" | "mapStyles" | "systemSettings"
>;

function shouldFallbackToFullAdminAction(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /unknown operation|unexpected action|unsupported action|404/i.test(error.message);
}

/** Phase 2.1: Operational admin data only (omits ~293 KB of static highway GeoJSON/offices/styles). Falls back to full action on older Edge deployments. */
export async function getAdminOperationalDataAction(): Promise<AdminOperationalDataPayload> {
  try {
    return await invokeHdms<AdminOperationalDataPayload>("getAdminOperationalDataAction", []);
  } catch (error) {
    if (!shouldFallbackToFullAdminAction(error)) throw error;
    const full = await getSystemDataAction();
    return {
      updatedAt: full.updatedAt,
      floodRoutes: full.floodRoutes,
      detourRoutes: full.detourRoutes,
      timelineUpdates: full.timelineUpdates,
      mitigationProjects: full.mitigationProjects,
      eventDetourLinks: full.eventDetourLinks,
      eventSegments: full.eventSegments,
      floodEvents: full.floodEvents,
    };
  }
}

/** Phase 2.1: Static GIS & config data (highwayLayers, offices, mapStyles, systemSettings), cached with longer staleTime in Admin. */
export async function getAdminStaticGisDataAction(): Promise<AdminStaticGisDataPayload> {
  try {
    return await invokeHdms<AdminStaticGisDataPayload>("getAdminStaticGisDataAction", []);
  } catch (error) {
    if (!shouldFallbackToFullAdminAction(error)) throw error;
    const full = await getSystemDataAction();
    return {
      updatedAt: full.updatedAt,
      highwayLayers: full.highwayLayers,
      offices: full.offices,
      mapStyles: full.mapStyles,
      systemSettings: full.systemSettings,
    };
  }
}

export interface EventDetourLinksResult {
  eventId: string;
  version: number;
  links: EventDetourLink[];
}

/** Admin-only read: all link states, including Pending and Withdrawn. */
export async function getEventDetourLinksAction(eventId: string): Promise<EventDetourLinksResult> {
  return invokeHdms("getEventDetourLinksAction", [eventId]);
}

/** Atomic replacement backed by optimistic versioning and an idempotency operation ID. */
export async function replaceEventDetourLinksAction(payload: SaveEventDetourLinks): Promise<EventDetourLinksResult> {
  return invokeHdms("replaceEventDetourLinksAction", [payload]);
}

// Public map data: same payload shape, but highway lines are the light
// (simplified) copy and every record is already filtered for public use. Do not
// retry an old Edge Function with the full Admin action: a recoverable error is
// safer than sending Draft/inactive records to a citizen browser.
export async function getPublicSystemDataAction(): Promise<SystemDataPayload> {
  return invokeHdms("getPublicSystemDataAction", []);
}

export async function saveTimelineUpdateAction(payload: {
  /** Stable client-generated key used by offline retries to prevent duplicate reports. */
  clientRequestId?: string;
  floodId: string;
  waterLevelCm: number;
  trafficStatus: "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";
  latitude: number;
  longitude: number;
  reporterName: string;
  remark: string;
  photoUrl?: string;
  roadSide?: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
  affectedLanes?: string;
  affectedShoulder?: "NONE" | "LEFT" | "RIGHT" | "BOTH" | "AFFECTED" | "UNKNOWN";
  directionMeta?: Record<string, any>;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("saveTimelineUpdateAction", [payload]);
}

export async function upsertRouteAction(payload: {
  recordType: "FLOOD" | "DETOUR";
  id?: string;
  linkedDetourCreate?: true;
  routeNo?: string;
  sectionName?: string;
  kmStart?: string;
  kmEnd?: string;
  latStart?: number;
  lonStart?: number;
  latEnd?: number;
  lonEnd?: number;
  coordinates?: [number, number][];
  reverseCoordinates?: [number, number][];
  reverseWaypoints?: [number, number][];
  directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  detourMeta?: Record<string, any>;
  waterLevelCm?: number;
  trafficStatus?: "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";
  latestPhotoUrl?: string;
  photoUrl?: string;
  detourAdvice?: string;
  detourRefId?: string;
  detourName?: string;
  detourDesc?: string;
  isActive?: boolean;
  district?: string;
  subdistrict?: string;
  roadSide?: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
  affectedLanes?: string;
  affectedShoulder?: "NONE" | "LEFT" | "RIGHT" | "BOTH" | "AFFECTED" | "UNKNOWN";
  reporterName?: string;
  directionMeta?: Record<string, any>;
  expectedUpdatedAt?: string;
}): Promise<{ success: boolean; savedId?: string; systemData: SystemDataPayload; detourLinkState?: "LINKED" | "PENDING" }> {
  return invokeHdms("upsertRouteAction", [payload]);
}

export async function uploadExternalMediaAction(payload: {
  dataUrl: string;
  fileName?: string;
  ownerType?: "FLOOD" | "PROJECT" | "DETOUR";
  ownerId?: string;
}): Promise<{ mediaId: string; url: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; sizeBytes: number; provider: "supabase-staging" | "google-drive" }> {
  return invokeHdms("uploadExternalMediaAction", [payload]);
}

export async function deleteExternalMediaAction(mediaId: string): Promise<{ success: boolean }> {
  return invokeHdms("deleteExternalMediaAction", [{ mediaId }]);
}

export async function syncReportingRowAction(payload: {
  recordId: string;
  recordType: "FLOOD" | "DETOUR" | "PROJECT";
  routeNo?: string;
  sectionName?: string;
  status?: string;
  isActive?: boolean;
  updatedAt: string;
}): Promise<{ success: boolean; synced: boolean; queued?: boolean; reason?: string }> {
  return invokeHdms("syncReportingRowAction", [payload]);
}

export async function deleteRouteAction(
  recordType: "FLOOD" | "DETOUR",
  id: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("deleteRouteAction", [recordType, id]);
}

export async function upsertMitigationProjectAction(payload: {
  projectId?: string;
  routeNo: string;
  locationName: string;
  kmRange: string;
  statusGroup: "COMPLETED" | "PENDING_BUDGET";
  solutionDetail: string;
  budgetMb: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("upsertMitigationProjectAction", [payload]);
}

export async function deleteMitigationProjectAction(
  projectId: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("deleteMitigationProjectAction", [projectId]);
}

export async function updateHighwayLayerAction(payload: {
  layerId: string;
  layerName?: string;
  colorHex?: string;
  lineWidth?: number;
  geojsonData?: any;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("updateHighwayLayerAction", [payload]);
}

export async function deleteHighwayLayerAction(
  layerId: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("deleteHighwayLayerAction", [layerId]);
}

export async function setIncidentStatusAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("setIncidentStatusAction", [id, isActive]);
}

export async function toggleDetourStatusAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("toggleDetourStatusAction", [id, isActive]);
}

export async function updateMapStyleAction(
  styles: Record<"flood" | "detour" | "primary" | "secondary", MapLineStyleItem>
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("updateMapStyleAction", [styles]);
}

export async function saveOfficeAction(
  office: DohOfficeLocation
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("saveOfficeAction", [office]);
}

export async function deleteOfficeAction(
  officeId: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("deleteOfficeAction", [officeId]);
}

export async function updateSystemSettingsAction(
  settings: SystemSettingsConfig
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("updateSystemSettingsAction", [settings]);
}
