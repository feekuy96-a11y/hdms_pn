import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const enabled = process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_TEST === "1";
const publicEnabled = process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_PUBLIC === "1";
const gpsEnabled = enabled && !publicEnabled && process.env.NEXT_PUBLIC_HDMS_MAP_WEATHER_TEST_GPS === "1";
const endpoint = "https://api.open-meteo.com/v1/forecast?**";
const fixtureHeaders = { "access-control-allow-origin": "*", "access-control-expose-headers": "x-hdms-test-fixture", "x-hdms-test-fixture": "1" };
const forecast = () => ({
  current: { time: Math.floor(Date.now() / 900_000) * 900, interval: 900, precipitation: 2.5, temperature_2m: 29.1, relative_humidity_2m: 60, wind_speed_10m: 11, weather_code: 61 },
});

test("forecast is default-off and never calls the provider in the default build", async ({ page }) => {
  test.skip(enabled || publicEnabled, "Default-off build only");
  const requests: string[] = [];
  await page.route(endpoint, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.goto(`${base}/`);
  await expect(page.getByRole("group", { name: "เครื่องมือแผนที่" })).toBeVisible();
  await expect(page.getByRole("region", { name: "สภาพอากาศปัจจุบันตามพื้นที่" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("weather card requires a separate request, labels the model, and preserves map controls", async ({ page, isMobile }) => {
  test.skip(!enabled || publicEnabled, "Staging weather fixture build only");
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
  test.skip(!gpsEnabled, "Explicit staging GPS test build only");
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
  test.skip(!gpsEnabled, "Explicit staging GPS test build only");
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

test("right placement keeps attribution, controls and navigation clear on standard and short screens", async ({ page, isMobile }) => {
  test.skip(!enabled || publicEnabled, "Staging weather fixture build only");
  await page.route(endpoint, (route) => route.fulfill({ json: forecast(), headers: fixtureHeaders }));
  for (const height of isMobile ? [844, 420] : [900, 500]) {
    const width = isMobile ? 390 : 1440;
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/`);
    const card = page.getByRole("region", { name: "สภาพอากาศปัจจุบันตามพื้นที่" });
    const toggle = card.getByRole("button", { name: "สภาพอากาศ (ทดลอง)" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await card.getByRole("button", { name: /ดูสภาพอากาศ: ปัตตานี/ }).click();
    await expect(card.getByText(/ข้อมูลจำลอง \(ใช้ทดสอบเท่านั้น\)/)).toBeVisible();
    const rect = (await card.boundingBox())!;
    const rightInset = await card.evaluate(node => Number.parseFloat(getComputedStyle(node).right));
    expect(rightInset).toBe(height <= 704 ? 64 : isMobile ? 8 : 12);
    const toggleRect = (await toggle.boundingBox())!;
    expect(toggleRect.x + toggleRect.width / 2).toBeGreaterThan(width / 2);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    const reserved = [
      page.getByRole("group", { name: "เครื่องมือแผนที่" }),
      page.locator(".leaflet-control-attribution"),
    ];
    if (isMobile) reserved.push(page.getByRole("navigation", { name: "เมนูประชาชน" }));
    for (const element of reserved) {
      await expect(element).toBeVisible();
      const b = (await element.boundingBox())!;
      expect(rect.x + rect.width <= b.x || b.x + b.width <= rect.x || rect.y + rect.height <= b.y || b.y + b.height <= rect.y).toBeTruthy();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("decorative motion matches weather, respects reduced motion and stops without usable weather", async ({ page }) => {
  test.skip(!enabled || publicEnabled, "Staging weather fixture build only");
  let code = 61;
  await page.route(endpoint, route => code < 0
    ? route.fulfill({ status: 503 })
    : route.fulfill({ json: { current: { ...forecast().current, weather_code: code } }, headers: fixtureHeaders }));
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "สภาพอากาศ (ทดลอง)" }).click();
  const fetchWeather = page.getByRole("button", { name: /ดูสภาพอากาศ: ปัตตานี/ });
  for (const [weather, kind, label] of [[61, "rain", "มีฝน"], [3, "cloud", "เมฆมาก"], [0, "sun", "ท้องฟ้าแจ่มใส"]] as const) {
    code = weather;
    await fetchWeather.click();
    const icon = page.locator(`[data-weather-motion="${kind}"]`);
    await expect(icon).toHaveCount(1);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    expect(await icon.evaluate(node => node.closest("svg")?.getAttribute("aria-hidden"))).toBe("true");
    expect(await icon.evaluate(node => getComputedStyle(node).animationName)).not.toBe("none");
    expect(await icon.evaluate(node => getComputedStyle(node).animationIterationCount)).not.toBe("infinite");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await icon.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  code = 45;
  await fetchWeather.click();
  await expect(page.getByText("แบบจำลองระบุหมอก", { exact: true })).toBeVisible();
  await expect(page.locator("[data-weather-motion]")).toHaveCount(0);
  code = -1;
  await fetchWeather.click();
  await expect(page.getByText(/โหลดสภาพอากาศไม่ได้/)).toBeVisible();
  await expect(page.locator("[data-weather-motion]")).toHaveCount(0);
});

test("public candidate uses fixed Pattani only, links attribution, and reports stale/unavailable data", async ({ page }) => {
  test.skip(!publicEnabled, "Public candidate build only");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition() { throw new Error("Public card must not access geolocation"); },
    } });
  });
  const requests: URL[] = [];
  await page.route(endpoint, route => {
    requests.push(new URL(route.request().url()));
    if (requests.length === 3) return route.fulfill({ status: 503 });
    const current = forecast().current;
    return route.fulfill({ json: { current: { ...current, time: requests.length === 2 ? current.time - 10_800 : current.time } } });
  });
  await page.goto(`${base}/`);
  const card = page.getByRole("region", { name: "สภาพอากาศปัจจุบันตามพื้นที่" });
  const toggle = card.getByRole("button", { name: "สภาพอากาศ", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  expect(requests).toHaveLength(0);
  await expect(card.getByRole("button", { name: /ใช้ตำแหน่ง/ })).toHaveCount(0);
  const load = card.getByRole("button", { name: /ดูสภาพอากาศ: ปัตตานี/ });
  await load.click();
  await expect(card.getByText("ข้อมูลจากแบบจำลอง", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "Open-Meteo" })).toHaveAttribute("href", "https://open-meteo.com/");
  await expect(card.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
  expect(requests[0].searchParams.get("latitude")).toBe("6.82");
  expect(requests[0].searchParams.get("longitude")).toBe("101.25");
  await load.click();
  await expect(card.getByText(/ไม่มีข้อมูลแบบจำลองล่าสุด/)).toBeVisible();
  await expect(card.getByText("29.1 °C", { exact: true })).toHaveCount(0);
  await load.click();
  await expect(card.getByText(/โหลดสภาพอากาศไม่ได้/)).toBeVisible();
  await expect(card.getByText("29.1 °C", { exact: true })).toHaveCount(0);
});
