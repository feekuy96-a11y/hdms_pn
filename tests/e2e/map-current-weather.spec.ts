import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const enabled = process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_TEST === "1";
const endpoint = "https://api.open-meteo.com/v1/forecast?**";
const fixtureHeaders = { "access-control-allow-origin": "*", "access-control-expose-headers": "x-hdms-test-fixture", "x-hdms-test-fixture": "1" };
const forecast = () => ({
  current: { time: Math.floor(Date.now() / 900_000) * 900, interval: 900, precipitation: 2.5, temperature_2m: 29.1, relative_humidity_2m: 60, wind_speed_10m: 11, weather_code: 61 },
});

test("forecast is default-off and never calls the provider in the default build", async ({ page }) => {
  test.skip(enabled, "Default-off build only");
  const requests: string[] = [];
  await page.route(endpoint, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.goto(`${base}/`);
  await expect(page.getByRole("group", { name: "เครื่องมือแผนที่" })).toBeVisible();
  await expect(page.getByRole("button", { name: "สภาพอากาศ (ทดลอง)" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("weather card requires a separate request, labels the model, and preserves map controls", async ({ page, isMobile }) => {
  test.skip(!enabled, "Staging weather fixture build only");
  const requests: URL[] = [];
  await page.route(endpoint, (route) => { requests.push(new URL(route.request().url())); return route.fulfill({ json: forecast(), headers: fixtureHeaders }); });
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "สภาพอากาศ (ทดลอง)" }).click();
  expect(requests).toEqual([]);
  const card = page.getByRole("region", { name: "สภาพอากาศปัจจุบันตามพื้นที่" });
  const controls = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  const [a, b] = await Promise.all([card.boundingBox(), controls.boundingBox()]);
  expect(a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)).toBeTruthy();
  if (isMobile) {
    const navigation = await page.getByRole("navigation", { name: "เมนูประชาชน" }).boundingBox();
    expect(a && navigation && a.y + a.height <= navigation.y).toBeTruthy();
  }
  await card.getByRole("button", { name: /ดูสภาพอากาศ: ปัตตานี/ }).click();
  await expect(card.getByText("60%")).toBeVisible();
  await expect(card.getByText(/เวลาข้อมูลจำลอง/)).toBeVisible();
  await expect(card.getByText("ข้อมูลจำลอง (ใช้ทดสอบเท่านั้น)")).toBeVisible();
  await expect(card.getByText(/ชุดข้อมูลทดสอบของ HDMS/)).toBeVisible();
  await expect(card.getByRole("link", { name: "Open-Meteo" })).toHaveCount(0);
  expect(requests[0].searchParams.get("hourly")).toBeNull();
  await expect(card.getByText("2.5 มม.", { exact: true })).toBeVisible();
  await expect(card.getByText("ไม่ใช่ค่าที่ตรวจวัด", { exact: false })).toBeVisible();
  expect(requests[0].searchParams.get("longitude")).toBe("101.25");
  await controls.getByRole("button", { name: "เลเยอร์", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("opt-in GPS denial uses Pattani; stale responses cannot overwrite the newer request", async ({ page }) => {
  test.skip(!enabled, "Staging weather fixture build only");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition(_ok: PositionCallback, error: PositionErrorCallback) { error({ code: 1, message: "test denied" } as GeolocationPositionError); },
    } });
  });
  let count = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(endpoint, async (route) => {
    count += 1;
    if (count === 1) { await pending; await route.fulfill({ status: 503 }).catch(() => {}); }
    else await route.fulfill({ json: forecast(), headers: fixtureHeaders });
  });
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "สภาพอากาศ (ทดลอง)" }).click();
  await page.getByRole("button", { name: "ใช้ตำแหน่งของฉัน" }).click();
  await expect(page.getByText(/ไม่สามารถใช้ตำแหน่งของคุณได้/)).toBeVisible();
  await expect.poll(() => count).toBe(1);
  await page.getByRole("button", { name: /ดูสภาพอากาศ: ปัตตานี/ }).click();
  await expect(page.getByText("60%")).toBeVisible();
  release();
  await expect(page.getByText("60%")).toBeVisible();
  await expect(page.getByText(/โหลดสภาพอากาศไม่ได้/)).toHaveCount(0);
});

test("GPS success is explicitly requested and rounded before sending; failed forecast shows an error", async ({ page }) => {
  test.skip(!enabled, "Staging weather fixture build only");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition(ok: PositionCallback) { ok({ coords: { latitude: 6.82634, longitude: 101.29382 } } as GeolocationPosition); },
    } });
  });
  const requests: URL[] = [];
  await page.route(endpoint, (route) => { requests.push(new URL(route.request().url())); return route.fulfill({ status: 503 }); });
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "สภาพอากาศ (ทดลอง)" }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "ใช้ตำแหน่งของฉัน" }).click();
  await expect(page.getByText(/โหลดสภาพอากาศไม่ได้/)).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get("latitude")).toBe("6.83");
  expect(requests[0].searchParams.get("longitude")).toBe("101.29");
  await expect(page.getByText("29.1 °C")).toHaveCount(0);
});
