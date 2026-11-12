import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const configPath = new URL("../.github/hdms-public.json", import.meta.url);
const publicConfig = JSON.parse(readFileSync(configPath, "utf8"));

if (!publicConfig.supabaseUrl || !publicConfig.supabasePublishableKey) {
  throw new Error(".github/hdms-public.json ต้องมี supabaseUrl และ supabasePublishableKey ก่อนรัน E2E");
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: publicConfig.supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicConfig.supabasePublishableKey,
};

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// NEXT_PUBLIC_* is embedded at build time. Build first so the local server
// receives the same public configuration as GitHub Actions before Playwright
// intercepts the Edge Function request.
run("npm", ["run", "build"]);
run("npx", ["playwright", "test", ...process.argv.slice(2)]);
