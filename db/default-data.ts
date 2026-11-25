/**
 * ข้อมูลเริ่มต้น (DOH Pattani Master Dataset)
 * ครอบคลุม 5 โครงสร้าง: จุดน้ำท่วม, ทางเลี่ยง, ไทม์ไลน์ระดับน้ำ, โครงการผู้ว่าฯ, เลเยอร์ทางหลวง
 */

import {
  DEFAULT_MAP_STYLES,
  DohOfficeLocation,
  MapLineStyleItem,
  APP_CONFIG,
} from "@/lib/constants";
import type { EventDetourLink } from "@/lib/event-detour-links";

export type { DohOfficeLocation, MapLineStyleItem };

export type RoadSide = "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
export type AffectedShoulder = "NONE" | "LEFT" | "RIGHT" | "BOTH" | "AFFECTED" | "UNKNOWN";
export type DetourDirectionMode = "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";

export interface FloodDirectionMeta {
  water_level_known?: boolean;
  carriageway_mode?: "SINGLE" | "DUAL" | "MIXED";
  arrow_direction?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
  safety_measure?: string;
  [key: string]: any;
}

export interface FloodRoute {
  id: string;
  route_no: string;
  section_name: string;
  km_start: string;
  km_end: string;
  lat_start: number;
  lon_start: number;
  lat_end: number;
  lon_end: number;
  coordinates_json: string | [number, number][];
  water_level_cm: number;
  traffic_status: "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";
  latest_photo_url: string;
  is_active: boolean;
  updated_at: string;
  district?: string;
  subdistrict?: string;
  province?: string;
  trend?: "RISING" | "FALLING" | "STEADY";
  diff_cm?: number;
  detour_note?: string;
  detour_advice?: string;
  road_side?: RoadSide;
  affected_lanes?: string;
  affected_shoulder?: AffectedShoulder;
  reporter_name?: string;
  direction_meta?: FloodDirectionMeta;
}

export type DetourPointLocationSource = "MAP" | "MANUAL" | "ROUTE_ENDPOINT";

export interface DetourPointPhoto {
  url?: string;
  caption?: string;
  mediaId?: string;
  lat?: number;
  lon?: number;
  subdistrict?: string;
  district?: string;
  province?: string;
  locationSource?: DetourPointLocationSource;
  resolvedAt?: string;
}

export interface DetourMeta {
  order_index?: number;
  event_orders?: Record<string, number>;
  forward_distance_km?: number;
  reverse_distance_km?: number;
  forward_duration_min?: number;
  reverse_duration_min?: number;
  forward_duration_s?: number;
  reverse_duration_s?: number;
  start_point_photo?: DetourPointPhoto;
  end_point_photo?: DetourPointPhoto;
  is_asymmetric?: boolean;
  closed_road_verified?: boolean;
  arrow_color_forward?: string;
  arrow_color_reverse?: string;
  show_arrows?: boolean;
  google_maps_url_forward?: string;
  google_maps_url_reverse?: string;
  google_maps_url?: string;
  [key: string]: any;
}

export interface DetourRoute {
  id: string;
  flood_id_ref: string | null;
  route_name: string;
  lat_start: number;
  lon_start: number;
  lat_end: number;
  lon_end: number;
  coordinates_json: string | [number, number][];
  reverse_coordinates_json?: string | [number, number][];
  reverse_waypoints_json?: string | [number, number][];
  direction_mode?: DetourDirectionMode;
  geometry_revision?: number;
  detour_meta?: DetourMeta;
  description: string;
  is_active: boolean;
  district?: string;
  subdistrict?: string;
  updated_at: string;
}

export interface TimelineUpdate {
  id: string;
  flood_id_ref: string;
  reported_at: string;
  water_level_cm: number;
  traffic_status: "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";
  latitude: number;
  longitude: number;
  photo_url: string;
  reporter_name: string;
  remark: string;
  road_side?: RoadSide;
  affected_lanes?: string;
  affected_shoulder?: AffectedShoulder;
  direction_meta?: FloodDirectionMeta;
}

export interface MitigationProject {
  project_id: string;
  route_no: string;
  location_name: string;
  km_range: string;
  status_group: "COMPLETED" | "PENDING_BUDGET";
  solution_detail: string;
  budget_mb: number;
  before_image_url: string;
  after_image_url: string;
  updated_at?: string;
}

export interface HighwayLayer {
  layer_id: string;
  layer_name: string;
  color_hex: string;
  line_width: number;
  geojson_data: any;
  is_visible: boolean;
  metadata?: {
    lanes?: string;
    surface?: string;
    responsibleOffice?: string;
    speedLimit?: string;
    roadStatus?: string;
    remarks?: string;
    [key: string]: any;
  };
}

export interface SystemSettingsConfig {
  name: string;
  org: string;
  desc: string;
  phone: string;
  logoUrl?: string;
}

export interface EventSegmentRecord {
  flood_id: string;
  event_id: string;
  event_direction: string;
  segment_position: number;
}

export interface FloodEventVersionRecord {
  id: string;
  link_version: number;
}

export interface SystemDataPayload {
  updatedAt: string;
  floodRoutes: FloodRoute[];
  detourRoutes: DetourRoute[];
  timelineUpdates: TimelineUpdate[];
  mitigationProjects: MitigationProject[];
  highwayLayers: HighwayLayer[];
  offices?: DohOfficeLocation[];
  mapStyles?: Record<"flood" | "detour" | "primary" | "secondary", MapLineStyleItem>;
  systemSettings?: SystemSettingsConfig;
  eventDetourLinks?: EventDetourLink[];
  eventSegments?: EventSegmentRecord[];
  floodEvents?: FloodEventVersionRecord[];
}

export const INITIAL_SYSTEM_DATA: SystemDataPayload = {
  updatedAt: "2026-11-02T03:00:00.000Z",
  offices: [],
  mapStyles: DEFAULT_MAP_STYLES,
  systemSettings: {
    name: APP_CONFIG.TITLE,
    org: APP_CONFIG.ORGANIZATION,
    desc: "ระบบติดตามและรายงานสถานการณ์อุทกภัย เส้นทางน้ำท่วมและทางเลี่ยงแบบเรียลไทม์",
    phone: APP_CONFIG.HOTLINE,
  },
  floodRoutes: [],
  detourRoutes: [],
  timelineUpdates: [],
  highwayLayers: [],
  mitigationProjects: [],
};
