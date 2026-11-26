"use client";

import { CloudRain } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { APP_CONFIG } from "@/lib/constants";
import { currentWeather, weatherUrl, thaiWeatherCode, validWeatherCoordinates, type WeatherCoordinates, type CurrentWeather } from "@/lib/map-current-weather";

const thaiDateTime = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pattani = { latitude: APP_CONFIG.DEFAULT_CENTER.lat, longitude: APP_CONFIG.DEFAULT_CENTER.lon };
type ForecastState =
  | { type: "idle" | "locating" | "loading" | "error" | "empty" }
  | { type: "ready"; current: CurrentWeather; label: string; fixture: boolean };

export function MapCurrentWeatherCard({ focusCoordinates }: {
  focusCoordinates: [number, number] | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ForecastState>({ type: "idle" });
  const [locationNote, setLocationNote] = useState("");
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const regionId = useId();
  const focusLongitude = focusCoordinates?.[0];
  const focusLatitude = focusCoordinates?.[1];
  const selected = { latitude: focusLatitude ?? NaN, longitude: focusLongitude ?? NaN };
  const hasFocus = validWeatherCoordinates(selected) && (selected.latitude !== 0 || selected.longitude !== 0);
  const fallback = hasFocus ? selected : pattani;
  const fallbackLabel = hasFocus ? "พื้นที่ที่เลือกบนแผนที่" : "ปัตตานี (ค่าเริ่มต้น)";

  useEffect(() => () => {
    sequence.current += 1;
    active.current?.abort();
  }, []);
  function begin() {
    active.current?.abort();
    setLocationNote("");
    return ++sequence.current;
  }

  async function load(point: WeatherCoordinates, label: string, id: number) {
    if (id !== sequence.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ type: "loading" });
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(weatherUrl(point), { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (controller.signal.aborted || !response.ok) throw new Error("forecast unavailable");
      const current = currentWeather(await response.json());
      if (id !== sequence.current) return;
      setState(current
        ? { type: "ready", current, label, fixture: response.headers.get("x-hdms-test-fixture") === "1" }
        : { type: "empty" });
    } catch {
      if (id === sequence.current) setState({ type: "error" });
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }

  function locate() {
    const id = begin();
    const requestFallback = () => {
      if (id !== sequence.current) return;
      setLocationNote("ไม่สามารถใช้ตำแหน่งของคุณได้ จึงใช้พื้นที่เริ่มต้นแทน");
      void load(fallback, fallbackLabel, id);
    };
    if (!navigator.geolocation) { requestFallback(); return; }
    setState({ type: "locating" });
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (validWeatherCoordinates(coords)) void load(coords, "บริเวณตำแหน่งของคุณ", id);
      else requestFallback();
    }, requestFallback, { enableHighAccuracy: false, timeout: 6_000, maximumAge: 0 });
  }

  return (
    <section aria-label="สภาพอากาศปัจจุบันตามพื้นที่" className="absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] left-2 z-[440] flex max-h-[60%] w-max max-w-[calc(100%-4rem)] flex-col items-start gap-1 lg:bottom-3 lg:left-3">
      {open && (
        <div id={regionId} className="hdms-map-control max-h-[42dvh] w-[18rem] max-w-full overflow-y-auto overscroll-contain rounded-xl border px-3 py-2 text-xs shadow-lg">
          <h3 className="text-sm font-bold">สภาพอากาศปัจจุบันตามพื้นที่</h3>
          <p className="mb-2">ใช้ประกอบการดูแผนที่ ไม่ใช่ค่าที่ตรวจวัดหรือประกาศเตือนภัย</p>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => void load(fallback, fallbackLabel, begin())} className="hdms-map-control min-h-9 rounded-md border px-2">ดูสภาพอากาศ: {fallbackLabel}</button>
            <button type="button" onClick={locate} className="hdms-map-control min-h-9 rounded-md border px-2">ใช้ตำแหน่งของฉัน</button>
          </div>
          <p className="my-1">เมื่อกดใช้ตำแหน่ง พิกัดโดยประมาณจะถูกส่งให้ Open-Meteo โดย HDMS ไม่บันทึกพิกัดนี้</p>
          <div role="status">
            {locationNote && <p>{locationNote}</p>}
            {state.type === "locating" && <p>กำลังขอตำแหน่ง…</p>}
            {state.type === "loading" && <p>กำลังโหลดสภาพอากาศ…</p>}
            {state.type === "error" && <p>โหลดสภาพอากาศไม่ได้ กรุณาลองใหม่</p>}
            {state.type === "empty" && <p>ไม่มีข้อมูลแบบจำลองล่าสุดสำหรับพื้นที่นี้</p>}
          </div>
          {state.type === "ready" && (
            <>
              <p className="mt-2 font-semibold">{state.label}</p>
              <p className="font-semibold">{state.fixture ? "ข้อมูลจำลอง (ใช้ทดสอบเท่านั้น)" : "ข้อมูลจากแบบจำลอง"}</p>
              <p>{state.fixture ? "เวลาข้อมูลจำลอง " : "เวลาแบบจำลอง "}<time dateTime={new Date(state.current.timestamp).toISOString()}>{thaiDateTime.format(state.current.timestamp)} น.</time> (เวลาไทย)</p>
              <p className="my-1 font-semibold">{thaiWeatherCode(state.current.code)}</p>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div><dt>อุณหภูมิ</dt><dd className="font-semibold">{state.current.temperature === null ? "–" : `${state.current.temperature} °C`}</dd></div>
                <div><dt>ความชื้น</dt><dd className="font-semibold">{state.current.humidity === null ? "–" : `${state.current.humidity}%`}</dd></div>
                <div><dt>หยาดน้ำฟ้า{state.current.interval ? ` (${Math.round(state.current.interval / 60)} นาที)` : ""}</dt><dd className="font-semibold">{state.current.precipitation === null ? "–" : `${state.current.precipitation} มม.`}</dd></div>
                <div><dt>ความเร็วลม</dt><dd className="font-semibold">{state.current.wind === null ? "–" : `${state.current.wind} กม./ชม.`}</dd></div>
              </dl>
            </>
          )}
          {state.type === "ready" && state.fixture ? <p className="mt-2">แหล่งข้อมูล: ชุดข้อมูลทดสอบของ HDMS</p> : <p className="mt-2">แหล่งข้อมูล: <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0)</p>}
        </div>
      )}
      <button type="button" aria-expanded={open} aria-controls={open ? regionId : undefined} className="hdms-map-control flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold shadow-lg" onClick={() => {
        if (open) { begin(); setState({ type: "idle" }); }
        setOpen(!open);
      }}><CloudRain size={16} aria-hidden="true" />สภาพอากาศ (ทดลอง)</button>
    </section>
  );
}
