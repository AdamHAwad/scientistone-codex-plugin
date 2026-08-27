import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PLUGIN_NAME = "scientistone";
const COMMAND_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function resolvedPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function isExecutableFile(value) {
  if (!value || !path.isAbsolute(value)) return false;
  try {
    const info = fs.statSync(value);
    if (!info.isFile()) return false;
    return process.platform === "win32" || (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function findCodexCli(env = process.env) {
  if (isExecutableFile(env.CODEX_CLI_PATH)) return env.CODEX_CLI_PATH;
  const names = process.platform === "win32" ? ["codex.exe", "codex.cmd", "codex.bat"] : ["codex"];
  for (const directory of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = path.resolve(directory, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function parseJsonOutput(stdout, label) {
  const start = stdout.indexOf("{");
  if (start === -1) throw new Error(`${label} did not return JSON.`);
  return JSON.parse(stdout.slice(start));
}

function marketplaceFromCachePath(pluginRoot) {
  const versionRoot = path.resolve(pluginRoot);
  const pluginDirectory = path.dirname(versionRoot);
  const marketplaceDirectory = path.dirname(pluginDirectory);
  const cacheDirectory = path.dirname(marketplaceDirectory);
  if (path.basename(pluginDirectory) !== PLUGIN_NAME || path.basename(cacheDirectory) !== "cache") return null;
  return path.basename(marketplaceDirectory);
}

function sourceType(plugin) {
  return plugin?.marketplaceSource?.sourceType ?? plugin?.source?.source ?? null;
}

export function selectRunningPlugin(inventory, pluginRoot, preferredMarketplaceName = null) {
  const installed = Array.isArray(inventory?.installed)
    ? inventory.installed.filter((item) => item?.name === PLUGIN_NAME && item?.installed === true)
    : [];
  if (!installed.length) throw new Error("ScientistOne is missing from the Codex plugin inventory.");

  const root = resolvedPath(pluginRoot);
  const direct = installed.filter((item) => typeof item?.source?.path === "string" && resolvedPath(item.source.path) === root);
  if (direct.length === 1) return direct[0];

  const marketplaceName = preferredMarketplaceName ?? marketplaceFromCachePath(pluginRoot);
  const cached = marketplaceName
    ? installed.filter((item) => item.marketplaceName === marketplaceName || item.pluginId === `${PLUGIN_NAME}@${marketplaceName}`)
    : [];
  if (cached.length === 1) return cached[0];
  if (installed.length === 1) return installed[0];
  throw new Error("More than one ScientistOne installation is active, so the running marketplace is ambiguous.");
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value ?? "");
  if (!match) return null;
  return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] ?? null };
}

export function compareVersions(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return Math.sign(a.numbers[index] - b.numbers[index]);
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return Math.sign(a.prerelease.localeCompare(b.prerelease, "en", { numeric: true }));
}

function result(status, runningVersion, extra = {}) {
  return {
    status,
    running_version: runningVersion,
    installed_version: extra.installedVersion ?? runningVersion,
    restart_required: extra.restartRequired ?? false,
    continue_setup: extra.continueSetup ?? true,
    message: extra.message,
  };
}

export async function checkAndInstallUpdate({
  pluginRoot,
  runningVersion,
  env = process.env,
  run = execFileAsync,
} = {}) {
  const cli = findCodexCli(env);
  if (!cli) {
    return result("check_failed", runningVersion, {
      message: "ScientistOne could not reach Codex's plugin updater. Continue with the installed version.",
    });
  }

  const invoke = async (args) => {
    const { stdout } = await run(cli, args, {
      encoding: "utf8",
      env,
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return parseJsonOutput(stdout, `codex ${args.join(" ")}`);
  };

  try {
    let marketplaceName = marketplaceFromCachePath(pluginRoot);
    let directInstall = null;
    if (!marketplaceName) {
      const inventory = await invoke(["plugin", "list", "--available", "--json"]);
      directInstall = selectRunningPlugin(inventory, pluginRoot);
      if (sourceType(directInstall) !== "git") {
        return result("local_install", runningVersion, {
          installedVersion: directInstall.version ?? runningVersion,
          message: "This is a local ScientistOne installation. Continue with the installed version.",
        });
      }
      marketplaceName = directInstall.marketplaceName;
    }
    if (typeof marketplaceName !== "string" || !/^[A-Za-z0-9._-]+$/.test(marketplaceName)) {
      throw new Error("ScientistOne's marketplace name is invalid.");
    }
    const activeDirectory = resolvedPath(process.cwd());
    const relativeToPlugin = path.relative(resolvedPath(pluginRoot), activeDirectory);
    if (relativeToPlugin === "" || (!relativeToPlugin.startsWith(`..${path.sep}`) && relativeToPlugin !== ".." && !path.isAbsolute(relativeToPlugin))) {
      process.chdir(os.tmpdir());
    }
    const upgrade = await invoke(["plugin", "marketplace", "upgrade", marketplaceName, "--json"]);
    if (!Array.isArray(upgrade.selectedMarketplaces) || !upgrade.selectedMarketplaces.includes(marketplaceName)) {
      throw new Error("Codex did not select ScientistOne's marketplace for refresh.");
    }
    if (Array.isArray(upgrade.errors) && upgrade.errors.length) throw new Error("Codex reported a marketplace refresh error.");

    const afterInventory = await invoke(["plugin", "list", "--available", "--json"]);
    const installedVersion = selectRunningPlugin(afterInventory, pluginRoot, marketplaceName).version ?? runningVersion;
    const versionChanged = compareVersions(installedVersion, runningVersion) === 1;
    const marketplaceChanged = Array.isArray(upgrade.upgradedRoots) && upgrade.upgradedRoots.length > 0;
    if (versionChanged || marketplaceChanged) {
      return result("updated", runningVersion, {
        installedVersion,
        restartRequired: true,
        continueSetup: false,
        message: "ScientistOne was updated. Close and reopen Codex, then start a new ScientistOne task.",
      });
    }
    if (compareVersions(installedVersion, runningVersion) === -1) throw new Error("The refreshed marketplace contains an older ScientistOne version.");
    return result("current", runningVersion, {
      installedVersion,
      message: "ScientistOne is up to date.",
    });
  } catch {
    return result("check_failed", runningVersion, {
      message: "ScientistOne could not complete its update check. Continue with the installed version.",
    });
  }
}
