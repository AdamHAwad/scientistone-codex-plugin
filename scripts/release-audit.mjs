import { readFile, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const textExtensions = new Set(["", ".cff", ".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".txt", ".yml", ".yaml"]);
const findings = [];
const removedFallbackVerdict = ["incon", "clusive"].join("");
const removedOutcomeFieldPrefix = ["negative", "or", ""].join("_");

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .sort();
const checks = [
  { type: "personal absolute path", pattern: /\/Users\/[A-Za-z0-9._-]+\//g, remediation: "use a project-relative path or documented placeholder" },
  { type: "deprecated implementation reference", pattern: /P[iI]\s+H[aA]rness|p[iI]-harness|scientist1-p[iI]/g, remediation: "remove release claims tied to the retired implementation" },
  { type: "local build identifier", pattern: /codex\.local|scientist1-l[oO]cal/g, remediation: "use the stable release version and public identity" },
  { type: "credential material", pattern: /(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["'][^"']+["']/gi, remediation: "remove the credential, rotate it, and use an environment variable at runtime" },
];

for (const relative of files) {
  let info;
  try {
    info = await lstat(path.join(root, relative));
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (info.isSymbolicLink()) {
    findings.push({ file: relative, type: "symlink", remediation: "replace with a bundled regular file" });
    continue;
  }
  if (path.basename(relative) === ".DS_Store") {
    findings.push({ file: relative, type: "Finder cache", remediation: "remove it from the source and release" });
    continue;
  }
  if (/scientist(?:one|-one)/i.test(relative)) {
    findings.push({ file: relative, type: "stale legacy product path", remediation: "rename product-owned paths to the Scientist1 identity" });
  }
  if (!textExtensions.has(path.extname(relative).toLowerCase())) continue;
  const text = await readFile(path.join(root, relative), "utf8");
  if (text.toLowerCase().includes(removedFallbackVerdict) || text.includes(removedOutcomeFieldPrefix)) {
    findings.push({ file: relative, type: "removed outcome path", remediation: "use autonomous null-result handling and fail-closed integrity checks" });
  }
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/scientist(?:one|-one)/i.test(line) && !/(?:paper|arXiv|2605\.26340|generated-artifacts|Towards Human-Level|AdamHAwad\/scientistone-codex-plugin)/i.test(line)) {
      findings.push({ file: `${relative}:${index + 1}`, type: "stale legacy product identity", remediation: "use Scientist1 unless this line explicitly refers to the Google paper" });
    }
  }
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    if (check.pattern.test(text)) findings.push({ file: relative, type: check.type, remediation: check.remediation });
  }
}

const manifestPath = path.join(root, "plugins/scientist1/.codex-plugin/plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== "1.3.1" || manifest.license !== "Apache-2.0") {
  findings.push({ file: "plugins/scientist1/.codex-plugin/plugin.json", type: "release metadata", remediation: "use version 1.3.1 and Apache-2.0" });
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const citation = await readFile(path.join(root, "CITATION.cff"), "utf8");
const capacityPreflight = await readFile(path.join(root, "plugins/scientist1/skills/scientist1/scripts/capacity-preflight.mjs"), "utf8");
if (packageJson.version !== manifest.version || packageLock.version !== manifest.version || packageLock.packages?.[""]?.version !== manifest.version || !citation.includes(`version: ${manifest.version}`) || !capacityPreflight.includes(`version: "${manifest.version}"`)) {
  findings.push({ file: "release metadata", type: "cross-file version mismatch", remediation: `set package, lockfile, citation, capacity preflight, and plugin manifest to ${manifest.version}` });
}
if (manifest.mcpServers !== "./.mcp.json" || "hooks" in manifest || "apps" in manifest) {
  findings.push({ file: "plugins/scientist1/.codex-plugin/plugin.json", type: "runtime wiring", remediation: "declare only the bundled local MCP; hooks are discovered from hooks/hooks.json and unsupported manifest fields must remain absent" });
}

const requiredRuntimeFiles = [
  "plugins/scientist1/.mcp.json",
  "plugins/scientist1/mcp/server.mjs",
  "plugins/scientist1/mcp/model-routing.mjs",
  "plugins/scientist1/mcp/ui/index.html",
  "plugins/scientist1/mcp/ui/app.js",
  "plugins/scientist1/mcp/ui/app.css",
  "plugins/scientist1/mcp/ui/newsreader-latin-600-normal.woff2",
  "plugins/scientist1/scripts/launch-scientist1-mcp",
  "plugins/scientist1/scripts/launch-scientist1-mcp.cmd",
  "plugins/scientist1/hooks/hooks.json",
  "plugins/scientist1/hooks/enforce-role-launch.mjs",
  "plugins/scientist1/skills/scientist1/references/legacy-model-policy-1.2.0.json",
  "plugins/scientist1/skills/scientist1/references/legacy-roles-1.2.0.md",
  "plugins/scientist1/skills/scientist1/scripts/capacity-preflight.mjs",
  "plugins/scientist1/skills/scientist1/scripts/i1-interpreter.mjs",
  "plugins/scientist1/skills/scientist1/scripts/legacy-coe-1.2.0.mjs",
  "plugins/scientist1/skills/scientist1/scripts/scheduler.mjs",
  "plugins/scientist1/LICENSE",
  "plugins/scientist1/NOTICE",
  "plugins/scientist1/THIRD_PARTY_NOTICES.md",
  "plugins/scientist1/ATTRIBUTIONS.md",
  "plugins/scientist1/licenses/NEWSREADER-LICENSE",
  "plugins/scientist1/licenses/PHOSPHOR-LICENSE",
];
for (const relative of requiredRuntimeFiles) {
  try {
    const info = await lstat(path.join(root, relative));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("not a regular file");
  } catch {
    findings.push({ file: relative, type: "missing bundled runtime file", remediation: "include the complete local browser and monitor runtime as regular files" });
  }
}

if (findings.length) {
  for (const finding of findings) {
    process.stderr.write(`${finding.file}: ${finding.type}; ${finding.remediation}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Release audit passed for ${files.length} source files. No secret values were printed.\n`);
}
