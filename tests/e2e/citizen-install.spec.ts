import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const label = "เพิ่มทางลัดแผนที่ลงมือถือ";
const safariUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const shell = { floodRoutes: [], detourRoutes: [], highwayLayers: [], offices: [], timelineUpdates: [], mitigationProjects: [], mapStyles: null };

async function open(page: Page, origin: string, path = "/") {
  await page.route("**/*", r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await page.route("**/functions/v1/hdms-api*", r => r.fulfill({ json: shell }));
  await page.goto(base + path);
  await expect(page.locator(path === "/" ? ".citizen-ui" : "body")).toBeVisible();
}

async function dispatchNativePrompt(page: Page) {
  return page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => { document.documentElement.dataset.installTestInvoked = "yes"; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test("manifest installs the public Pages subpath and ships correctly sized icons, not Admin", async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await open(page, origin);
  const path = base + "/citizen.webmanifest";
  await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute("href", path);
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", base + "/app-icons/hdms-180.png");
  const cdp = await page.context().newCDPSession(page);
  const recognized = await cdp.send("Page.getAppManifest");
  expect(recognized.url).toBe(origin + path);
  expect(recognized.errors).toHaveLength(0);
  const response = await request.get(path);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(new URL(manifest.scope, response.url()).pathname).toBe(base + "/");
  expect(new URL(manifest.start_url, response.url()).pathname).toBe(base + "/");
  expect(manifest.display).toBe("standalone");
  for (const size of [180, 192, 512]) {
    const icon = await request.get(base + "/app-icons/hdms-" + size + ".png");
    expect(icon.ok()).toBe(true);
    const data = await icon.body();
    expect(data.readUInt32BE(16)).toBe(size);
    expect(data.readUInt32BE(20)).toBe(size);
  }
  await page.goto(base + "/admin/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
});

test("only a mobile install event offers a native prompt, user action invokes it, and installed stays hidden", async ({ page, baseURL, isMobile }) => {
  await open(page, new URL(baseURL!).origin);
  const banner = page.getByRole("complementary", { name: label });
  await expect(banner).toHaveCount(0);
  const prevented = await dispatchNativePrompt(page);
  if (!isMobile) {
    expect(prevented).toBe(false);
    await expect(banner).toHaveCount(0);
    return;
  }
  expect(prevented).toBe(true);
  await expect(banner).toBeVisible();
  expect(await page.locator("html").getAttribute("data-install-test-invoked")).toBeNull();
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  await layers.tap();
  await expect(banner).toBeHidden();
  await layers.tap();
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "ติดตั้งแอป" }).tap();
  await expect(page.locator("html")).toHaveAttribute("data-install-test-invoked", "yes");
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".citizen-ui")).toBeVisible();
  await expect.poll(() => dispatchNativePrompt(page)).toBe(true);
  await expect(banner).toHaveCount(0);
});

test("iOS Safari offers the manual steps, and closing persists across reload", async ({ page, baseURL, isMobile }) => {
  test.skip(!isMobile, "Mobile-sized Safari flow emulated in Chromium.");
  await page.addInitScript(ua => Object.defineProperty(navigator, "userAgent", { value: ua }), safariUA);
  await open(page, new URL(baseURL!).origin);
  const banner = page.getByRole("complementary", { name: label });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "ดูวิธีเพิ่มไอคอน" }).tap();
  await expect(banner.getByText(/แชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม/)).toBeVisible();
  await banner.getByRole("button", { name: "ซ่อนคำเชิญติดตั้ง" }).tap();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".citizen-ui")).toBeVisible();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(k => localStorage.getItem(k), `hdms:citizen-install:v1:${base || "/"}`)).toBe("hidden");
});

test("opening from the installed iPhone icon skips the invitation", async ({ page, baseURL, isMobile }) => {
  test.skip(!isMobile, "Mobile-sized standalone flow emulated in Chromium.");
  await page.addInitScript(ua => {
    Object.defineProperty(navigator, "userAgent", { value: ua });
    Object.defineProperty(navigator, "standalone", { value: true });
  }, safariUA);
  await open(page, new URL(baseURL!).origin);
  await expect(page.getByRole("complementary", { name: label })).toHaveCount(0);
});
