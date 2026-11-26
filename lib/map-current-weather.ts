export type WeatherCoordinates = { latitude: number; longitude: number };
export type CurrentWeather = {
  timestamp: number; interval: number | null; temperature: number | null;
  humidity: number | null; precipitation: number | null; wind: number | null; code: number | null;
};

export const WEATHER_TEST_ENABLED = process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_TEST === "1";
export const WEATHER_PUBLIC_ENABLED = process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_PUBLIC === "1";
export const WEATHER_GPS_ENABLED = WEATHER_TEST_ENABLED && !WEATHER_PUBLIC_ENABLED &&
  process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_TEST_GPS === "1";
export const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

export function weatherUrl({ latitude, longitude }: WeatherCoordinates) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(2),
    longitude: longitude.toFixed(2),
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    wind_speed_unit: "kmh",
    timeformat: "unixtime",
    timezone: "UTC",
  });
  return `${OPEN_METEO_FORECAST}?${params.toString()}`;
}

export function validWeatherCoordinates({ latitude, longitude }: WeatherCoordinates) {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

const metric = (value: unknown, minimum = 0, maximum = Infinity): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;

export function currentWeather(payload: unknown, nowMs = Date.now()): CurrentWeather | null {
  if (!payload || typeof payload !== "object" || !("current" in payload)) return null;
  const raw = payload.current;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.time !== "number" || !Number.isSafeInteger(record.time)) return null;
  const timestamp = record.time * 1_000;
  if (timestamp < nowMs - 7_200_000 || timestamp > nowMs + 600_000) return null;
  const data = {
    timestamp, interval: metric(record.interval, 1, 3600),
    temperature: metric(record.temperature_2m, -100, 100), humidity: metric(record.relative_humidity_2m, 0, 100),
    precipitation: metric(record.precipitation), wind: metric(record.wind_speed_10m), code: metric(record.weather_code),
  };
  return [data.temperature, data.humidity, data.precipitation, data.wind, data.code].some(v => v !== null) ? data : null;
}

export function thaiWeatherCode(code: number | null): string {
  if (code === 0) return "ท้องฟ้าแจ่มใส";
  if (code === 1 || code === 2) return "มีเมฆบางส่วน";
  if (code === 3) return "เมฆมาก";
  if (code === 45 || code === 48) return "แบบจำลองระบุหมอก";
  if (code !== null && [51, 53, 55, 56, 57].includes(code)) return "ฝนละออง";
  if (code !== null && [61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "มีฝน";
  if (code !== null && [71, 73, 75, 77, 85, 86].includes(code)) return "หิมะ";
  if (code !== null && [95, 96, 99].includes(code)) return "ฝนฟ้าคะนอง";
  return "ไม่ระบุสภาพอากาศ";
}
