import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, "..");
const POLICY_FILE = path.join(PLUGIN_ROOT, "skills", "scientistone", "references", "model-policy.json");
const ROUTING_FILE = path.join("environment", "model-routing.json");
const TOKEN_PATTERN = /^s1_([a-z0-9_]+)__([0-9a-f]{32})$/;
const LAUNCH_GRANT_TTL_MS = 10 * 60 * 1000;
const TIERS = new Set(["strong", "efficient"]);
const CURRENT_EFFICIENT_REASONING_EFFORT = "xhigh";
const STRUCTURED_TIER_FIELDS = ["tier", "model_tier", "semantic_tier", "performance_tier", "capability_tier"];
const TIER_WORDS = {
  strong: ["strong", "frontier", "flagship", "most capable", "most advanced", "state of the art", "state-of-the-art"],
  efficient: ["efficient", "affordable", "fast", "low cost", "low-cost", "cost effective", "cost-effective", "lightweight", "high volume", "high-volume"],
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function atomicJson(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (exclusive) {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return;
  }
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

class LaunchAuthorizationError extends Error {
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = "LaunchAuthorizationError";
    this.code = code;
  }
}

function launchStateHome(options = {}) {
  const env = options.env ?? process.env;
  const explicit = options.stateHome ?? env.SCIENTISTONE_STATE_HOME;
  if (explicit) {
    if (!path.isAbsolute(explicit)) throw new Error("SCIENTISTONE_STATE_HOME must be an absolute path.");
    return path.resolve(explicit);
  }
  const home = options.home ?? os.homedir();
  if (!home || !path.isAbsolute(home)) throw new Error("ScientistOne could not resolve a stable local state directory.");
  const platform = options.platform ?? process.platform;
  if (platform === "win32") return path.join(path.resolve(home), "AppData", "Local", "ScientistOne");
  if (platform === "darwin") return path.join(path.resolve(home), "Library", "Caches", "ScientistOne");
  return path.join(path.resolve(home), ".cache", "scientistone");
}

function launchGrantDirectory(options = {}) {
  return path.join(launchStateHome(options), "role-launches");
}

function cleanupExpiredLaunchGrants(directory, now = Date.now()) {
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    if (!/^[0-9a-f]{32}\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    try {
      const grant = readJson(file);
      if (Number.isFinite(Date.parse(grant.expires_at)) && Date.parse(grant.expires_at) < now) fs.unlinkSync(file);
    } catch {
      // Leave malformed files for an explicit authorization failure rather than deleting unknown data.
    }
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function validatePolicy(policy) {
  assertObject(policy, "model policy");
  if (policy.schema_version !== 1) throw new Error("Unsupported ScientistOne model-policy schema.");
  assertObject(policy.roles, "model policy roles");
  for (const [role, setting] of Object.entries(policy.roles)) {
    if (!/^[a-z0-9_]+$/.test(role)) throw new Error(`Invalid role in model policy: ${role}.`);
    assertObject(setting, `model policy for ${role}`);
    if (!TIERS.has(setting.tier) || typeof setting.reasoning_effort !== "string" || !setting.reasoning_effort) throw new Error(`Invalid model policy for ${role}.`);
  }
  return policy;
}

function validateCurrentPolicy(policy) {
  validatePolicy(policy);
  for (const [role, setting] of Object.entries(policy.roles)) {
    if (setting.tier === "efficient" && setting.reasoning_effort !== CURRENT_EFFICIENT_REASONING_EFFORT) {
      throw new Error(`Current ScientistOne model policy requires reasoning effort ${CURRENT_EFFICIENT_REASONING_EFFORT} for efficient role ${role}.`);
    }
  }
  return policy;
}

function loadModelPolicy(file = POLICY_FILE) {
  return validateCurrentPolicy(readJson(file));
}

function reasoningLevels(model) {
  const values = Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels : [];
  return [...new Set(values.map((value) => typeof value === "string" ? value : value?.effort).filter((value) => typeof value === "string" && value))];
}

function normalizeCatalog(catalog) {
  const models = Array.isArray(catalog) ? catalog : catalog?.models;
  if (!Array.isArray(models)) throw new Error("Codex returned an invalid model catalog.");
  return models.map((model) => {
    const semanticFields = model?.semantic_fields && typeof model.semantic_fields === "object" && !Array.isArray(model.semantic_fields)
      ? Object.fromEntries(Object.entries(model.semantic_fields).filter(([field, value]) => STRUCTURED_TIER_FIELDS.includes(field) && typeof value === "string"))
      : Object.fromEntries(STRUCTURED_TIER_FIELDS.filter((field) => typeof model?.[field] === "string").map((field) => [field, model[field]]));
    return {
      slug: model?.slug,
      description: typeof model?.description === "string" ? model.description : "",
      priority: Number.isFinite(model?.priority) ? model.priority : Number.MAX_SAFE_INTEGER,
      visibility: model?.visibility ?? null,
      supported_in_api: model?.supported_in_api !== false,
      supported_reasoning_levels: reasoningLevels(model),
      semantic_fields: semanticFields,
      tags: Array.isArray(model?.tags) ? model.tags.filter((tag) => typeof tag === "string") : [],
    };
  }).filter((model) => typeof model.slug === "string" && model.slug && model.supported_in_api && (model.visibility === null || model.visibility === "list"));
}

function semanticText(model) {
  return model.description.toLowerCase();
}

function declaredTier(model) {
  const values = [...Object.values(model.semantic_fields), ...model.tags].map((value) => value.toLowerCase().trim());
  const matches = [...TIERS].filter((tier) => values.some((value) => value === tier || TIER_WORDS[tier].includes(value)));
  return matches.length === 1 ? matches[0] : null;
}

function matchesTier(model, tier) {
  const declared = declaredTier(model);
  if (declared) return declared === tier;
  const text = semanticText(model);
  const own = TIER_WORDS[tier].some((word) => text.includes(word));
  const otherTier = tier === "strong" ? "efficient" : "strong";
  const other = TIER_WORDS[otherTier].some((word) => text.includes(word));
  return own && !other;
}

function chooseTier(models, tier) {
  const candidates = models.filter((model) => matchesTier(model, tier)).sort((left, right) => left.priority - right.priority || left.slug.localeCompare(right.slug));
  if (!candidates.length) throw new Error(`The live Codex catalog does not unambiguously identify an eligible ${tier} model.`);
  if (candidates.length > 1 && candidates[0].priority === candidates[1].priority) throw new Error(`The live Codex catalog has an ambiguous ${tier} model priority tie.`);
  return candidates[0];
}

function resolveModelCatalog(catalog, policy = loadModelPolicy()) {
  validatePolicy(policy);
  const models = normalizeCatalog(catalog);
  const tiers = Object.fromEntries([...TIERS].map((tier) => {
    const selected = chooseTier(models, tier);
    const required = [...new Set(Object.values(policy.roles).filter((setting) => setting.tier === tier).map((setting) => setting.reasoning_effort))];
    for (const effort of required) {
      if (!selected.supported_reasoning_levels.includes(effort)) throw new Error(`The resolved ${tier} model does not support required reasoning effort ${effort}.`);
    }
    return [tier, { model: selected.slug, priority: selected.priority, description: selected.description, supported_reasoning_levels: selected.supported_reasoning_levels }];
  }));
  return { models, tiers };
}

function createRoutingRecord(catalog, policy = loadModelPolicy(), resolvedAt = new Date().toISOString()) {
  validateCurrentPolicy(policy);
  const { models, tiers } = resolveModelCatalog(catalog, policy);
  const core = {
    schema_version: 1,
    resolved_at: resolvedAt,
    policy,
    policy_sha256: sha256(policy),
    catalog: models,
    catalog_sha256: sha256(models),
    tiers,
  };
  return { ...core, routing_sha256: sha256(core) };
}

function validateRoutingRecord(record) {
  assertObject(record, "model routing record");
  if (record.schema_version !== 1 || typeof record.resolved_at !== "string" || !Number.isFinite(Date.parse(record.resolved_at))) throw new Error("Invalid ScientistOne model-routing record.");
  validatePolicy(record.policy);
  if (record.policy_sha256 !== sha256(record.policy) || record.catalog_sha256 !== sha256(record.catalog)) throw new Error("ScientistOne model-routing policy or catalog hash mismatch.");
  const { tiers } = resolveModelCatalog(record.catalog, record.policy);
  if (canonical(record.tiers) !== canonical(tiers)) throw new Error("ScientistOne model-routing resolution is inconsistent with its frozen catalog.");
  const core = { ...record };
  delete core.routing_sha256;
  if (record.routing_sha256 !== sha256(core)) throw new Error("ScientistOne model-routing record hash mismatch.");
  return record;
}

async function readLiveCatalog(codexPath = process.env.CODEX_CLI_PATH || "codex") {
  const { stdout } = await execFileAsync(codexPath, ["debug", "models"], { encoding: "utf8", timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function validateRunPath(runPath) {
  if (typeof runPath !== "string" || !path.isAbsolute(runPath)) throw new Error("run_path must be an absolute ScientistOne run path.");
  const run = fs.realpathSync(runPath);
  if (!fs.statSync(run).isDirectory() || !fs.existsSync(path.join(run, "run.json"))) throw new Error("run_path must contain a ScientistOne run.json file.");
  return run;
}

function validateCurrentAvailability(record, catalog) {
  const current = normalizeCatalog(catalog);
  for (const [tier, selected] of Object.entries(record.tiers)) {
    const model = current.find((candidate) => candidate.slug === selected.model);
    if (!model) throw new Error(`The ${tier} model frozen for this run is no longer available. Pause the run; do not silently migrate it.`);
    const required = [...new Set(Object.values(record.policy.roles).filter((setting) => setting.tier === tier).map((setting) => setting.reasoning_effort))];
    if (required.some((effort) => !model.supported_reasoning_levels.includes(effort))) throw new Error(`The ${tier} model frozen for this run no longer supports every required reasoning effort. Pause the run; do not silently downgrade it.`);
  }
}

async function ensureRunRouting(runPath, options = {}) {
  const run = validateRunPath(runPath);
  const file = path.join(run, ROUTING_FILE);
  const liveCatalog = options.catalog ?? await readLiveCatalog(options.codexPath);
  if (fs.existsSync(file)) {
    const record = validateRoutingRecord(readJson(file));
    validateCurrentAvailability(record, liveCatalog);
    return record;
  }
  const record = createRoutingRecord(liveCatalog, loadModelPolicy(options.policyFile));
  try {
    atomicJson(file, record, true);
    return record;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = validateRoutingRecord(readJson(file));
    validateCurrentAvailability(existing, liveCatalog);
    return existing;
  }
}

function readRunRouting(runPath) {
  const run = validateRunPath(runPath);
  const file = path.join(run, ROUTING_FILE);
  if (!fs.existsSync(file)) throw new Error("ScientistOne model routing has not been frozen for this run.");
  return validateRoutingRecord(readJson(file));
}

function expectedRoleRuntime(runPath, role) {
  const record = readRunRouting(runPath);
  const setting = record.policy.roles[role];
  if (!setting) throw new Error(`Role ${role} is not present in the frozen ScientistOne model policy.`);
  return {
    tier: setting.tier,
    model: record.tiers[setting.tier].model,
    reasoning_effort: setting.reasoning_effort,
    routing_sha256: record.routing_sha256,
  };
}

function normalizeRolePath(run, value, label) {
  if (typeof value !== "string" || !value) throw new Error(`${label} must contain non-empty paths.`);
  const relative = path.isAbsolute(value) ? path.relative(run, value) : value;
  const normalized = path.normalize(relative).split(path.sep).join("/");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || path.isAbsolute(normalized)) throw new Error(`${label} contains a path outside the run.`);
  return normalized;
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${label} must be an array of non-empty strings.`);
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
  return value;
}

async function prepareRoleLaunch(args, options = {}) {
  assertObject(args, "prepare_role_launch arguments");
  const run = validateRunPath(args.run_path);
  if (typeof args.task_name !== "string" || !/^[a-z0-9_]{1,120}$/.test(args.task_name)) throw new Error("task_name must use 1-120 lowercase letters, digits, or underscores.");
  const logicalTaskName = args.logical_task_name ?? args.task_name;
  if (typeof logicalTaskName !== "string" || !/^[a-z0-9_]{1,120}$/.test(logicalTaskName)) throw new Error("logical_task_name must use 1-120 lowercase letters, digits, or underscores.");
  const attempt = args.attempt ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be a positive integer.");
  if (typeof args.role !== "string" || !args.role) throw new Error("role is required.");
  const routing = await ensureRunRouting(run, options);
  const runtime = expectedRoleRuntime(run, args.role);
  const declaredInputs = stringArray(args.declared_inputs, "declared_inputs").map((value) => normalizeRolePath(run, value, "declared_inputs"));
  const declaredOutputs = stringArray(args.declared_outputs, "declared_outputs").map((value) => normalizeRolePath(run, value, "declared_outputs"));
  if (!declaredOutputs.length) throw new Error("declared_outputs must not be empty.");
  const allowedExternalSources = stringArray(args.allowed_external_sources ?? [], "allowed_external_sources");
  const startedAt = new Date().toISOString();
  const launchRelative = `role-launches/${args.task_name}.json`;
  const launchFile = path.join(run, launchRelative);
  const launch = {
    schema_version: 1,
    task_id: `native-${args.task_name}`,
    logical_task_name: logicalTaskName,
    attempt,
    role: args.role,
    fork_turns: "none",
    model_tier: runtime.tier,
    model: runtime.model,
    reasoning_effort: runtime.reasoning_effort,
    model_routing_sha256: routing.routing_sha256,
    declared_inputs: declaredInputs,
    allowed_external_sources: allowedExternalSources,
    declared_outputs: declaredOutputs,
    started_at: startedAt,
  };
  try {
    atomicJson(launchFile, launch, true);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`A launch record already exists for task ${args.task_name}; use a fresh task name.`);
    throw error;
  }
  const tokenDirectory = launchGrantDirectory(options);
  fs.mkdirSync(tokenDirectory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(tokenDirectory, 0o700); } catch {}
  const now = options.now ?? Date.now();
  cleanupExpiredLaunchGrants(tokenDirectory, now);
  const token = randomBytes(16).toString("hex");
  const marker = `s1_${args.role}__${token}`;
  atomicJson(path.join(tokenDirectory, `${token}.json`), {
    schema_version: 1,
    token,
    marker,
    run_path: run,
    launch_record: launchRelative,
    logical_task_name: logicalTaskName,
    attempt,
    expires_at: new Date(now + (options.grantTtlMs ?? LAUNCH_GRANT_TTL_MS)).toISOString(),
  }, true);
  return {
    task_name: marker,
    fork_turns: "none",
    model: runtime.model,
    reasoning_effort: runtime.reasoning_effort,
    launch_record: launchRelative,
    logical_task_name: logicalTaskName,
    attempt,
    model_tier: runtime.tier,
  };
}

function consumeLaunchToken(marker, options = {}) {
  if (typeof marker !== "string") return null;
  const match = TOKEN_PATTERN.exec(marker);
  if (!match) return null;
  const [, markerRole, token] = match;
  const tokenDirectory = launchGrantDirectory(options);
  const file = path.join(tokenDirectory, `${token}.json`);
  const claimed = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.claimed`;
  let grant;
  try {
    fs.renameSync(file, claimed);
  } catch (error) {
    throw new LaunchAuthorizationError(error.code === "ENOENT" ? "S1_LAUNCH_GRANT_NOT_FOUND" : "S1_LAUNCH_GRANT_MISMATCH", error.code === "ENOENT" ? "ScientistOne launch authorization is missing or was already used." : "ScientistOne launch authorization could not be claimed.");
  }
  try {
    grant = readJson(claimed);
    if (grant.schema_version !== 1 || grant.token !== token || grant.marker !== marker || !Number.isFinite(Date.parse(grant.expires_at))) throw new LaunchAuthorizationError("S1_LAUNCH_GRANT_MISMATCH", "ScientistOne launch authorization is malformed or does not match its marker.");
    if (Date.parse(grant.expires_at) < (options.now ?? Date.now())) throw new LaunchAuthorizationError("S1_LAUNCH_GRANT_EXPIRED", "ScientistOne launch authorization expired before the specialist started.");
    const run = validateRunPath(grant.run_path);
    const runtimeRecord = readRunRouting(run);
    const launchFile = path.join(run, normalizeRolePath(run, grant.launch_record, "launch_record"));
    const launch = readJson(launchFile);
    const runtime = expectedRoleRuntime(run, launch.role);
    const cleanTaskName = path.basename(grant.launch_record, ".json");
    const logicalTaskName = launch.logical_task_name ?? cleanTaskName;
    const attempt = launch.attempt ?? 1;
    if (markerRole !== launch.role || launch.task_id !== `native-${cleanTaskName}` || grant.logical_task_name !== logicalTaskName || grant.attempt !== attempt || launch.fork_turns !== "none" || launch.model_tier !== runtime.tier || launch.model !== runtime.model || launch.reasoning_effort !== runtime.reasoning_effort || launch.model_routing_sha256 !== runtimeRecord.routing_sha256) throw new LaunchAuthorizationError("S1_LAUNCH_POLICY_MISMATCH", "ScientistOne launch authorization does not match the frozen role policy or launch attempt.");
    return { task_name: cleanTaskName, logical_task_name: logicalTaskName, attempt, model: runtime.model, reasoning_effort: runtime.reasoning_effort };
  } finally {
    try { fs.unlinkSync(claimed); } catch {}
  }
}

export {
  TOKEN_PATTERN,
  LaunchAuthorizationError,
  consumeLaunchToken,
  createRoutingRecord,
  ensureRunRouting,
  expectedRoleRuntime,
  loadModelPolicy,
  launchGrantDirectory,
  normalizeCatalog,
  prepareRoleLaunch,
  readLiveCatalog,
  readRunRouting,
  resolveModelCatalog,
  validateRoutingRecord,
};
