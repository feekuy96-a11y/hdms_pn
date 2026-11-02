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
  mitigationProjects: [
    {
      project_id: "P-01",
      route_no: "42",
      location_name: "ตอน คลองแงะ - นาประดู่ (จุดที่ 1)",
      km_range: "กม.28+400 - 29+100",
      status_group: "COMPLETED",
      solution_detail: "ก่อสร้างท่อลอดเหลี่ยม Box Culvert 2.40x2.40 ม. 3 ช่อง และยกระดับคันทาง",
      budget_mb: 28.5,
      before_image_url: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80",
      after_image_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80",
    },
    {
      project_id: "P-02",
      route_no: "42",
      location_name: "ตอน ดอนยาง - บานา",
      km_range: "กม.98+200 - 99+500",
      status_group: "COMPLETED",
      solution_detail: "ขยายช่องทางระบายน้ำข้างทางและเสริมผิวแอสฟัลต์คอนกรีต",
      budget_mb: 32.0,
      before_image_url: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80",
      after_image_url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80",
    },
    {
      project_id: "P-03",
      route_no: "418",
      location_name: "ตอน ทางเลี่ยงเมืองปัตตานี (แยกมะพร้าวต้นเดียว)",
      km_range: "กม.11+000 - 12+200",
      status_group: "COMPLETED",
      solution_detail: "ขุดลอกร่องน้ำและวางท่อระบายน้ำ คสล. แถวคู่",
      budget_mb: 19.8,
      before_image_url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80",
      after_image_url: "https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=600&q=80",
    },
    {
      project_id: "P-04",
      route_no: "410",
      location_name: "ตอน ปัตตานี - เมาะมาวี (บ้านปาลัส)",
      km_range: "กม.15+100 - 15+800",
      status_group: "COMPLETED",
      solution_detail: "ยกระดับชั้นทางและปรับปรุงระบบระบายน้ำ 2 ฝั่ง",
      budget_mb: 24.0,
      before_image_url: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80",
      after_image_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80",
    },
    {
      project_id: "P-05",
      route_no: "409",
      location_name: "ตอน นาเกตุ - ยะลา (เขตปัตตานี)",
      km_range: "กม.8+300 - 9+100",
      status_group: "COMPLETED",
      solution_detail: "ก่อสร้างกำแพงกันน้ำกัดเซาะและขยายสะพาน",
      budget_mb: 35.0,
      before_image_url: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80",
      after_image_url: "https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=600&q=80",
    },
    {
      project_id: "P-06",
      route_no: "42",
      location_name: "ตอน บานา - ปะนาเระ (บ้านลางา)",
      km_range: "กม.112+500 - 113+200",
      status_group: "COMPLETED",
      solution_detail: "วาง Box Culvert ระบายน้ำออกสู่ทะเลโดยตรง",
      budget_mb: 27.5,
      before_image_url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80",
      after_image_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80",
    },
    {
      project_id: "P-07",
      route_no: "43",
      location_name: "ตอน บ่อทอง - ดอนยาง (จุดวิกฤตคลองตุยง)",
      km_range: "กม.52+100 - 54+800",
      status_group: "PENDING_BUDGET",
      solution_detail: "ยกระดับคันทางสูง 0.80 ม. พร้อมก่อสร้าง Box Culvert 4 ช่อง",
      budget_mb: 55.0,
      before_image_url: "",
      after_image_url: "",
    },
    {
      project_id: "P-08",
      route_no: "418",
      location_name: "ตอน ทางเลี่ยงเมืองปัตตานี - ยะหริ่ง",
      km_range: "กม.14+200 - 16+000",
      status_group: "PENDING_BUDGET",
      solution_detail: "เพิ่มอาคารระบายน้ำลอดทางหลวงและปรับปรุงผิวจราจร",
      budget_mb: 38.0,
      before_image_url: "",
      after_image_url: "",
    },
    {
      project_id: "P-09",
      route_no: "410",
      location_name: "ตอน เมาะมาวี - เขาตูม",
      km_range: "กม.18+400 - 19+900",
      status_group: "PENDING_BUDGET",
      solution_detail: "ยกระดับผิวจราจรคอนกรีตเสริมเหล็กและขยายท่อลอด",
      budget_mb: 30.0,
      before_image_url: "",
      after_image_url: "",
    },
    {
      project_id: "P-10",
      route_no: "4061",
      location_name: "ตอน ยะหริ่ง - มายอ",
      km_range: "กม.10+200 - 11+500",
      status_group: "PENDING_BUDGET",
      solution_detail: "ก่อสร้างรางระบายน้ำ คสล. และปรับปรุงโครงสร้างชั้นทาง",
      budget_mb: 22.0,
      before_image_url: "",
      after_image_url: "",
    },
  ],
  highwayLayers: [],
};
