/**
 * ข้อมูลเริ่มต้น (DOH Pattani Master Dataset)
 * ครอบคลุม 5 โครงสร้าง: จุดน้ำท่วม, ทางเลี่ยง, ไทม์ไลน์ระดับน้ำ, โครงการผู้ว่าฯ, เลเยอร์ทางหลวง
 */

import {
  DEFAULT_DOH_OFFICES,
  DEFAULT_MAP_STYLES,
  DohOfficeLocation,
  MapLineStyleItem,
  APP_CONFIG,
} from "@/lib/constants";

export type { DohOfficeLocation, MapLineStyleItem };

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
  traffic_status: "CLOSED" | "WARNING" | "PASSABLE";
  latest_photo_url: string;
  is_active: boolean;
  updated_at: string;
  district?: string;
  subdistrict?: string;
  trend?: "RISING" | "FALLING" | "STEADY";
  diff_cm?: number;
  detour_note?: string;
  detour_advice?: string;
}

export interface DetourRoute {
  id: string;
  flood_id_ref: string;
  route_name: string;
  lat_start: number;
  lon_start: number;
  lat_end: number;
  lon_end: number;
  coordinates_json: string | [number, number][];
  description: string;
  is_active: boolean;
  updated_at: string;
}

export interface TimelineUpdate {
  id: string;
  flood_id_ref: string;
  reported_at: string;
  water_level_cm: number;
  traffic_status: "CLOSED" | "WARNING" | "PASSABLE";
  latitude: number;
  longitude: number;
  photo_url: string;
  reporter_name: string;
  remark: string;
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
}

export const INITIAL_SYSTEM_DATA: SystemDataPayload = {
  updatedAt: "2026-11-02T03:00:00.000Z",
  offices: DEFAULT_DOH_OFFICES,
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
