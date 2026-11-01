import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

export type Trend = "rising" | "falling" | "stable" | "new" | "no_data";
export type Traffic = "open_limited" | "large_vehicle_only" | "closed";

export interface Incident {
  incident_id: string;
  title: string;
  location_name: string | null;
  district: string | null;
  km_start: number | null;
  km_end: number | null;
  status: "active" | "resolved";
  traffic_status: Traffic;
  detour_note: string | null;
  flood_length_m: number | null;
  detour_length_m: number | null;
  is_published: boolean;
  started_at: string;
  route_id: string | null;
  route_code: string | null;
  route_name: string | null;
  latest_level_cm: number | null;
  latest_recorded_at: string | null;
  latest_note: string | null;
  latest_image_paths: string[] | null;
  latest_reported_by: string | null;
  update_count: number;
  previous_level_cm: number | null;
  level_diff_cm: number | null;
  trend: Trend;
  flood_geojson: any;
  detour_geojson: any | null;
  pin_lng: number;
  pin_lat: number;
}

export interface RouteRow {
  id: string;
  route_code: string;
  route_name: string;
  route_type: "primary" | "secondary";
  color: string;
  geojson: any;
  pin_lng: number;
  pin_lat: number;
}

export interface AdminRoute {
  id: string;
  route_code: string;
  route_name: string;
  route_type: "primary" | "secondary";
  is_active: boolean;
  source: string | null;
  length_km: number;
  points: number;
  updated_at: string;
}

export interface Settings {
  system_name: string;
  organization: string;
  description: string | null;
  logo_url: string | null;
  contact_phone: string | null;
  map_style: any;
}

export interface Office {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lng: number;
  lat: number;
  is_active: boolean;
}

export interface HistoryPoint {
  water_level_cm: number;
  recorded_at: string;
  note: string | null;
  reported_by: string | null;
}
