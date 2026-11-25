import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const entry = "scripts/test-e2e-with-public-config.mjs";

for (const [signal, exitCode, phase] of [["SIGINT", 130, "npm"], ["SIGTERM", 143, "npx"]]) {
  test(`${signal} during ${phase} stops the child tree and frees the workspace lock`,
    { skip: process.platform === "win32", timeout: 20_000 }, async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), "hdms-runner-test-")));
      const live = new Set();
      const pids = join(root, "pids");
      const lock = join(root, `hdms-e2e-${createHash("sha256").update(root).digest("hex").slice(0, 16)}.lock`);
      const ready = join(root, "ready");
      const stopped = join(root, "child-stopped");
      function run(hold) {
        const processHandle = spawn(process.execPath, [entry], {
          cwd: root,
          env: { ...process.env, PORT: "3001", TMPDIR: root, PATH: `${root}/bin:${process.env.PATH}`,
            HDMS_FIXTURE_HOLD: hold ? phase : "", HDMS_FIXTURE_READY: ready,
            HDMS_FIXTURE_STOPPED: stopped, HDMS_FIXTURE_PIDS: pids },
          stdio: ["ignore", "ignore", "pipe"],
        });
        live.add(processHandle);
        let stderr = "";
        processHandle.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
        const result = once(processHandle, "exit").then(([code, cause]) => {
          live.delete(processHandle);
          return { code, cause, stderr };
        });
        return { processHandle, result };
      }
      try {
        for (const dir of ["scripts", ".github", "bin"]) mkdirSync(join(root, dir));
        copyFileSync(new URL(`../${entry}`, import.meta.url), join(root, entry));
        writeFileSync(join(root, ".github/hdms-public.json"), JSON.stringify({
          supabaseUrl: "https://fixture.invalid", supabasePublishableKey: "fixture",
        }));
        execFileSync("git", ["init", "-q", root]);
        const fixtureChild = `process.on("SIGINT", finish); process.on("SIGTERM", finish);
          function finish() {
            setTimeout(() => {
              require("node:fs").writeFileSync(process.env.HDMS_FIXTURE_STOPPED, "");
              process.exit(0);
            }, 250);
          }
          require("node:fs").writeFileSync(process.env.HDMS_FIXTURE_READY, "");
          setInterval(() => {}, 1000);`;
        const fixture = `#!${process.execPath}
          const { spawn } = require("node:child_process");
          if (require("node:path").basename(process.argv[1]) === process.env.HDMS_FIXTURE_HOLD) {
            const child = spawn(process.execPath, ["-e", ${JSON.stringify(fixtureChild)}], { stdio: "ignore" });
            require("node:fs").writeFileSync(process.env.HDMS_FIXTURE_PIDS, String(child.pid));
            process.on("SIGINT", () => {});
            process.on("SIGTERM", () => {});
            child.once("close", () => process.exit(0));
          }`;
        for (const name of ["npm", "npx"]) writeFileSync(join(root, "bin", name), fixture, { mode: 0o755 });

        const first = run(true);
        for (let tries = 0; !existsSync(ready) && tries < 150; tries++) await delay(20);
        assert.ok(existsSync(ready), "fixture command and grandchild started");
        assert.ok(existsSync(lock));
        const concurrent = await run(false).result;
        assert.equal(concurrent.code, 1);
        assert.match(concurrent.stderr, /E2E workspace is locked/);

        first.processHandle.kill(signal);
        const interrupted = await first.result;
        assert.equal(interrupted.code, exitCode, interrupted.stderr);
        assert.ok(existsSync(stopped), "runner waited for grandchild shutdown");
        assert.ok(!existsSync(lock), "workspace lock was released");
        assert.equal((await run(false).result).code, 0, "next run can acquire lock and finish");
      } finally {
        for (const processHandle of live) processHandle.kill("SIGKILL");
        if (existsSync(pids)) {
          try { process.kill(Number(readFileSync(pids, "utf8")), "SIGKILL"); }
          catch (error) { if (error.code !== "ESRCH") throw error; }
        }
        rmSync(root, { recursive: true, force: true });
      }
    });
}
