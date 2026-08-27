import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkAndInstallUpdate, compareVersions, selectRunningPlugin } from "../mcp/update-manager.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-update-"));
  const cli = path.join(root, process.platform === "win32" ? "codex.exe" : "codex");
  fs.writeFileSync(cli, "");
  fs.chmodSync(cli, 0o700);
  const pluginRoot = path.join(root, "plugins", "cache", "scientistone-marketplace", "scientistone", "1.1.1");
  fs.mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), '{"name":"scientistone","version":"1.1.1"}\n');
  return { root, cli, pluginRoot, env: { ...process.env, CODEX_CLI_PATH: cli } };
}

function inventory(version = "1.1.1", sourceType = "git") {
  return {
    installed: [{
      pluginId: "scientistone@scientistone-marketplace",
      name: "scientistone",
      marketplaceName: "scientistone-marketplace",
      version,
      installed: true,
      source: { source: "local", path: "/materialized/marketplace/plugins/scientistone" },
      marketplaceSource: { sourceType, source: sourceType === "git" ? "https://github.com/example/scientistone.git" : "/local/marketplace" },
    }],
  };
}

function mockRun(outputs) {
  const calls = [];
  const run = async (_cli, args) => {
    calls.push(args);
    const output = outputs.shift();
    if (output instanceof Error) throw output;
    return { stdout: JSON.stringify(output), stderr: "" };
  };
  return { run, calls };
}

test("version comparison handles stable SemVer releases", () => {
  assert.equal(compareVersions("1.1.1", "1.1.1"), 0);
  assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
  assert.equal(compareVersions("1.1.1-beta.2", "1.1.1"), -1);
  assert.equal(compareVersions("release", "1.1.1"), null);
});

test("cache paths select the exact running marketplace", () => {
  const { root, pluginRoot } = fixture();
  try {
    const selected = selectRunningPlugin({ installed: [
      inventory().installed[0],
      { ...inventory().installed[0], pluginId: "scientistone@other", marketplaceName: "other" },
    ] }, pluginRoot);
    assert.equal(selected.marketplaceName, "scientistone-marketplace");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an exact marketplace remains identifiable after its source path changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-direct-source-"));
  try {
    const plugins = inventory().installed;
    plugins.push({ ...plugins[0], pluginId: "scientistone@other", marketplaceName: "other" });
    const selected = selectRunningPlugin({ installed: plugins }, root, "scientistone-marketplace");
    assert.equal(selected.marketplaceName, "scientistone-marketplace");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a current Git marketplace needs no restart", async () => {
  const { root, cli, pluginRoot, env } = fixture();
  const { run, calls } = mockRun([
    { selectedMarketplaces: ["scientistone-marketplace"], upgradedRoots: [], errors: [] },
    inventory(),
  ]);
  try {
    const result = await checkAndInstallUpdate({ pluginRoot, runningVersion: "1.1.1", env, run });
    assert.equal(result.status, "current");
    assert.equal(result.restart_required, false);
    assert.equal(result.continue_setup, true);
    assert.deepEqual(calls[0], ["plugin", "marketplace", "upgrade", "scientistone-marketplace", "--json"]);
    assert.equal(cli, env.CODEX_CLI_PATH);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a refreshed marketplace installs the update and requires a new Codex session", async () => {
  const { root, pluginRoot, env } = fixture();
  const { run } = mockRun([
    { selectedMarketplaces: ["scientistone-marketplace"], upgradedRoots: ["/installed/scientistone-marketplace"], errors: [] },
    inventory("1.1.2"),
  ]);
  try {
    const result = await checkAndInstallUpdate({ pluginRoot, runningVersion: "1.1.1", env, run });
    assert.equal(result.status, "updated");
    assert.equal(result.installed_version, "1.1.2");
    assert.equal(result.restart_required, true);
    assert.equal(result.continue_setup, false);
    assert.match(result.message, /Close and reopen Codex/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an update installed by Codex startup is detected after the lightweight refresh", async () => {
  const { root, pluginRoot, env } = fixture();
  const { run, calls } = mockRun([
    { selectedMarketplaces: ["scientistone-marketplace"], upgradedRoots: [], errors: [] },
    inventory("1.1.2"),
  ]);
  try {
    const result = await checkAndInstallUpdate({ pluginRoot, runningVersion: "1.1.1", env, run });
    assert.equal(result.status, "updated");
    assert.equal(result.restart_required, true);
    assert.equal(calls.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local development installs and failed checks do not block setup", async () => {
  const localFixture = fixture();
  const localPluginRoot = path.join(localFixture.root, "local-marketplace", "plugins", "scientistone");
  fs.mkdirSync(localPluginRoot, { recursive: true });
  const local = inventory("1.1.1", "local");
  local.installed[0].source.path = localPluginRoot;
  const localRun = mockRun([local]);
  try {
    const localResult = await checkAndInstallUpdate({ pluginRoot: localPluginRoot, runningVersion: "1.1.1", env: localFixture.env, run: localRun.run });
    assert.equal(localResult.status, "local_install");
    assert.equal(localResult.continue_setup, true);

    const failedRun = mockRun([new Error("offline")]);
    const failedResult = await checkAndInstallUpdate({ pluginRoot: localPluginRoot, runningVersion: "1.1.1", env: localFixture.env, run: failedRun.run });
    assert.equal(failedResult.status, "check_failed");
    assert.equal(failedResult.continue_setup, true);

    const ambiguous = inventory();
    ambiguous.installed.push({ ...ambiguous.installed[0], pluginId: "scientistone@second", marketplaceName: "second" });
    const ambiguousRun = mockRun([ambiguous]);
    const ambiguousResult = await checkAndInstallUpdate({ pluginRoot: localPluginRoot, runningVersion: "1.1.1", env: localFixture.env, run: ambiguousRun.run });
    assert.equal(ambiguousResult.status, "check_failed");
    assert.equal(ambiguousResult.continue_setup, true);
  } finally {
    fs.rmSync(localFixture.root, { recursive: true, force: true });
  }
});
