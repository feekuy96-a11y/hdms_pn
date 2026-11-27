import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classify, verifyDocs } from "./classify-ci-scope.mjs";

const copy = "config/public-display-copy.json";
const doc = "docs/PRE_CI_CHECKLIST.md";
const json = text => JSON.stringify({ emptyFloodReports: text }, null, 2) + "\n";

function fixture(t, entries) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hdms-ci-scope-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  const write = (name, data) => {
    const p = path.join(cwd, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };
  write("AGENTS.md", "# Agent rules\n");
  write(copy, json("ยังไม่มีรายงานจุดน้ำท่วม"));
  write("app/page.tsx", "export const runtime = 'none';\n");
  git("add", "."); git("commit", "-m", "base");
  const base = git("rev-parse", "HEAD");
  for (const [name, data] of Object.entries(entries)) {
    if (data === null) fs.unlinkSync(path.join(cwd, name));
    else write(name, data);
  }
  git("add", "-A"); git("commit", "--allow-empty", "-m", "candidate");
  const head = git("rev-parse", "HEAD");
  return { cwd, base, head };
}

const cases = [
  ["new allowlisted docs", { [doc]: "[Rules](../AGENTS.md)\n" }, "docs"],
  ["existing guide", { "AGENTS.md": "# Updated\n" }, "docs"],
  ["established copy only", { [copy]: json("ยังไม่มีรายงานเส้นทางน้ำท่วม") }, "copy"],
  ["copy and recognized docs", { [copy]: json("ยังไม่มีรายงานเส้นทางน้ำท่วม"), [doc]: "# Guide\n" }, "copy"],
  ["copy and browser code", { [copy]: json("ยังไม่มีรายงานเส้นทางน้ำท่วม"), "app/page.tsx": "export const runtime = 'other';\n" }, "full"],
  ["arbitrary markdown", { "public/guide.md": "# not classified as repository documentation\n" }, "full"],
  ["documentation built into Pages", { "docs/ADMIN_BOUNDARY_ASSETS.md": "# Attribution\n" }, "full"],
  ["deleted tracked doc", { "AGENTS.md": null }, "full"],
  ["workflow matters even with docs", { ".github/workflows/ci.yml": "name: altered\n", [doc]: "# Docs\n" }, "full"],
  ["copy key changed", { [copy]: '{\n  "other": "Not permitted"\n}\n' }, "full"],
  ["copy HTML", { [copy]: json("<a>link</a>") }, "full"],
  ["copy duplicate key", { [copy]: '{"emptyFloodReports":"1","emptyFloodReports":"2"}\n' }, "full"],
  ["copy newline", { [copy]: json("two\nlines") }, "full"],
  ["copy too long", { [copy]: json("ก".repeat(97)) }, "full"],
  ["nothing changed", {}, "full"],
];
for (const [name, entries, expected] of cases) {
  test(name, t => {
    const { cwd, base, head } = fixture(t, entries);
    assert.equal(classify(cwd, base, head), expected);
  });
}
test("missing or non-ancestor history fails closed", t => {
  const { cwd, base, head } = fixture(t, { [doc]: "# guide\n" });
  for (const source of ["", "0".repeat(40), "f".repeat(40)]) assert.equal(classify(cwd, source, head), "full");
  assert.equal(classify(cwd, head, base), "full");
});
test("changed local docs links are validated on the revision under test", t => {
  const bad = fixture(t, { [doc]: "[missing](NOT_INSTALLED.md)\n" });
  assert.throws(() => verifyDocs(bad.cwd, bad.base, bad.head), /Missing repo link/);
  const good = fixture(t, { [doc]: "[rules](../AGENTS.md)\n" });
  assert.doesNotThrow(() => verifyDocs(good.cwd, good.base, good.head));
});
