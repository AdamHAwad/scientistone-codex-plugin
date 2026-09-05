import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(root, "plugins", "scientist1");
const destination = path.join(root, "dist", "scientist1");

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
  "hooks/enforce-study-completion.mjs",
  "hooks/hooks.json",
  "licenses/NEWSREADER-LICENSE",
  "licenses/PHOSPHOR-LICENSE",
  "mcp/model-routing.mjs",
  "mcp/server.mjs",
  "mcp/ui/app.css",
  "mcp/ui/app.js",
  "mcp/ui/index.html",
  "mcp/ui/newsreader-latin-600-normal.woff2",
  "scripts/launch-scientist1-mcp",
  "scripts/launch-scientist1-mcp.cmd",
  "skills/scientist1-monitor/SKILL.md",
  "skills/scientist1-monitor/agents/openai.yaml",
  "skills/scientist1-monitor/assets/logo.svg",
  "skills/scientist1-results/SKILL.md",
  "skills/scientist1-results/agents/openai.yaml",
  "skills/scientist1-results/assets/logo.svg",
  "skills/scientist1/SKILL.md",
  "skills/scientist1/agents/openai.yaml",
  "skills/scientist1/assets/logo.svg",
  "skills/scientist1/references/artifacts.md",
  "skills/scientist1/references/doctrine.md",
  "skills/scientist1/references/gate-checklists.json",
  "skills/scientist1/references/i1-verification-policy.schema.json",
  "skills/scientist1/references/i1-verification.md",
  "skills/scientist1/references/intake.md",
  "skills/scientist1/references/legacy-model-policy-1.2.0.json",
  "skills/scientist1/references/legacy-roles-1.2.0.md",
  "skills/scientist1/references/model-policy.json",
  "skills/scientist1/references/protocol.md",
  "skills/scientist1/references/roles.md",
  "skills/scientist1/references/scientific-writing.md",
  "skills/scientist1/references/writing-examples/README.md",
  "skills/scientist1/references/writing-examples/aims-and-research-strategy.docx",
  "skills/scientist1/references/writing-examples/manifest.json",
  "skills/scientist1/references/writing-examples/mechano-metabolic-manuscript.pdf",
  "skills/scientist1/references/writing-examples/syntoc-manuscript.docx",
  "skills/scientist1/scripts/capacity-preflight.mjs",
  "skills/scientist1/scripts/coe.mjs",
  "skills/scientist1/scripts/i1-interpreter.mjs",
  "skills/scientist1/scripts/legacy-coe-1.2.0.mjs",
  "skills/scientist1/scripts/scheduler.mjs",
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
