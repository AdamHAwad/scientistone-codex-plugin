import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(root, "plugins", "scientistone");
const destination = path.join(root, "dist", "scientistone");

const files = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "DESIGN.md",
  "assets/logo.png",
  "assets/logo.svg",
];

async function requireRegularFile(relative) {
  const absolute = path.join(source, relative);
  let info;
  try {
    info = await stat(absolute);
  } catch {
    throw new Error(`Missing release file: plugins/scientistone/${relative}`);
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Release file must be a regular file: plugins/scientistone/${relative}`);
  }
  return absolute;
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const relative of files) {
  const from = await requireRegularFile(relative);
  const to = path.join(destination, relative);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { dereference: false, errorOnExist: true });
}

const packagedManifestPath = path.join(destination, ".codex-plugin", "plugin.json");
const packagedManifest = JSON.parse(await readFile(packagedManifestPath, "utf8"));
packagedManifest.mcpServers = "./.mcp.json";
packagedManifest.hooks = "./hooks/hooks.json";
await writeFile(packagedManifestPath, `${JSON.stringify(packagedManifest, null, 2)}\n`, "utf8");

for (const relative of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "ATTRIBUTIONS.md"]) {
  await cp(path.join(root, relative), path.join(destination, relative), {
    dereference: false,
    errorOnExist: true,
  });
}

await cp(path.join(source, "skills"), path.join(destination, "skills"), {
  recursive: true,
  dereference: false,
  filter: (entry) => !entry.endsWith(".DS_Store"),
});

for (const directory of ["mcp", "scripts", "hooks", "licenses"]) {
  await cp(path.join(source, directory), path.join(destination, directory), {
    recursive: true,
    dereference: false,
    filter: (entry) => !entry.endsWith(".DS_Store"),
  });
}

await rm(path.join(destination, ".DS_Store"), { force: true });

async function verifyBundle(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    if (entry.name === ".DS_Store" || entry.name === "node_modules" || entry.name === "test") {
      throw new Error(`Forbidden release entry: ${childRelative}`);
    }
    if (entry.isSymbolicLink()) throw new Error(`Release entry must not be a symbolic link: ${childRelative}`);
    if (entry.isDirectory()) await verifyBundle(path.join(directory, entry.name), childRelative);
  }
}

await verifyBundle(destination);

process.stdout.write(`Built ${destination}\n`);
