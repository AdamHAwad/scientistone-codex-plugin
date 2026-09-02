import { readFile, lstat, readdir } from "node:fs/promises";
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

const activeLivenessFiles = [
  "README.md",
  "plugins/scientist1/.codex-plugin/plugin.json",
  "plugins/scientist1/hooks/enforce-study-completion.mjs",
  "plugins/scientist1/mcp/model-routing.mjs",
  "plugins/scientist1/mcp/server.mjs",
  "plugins/scientist1/mcp/ui/app.js",
  "plugins/scientist1/skills/scientist1-monitor/SKILL.md",
  "plugins/scientist1/skills/scientist1-results/SKILL.md",
  "plugins/scientist1/skills/scientist1/SKILL.md",
  "plugins/scientist1/skills/scientist1/references/artifacts.md",
  "plugins/scientist1/skills/scientist1/references/doctrine.md",
  "plugins/scientist1/skills/scientist1/references/gate-checklists.json",
  "plugins/scientist1/skills/scientist1/references/i1-verification.md",
  "plugins/scientist1/skills/scientist1/references/intake.md",
  "plugins/scientist1/skills/scientist1/references/protocol.md",
  "plugins/scientist1/skills/scientist1/references/roles.md",
  "plugins/scientist1/skills/scientist1/scripts/scheduler.mjs",
];
const retiredLivenessPatterns = [
  /blocked_exhausted/g,
  /terminal\/incomplete\.json/g,
  /S1_TASK_ATTEMPTS_EXHAUSTED/g,
  /max_task_attempts/g,
  /max_repair_waves_per_gate/g,
  /audit_incomplete/g,
  /mark-incomplete/g,
  /may include (?:a )?paper/gi,
  /paper (?:is|remains) optional/gi,
  /(?:stop|end|terminate)[^\n.]{0,100}(?:without|before)[^\n.]{0,60}(?:paper|deliverable)/gi,
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

for (const relative of activeLivenessFiles) {
  const text = await readFile(path.join(root, relative), "utf8");
  for (const pattern of retiredLivenessPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      findings.push({ file: relative, type: "retired liveness path", remediation: "keep the approved run active, preserve the issue, repair the affected work, and require a fresh verified paper delivery" });
    }
  }
}

const livenessRequirements = [
  ["plugins/scientist1/skills/scientist1/scripts/coe.mjs", /task_attempt_policy:\s*"repair_until_pass"/],
  ["plugins/scientist1/skills/scientist1/scripts/coe.mjs", /completion_condition:\s*"fresh_verified_delivery"/],
  ["plugins/scientist1/skills/scientist1/scripts/coe.mjs", /rollback_policy:\s*"independent_adjudication_only"/],
  ["plugins/scientist1/skills/scientist1/scripts/coe.mjs", /function closeRepair/],
  ["plugins/scientist1/skills/scientist1/references/gate-checklists.json", /"release":\s*"1\.5\.0"/],
  ["plugins/scientist1/skills/scientist1/references/roles.md", /A raw `REVISE` or `FAIL` is only a proposal/i],
  ["plugins/scientist1/hooks/hooks.json", /enforce-study-completion\.mjs/],
  ["plugins/scientist1/hooks/enforce-study-completion.mjs", /finalVerification/],
  ["plugins/scientist1/mcp/server.mjs", /bind-approval/],
  ["plugins/scientist1/skills/scientist1/SKILL.md", /Do not report completion or end the lead turn until/i],
  ["plugins/scientist1/skills/scientist1/SKILL.md", /canonical paper source/i],
];
for (const [relative, pattern] of livenessRequirements) {
  const text = await readFile(path.join(root, relative), "utf8");
  if (!pattern.test(text)) {
    findings.push({ file: relative, type: "missing liveness invariant", remediation: "restore the approval binding, repair-until-pass policy, Stop enforcement, and fresh verified paper completion condition" });
  }
}

const manifestPath = path.join(root, "plugins/scientist1/.codex-plugin/plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== "1.5.0" || manifest.license !== "Apache-2.0") {
  findings.push({ file: "plugins/scientist1/.codex-plugin/plugin.json", type: "release metadata", remediation: "use version 1.5.0 and Apache-2.0" });
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
  "plugins/scientist1/hooks/enforce-study-completion.mjs",
  "plugins/scientist1/skills/scientist1/references/legacy-model-policy-1.2.0.json",
  "plugins/scientist1/skills/scientist1/references/legacy-roles-1.2.0.md",
  "plugins/scientist1/skills/scientist1/references/gate-checklists.json",
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

async function inventory(directory, relative = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = path.posix.join(relative, entry.name);
    const childPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release tree contains a symbolic link: ${childRelative}`);
    if (entry.isDirectory()) found.push(...await inventory(childPath, childRelative));
    else if (entry.isFile()) found.push(childRelative);
    else throw new Error(`Release tree contains a non-file entry: ${childRelative}`);
  }
  return found.sort();
}

const pluginSource = path.join(root, "plugins/scientist1");
const packagedPlugin = path.join(root, "dist/scientist1");
try {
  const sourceInventory = await inventory(pluginSource);
  const packageInventory = await inventory(packagedPlugin);
  if (JSON.stringify(sourceInventory) !== JSON.stringify(packageInventory)) {
    findings.push({ file: "dist/scientist1", type: "release inventory mismatch", remediation: "run npm run package:plugin and commit the exact allowlisted package" });
  } else {
    for (const relative of sourceInventory) {
      const [sourceBytes, packageBytes] = await Promise.all([
        readFile(path.join(pluginSource, relative)),
        readFile(path.join(packagedPlugin, relative)),
      ]);
      if (!sourceBytes.equals(packageBytes)) {
        findings.push({ file: `dist/scientist1/${relative}`, type: "release byte mismatch", remediation: "rebuild the packaged plugin from the audited source" });
      }
    }
  }
} catch (error) {
  if (error?.code === "ENOENT") {
    findings.push({ file: "dist/scientist1", type: "missing packaged release", remediation: "run npm run package:plugin before the release audit" });
  } else {
    throw error;
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
