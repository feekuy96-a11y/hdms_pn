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
  floodRoutes: [
    {
      id: "F-001",
      route_no: "43",
      section_name: "บ่อทอง - ดอนยาง (อ.หนองจิก)",
      km_start: "52+100",
      km_end: "54+800",
      lat_start: 6.7845,
      lon_start: 101.178,
      lat_end: 6.779,
      lon_end: 101.205,
      coordinates_json: [
        [101.178, 6.7845],
        [101.1865, 6.7825],
        [101.195, 6.7808],
        [101.205, 6.779],
      ],
      water_level_cm: 48,
      traffic_status: "CLOSED",
      latest_photo_url: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80",
      is_active: true,
      updated_at: "2026-11-02T10:30:00.000Z",
      district: "หนองจิก",
      subdistrict: "บ่อทอง",
      trend: "RISING",
      detour_advice: "ปิดการจราจรฝั่ง NB เปิดทางเบี่ยงสวนเลนฝั่ง SB กม.84+397 - 85+000 (ระยะทาง 603 ม.)",
    },
    {
      id: "F-002",
      route_no: "418",
      section_name: "ทางเลี่ยงเมืองปัตตานี - ยะหริ่ง",
      km_start: "14+200",
      km_end: "16+000",
      lat_start: 6.842,
      lon_start: 101.242,
      lat_end: 6.8485,
      lon_end: 101.268,
      coordinates_json: [
        [101.242, 6.842],
        [101.251, 6.8442],
        [101.26, 6.8468],
        [101.268, 6.8485],
      ],
      water_level_cm: 25,
      traffic_status: "WARNING",
      latest_photo_url: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80",
      is_active: true,
      updated_at: "2026-11-02T09:15:00.000Z",
      district: "เมืองปัตตานี",
      subdistrict: "รูสะมิแล",
      trend: "STEADY",
      detour_advice: "รถเล็กห้ามผ่าน รถยกสูงสามารถใช้ความระมัดระวังได้",
    },
    {
      id: "F-003",
      route_no: "410",
      section_name: "ปัตตานี - เมาะมาวี (อ.ยะรัง)",
      km_start: "18+400",
      km_end: "19+900",
      lat_start: 6.752,
      lon_start: 101.285,
      lat_end: 6.736,
      lon_end: 101.289,
      coordinates_json: [
        [101.285, 6.752],
        [101.2868, 6.744],
        [101.289, 6.736],
      ],
      water_level_cm: 32,
      traffic_status: "WARNING",
      latest_photo_url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=80",
      is_active: true,
      updated_at: "2026-11-02T08:00:00.000Z",
      district: "ยะรัง",
      subdistrict: "เมาะมาวี",
      trend: "RISING",
      detour_advice: "น้ำเอ่อล้นช่องจราจรซ้าย รถเล็กควรใช้ ทล.4061 (ยะหริ่ง - ปาลัส)",
    },
  ],
  detourRoutes: [
    {
      id: "D-001",
      flood_id_ref: "F-001",
      route_name: "ทางเลี่ยง ทล.42 -> ทล.4092 (สายหนองจิก - โคกโพธิ์)",
      lat_start: 6.7845,
      lon_start: 101.178,
      lat_end: 6.779,
      lon_end: 101.205,
      coordinates_json: [
        [101.178, 6.7845],
        [101.181, 6.802],
        [101.198, 6.804],
        [101.205, 6.779],
      ],
      description: "เลี้ยวซ้ายแยกดอนยาง เข้าสู่ตัวเมืองปัตตานีผ่านสาย 42 เดิม รถทุกชนิดผ่านได้สะดวก",
      is_active: true,
      updated_at: "2026-11-02T10:30:00.000Z",
    },
    {
      id: "D-002",
      flood_id_ref: "F-002",
      route_name: "ทางเลี่ยงเข้า ทล.42 (สายปัตตานี - ยะหริ่ง สายเก่า)",
      lat_start: 6.842,
      lon_start: 101.242,
      lat_end: 6.8485,
      lon_end: 101.268,
      coordinates_json: [
        [101.242, 6.842],
        [101.246, 6.863],
        [101.265, 6.862],
        [101.268, 6.8485],
      ],
      description: "รถเล็กแนะนำใช้ ทล.42 ผ่านหน้า ม.อ.ปัตตานี มุ่งหน้าแยกคลองขุด",
      is_active: true,
      updated_at: "2026-11-02T09:15:00.000Z",
    },
  ],
  timelineUpdates: [
    {
      id: "TL-101",
      flood_id_ref: "F-001",
      reported_at: "2026-11-02T04:30:00.000Z",
      water_level_cm: 28,
      traffic_status: "WARNING",
      latitude: 6.7825,
      longitude: 101.1865,
      photo_url: "",
      reporter_name: "หมวดทางหลวงหนองจิก",
      remark: "น้ำเริ่มเอ่อล้นตลิ่งคลองตุยง",
    },
    {
      id: "TL-102",
      flood_id_ref: "F-001",
      reported_at: "2026-11-02T07:30:00.000Z",
      water_level_cm: 38,
      traffic_status: "WARNING",
      latitude: 6.7825,
      longitude: 101.1865,
      photo_url: "",
      reporter_name: "หมวดทางหลวงหนองจิก",
      remark: "ฝนตกหนักต่อเนื่อง ปิดช่องทางซ้าย",
    },
    {
      id: "TL-103",
      flood_id_ref: "F-001",
      reported_at: "2026-11-02T09:30:00.000Z",
      water_level_cm: 48,
      traffic_status: "CLOSED",
      latitude: 6.7825,
      longitude: 101.1865,
      photo_url: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80",
      reporter_name: "หมวดทางหลวงหนองจิก",
      remark: "งดการจราจรรถเล็ก ติดตั้งป้ายไฟแนะนำทางเลี่ยง",
    },
  ],
  highwayLayers: [
    {
      layer_id: "MAIN_HIGHWAY",
      layer_name: "ทางหลวงแผ่นดินสายหลัก (ทล.42, 43, 418, 410)",
      color_hex: "#1B5E20",
      line_width: 5,
      is_visible: true,
      geojson_data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              route_no: "43",
              route_code: "43",
              section_name: "หาดใหญ่ - ดอนยาง - ปัตตานี",
              km_start: "42+000",
              km_end: "89+000",
              length_km: 47,
              lanes: "๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)",
              surface: "ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)",
              responsible_office: "หมวดทางหลวงหนองจิก",
              speed_limit: "๙๐ กม./ชม. (ทางหลวงแผ่นดินทั่วไป)",
              road_status: "สัญจรได้ตามปกติ",
              remarks: "แนวเส้นทางหลักเชื่อมโยง สงขลา - ปัตตานี",
              is_visible: true,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [101.135, 6.792],
                [101.178, 6.7845],
                [101.242, 6.842],
                [101.285, 6.868],
              ],
            },
          },
          {
            type: "Feature",
            properties: {
              route_no: "418",
              route_code: "418",
              section_name: "ทางเลี่ยงเมืองปัตตานี - ยะลา",
              km_start: "0+000",
              km_end: "35+500",
              length_km: 35.5,
              lanes: "๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)",
              surface: "ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)",
              responsible_office: "หมวดทางหลวงปัตตานี",
              speed_limit: "๙๐ กม./ชม.",
              road_status: "สัญจรได้ตามปกติ",
              remarks: "ถนน 4 เลนเชื่อมตรง ปัตตานี - ยะลา",
              is_visible: true,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [101.255, 6.865],
                [101.285, 6.752],
                [101.292, 6.65],
              ],
            },
          },
          {
            type: "Feature",
            properties: {
              route_no: "42",
              route_code: "42",
              section_name: "ดอนยาง - บานา - สายบุรี",
              km_start: "98+000",
              km_end: "155+000",
              length_km: 57,
              lanes: "๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)",
              surface: "ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)",
              responsible_office: "หมวดทางหลวงสายบุรี",
              speed_limit: "๙๐ กม./ชม.",
              road_status: "สัญจรได้ตามปกติ",
              remarks: "โครงข่ายเชื่อมโยง ปัตตานี - นราธิวาส",
              is_visible: true,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [101.242, 6.842],
                [101.268, 6.8485],
                [101.32, 6.855],
                [101.41, 6.72],
              ],
            },
          },
        ],
      },
    },
    {
      layer_id: "SECOND_HIGHWAY",
      layer_name: "ทางหลวงแผ่นดินสายรอง (ทล.409, 4061, 4074, 4092)",
      color_hex: "#0284c7",
      line_width: 3.5,
      is_visible: true,
      geojson_data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              route_no: "4092",
              route_code: "4092",
              section_name: "หนองจิก - โคกโพธิ์",
              km_start: "0+000",
              km_end: "18+200",
              length_km: 18.2,
              lanes: "๒ ช่องจราจร (สวนทาง)",
              surface: "ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)",
              responsible_office: "หมวดทางหลวงโคกโพธิ์",
              speed_limit: "๘๐ กม./ชม.",
              road_status: "สัญจรได้ตามปกติ",
              remarks: "เส้นทางเลี่ยงสำคัญเมื่อ ทล.43 น้ำท่วม",
              is_visible: true,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [101.178, 6.7845],
                [101.181, 6.802],
                [101.198, 6.804],
                [101.205, 6.779],
              ],
            },
          },
          {
            type: "Feature",
            properties: {
              route_no: "4061",
              route_code: "4061",
              section_name: "ยะหริ่ง - มายอ",
              km_start: "0+000",
              km_end: "22+500",
              length_km: 22.5,
              lanes: "๒ ช่องจราจร (สวนทาง)",
              surface: "ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)",
              responsible_office: "หมวดทางหลวงยะรัง",
              speed_limit: "๘๐ กม./ชม.",
              road_status: "สัญจรได้ตามปกติ",
              remarks: "เชื่อมต่อ อ.ยะหริ่ง สู่ อ.มายอ",
              is_visible: true,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [101.268, 6.8485],
                [101.35, 6.74],
                [101.41, 6.72],
              ],
            },
          },
        ],
      },
    },
  ],
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
};
