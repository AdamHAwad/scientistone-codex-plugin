import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const TARGET_CONCURRENCY = 16;
const STATE_SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 2_000;
const CONFIG_TIMEOUT_MS = 10_000;
const NO_PROMPT_DECISIONS = new Set(["applied", "declined", "managed", "unsupported"]);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function resolveCodexHome(explicit) {
  const requested = path.resolve(explicit ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"));
  if (fs.existsSync(requested)) return fs.realpathSync(requested);
  let ancestor = requested;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const resolvedAncestor = fs.existsSync(ancestor) ? fs.realpathSync(ancestor) : ancestor;
  return path.resolve(resolvedAncestor, path.relative(ancestor, requested));
}

function pathsFor(options = {}) {
  const codexHome = resolveCodexHome(options.codexHome);
  const stateDirectory = path.join(codexHome, "scientist1");
  return {
    codexHome,
    config: path.join(codexHome, "config.toml"),
    stateDirectory,
    state: path.join(stateDirectory, "capacity-preflight.json"),
    lock: path.join(stateDirectory, "capacity-preflight.lock"),
  };
}

function samePath(left, right) {
  try {
    const resolvedLeft = fs.existsSync(left) ? fs.realpathSync(left) : path.resolve(left);
    const resolvedRight = fs.existsSync(right) ? fs.realpathSync(right) : path.resolve(right);
    return resolvedLeft === resolvedRight;
  } catch {
    return false;
  }
}

function assertUnderRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  const error = new Error("Scientist1 capacity state must remain inside the resolved Codex home.");
  error.code = "S1_MANAGED_PATH";
  throw error;
}

function assertNoSymlinkComponents(root, target) {
  assertUnderRoot(root, target);
  const relative = path.relative(root, target);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) {
      const error = new Error("Scientist1 will not mutate symlink-managed Codex configuration or preference paths.");
      error.code = "S1_MANAGED_PATH";
      throw error;
    }
  }
}

function assertSafePaths(paths) {
  assertNoSymlinkComponents(paths.codexHome, paths.config);
  assertNoSymlinkComponents(paths.codexHome, paths.stateDirectory);
  assertNoSymlinkComponents(paths.codexHome, paths.state);
  assertNoSymlinkComponents(paths.codexHome, paths.lock);
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error?.code)) throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function atomicWrite(file, content, mode = 0o600) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const descriptor = fs.openSync(temporary, "wx", mode);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(temporary, file);
    fsyncDirectory(directory);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function writeExclusive(file, content, mode = 0o600) {
  const descriptor = fs.openSync(file, "wx", mode);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(path.dirname(file));
}

function waitBriefly(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function lockOwnerIsGone(lockFile) {
  try {
    const owner = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (!Number.isInteger(owner.pid) || owner.pid < 1) return false;
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

function withLock(options, callback) {
  const paths = pathsFor(options);
  assertSafePaths(paths);
  fs.mkdirSync(paths.stateDirectory, { recursive: true, mode: 0o700 });
  assertSafePaths(paths);
  const deadline = Date.now() + (options.lockTimeoutMs ?? LOCK_TIMEOUT_MS);
  let descriptor;
  while (descriptor === undefined) {
    try {
      descriptor = fs.openSync(paths.lock, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (lockOwnerIsGone(paths.lock)) {
        fs.rmSync(paths.lock, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        const busy = new Error("Another Scientist1 capacity preflight is already running.");
        busy.code = "S1_CAPACITY_PREFLIGHT_BUSY";
        throw busy;
      }
      waitBriefly(25);
    }
  }
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`);
    fs.fsyncSync(descriptor);
    fsyncDirectory(paths.stateDirectory);
    return callback(paths);
  } finally {
    fs.closeSync(descriptor);
    fs.rmSync(paths.lock, { force: true });
    fsyncDirectory(paths.stateDirectory);
  }
}

function codexConfigRequest(method, params, options = {}) {
  if (options.configRequest) return options.configRequest(method, params);
  return new Promise((resolve, reject) => {
    const codexPath = options.codexPath ?? process.env.CODEX_CLI_PATH ?? "codex";
    const child = spawn(codexPath, ["app-server", "--listen", "stdio://", "--disable", "plugins"], {
      env: {
        CODEX_HOME: pathsFor(options).codexHome,
        HOME: process.env.HOME,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        NO_COLOR: "1",
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        USERPROFILE: process.env.USERPROFILE,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let settled = false;
    const timeout = setTimeout(() => finish(Object.assign(new Error("Codex configuration service timed out."), { code: "S1_CONFIG_SERVICE_TIMEOUT" })), options.appServerTimeoutMs ?? CONFIG_TIMEOUT_MS);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    }
    child.once("error", finish);
    child.once("close", (code) => {
      if (!settled) finish(Object.assign(new Error(`Codex configuration service exited before responding (${code}).`), { code: "S1_CONFIG_SERVICE_EXIT" }));
    });
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      buffer += chunk;
      for (let end; (end = buffer.indexOf("\n")) !== -1;) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 0) {
          if (message.error) return finish(Object.assign(new Error("Codex configuration service initialization failed."), { code: message.error.code, data: message.error.data }));
          child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
          child.stdin.write(`${JSON.stringify({ id: 1, method, params })}\n`);
        } else if (message.id === 1) {
          if (message.error) {
            const error = new Error(message.error.message ?? "Codex configuration request failed.");
            error.code = message.error.data?.code ?? message.error.code;
            error.data = message.error.data;
            return finish(error);
          }
          return finish(null, message.result);
        }
      }
    });
    child.stdin.write(`${JSON.stringify({ id: 0, method: "initialize", params: { clientInfo: { name: "scientist1", title: "Scientist1", version: "1.5.0" } } })}\n`);
  });
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function instanceFingerprint(options = {}) {
  const marker = options.instanceMarker ?? process.env.CODEX_APP_TOOLS_PIPE_PATH;
  return typeof marker === "string" && marker.length > 0 ? sha256(marker) : null;
}

function remember(options, decision, details = {}) {
  atomicWrite(pathsFor(options).state, `${JSON.stringify({
    schema_version: STATE_SCHEMA_VERSION,
    target_concurrency: TARGET_CONCURRENCY,
    decision,
    recorded_at: new Date(options.now ?? Date.now()).toISOString(),
    ...details,
  }, null, 2)}\n`);
}

function persistDecision(options, decision, details = {}) {
  if (options.stateWriter) return options.stateWriter({ options, decision, details });
  return remember(options, decision, details);
}

function limited(reason, configuredConcurrency = null, changed = undefined) {
  return { action: "continue_limited", ...(changed === undefined ? {} : { changed }), reason, configured_concurrency: configuredConcurrency, target_concurrency: TARGET_CONCURRENCY };
}

function storageWritable(paths) {
  const probe = path.join(paths.stateDirectory, `.capacity-preflight-probe.${process.pid}.${Date.now()}`);
  try {
    fs.mkdirSync(paths.stateDirectory, { recursive: true, mode: 0o700 });
    assertSafePaths(paths);
    writeExclusive(probe, "ok\n");
    fs.rmSync(probe);
    fsyncDirectory(paths.stateDirectory);
    return true;
  } catch {
    fs.rmSync(probe, { force: true });
    return false;
  }
}

function baseUserLayer(readResult) {
  return readResult?.layers?.find((layer) => layer?.name?.type === "user" && (layer.name.profile ?? null) === null) ?? null;
}

function effectiveCapacity(readResult) {
  const agents = readResult?.config?.agents;
  const max = agents?.max_concurrent_threads_per_session ?? agents?.max_threads ?? null;
  return Number.isInteger(max) && max > 0 ? max : null;
}

function effectiveV2Override(readResult) {
  const max = readResult?.config?.features?.multi_agent_v2?.max_concurrent_threads_per_session;
  return Number.isInteger(max) && max > 0 ? max : null;
}

function capacityOrigin(readResult) {
  return readResult?.origins?.["agents.max_concurrent_threads_per_session"] ?? readResult?.origins?.["agents.max_threads"] ?? null;
}

function managedEffectiveCapacity(readResult) {
  const origin = capacityOrigin(readResult)?.name;
  if (!origin) return false;
  const user = baseUserLayer(readResult)?.name;
  return origin.type !== "user"
    || (origin.profile ?? null) !== null
    || !user
    || (origin.file && user.file && !samePath(origin.file, user.file));
}

function stateDecision(options) {
  const state = readJson(pathsFor(options).state);
  return state?.schema_version === STATE_SCHEMA_VERSION && state.target_concurrency >= TARGET_CONCURRENCY ? state : null;
}

function resolvePendingRestart(options) {
  const state = stateDecision(options);
  if (state?.decision !== "applied" || state.restart_pending !== true) return null;
  const currentFingerprint = instanceFingerprint(options);
  if (state.applied_instance_fingerprint && currentFingerprint && state.applied_instance_fingerprint !== currentFingerprint) {
    try {
      withLock(options, () => remember(options, "applied", { ...state, restart_pending: false }));
      return null;
    } catch {
      return limited("managed", state.configured_concurrency);
    }
  }
  return { action: "restart_required", reason: "restart_pending", configured_concurrency: state.configured_concurrency ?? TARGET_CONCURRENCY, target_concurrency: TARGET_CONCURRENCY };
}

function rememberLimited(options, decision, reason, configuredConcurrency = null, details = {}) {
  try { withLock(options, () => remember(options, decision, { reason, configured_concurrency: configuredConcurrency, ...details })); } catch { /* Preference storage must never block research. */ }
  return limited(reason, configuredConcurrency);
}

async function capacityStatusWithCodex(options = {}) {
  try { assertSafePaths(pathsFor(options)); } catch { return limited("managed"); }
  const restart = resolvePendingRestart(options);
  if (restart) return restart;
  let readResult;
  try {
    readResult = await codexConfigRequest("config/read", { includeLayers: true }, options);
  } catch {
    return rememberLimited(options, "unsupported", "config_service_unavailable");
  }
  const configuredConcurrency = effectiveCapacity(readResult);
  if (effectiveV2Override(readResult) !== null) return rememberLimited(options, "managed", "explicit_v2_override", configuredConcurrency);
  if (readResult?.config?.agents?.enabled === false) return rememberLimited(options, "managed", "agents_disabled", configuredConcurrency);
  if (configuredConcurrency !== null && configuredConcurrency >= TARGET_CONCURRENCY) {
    return { action: "continue", reason: "capacity_sufficient", configured_concurrency: configuredConcurrency, target_concurrency: TARGET_CONCURRENCY };
  }
  if (managedEffectiveCapacity(readResult)) return rememberLimited(options, "managed", "managed", configuredConcurrency);
  const prior = stateDecision(options);
  if (prior && NO_PROMPT_DECISIONS.has(prior.decision)) return limited(prior.decision === "declined" ? "declined" : prior.reason ?? prior.decision, configuredConcurrency);
  if (!instanceFingerprint(options)) return rememberLimited(options, "unsupported", "restart_detection_unavailable", configuredConcurrency);
  const paths = pathsFor(options);
  const userLayer = baseUserLayer(readResult);
  if (!userLayer?.version || !userLayer?.name?.file || !samePath(userLayer.name.file, paths.config) || !storageWritable(paths)) return rememberLimited(options, "managed", "managed", configuredConcurrency);
  return { action: "prompt", reason: "capacity_below_target", configured_concurrency: configuredConcurrency, target_concurrency: TARGET_CONCURRENCY };
}

async function declineParallelCapacity(options = {}) {
  let configuredConcurrency = null;
  try { configuredConcurrency = effectiveCapacity(await codexConfigRequest("config/read", { includeLayers: true }, options)); } catch { /* The explicit preference is still durable without the service. */ }
  return rememberLimited(options, "declined", "declined", configuredConcurrency);
}

function userLayerValues(userLayer) {
  const agents = userLayer?.config?.agents ?? {};
  return { canonical: agents.max_concurrent_threads_per_session ?? null, legacy: agents.max_threads ?? null };
}

function appServerEdits(value) {
  return [
    { keyPath: "agents.max_threads", value: null, mergeStrategy: "replace" },
    { keyPath: "agents.max_concurrent_threads_per_session", value, mergeStrategy: "replace" },
  ];
}

function appServerRollbackEdits(userLayer) {
  const values = userLayerValues(userLayer);
  return [
    { keyPath: "agents.max_concurrent_threads_per_session", value: values.canonical, mergeStrategy: "replace" },
    { keyPath: "agents.max_threads", value: values.legacy, mergeStrategy: "replace" },
  ];
}

function isVersionConflict(error) {
  return error?.code === "configVersionConflict" || /version|conflict|modified since/i.test(error?.message ?? "");
}

async function appServerRollback(options, userLayer, expectedVersion) {
  return codexConfigRequest("config/batchWrite", { edits: appServerRollbackEdits(userLayer), expectedVersion, filePath: userLayer.name.file, reloadUserConfig: false }, options);
}

function backupName(file, now) {
  const stamp = new Date(now).toISOString().replace(/[-:.]/g, "");
  return `${file}.scientist1-backup-${stamp}-${process.pid}`;
}

async function applyParallelCapacityWithCodex(options = {}) {
  if (options.confirmed !== true) throw new Error("Refusing to change Codex configuration without explicit researcher confirmation.");
  const paths = pathsFor(options);
  try { assertSafePaths(paths); } catch { return { ...rememberLimited(options, "managed", "managed"), changed: false }; }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let readResult;
    try { readResult = await codexConfigRequest("config/read", { includeLayers: true }, options); } catch {
      return { ...rememberLimited(options, "unsupported", "config_service_unavailable"), changed: false };
    }
    const configuredConcurrency = effectiveCapacity(readResult);
    if (effectiveV2Override(readResult) !== null) return { ...rememberLimited(options, "managed", "explicit_v2_override", configuredConcurrency), changed: false };
    if (readResult?.config?.agents?.enabled === false) return { ...rememberLimited(options, "managed", "agents_disabled", configuredConcurrency), changed: false };
    if (configuredConcurrency !== null && configuredConcurrency >= TARGET_CONCURRENCY) return { action: "continue", changed: false, configured_concurrency: configuredConcurrency, target_concurrency: TARGET_CONCURRENCY };
    if (managedEffectiveCapacity(readResult)) return { ...rememberLimited(options, "managed", "managed", configuredConcurrency), changed: false };
    if (!instanceFingerprint(options)) return { ...rememberLimited(options, "unsupported", "restart_detection_unavailable", configuredConcurrency), changed: false };
    const userLayer = baseUserLayer(readResult);
    if (!userLayer?.version || !userLayer?.name?.file || !samePath(userLayer.name.file, paths.config) || !storageWritable(paths)) return { ...rememberLimited(options, "managed", "managed", configuredConcurrency), changed: false };

    const originalExists = fs.existsSync(paths.config);
    const original = originalExists ? fs.readFileSync(paths.config) : Buffer.from("");
    const now = options.now ?? Date.now();
    const backup = originalExists ? backupName(paths.config, now + attempt - 1) : null;
    const backupPath = backup ? path.relative(paths.codexHome, backup) : null;
    if (backup) writeExclusive(backup, original, 0o600);
    let response;
    try {
      response = await codexConfigRequest("config/batchWrite", { edits: appServerEdits(TARGET_CONCURRENCY), expectedVersion: userLayer.version, filePath: userLayer.name.file, reloadUserConfig: false }, options);
    } catch (error) {
      if (backup) {
        fs.rmSync(backup, { force: true });
        fsyncDirectory(path.dirname(backup));
      }
      if (attempt === 1 && isVersionConflict(error)) continue;
      return { ...rememberLimited(options, "unsupported", isVersionConflict(error) ? "config_changed_concurrently" : "config_write_failed", configuredConcurrency), changed: false };
    }
    if (!response?.filePath || !samePath(response.filePath, paths.config) || !response.version) throw new Error("Codex configuration service returned an unexpected write target.");
    if (response.status === "okOverridden") {
      try { await appServerRollback(options, userLayer, response.version); } catch { /* Expected-version rollback never overwrites a concurrent writer. */ }
      return { ...rememberLimited(options, "managed", "managed", configuredConcurrency, { backup_path: backupPath }), changed: false, backup_path: backupPath };
    }
    if (response.status !== "ok") throw new Error("Codex configuration service returned an unknown write status.");

    let validated;
    try { validated = await codexConfigRequest("config/read", { includeLayers: true }, options); } catch { /* handled by rollback */ }
    if (effectiveCapacity(validated) !== TARGET_CONCURRENCY || managedEffectiveCapacity(validated)) {
      try { await appServerRollback(options, userLayer, response.version); } catch (rollbackError) {
        throw new AggregateError([rollbackError], `Scientist1 could not safely roll back the Codex setting. Recovery backup: ${backupPath ?? "none"}.`);
      }
      return { ...rememberLimited(options, "unsupported", "config_validation_failed", configuredConcurrency, { backup_path: backupPath }), changed: false, backup_path: backupPath };
    }

    const updated = fs.readFileSync(paths.config);
    try {
      persistDecision(options, "applied", {
        configured_concurrency: TARGET_CONCURRENCY,
        config_sha256: sha256(updated),
        backup_path: backupPath,
        applied_instance_fingerprint: instanceFingerprint(options),
        restart_pending: true,
      });
    } catch {
      try { await appServerRollback(options, userLayer, response.version); } catch (rollbackError) {
        throw new AggregateError([rollbackError], `Scientist1 could not safely roll back the Codex setting. Recovery backup: ${backupPath ?? "none"}.`);
      }
      return { ...limited("unsupported", configuredConcurrency, false), backup_path: backupPath };
    }
    return { action: "restart_required", changed: true, configured_concurrency: TARGET_CONCURRENCY, target_concurrency: TARGET_CONCURRENCY, backup_path: backupPath };
  }
  return { ...limited("config_changed_concurrently", null), changed: false };
}

export { TARGET_CONCURRENCY, applyParallelCapacityWithCodex, capacityStatusWithCodex, codexConfigRequest, declineParallelCapacity };
