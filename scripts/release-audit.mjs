import { readFile, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const textExtensions = new Set(["", ".cff", ".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".txt", ".yml", ".yaml"]);
const findings = [];

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
  { type: "deprecated implementation reference", pattern: /P[iI]\s+H[aA]rness|p[iI]-harness|scientistone-p[iI]/g, remediation: "remove release claims tied to the retired implementation" },
  { type: "local build identifier", pattern: /codex\.local|scientistone-l[oO]cal/g, remediation: "use the stable release version and public identity" },
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
  if (!textExtensions.has(path.extname(relative).toLowerCase())) continue;
  const text = await readFile(path.join(root, relative), "utf8");
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    if (check.pattern.test(text)) findings.push({ file: relative, type: check.type, remediation: check.remediation });
  }
}

const manifestPath = path.join(root, "plugins/scientistone/.codex-plugin/plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== "1.1.2" || manifest.license !== "Apache-2.0") {
  findings.push({ file: "plugins/scientistone/.codex-plugin/plugin.json", type: "release metadata", remediation: "use version 1.1.2 and Apache-2.0" });
}
if (manifest.mcpServers !== "./.mcp.json" || manifest.hooks !== "./hooks/hooks.json" || "apps" in manifest) {
  findings.push({ file: "plugins/scientistone/.codex-plugin/plugin.json", type: "runtime wiring", remediation: "ship only the bundled local MCP and lifecycle hooks; do not declare a competing registered app" });
}

const requiredRuntimeFiles = [
  "plugins/scientistone/.mcp.json",
  "plugins/scientistone/mcp/server.mjs",
  "plugins/scientistone/mcp/model-routing.mjs",
  "plugins/scientistone/mcp/ui/index.html",
  "plugins/scientistone/mcp/ui/app.js",
  "plugins/scientistone/mcp/ui/app.css",
  "plugins/scientistone/mcp/ui/newsreader-latin-600-normal.woff2",
  "plugins/scientistone/scripts/launch-scientistone-mcp",
  "plugins/scientistone/scripts/launch-scientistone-mcp.cmd",
  "plugins/scientistone/hooks/hooks.json",
  "plugins/scientistone/hooks/enforce-role-launch.mjs",
  "plugins/scientistone/licenses/NEWSREADER-LICENSE",
  "plugins/scientistone/licenses/PHOSPHOR-LICENSE",
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
