import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const appPort = process.env.PORT || "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${appPort}`;
const focusedLocalRun = process.env.HDMS_E2E_MANAGED === "1" && process.env.HDMS_E2E_FULL !== "1";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: process.env.HDMS_E2E_OUTPUT_DIR,
  fullyParallel: true,
  workers: process.env.CI ? undefined : process.platform === "win32" ? 2 : undefined,
  retries: process.env.CI && !focusedLocalRun ? 2 : 0,
  maxFailures: focusedLocalRun ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: process.env.PLAYWRIGHT_STATIC ? "node scripts/serve-pages.mjs" : "npm run start",
          url: `${baseURL}${process.env.BASE_PATH || ""}/`,
          reuseExistingServer: !process.env.CI && !process.env.HDMS_E2E_MANAGED,
          timeout: 120_000,
        },
      }),
});
