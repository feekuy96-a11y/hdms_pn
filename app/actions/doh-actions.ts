import type { SystemDataPayload, MapLineStyleItem, DohOfficeLocation, SystemSettingsConfig } from "@/db/default-data";
import { invokeHdms } from "@/lib/hdms-api";

export async function restoreRouteAction(recordType: "FLOOD" | "DETOUR", id: string) {
  return invokeHdms("restoreRouteAction", [recordType, id]);
}

export async function getDeletedRoutesAction() {
  return invokeHdms("getDeletedRoutesAction", []);
}

export async function snapRouteAction(start: [number, number], end: [number, number]) {
  return invokeHdms("snapRouteAction", [start, end]);
}

export async function getSystemDataAction(): Promise<SystemDataPayload> {
  return invokeHdms("getSystemDataAction", []);
}

export async function saveTimelineUpdateAction(payload: {
  floodId: string;
  waterLevelCm: number;
  trafficStatus: "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";
  latitude: number;
  longitude: number;
  reporterName: string;
  remark: string;
  photoUrl?: string;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("saveTimelineUpdateAction", [payload]);
}

export async function upsertRouteAction(payload: {
  recordType: "FLOOD" | "DETOUR";
  id?: string;
  routeNo?: string;
  sectionName?: string;
  kmStart?: string;
  kmEnd?: string;
  latStart?: number;
  lonStart?: number;
  latEnd?: number;
  lonEnd?: number;
  coordinates?: [number, number][];
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
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  return invokeHdms("upsertRouteAction", [payload]);
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
