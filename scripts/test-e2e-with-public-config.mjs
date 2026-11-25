import { closeSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const workspace = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const full = args.includes("--full");
const reuseBuild = args.includes("--reuse-build");
const playwrightArgs = args.filter((arg) => arg !== "--full" && arg !== "--reuse-build");

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

const windows = process.platform === "win32";
const exitCodes = { SIGINT: 130, SIGTERM: 143 };
let activeChild;
let interrupted;
let stopping;

async function stopTree(child, signal) {
  if (child.pid === undefined) return;
  if (windows) {
    await new Promise((resolve, reject) => {
      execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, (error) => {
        if (error && child.exitCode === null && child.signalCode === null) reject(error);
        else resolve();
      });
    });
    return;
  }

  // The spawned command owns a separate process group, including npm/Playwright descendants.
  const group = -child.pid;
  const signalGroup = (value) => {
    try {
      process.kill(group, value);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw error;
    }
  };
  if (!signalGroup(signal)) return;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!signalGroup(0)) return;
    await delay(50);
  }
  signalGroup("SIGKILL");
}

function interrupt(signal) {
  if (interrupted) return;
  interrupted = signal;
  const child = activeChild;
  // Attach a rejection handler immediately; the command may still need to close.
  if (child) stopping = stopTree(child, signal).catch((error) => error);
}

async function run(command, args) {
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
  const child = spawn(command, args, {
    cwd: workspace, stdio: "inherit", env, shell: windows, detached: true, windowsHide: true,
  });
  activeChild = child;
  try {
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
    if (status !== 0) {
      process.exitCode = status ?? 1;
      throw new Error(`${command} ${args.slice(0, 2).join(" ")} failed`);
    }
  } finally {
    activeChild = undefined;
  }
}

function selectPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(String(port)));
    });
  });
}

function fileContents(path) {
  try {
    return readFileSync(join(workspace, path));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

function buildFingerprint() {
  const hash = createHash("sha256");
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: workspace })
    .toString().split("\0").filter(Boolean);
  for (const path of [".env", ".env.local", ".env.production", ".env.production.local"]) files.push(path);
  for (const path of [...new Set(files)].sort()) {
    if (/^(tests\/|test-results\/|playwright\.config\.ts$)/.test(path)) continue;
    const contents = fileContents(path);
    hash.update(JSON.stringify([path, contents?.length ?? null]));
    if (contents) hash.update(contents);
  }
  const buildEnv = Object.entries(env)
    .filter(([key]) => /^(NEXT_|BASE_PATH$|NODE_ENV$)/.test(key))
    .sort(([left], [right]) => left.localeCompare(right));
  hash.update(JSON.stringify([process.version, Boolean(env.PLAYWRIGHT_STATIC), buildEnv]));
  return hash.digest("hex");
}

function artifactFingerprint() {
  const paths = env.PLAYWRIGHT_STATIC
    ? [".next/BUILD_ID", "out/index.html", "out/admin/index.html"]
    : [".next/BUILD_ID"];
  const hash = createHash("sha256");
  for (const path of paths) {
    const contents = fileContents(path);
    if (!contents?.length) return null;
    hash.update(contents);
  }
  return hash.digest("hex");
}

// Hold the lock through Playwright because the server still reads the build.
const workspaceKey = createHash("sha256").update(workspace).digest("hex").slice(0, 16);
const lockPath = join(tmpdir(), `hdms-e2e-${workspaceKey}.lock`);
let lock;
try {
  lock = openSync(lockPath, "wx");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  throw new Error(`E2E workspace is locked: ${lockPath}. Wait for the other run, or remove a stale lock after confirming no run is active.`);
}

const onInterrupt = () => interrupt("SIGINT");
const onTerminate = () => interrupt("SIGTERM");
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
try {
  env.PORT ||= await selectPort();
  env.HDMS_E2E_MANAGED = "1";
  env.HDMS_E2E_FULL = full ? "1" : "0";
  env.HDMS_E2E_OUTPUT_DIR = mkdtempSync(join(tmpdir(), "hdms-e2e-results-"));
  if (full) {
    env.PLAYWRIGHT_STATIC = "1";
    env.BASE_PATH ??= "/hdms_pn";
  }
  console.log(`E2E port: ${env.PORT}; default output: ${env.HDMS_E2E_OUTPUT_DIR}`);
  if (full) {
    await run("npm", ["run", "lint"]);
    await run("npm", ["run", "typecheck"]);
  }
  const manifestPath = ".next/hdms-e2e-build.json";
  const inputs = buildFingerprint();
  const artifacts = artifactFingerprint();
  const previous = fileContents(manifestPath);
  const manifest = (artifactHash) => JSON.stringify({ inputs, artifacts: artifactHash });
  if (reuseBuild && !full && artifacts && previous?.toString() === manifest(artifacts)) {
    console.log("E2E build: reused (0 builds)");
  } else {
    console.log("E2E build: rebuilding (1 build)");
    rmSync(join(workspace, manifestPath), { force: true });
    await run("npm", ["run", env.PLAYWRIGHT_STATIC ? "build:pages" : "build"]);
    const builtArtifacts = artifactFingerprint();
    if (builtArtifacts && inputs === buildFingerprint()) {
      writeFileSync(join(workspace, manifestPath), manifest(builtArtifacts));
    }
  }
  await run("npx", ["playwright", "test", ...playwrightArgs]);
} catch (error) {
  if (!interrupted) throw error;
} finally {
  try {
    const stopError = await stopping;
    if (interrupted) {
      process.exitCode = exitCodes[interrupted];
      if (stopError) throw stopError;
      console.error(`E2E cancelled (${interrupted}).`);
    }
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}
