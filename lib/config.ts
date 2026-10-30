/**
 * ค่าเชื่อมต่อ — เก็บไว้ใน Git ได้
 *  • Supabase anon key เป็น "public key" โดยออกแบบ (ความปลอดภัยอยู่ที่ RLS/RPC ใน 001_schema.sql)
 *  • ห้ามนำ service_role key มาใส่ที่นี่เด็ดขาด
 *  • Longdo key ผูกกับโดเมน: เพิ่ม <user>.github.io และ localhost ใน Longdo Console
 * ต้องการเปลี่ยนค่าโดยไม่แก้โค้ด ให้ตั้ง NEXT_PUBLIC_* ตอน build
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ebyobrtvisylwawxiurx.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVieW9icnR2aXN5bHdhd3hpdXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzA0OTgsImV4cCI6MjEwODc0NjQ5OH0.aDMnfQk3GG6TFWp5xpKyZekQ2nxT8mLfGtUawpLVrAo";

export const LONGDO_KEY = process.env.NEXT_PUBLIC_LONGDO_KEY || "f5838f4ecb48ed60d79e6f93d52e5a9a";

export const MAP_DEFAULT = { lon: 101.25, lat: 6.87, zoom: 10 };

export const COLORS = {
  navy: "#0B2A5B",
  navyDark: "#071B3D",
  yellow: "#FBC02D",
  main: "#1B5E20",
  sub: "#81C784",
  flood: "#D32F2F",
};
