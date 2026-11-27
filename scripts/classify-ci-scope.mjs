import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const copyPath = "config/public-display-copy.json";
const docPaths = new Set([
  "AGENTS.md", "docs/CODEBASE_MAP.md", "docs/PLAYBOOKS.md", "docs/PRE_CI_CHECKLIST.md",
  "docs/archive/history/CHANGELOG.md", "docs/CI_SCOPE.md",
  "docs/map-modules/README.md", "docs/map-modules/controls.md", "docs/map-modules/status.md",
  "docs/map-modules/popups.md", "docs/map-modules/focus.md",
]);

function git(cwd, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

const sha = value => typeof value === "string" && /^[0-9a-f]{40}$/.test(value) && !/^0+$/.test(value);
const isRegular = (cwd, revision, file) => git(cwd, ["ls-tree", revision, "--", file]).startsWith("100644 blob ");
function changes(cwd, base, head) {
  if (!sha(base) || !sha(head)) throw Error("Invalid comparison commits");
  git(cwd, ["merge-base", "--is-ancestor", base, head]);
  const fields = git(cwd, ["diff", "--name-status", "-z", "--no-renames", base, head, "--"]).split("\0");
  if (fields.pop() !== "" || fields.length % 2) throw Error("Malformed diff");
  return Array.from({ length: fields.length / 2 }, (_, i) => ({ status: fields[2 * i], file: fields[2 * i + 1] }));
}

function validatedCopy(source) {
  // Canonical formatting rejects duplicate keys, alternate structures and unknown keys.
  const value = JSON.parse(source);
  if (JSON.stringify(value, null, 2) + "\n" !== source ||
      JSON.stringify(Object.keys(value)) !== '["emptyFloodReports"]') return false;
  const text = value.emptyFloodReports;
  return typeof text === "string" && text === text.trim() && Array.from(text).length >= 1 &&
    Array.from(text).length <= 96 && !/[<>\p{C}\p{Zl}\p{Zp}]/u.test(text);
}

export function classify(cwd, base, head) {
  try {
    const diff = changes(cwd, base, head);
    if (!diff.length) return "full";
    const isDoc = ({status,file}) =>
      docPaths.has(file) && ["A", "M"].includes(status) && isRegular(cwd, head, file) &&
      (status === "A" || isRegular(cwd, base, file));
    const comparable = entry => entry.file === copyPath || isDoc(entry);
    if (diff.every(isDoc)) return "docs";
    if (diff.every(comparable)) {
      const copy = diff.find(entry => entry.file === copyPath);
      if (copy?.status === "M" && isRegular(cwd, base, copyPath) && isRegular(cwd, head, copyPath) &&
          validatedCopy(git(cwd, ["show", `${base}:${copyPath}`])) &&
          validatedCopy(git(cwd, ["show", `${head}:${copyPath}`]))) return "copy";
    }
  } catch {
    // Missing history, unexpected input or Git errors must never opt out.
  }
  return "full";
}

export function verifyDocs(cwd, base, head) {
  git(cwd, ["diff", "--check", base, head, "--"]);
  for (const { file } of changes(cwd, base, head).filter(e => docPaths.has(e.file))) {
    const patch = git(cwd, ["diff", "--unified=0", "--no-ext-diff", base, head, "--", file]);
    for (const line of patch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        const url = match[1];
        if (url.startsWith("#") || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) continue;
        const relativePath = decodeURIComponent(url.split("#")[0]);
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), relativePath));
        if (relativePath.startsWith("/") || target.startsWith("../")) throw Error(`Invalid repo link in ${file}: ${url}`);
        try { git(cwd, ["cat-file", "-e", `${head}:${target}`]); }
        catch { throw Error(`Missing repo link in ${file}: ${url}`); }
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , mode, base, head] = process.argv;
  if (mode === "--validate-docs") verifyDocs(process.cwd(), base, head);
  else if (mode === "--classify") console.log(classify(process.cwd(), base, head));
  else process.exitCode = 2;
}
