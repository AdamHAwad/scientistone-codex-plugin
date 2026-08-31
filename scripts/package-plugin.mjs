import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(root, "plugins", "scientistone");
const destination = path.join(root, "dist", "scientistone");

const files = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "ATTRIBUTIONS.md",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "assets/logo.png",
  "assets/logo.svg",
  "hooks/enforce-role-launch.mjs",
  "hooks/hooks.json",
  "licenses/NEWSREADER-LICENSE",
  "licenses/PHOSPHOR-LICENSE",
  "mcp/model-routing.mjs",
  "mcp/server.mjs",
  "mcp/ui/app.css",
  "mcp/ui/app.js",
  "mcp/ui/index.html",
  "mcp/ui/newsreader-latin-600-normal.woff2",
  "scripts/launch-scientistone-mcp",
  "scripts/launch-scientistone-mcp.cmd",
  "skills/scientistone-monitor/SKILL.md",
  "skills/scientistone-monitor/agents/openai.yaml",
  "skills/scientistone-monitor/assets/logo.svg",
  "skills/scientistone-results/SKILL.md",
  "skills/scientistone-results/agents/openai.yaml",
  "skills/scientistone-results/assets/logo.svg",
  "skills/scientistone/SKILL.md",
  "skills/scientistone/agents/openai.yaml",
  "skills/scientistone/assets/logo.svg",
  "skills/scientistone/references/artifacts.md",
  "skills/scientistone/references/doctrine.md",
  "skills/scientistone/references/i1-verification-policy.schema.json",
  "skills/scientistone/references/i1-verification.md",
  "skills/scientistone/references/intake.md",
  "skills/scientistone/references/legacy-model-policy-1.2.0.json",
  "skills/scientistone/references/legacy-roles-1.2.0.md",
  "skills/scientistone/references/model-policy.json",
  "skills/scientistone/references/protocol.md",
  "skills/scientistone/references/roles.md",
  "skills/scientistone/scripts/capacity-preflight.mjs",
  "skills/scientistone/scripts/coe.mjs",
  "skills/scientistone/scripts/i1-interpreter.mjs",
  "skills/scientistone/scripts/legacy-coe-1.2.0.mjs",
  "skills/scientistone/scripts/scheduler.mjs",
].sort();

async function inventory(directory, relative = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Plugin source entry must not be a symbolic link: ${childRelative}`);
    if (entry.isDirectory()) found.push(...await inventory(path.join(directory, entry.name), childRelative));
    else if (entry.isFile()) found.push(childRelative);
    else throw new Error(`Plugin source entry must be a regular file or directory: ${childRelative}`);
  }
  return found.sort();
}

const observed = await inventory(source);
if (JSON.stringify(observed) !== JSON.stringify(files)) {
  const allowed = new Set(files);
  const actual = new Set(observed);
  const missing = files.filter((file) => !actual.has(file));
  const extra = observed.filter((file) => !allowed.has(file));
  throw new Error(`Plugin source differs from the release allowlist. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const relative of files) {
  const target = path.join(destination, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(source, relative), target, { dereference: false, errorOnExist: true });
}

const packaged = await inventory(destination);
if (JSON.stringify(packaged) !== JSON.stringify(files)) throw new Error("Packaged plugin differs from the exact release allowlist.");

process.stdout.write(`Built ${destination} from ${files.length} allowlisted files\n`);
