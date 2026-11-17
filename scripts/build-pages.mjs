import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = {
  ...process.env,
  NEXT_OUTPUT: "export",
};

// Fallback to .github/hdms-public.json if public config is not in environment (e.g. local build)
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  const configPath = new URL("../.github/hdms-public.json", import.meta.url);
  if (existsSync(configPath)) {
    try {
      const publicConfig = JSON.parse(readFileSync(configPath, "utf8"));
      if (publicConfig.supabaseUrl && publicConfig.supabasePublishableKey) {
        env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || publicConfig.supabaseUrl;
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || publicConfig.supabasePublishableKey;
      }
    } catch {
      // Ignore parse failure; Next.js handles missing env
    }
  }
}

const nextBinPath = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const result = spawnSync(process.execPath, [nextBinPath, "build"], {
  stdio: "inherit",
  env,
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
