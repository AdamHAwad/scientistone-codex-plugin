import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyParallelCapacityWithCodex,
  capacityStatusWithCodex,
  declineParallelCapacity,
} from "../../plugins/scientistone/skills/scientistone/scripts/capacity-preflight.mjs";

function home(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-capacity-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function config(directory, content) {
  fs.writeFileSync(path.join(directory, "config.toml"), content, { mode: 0o600 });
}

function state(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, "scientistone", "capacity-preflight.json"), "utf8"));
}

function fakeConfigService(directory, options = {}) {
  const configFile = path.join(directory, "config.toml");
  let version = 1;
  let canonical = options.userCapacity ?? null;
  let legacy = options.legacyCapacity ?? null;
  let effective = options.effectiveCapacity ?? canonical ?? legacy ?? 4;
  let conflicts = options.conflicts ?? 0;
  const calls = [];
  const layerType = options.layerType ?? "user";
  function readResult() {
    return {
      config: {
        agents: { ...(effective === null ? {} : { max_concurrent_threads_per_session: effective }), ...(options.agentsDisabled ? { enabled: false } : {}) },
        ...(options.v2Capacity ? { features: { multi_agent_v2: { max_concurrent_threads_per_session: options.v2Capacity } } } : {}),
      },
      origins: effective === null ? {} : { "agents.max_concurrent_threads_per_session": { name: { type: layerType, ...(options.originProfile ? { profile: options.originProfile } : {}) } } },
      layers: [{
        name: { type: "user", profile: null, file: configFile },
        version: `v${version}`,
        config: { agents: { ...(canonical === null ? {} : { max_concurrent_threads_per_session: canonical }), ...(legacy === null ? {} : { max_threads: legacy }) } },
      }],
    };
  }
  async function request(method, params) {
    calls.push({ method, params: structuredClone(params) });
    if (method === "config/read") return readResult();
    assert.equal(method, "config/batchWrite");
    if (conflicts > 0) {
      conflicts -= 1;
      const error = new Error("configuration version conflict");
      error.code = "configVersionConflict";
      throw error;
    }
    assert.equal(params.filePath, configFile);
    assert.equal(params.expectedVersion, `v${version}`);
    for (const edit of params.edits) {
      if (edit.keyPath === "agents.max_concurrent_threads_per_session") canonical = edit.value;
      if (edit.keyPath === "agents.max_threads") legacy = edit.value;
    }
    effective = canonical ?? legacy ?? null;
    version += 1;
    if (canonical === 16) {
      const original = fs.existsSync(configFile) ? fs.readFileSync(configFile, "utf8") : "";
      fs.writeFileSync(configFile, `${original.replace(/\s*$/, "")}\n\n[agents]\nmax_concurrent_threads_per_session = 16\n`, { mode: 0o600 });
    } else if (options.original !== undefined) {
      fs.writeFileSync(configFile, options.original, { mode: 0o600 });
    }
    return { status: options.writeStatus ?? "ok", filePath: configFile, version: `v${version}` };
  }
  return { calls, request };
}

test("a sufficient effective configuration continues silently", async (t) => {
  const directory = home(t);
  config(directory, "[agents]\nmax_concurrent_threads_per_session = 20\n");
  const service = fakeConfigService(directory, { effectiveCapacity: 20, userCapacity: 20 });
  assert.deepEqual(await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request }), {
    action: "continue",
    reason: "capacity_sufficient",
    configured_concurrency: 20,
    target_concurrency: 16,
  });
});

test("a declined prompt is remembered and does not nag again", async (t) => {
  const directory = home(t);
  config(directory, "model = \"test\"\n");
  const service = fakeConfigService(directory);
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request, instanceMarker: "test-instance" })).action, "prompt");
  assert.equal((await declineParallelCapacity({ codexHome: directory, configRequest: service.request })).reason, "declined");
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request, instanceMarker: "test-instance" })).reason, "declined");
});

test("approval uses a versioned atomic batch, exact private backup, validation, and restart marker", async (t) => {
  const directory = home(t);
  const original = "developer_instructions = '''\nThis is documentation, not config:\n[agents]\nmax_concurrent_threads_per_session = 4\n'''\n";
  config(directory, original);
  const service = fakeConfigService(directory, { original });
  const result = await applyParallelCapacityWithCodex({
    codexHome: directory,
    configRequest: service.request,
    confirmed: true,
    instanceMarker: "desktop-instance-a",
    now: Date.UTC(2026, 7, 30),
  });
  assert.equal(result.action, "restart_required");
  assert.equal(path.isAbsolute(result.backup_path), false);
  assert.equal(fs.readFileSync(path.join(directory, result.backup_path), "utf8"), original);
  assert.equal(fs.statSync(path.join(directory, result.backup_path)).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(directory, "config.toml"), "utf8").includes(original.trim()), true);

  const batch = service.calls.find((call) => call.method === "config/batchWrite");
  assert.equal(batch.params.expectedVersion, "v1");
  assert.equal(batch.params.reloadUserConfig, false);
  assert.deepEqual(batch.params.edits, [
    { keyPath: "agents.max_threads", value: null, mergeStrategy: "replace" },
    { keyPath: "agents.max_concurrent_threads_per_session", value: 16, mergeStrategy: "replace" },
  ]);
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request, instanceMarker: "desktop-instance-a" })).action, "restart_required");
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request, instanceMarker: "desktop-instance-b" })).action, "continue");
  assert.equal(state(directory).restart_pending, false);
  assert.doesNotMatch(JSON.stringify(state(directory)), /desktop-instance-a/);
});

test("without a reliable live-instance marker the setting is not changed", async (t) => {
  const directory = home(t);
  config(directory, "model = \"test\"\n");
  const service = fakeConfigService(directory);
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request, instanceMarker: "" })).reason, "restart_detection_unavailable");
  assert.equal((await applyParallelCapacityWithCodex({ codexHome: directory, configRequest: service.request, confirmed: true, instanceMarker: "" })).changed, false);
  assert.equal(service.calls.some((call) => call.method === "config/batchWrite"), false);
  assert.equal(fs.readFileSync(path.join(directory, "config.toml"), "utf8"), "model = \"test\"\n");
});

test("a completed one-time setup is not repeated if capacity is later lowered", async (t) => {
  const directory = home(t);
  config(directory, "model = \"test\"\n");
  const service = fakeConfigService(directory);
  assert.equal((await applyParallelCapacityWithCodex({ codexHome: directory, configRequest: service.request, confirmed: true, instanceMarker: "instance-a" })).action, "restart_required");
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request, instanceMarker: "instance-b" })).action, "continue");
  const lowered = fakeConfigService(directory, { effectiveCapacity: 4, userCapacity: 4 });
  const status = await capacityStatusWithCodex({ codexHome: directory, configRequest: lowered.request, instanceMarker: "instance-b" });
  assert.equal(status.action, "continue_limited");
  assert.equal(status.reason, "applied");
});

test("a version conflict is retried once without keeping a stale backup", async (t) => {
  const directory = home(t);
  const original = "model = \"test\"\n";
  config(directory, original);
  const service = fakeConfigService(directory, { conflicts: 1, original });
  const result = await applyParallelCapacityWithCodex({ codexHome: directory, configRequest: service.request, confirmed: true, instanceMarker: "test-instance" });
  assert.equal(result.action, "restart_required");
  assert.equal(service.calls.filter((call) => call.method === "config/batchWrite").length, 2);
  const backups = fs.readdirSync(directory).filter((name) => name.includes("scientistone-backup"));
  assert.equal(backups.length, 1);
});

test("managed, disabled, and V2-overridden configurations continue limited without mutation", async (t) => {
  for (const variant of [
    ...["mdm", "system", "enterpriseManaged", "project", "sessionFlags", "legacyManagedConfigTomlFromFile", "legacyManagedConfigTomlFromMdm"].map((layerType) => ({ layerType, expected: "managed" })),
    { layerType: "user", originProfile: "high-throughput", expected: "managed" },
    { agentsDisabled: true, expected: "agents_disabled" },
    { v2Capacity: 8, expected: "explicit_v2_override" },
  ]) {
    const directory = home(t);
    const original = "model = \"test\"\n";
    config(directory, original);
    const service = fakeConfigService(directory, variant);
    assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request })).reason, variant.expected);
    assert.equal((await applyParallelCapacityWithCodex({ codexHome: directory, configRequest: service.request, confirmed: true })).changed, false);
    assert.equal(fs.readFileSync(path.join(directory, "config.toml"), "utf8"), original);
  }
});

test("applied-state failure rolls back through the same versioned service", async (t) => {
  const directory = home(t);
  const original = "model = \"test\"\n";
  config(directory, original);
  const service = fakeConfigService(directory, { original });
  const result = await applyParallelCapacityWithCodex({
    codexHome: directory,
    configRequest: service.request,
    confirmed: true,
    instanceMarker: "test-instance",
    stateWriter: () => { throw new Error("state unavailable"); },
  });
  assert.equal(result.reason, "unsupported");
  assert.equal(service.calls.filter((call) => call.method === "config/batchWrite").length, 2);
  assert.equal(fs.readFileSync(path.join(directory, "config.toml"), "utf8"), original);
});

test("symlink-managed config and preference paths are never mutated", async (t) => {
  const directory = home(t);
  const external = path.join(home(t), "external.toml");
  fs.writeFileSync(external, "model = \"test\"\n");
  fs.symlinkSync(external, path.join(directory, "config.toml"));
  const service = fakeConfigService(directory);
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, configRequest: service.request })).reason, "managed");
  assert.equal(fs.readFileSync(external, "utf8"), "model = \"test\"\n");
});

const codexAvailable = spawnSync(process.env.CODEX_CLI_PATH ?? "codex", ["--version"], { encoding: "utf8" }).status === 0;
test("the real Codex configuration service preserves multiline TOML and enforces restart", { skip: !codexAvailable }, async (t) => {
  const directory = home(t);
  const original = "developer_instructions = '''\nThis example must remain text:\n[agents]\nmax_concurrent_threads_per_session = 4\n'''\n";
  config(directory, original);
  const before = await capacityStatusWithCodex({ codexHome: directory, instanceMarker: "live-a" });
  assert.equal(before.action, "prompt");
  const applied = await applyParallelCapacityWithCodex({ codexHome: directory, confirmed: true, instanceMarker: "live-a" });
  assert.equal(applied.action, "restart_required");
  const updated = fs.readFileSync(path.join(directory, "config.toml"), "utf8");
  assert.match(updated, /This example must remain text:/);
  assert.match(updated, /'''[\s\S]*\[agents\][\s\S]*max_concurrent_threads_per_session = 16/);
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, instanceMarker: "live-a" })).action, "restart_required");
  assert.equal((await capacityStatusWithCodex({ codexHome: directory, instanceMarker: "live-b" })).action, "continue");
});
