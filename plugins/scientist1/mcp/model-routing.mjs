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
const POLICY_FILE = path.join(PLUGIN_ROOT, "skills", "scientist1", "references", "model-policy.json");
const ROLE_CONTRACT_FILE = path.join(PLUGIN_ROOT, "skills", "scientist1", "references", "roles.md");
const PAPER_UNSLOP_FILE = path.join(PLUGIN_ROOT, "skills", "scientist1", "references", "paper-unslop.md");
const LEGACY_POLICY_FILE = path.join(PLUGIN_ROOT, "skills", "scientist1", "references", "legacy-model-policy-1.2.0.json");
const LEGACY_ROLE_CONTRACT_FILE = path.join(PLUGIN_ROOT, "skills", "scientist1", "references", "legacy-roles-1.2.0.md");
const ROUTING_FILE = path.join("environment", "model-routing.json");
const ACTIVE_ROUTING_FILE = path.join("environment", "model-routing-active.json");
const TOKEN_PATTERN = /^s1_([a-z0-9_]+)__([0-9a-f]{32})$/;
const LAUNCH_GRANT_TTL_MS = 10 * 60 * 1000;
const LIVE_CATALOG_TTL_MS = 15 * 60 * 1000;
const TIERS = new Set(["strong", "efficient"]);
const PAPER_UNSLOP_ROLES = new Set(["writer", "paper_critic", "paper_style_auditor"]);
const PAPER_STYLE_INPUT_ROLES = new Set(["contract_auditor", "writer", "paper_style_auditor"]);
const STRUCTURED_TIER_FIELDS = ["tier", "model_tier", "semantic_tier", "performance_tier", "capability_tier"];
const REPAIR_REVIEW_OUTPUTS = Object.freeze({
  checkpoint_reviewer: ["repairs/reviews/checkpoint"],
  contract_auditor: ["contract/audit.md"],
  protocol_auditor: ["investigation/protocol-audit.md"],
  brief_critic: ["investigation/critic.md"],
  idea_critic: ["discovery/idea-critique.jsonl"],
  legitimacy_auditor: ["legitimacy-audit.md"],
  selection_auditor: ["selection/selection-audit.md"],
  paper_critic: ["paper/grounding-report.json", "paper/critic.md"],
  claim_verifier: ["paper/claims.jsonl", "paper/verification.md", "paper/provenance.jsonl", "paper/paper.tex"],
  i1_score_auditor: ["audit/i1.json", "audit/i1"],
  i2_judge: ["audit/i2"],
  i3_reference_auditor: ["audit/i3.json"],
  i4_judge: ["audit/i4"],
  claim_provenance_auditor: ["audit/claim-provenance.json"],
});
const liveCatalogCache = new Map();
const liveCatalogInflight = new Map();

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function pathCoveredBy(allowed, observed) {
  return allowed.some((prefix) => observed === prefix || observed.startsWith(`${prefix}/`));
}

function repairReviewOutputAllowed(role, observed) {
  if (role === "legitimacy_auditor") return /^discovery\/nodes\/[^/]+\/legitimacy-audit\.md$/.test(observed);
  return pathCoveredBy(REPAIR_REVIEW_OUTPUTS[role] ?? [], observed);
}

function addField(hash, tag, value) {
  const data = Buffer.from(String(value));
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(data.length));
  hash.update(tag);
  hash.update(length);
  hash.update(data);
}

function addFile(hash, file) {
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
  } finally {
    fs.closeSync(descriptor);
  }
}

function hashAt(target, logical) {
  const hash = createHash("sha256");
  function walk(current, name) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks cannot be bound as Scientist1 inputs: ${name}.`);
    if (stat.isDirectory()) {
      addField(hash, "D", name);
      for (const child of fs.readdirSync(current).sort()) walk(path.join(current, child), `${name}/${child}`);
      return;
    }
    if (!stat.isFile()) throw new Error(`Only regular files and directories can be bound as Scientist1 inputs: ${name}.`);
    addField(hash, "F", name);
    addField(hash, "S", stat.size);
    addFile(hash, current);
  }
  walk(target, logical);
  return hash.digest("hex");
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
  const explicit = options.stateHome ?? env.SCIENTIST1_STATE_HOME;
  if (explicit) {
    if (!path.isAbsolute(explicit)) throw new Error("SCIENTIST1_STATE_HOME must be an absolute path.");
    return path.resolve(explicit);
  }
  const home = options.home ?? os.homedir();
  if (!home || !path.isAbsolute(home)) throw new Error("Scientist1 could not resolve a stable local state directory.");
  const platform = options.platform ?? process.platform;
  if (platform === "win32") return path.join(path.resolve(home), "AppData", "Local", "Scientist1");
  if (platform === "darwin") return path.join(path.resolve(home), "Library", "Caches", "Scientist1");
  return path.join(path.resolve(home), ".cache", "scientist1");
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
  if (policy.schema_version !== 1) throw new Error("Unsupported Scientist1 model-policy schema.");
  if (policy.models !== undefined) {
    assertObject(policy.models, "model policy models");
    for (const tier of TIERS) if (typeof policy.models[tier] !== "string" || !policy.models[tier]) throw new Error(`Missing configured ${tier} model.`);
  }
  assertObject(policy.roles, "model policy roles");
  for (const [role, setting] of Object.entries(policy.roles)) {
    if (!/^[a-z0-9_]+$/.test(role)) throw new Error(`Invalid role in model policy: ${role}.`);
    assertObject(setting, `model policy for ${role}`);
    if (!TIERS.has(setting.tier) || typeof setting.reasoning_effort !== "string" || !setting.reasoning_effort) throw new Error(`Invalid model policy for ${role}.`);
  }
  return policy;
}

function validateCurrentPolicy(policy) {
  return validatePolicy(policy);
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
  }).filter((model) => typeof model.slug === "string" && model.slug && model.supported_in_api);
}

function resolveModelCatalog(catalog, policy = loadModelPolicy()) {
  validatePolicy(policy);
  const models = normalizeCatalog(catalog);
  const configured = policy.models ?? loadModelPolicy().models;
  const tiers = Object.fromEntries([...TIERS].map((tier) => {
    const selected = models.find((model) => model.slug === configured[tier]);
    if (!selected) throw new Error(`The configured ${tier} model ${configured[tier]} is unavailable. Model changes require a plugin release.`);
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
  const expectedKeys = ["catalog", "catalog_sha256", "policy", "policy_sha256", "resolved_at", "routing_sha256", "schema_version", "tiers"];
  if (Object.keys(record).sort().join() !== expectedKeys.sort().join()) throw new Error("Scientist1 model-routing record has unknown or missing fields.");
  if (record.schema_version !== 1 || typeof record.resolved_at !== "string" || !Number.isFinite(Date.parse(record.resolved_at))) throw new Error("Invalid Scientist1 model-routing record.");
  validatePolicy(record.policy);
  if (record.policy_sha256 !== sha256(record.policy) || record.catalog_sha256 !== sha256(record.catalog)) throw new Error("Scientist1 model-routing policy or catalog hash mismatch.");
  // Older runs retain their hash-bound model names without catalog-based reselection.
  const models = record.policy.models ?? Object.fromEntries([...TIERS].map((tier) => [tier, record.tiers?.[tier]?.model]));
  const { tiers } = resolveModelCatalog(record.catalog, { ...record.policy, models });
  if (canonical(record.tiers) !== canonical(tiers)) throw new Error("Scientist1 model-routing resolution is inconsistent with its frozen catalog.");
  const core = { ...record };
  delete core.routing_sha256;
  if (record.routing_sha256 !== sha256(core)) throw new Error("Scientist1 model-routing record hash mismatch.");
  return record;
}

async function readLiveCatalog(codexPath = process.env.CODEX_CLI_PATH || "codex") {
  const { stdout } = await execFileAsync(codexPath, ["debug", "models"], { encoding: "utf8", timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function liveCatalogKey(options = {}) {
  const env = options.env ?? process.env;
  return JSON.stringify([
    options.codexPath ?? env.CODEX_CLI_PATH ?? "codex",
    options.catalogContext ?? env.CODEX_HOME ?? "",
    options.accountContext ?? "",
  ]);
}

async function cachedLiveCatalog(options = {}) {
  if (options.catalog !== undefined) return options.catalog;
  const key = liveCatalogKey(options);
  const now = options.now ?? Date.now();
  const cached = liveCatalogCache.get(key);
  if (cached && now - cached.at < (options.catalogTtlMs ?? LIVE_CATALOG_TTL_MS)) return cached.catalog;
  if (liveCatalogInflight.has(key)) return liveCatalogInflight.get(key);
  const loader = options.catalogLoader ?? ((codexPath) => readLiveCatalog(codexPath));
  const promise = Promise.resolve(loader(options.codexPath ?? (options.env ?? process.env).CODEX_CLI_PATH ?? "codex"))
    .then((catalog) => {
      liveCatalogCache.set(key, { at: now, catalog });
      return catalog;
    })
    .finally(() => liveCatalogInflight.delete(key));
  liveCatalogInflight.set(key, promise);
  return promise;
}

function clearLiveCatalogCache() {
  liveCatalogCache.clear();
  liveCatalogInflight.clear();
}

function validateRunPath(runPath) {
  if (typeof runPath !== "string" || !path.isAbsolute(runPath)) throw new Error("run_path must be an absolute Scientist1 run path.");
  const run = fs.realpathSync(runPath);
  if (!fs.statSync(run).isDirectory() || !fs.existsSync(path.join(run, "run.json"))) throw new Error("run_path must contain a Scientist1 run.json file.");
  return run;
}

function legacyRun(run) {
  const config = readJson(path.join(run, "contract", "run-config.json"));
  return config.schema_version === 1 && config.orchestration === undefined;
}

function convergenceMigrationRequired(run, runRecord) {
  const config = readJson(path.join(run, "contract", "run-config.json"));
  return [2, 3].includes(config.schema_version) && !runRecord.convergence_control;
}

function validateCurrentAvailability(record, catalog) {
  const current = normalizeCatalog(catalog);
  for (const [tier, selected] of Object.entries(record.tiers)) {
    const model = current.find((candidate) => candidate.slug === selected.model);
    if (!model) throw Object.assign(new Error(`The ${tier} model selected for future launches is no longer available. Model changes require a plugin release; preserve the saved route.`), { code: "S1_FROZEN_ROUTE_UNAVAILABLE" });
    const required = [...new Set(Object.values(record.policy.roles).filter((setting) => setting.tier === tier).map((setting) => setting.reasoning_effort))];
    if (required.some((effort) => !model.supported_reasoning_levels.includes(effort))) throw Object.assign(new Error(`The ${tier} model selected for future launches no longer supports every required reasoning effort. Model changes require a plugin release; preserve the saved route.`), { code: "S1_FROZEN_ROUTE_UNAVAILABLE" });
  }
}

function activeRoutingPath(run) {
  const pointerFile = path.join(run, ACTIVE_ROUTING_FILE);
  if (!fs.existsSync(pointerFile)) return path.join(run, ROUTING_FILE);
  const pointer = readJson(pointerFile);
  const expectedKeys = ["path", "routing_sha256", "schema_version"];
  if (!pointer || Object.keys(pointer).sort().join() !== expectedKeys.sort().join() || pointer.schema_version !== 1 || typeof pointer.routing_sha256 !== "string") throw new Error("Scientist1 active model-routing pointer is malformed.");
  const expectedPath = path.join("environment", "routing-history", `${pointer.routing_sha256}.json`).split(path.sep).join("/");
  if (pointer.path !== expectedPath) throw new Error("Scientist1 active model-routing pointer does not use its content-addressed history path.");
  const target = path.resolve(run, pointer.path);
  if (path.relative(run, target).startsWith("..") || !fs.existsSync(target)) throw new Error("Scientist1 active model-routing pointer target is missing or outside the run.");
  const record = validateRoutingRecord(readJson(target));
  if (record.routing_sha256 !== pointer.routing_sha256) throw new Error("Scientist1 active model-routing pointer hash does not match its target.");
  return target;
}

async function ensureRunRouting(runPath, options = {}) {
  const run = validateRunPath(runPath);
  const file = path.join(run, ROUTING_FILE);
  const liveCatalog = await cachedLiveCatalog(options);
  if (fs.existsSync(file)) {
    const record = validateRoutingRecord(readJson(activeRoutingPath(run)));
    validateCurrentAvailability(record, liveCatalog);
    return record;
  }
  const policyFile = options.policyFile ?? (legacyRun(run) ? LEGACY_POLICY_FILE : POLICY_FILE);
  const record = createRoutingRecord(liveCatalog, loadModelPolicy(policyFile));
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
  if (!fs.existsSync(file)) throw new Error("Scientist1 model routing has not been frozen for this run.");
  return validateRoutingRecord(readJson(activeRoutingPath(run)));
}

function expectedRoleRuntime(runPath, role) {
  const record = readRunRouting(runPath);
  const setting = record.policy.roles[role];
  if (!setting) throw new Error(`Role ${role} is not present in the frozen Scientist1 model policy.`);
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

function bindArtifact(run, relative) {
  const clean = normalizeRolePath(run, relative, "declared_inputs");
  const target = path.resolve(run, clean);
  if (!fs.existsSync(target)) throw new Error(`Declared Scientist1 input does not exist: ${clean}.`);
  return { path: clean, sha256: hashAt(target, clean) };
}

function ensureRepairAbsenceProof(run, docket) {
  const absentPaths = docket.repair_scope.filter((relative) => !fs.existsSync(path.join(run, relative))).sort();
  if (!absentPaths.length) return null;
  const relative = `repairs/absence-proofs/${docket.semantic_digest}.json`;
  const proof = { schema_version: 1, docket_id: docket.docket_id, semantic_digest: docket.semantic_digest, absent_paths: absentPaths };
  const target = path.join(run, relative);
  if (fs.existsSync(target)) {
    if (canonical(readJson(target)) !== canonical(proof)) throw Object.assign(new Error("The controller-owned repair absence proof differs from the current exact absent scope."), { code: "S1_REPAIR_ABSENCE_PROOF_DRIFT" });
  } else atomicJson(target, proof, true);
  return relative;
}

function currentRunBinding(run) {
  const record = readJson(path.join(run, "run.json"));
  if (!Number.isInteger(record.contract_revision) || !Number.isInteger(record.charter_revision) || !record.checkpoints || typeof record.checkpoints !== "object") throw new Error("Scientist1 run revisions or checkpoint anchors are malformed.");
  if (!legacyRun(run)) {
    let contractRevision = 1;
    let charterRevision = 1;
    for (const root of record.invalidation_roots ?? []) {
      const metadata = readJson(path.join(run, root.path, "invalidation.json"));
      if (metadata.contract_revision_before !== contractRevision || metadata.charter_revision_before !== charterRevision) throw new Error("Scientist1 invalidation revision history is noncontiguous.");
      contractRevision = metadata.contract_revision_after;
      charterRevision = metadata.charter_revision_after;
    }
    if (record.contract_revision !== contractRevision || record.charter_revision !== charterRevision) throw new Error("Scientist1 run revisions are not backed by immutable invalidation history.");
  }
  const last = record.last_checkpoint;
  const predecessor = last === null
    ? null
    : { path: `receipts/${last}.json`, sha256: record.checkpoints[last]?.receipt_sha256 };
  if (predecessor && typeof predecessor.sha256 !== "string") throw new Error("Scientist1 run predecessor anchor is malformed.");
  return { contract_revision: record.contract_revision, charter_revision: record.charter_revision, predecessor };
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${label} must be an array of non-empty strings.`);
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
  return value;
}

function taskBrief(value, declaredInputs) {
  assertObject(value, "task_brief");
  const expected = ["objective", "context", "acceptance_gate", "constraints", "upstream_summary"];
  const unknown = Object.keys(value).filter((key) => !expected.includes(key));
  if (unknown.length) throw new Error(`task_brief has unknown fields: ${unknown.join(", ")}.`);
  for (const field of ["objective", "context", "acceptance_gate", "constraints"]) if (typeof value[field] !== "string" || !value[field].trim()) throw new Error(`task_brief.${field} is required.`);
  if (!Array.isArray(value.upstream_summary)) throw new Error("task_brief.upstream_summary must be an array.");
  const upstream = value.upstream_summary.map((item, index) => {
    assertObject(item, `task_brief.upstream_summary[${index}]`);
    if (Object.keys(item).sort().join() !== "input_path,summary" || typeof item.input_path !== "string" || typeof item.summary !== "string" || !item.summary.trim()) throw new Error(`task_brief.upstream_summary[${index}] must contain input_path and summary.`);
    if (!declaredInputs.includes(item.input_path)) throw new Error(`task_brief upstream summary references undeclared input: ${item.input_path}.`);
    return { input_path: item.input_path, summary: item.summary.trim() };
  });
  return { objective: value.objective.trim(), context: value.context.trim(), acceptance_gate: value.acceptance_gate.trim(), constraints: value.constraints.trim(), upstream_summary: upstream };
}

function taskWorkKey(role, declaredOutputs, contractRevision, charterRevision, repairDocketId = null, repairSemanticDigest = null) {
  return createHash("sha256").update(canonical({ contract_revision: contractRevision, charter_revision: charterRevision, role, declared_outputs: [...declaredOutputs].sort(), ...(repairDocketId ? { repair_docket_id: repairDocketId, repair_semantic_digest: repairSemanticDigest } : {}) })).digest("hex");
}

function launchWorkKey(launch) {
  if (!launch || typeof launch.role !== "string" || !Array.isArray(launch.declared_outputs)) throw new Error("Scientist1 launch lacks a stable role/output work identity.");
  const observed = taskWorkKey(launch.role, launch.declared_outputs, launch.contract_revision ?? 1, launch.charter_revision ?? 1, launch.repair_binding?.docket_id ?? null, launch.repair_binding?.semantic_digest ?? null);
  if (launch.work_key_sha256 !== undefined && launch.work_key_sha256 !== observed) throw new Error("Scientist1 launch work identity does not match its role and exclusive outputs.");
  return observed;
}

function bindIdentity(file, value, code, message) {
  try {
    atomicJson(file, value, true);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readJson(file);
    if (canonical(existing) !== canonical(value)) throw Object.assign(new Error(message), { code });
  }
}

function acquireIdentityLock(file) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(file, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = Number.parseInt(fs.readFileSync(file, "utf8").trim(), 10);
      if (!Number.isInteger(owner) || owner < 1) break;
      try {
        process.kill(owner, 0);
        break;
      } catch (probeError) {
        if (probeError.code !== "ESRCH") break;
        try { fs.unlinkSync(file); } catch (unlinkError) { if (unlinkError.code !== "ENOENT") throw unlinkError; }
      }
    }
  }
  throw Object.assign(new Error("Scientist1 work identity is being bound by another live launch; retry this grant preparation."), { code: "S1_IDENTITY_BIND_BUSY" });
}

function outputWorkRebound(message) {
  return Object.assign(new Error(message), { code: "S1_OUTPUT_WORK_REBOUND" });
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validateHistoricalLaunchEnvelope(run, launch, launchRelative, repairDocketId) {
  assertObject(launch, "accepted launch");
  const required = ["allowed_external_sources", "assignment", "assignment_sha256", "attempt", "charter_revision", "contract_revision", "declared_inputs", "declared_outputs", "fork_turns", "gate_schema_version", "input_artifacts", "logical_task_name", "model", "model_routing_sha256", "model_tier", "predecessor", "reasoning_effort", "role", "role_contract_sha256", "schema_version", "started_at", "task_brief", "task_brief_sha256", "task_id", "work_key_sha256"];
  if (required.some((field) => !Object.hasOwn(launch, field))) throw new Error("accepted launch is missing a required field");
  const inputs = stringArray(launch.declared_inputs, "accepted launch declared_inputs");
  const outputs = stringArray(launch.declared_outputs, "accepted launch declared_outputs");
  stringArray(launch.allowed_external_sources, "accepted launch allowed_external_sources");
  if (inputs.some((value) => normalizeRolePath(run, value, "accepted launch declared_inputs") !== value) || outputs.some((value) => normalizeRolePath(run, value, "accepted launch declared_outputs") !== value)) throw new Error("accepted launch paths are not canonical");
  if (!Array.isArray(launch.input_artifacts) || launch.input_artifacts.length !== inputs.length || launch.input_artifacts.some((artifact, index) => !artifact || typeof artifact !== "object" || Array.isArray(artifact) || Object.keys(artifact).sort().join() !== "path,sha256" || artifact.path !== inputs[index] || !isSha256(artifact.sha256))) throw new Error("accepted launch input bindings are malformed");
  const normalizedBrief = taskBrief(launch.task_brief, inputs);
  if (canonical(normalizedBrief) !== canonical(launch.task_brief) || !isSha256(launch.task_brief_sha256) || launch.task_brief_sha256 !== sha256(launch.task_brief) || !nonemptyAssignment(launch.assignment, launch.assignment_sha256)) throw new Error("accepted launch brief or assignment binding is malformed");
  if (launch.predecessor !== null) {
    const predecessor = assertObject(launch.predecessor, "accepted launch predecessor");
    if (Object.keys(predecessor).sort().join() !== "path,sha256" || normalizeRolePath(run, predecessor.path, "accepted launch predecessor") !== predecessor.path || !isSha256(predecessor.sha256)) throw new Error("accepted launch predecessor is malformed");
  }
  if (launch.schema_version !== 1 || ![1, 2].includes(launch.gate_schema_version) || launch.fork_turns !== "none" || !TIERS.has(launch.model_tier) || typeof launch.model !== "string" || !launch.model || typeof launch.reasoning_effort !== "string" || !launch.reasoning_effort || !isSha256(launch.model_routing_sha256) || !isSha256(launch.role_contract_sha256) || typeof launch.started_at !== "string" || !Number.isFinite(Date.parse(launch.started_at))) throw new Error("accepted launch envelope is malformed");
  if (repairDocketId !== null) {
    const binding = assertObject(launch.repair_binding, "accepted launch repair_binding");
    const repairFields = ["baseline", "controller_delta", "dependent_regeneration", "docket_id", "finding_fingerprints", "incident_path", "incident_sha256", "repair_mode", "repair_scope", "scope_baseline", "semantic_digest"];
    if (repairFields.some((field) => !Object.hasOwn(binding, field)) || !isSha256(binding.docket_id) || !isSha256(binding.semantic_digest) || normalizeRolePath(run, binding.incident_path, "accepted launch repair incident") !== binding.incident_path || !isSha256(binding.incident_sha256) || !["scientific_delta", "deterministic_delta"].includes(binding.repair_mode) || stringArray(binding.finding_fingerprints, "accepted launch finding_fingerprints").some((value) => !isSha256(value)) || stringArray(binding.repair_scope, "accepted launch repair_scope").some((value) => normalizeRolePath(run, value, "accepted launch repair_scope") !== value) || !Array.isArray(binding.scope_baseline) || !Array.isArray(binding.controller_delta) || !Array.isArray(binding.dependent_regeneration) || !Array.isArray(binding.baseline)) throw new Error("accepted launch repair binding is malformed");
  }
}

function hasAcceptedHistoricalOverlapBinding(run, logicalTaskName, workKey, role, declaredOutputs, contractRevision, charterRevision, repairDocketId, repairSemanticDigest) {
  const acceptedRoot = path.join(run, "role-attempts", logicalTaskName, workKey);
  if (!fs.existsSync(acceptedRoot)) return false;
  try {
    const rootStat = fs.lstatSync(acceptedRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("accepted-attempt root is not a regular directory");
    const attemptNames = fs.readdirSync(acceptedRoot).filter((name) => /^attempt-\d+\.json$/.test(name)).sort();
    if (!attemptNames.length) return false;
    for (const name of attemptNames) {
      const recordFile = path.join(acceptedRoot, name);
      const recordStat = fs.lstatSync(recordFile);
      if (!recordStat.isFile() || recordStat.isSymbolicLink()) throw new Error("accepted-attempt metadata is not a regular file");
      const record = readJson(recordFile);
      const expectedKeys = ["accepted_at", "attempt", "launch_record", "launch_record_sha256", "logical_task_name", "schema_version", "work_key_sha256"];
      if (!record || Object.keys(record).sort().join() !== expectedKeys.sort().join() || record.schema_version !== 2 || record.logical_task_name !== logicalTaskName || record.work_key_sha256 !== workKey || !Number.isInteger(record.attempt) || record.attempt < 1 || name !== `attempt-${record.attempt}.json` || typeof record.accepted_at !== "string" || !Number.isFinite(Date.parse(record.accepted_at)) || typeof record.launch_record_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.launch_record_sha256)) throw new Error("accepted-attempt metadata is malformed");
      const launchRelative = normalizeRolePath(run, record.launch_record, "launch_record");
      if (record.launch_record !== launchRelative) throw new Error("accepted launch path is not canonical");
      if (!/^role-launches\/[^/]+\.json$/.test(launchRelative)) throw new Error("accepted launch is outside the immutable launch registry");
      const launchFile = path.join(run, launchRelative);
      if (!fs.existsSync(launchFile)) throw new Error("accepted launch is missing");
      const launchStat = fs.lstatSync(launchFile);
      if (!launchStat.isFile() || launchStat.isSymbolicLink() || record.launch_record_sha256 !== hashAt(launchFile, launchRelative)) throw new Error("accepted launch binding is stale");
      const launch = readJson(launchFile);
      validateHistoricalLaunchEnvelope(run, launch, launchRelative, repairDocketId);
      const launchTaskName = path.basename(launchRelative, ".json");
      const exactRepairBinding = repairDocketId === null
        ? launch.repair_binding === undefined
        : launch.repair_binding?.docket_id === repairDocketId && launch.repair_binding?.semantic_digest === repairSemanticDigest;
      if (launch.schema_version !== 1 || launch.task_id !== `native-${launchTaskName}` || launchWorkKey(launch) !== workKey || launch.work_key_sha256 !== workKey || launch.logical_task_name !== logicalTaskName || launch.attempt !== record.attempt || launch.role !== role || launch.contract_revision !== contractRevision || launch.charter_revision !== charterRevision || !exactRepairBinding || canonical([...launch.declared_outputs].sort()) !== canonical([...declaredOutputs].sort())) throw new Error("accepted launch does not match the requested historical work package");
    }
    return true;
  } catch {
    throw outputWorkRebound("Historical accepted overlap authority is malformed, stale, or does not match the requested work package.");
  }
}

function bindWorkIdentity(run, logicalTaskName, workKey, role, declaredOutputs, contractRevision, charterRevision, repairDocketId = null, repairSemanticDigest = null) {
  const revisionBase = path.join(run, "role-attempts", `_revision-${contractRevision}-${charterRevision}`);
  const base = repairDocketId ? path.join(revisionBase, `_repair-${repairDocketId}-${repairSemanticDigest}`) : revisionBase;
  const common = { schema_version: 1, contract_revision: contractRevision, charter_revision: charterRevision, role, declared_outputs: [...declaredOutputs].sort(), work_key_sha256: workKey };
  const outputs = [...declaredOutputs].sort();
  const overlaps = (left, right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
  const hasInternalOverlap = outputs.some((output, index) => outputs.slice(index + 1).some((other) => overlaps(output, other)));
  if (hasInternalOverlap && !hasAcceptedHistoricalOverlapBinding(run, logicalTaskName, workKey, role, outputs, contractRevision, charterRevision, repairDocketId, repairSemanticDigest)) throw outputWorkRebound("One work package cannot declare ancestor/descendant output paths unless the exact same work has a valid immutable accepted-attempt history.");
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const lock = path.join(base, ".identity.lock");
  acquireIdentityLock(lock);
  try {
    const outputDirectory = path.join(base, "_outputs");
    if (fs.existsSync(outputDirectory)) for (const name of fs.readdirSync(outputDirectory).filter((item) => item.endsWith(".json"))) {
      const existing = readJson(path.join(outputDirectory, name));
      if (typeof existing.output !== "string" || typeof existing.work_key_sha256 !== "string") throw new Error("Scientist1 output work identity is malformed.");
      if (outputs.some((output) => overlaps(output, existing.output)) && existing.work_key_sha256 !== workKey) throw Object.assign(new Error(`Exclusive output overlaps existing work at ${existing.output}.`), { code: "S1_OUTPUT_WORK_REBOUND" });
    }
    bindIdentity(
      path.join(base, "_logical", `${logicalTaskName}.json`),
      { ...common, logical_task_name: logicalTaskName },
      "S1_LOGICAL_TASK_REBOUND",
      `Logical task ${logicalTaskName} is already bound to different role/output work in this frozen revision.`,
    );
    bindIdentity(
      path.join(base, "_work", `${workKey}.json`),
      { ...common, logical_task_name: logicalTaskName },
      "S1_LOGICAL_TASK_ALIAS",
      `Role/output work ${workKey} is already bound to a different logical task name.`,
    );
    for (const output of outputs) {
      const outputKey = createHash("sha256").update(output).digest("hex");
      bindIdentity(
        path.join(base, "_outputs", `${outputKey}.json`),
        { ...common, logical_task_name: logicalTaskName, output },
        "S1_OUTPUT_WORK_REBOUND",
        `Exclusive output ${output} is already bound to different work in this frozen revision.`,
      );
    }
  } finally {
    try { fs.unlinkSync(lock); } catch {}
  }
}

function executedLogicalTaskState(run, workKey, requestedLogicalTaskName) {
  const current = readJson(path.join(run, "run.json"));
  const currentRepairGeneration = current.active_repair?.semantic_digest ?? null;
  const inCurrentGeneration = (launch) => currentRepairGeneration === null ? !launch.repair_binding : launch.repair_binding?.semantic_digest === currentRepairGeneration;
  const attempts = new Set();
  const logicalTaskNames = new Set();
  let complete = false;
  const attemptsRoot = path.join(run, "role-attempts");
  if (fs.existsSync(attemptsRoot)) {
    for (const logicalTaskName of fs.readdirSync(attemptsRoot).sort()) {
      if (logicalTaskName.startsWith("_")) continue;
      const attemptRoot = path.join(attemptsRoot, logicalTaskName);
      if (!fs.statSync(attemptRoot).isDirectory()) continue;
      const recordFiles = [];
      for (const name of fs.readdirSync(attemptRoot).sort()) {
        const candidate = path.join(attemptRoot, name);
        if (name.endsWith(".json") && fs.statSync(candidate).isFile()) recordFiles.push(candidate);
        else if (fs.statSync(candidate).isDirectory()) for (const nested of fs.readdirSync(candidate).filter((item) => item.endsWith(".json")).sort()) recordFiles.push(path.join(candidate, nested));
      }
      for (const recordFile of recordFiles) {
        const name = path.basename(recordFile);
        const record = readJson(recordFile);
        const expectedV1 = ["accepted_at", "attempt", "launch_record", "launch_record_sha256", "logical_task_name", "schema_version"];
        const expectedV2 = [...expectedV1, "work_key_sha256"];
        if (!record || ![expectedV1.sort().join(), expectedV2.sort().join()].includes(Object.keys(record).sort().join()) || ![1, 2].includes(record.schema_version) || record.logical_task_name !== logicalTaskName || !Number.isInteger(record.attempt) || record.attempt < 1 || name !== `attempt-${record.attempt}.json`) throw new Error(`Accepted attempt record for ${logicalTaskName} is malformed.`);
        const launchRelative = normalizeRolePath(run, record.launch_record, "launch_record");
        const launchFile = path.join(run, launchRelative);
        if (!fs.existsSync(launchFile) || record.launch_record_sha256 !== hashAt(launchFile, launchRelative)) throw new Error(`Accepted attempt ${record.attempt} for ${logicalTaskName} does not match its immutable launch record.`);
        const launch = readJson(launchFile);
        const observedWorkKey = launchWorkKey(launch);
        if (record.schema_version === 2 && record.work_key_sha256 !== observedWorkKey) throw new Error(`Accepted attempt ${record.attempt} for ${logicalTaskName} has a mismatched work identity.`);
        if (logicalTaskName === requestedLogicalTaskName && observedWorkKey !== workKey && inCurrentGeneration(launch) && (launch.contract_revision ?? 1) === current.contract_revision && (launch.charter_revision ?? 1) === current.charter_revision) throw Object.assign(new Error(`Logical task ${logicalTaskName} is already bound to different role/output work in this frozen revision and repair generation.`), { code: "S1_LOGICAL_TASK_REBOUND" });
        if (observedWorkKey !== workKey) continue;
        if ((launch.logical_task_name ?? path.basename(launchRelative, ".json")) !== logicalTaskName || launch.attempt !== record.attempt || attempts.has(record.attempt)) throw new Error(`Accepted attempts for work ${workKey} have duplicate or inconsistent attempt numbers.`);
        logicalTaskNames.add(logicalTaskName);
        attempts.add(record.attempt);
      }
    }
  }
  const receiptRoot = path.join(run, "role-receipts");
  if (fs.existsSync(receiptRoot)) for (const name of fs.readdirSync(receiptRoot).filter((item) => item.endsWith(".json")).sort()) {
    const launchFile = path.join(run, "role-launches", name);
    if (!fs.existsSync(launchFile)) continue;
    const launch = readJson(launchFile);
    const receiptLogicalTaskName = launch.logical_task_name ?? path.basename(name, ".json");
    if (receiptLogicalTaskName === requestedLogicalTaskName && launchWorkKey(launch) !== workKey && inCurrentGeneration(launch) && (launch.contract_revision ?? 1) === current.contract_revision && (launch.charter_revision ?? 1) === current.charter_revision) throw Object.assign(new Error(`Logical task ${receiptLogicalTaskName} is already bound to different role/output work in this frozen revision and repair generation.`), { code: "S1_LOGICAL_TASK_REBOUND" });
    if (launchWorkKey(launch) !== workKey) continue;
    const logicalTaskName = receiptLogicalTaskName;
    if (!Number.isInteger(launch.attempt) || launch.attempt < 1) throw new Error(`Executed receipt for work ${workKey} has an invalid attempt number.`);
    logicalTaskNames.add(logicalTaskName);
    attempts.add(launch.attempt);
    const receipt = readJson(path.join(receiptRoot, name));
    if (receipt.execution_status === "COMPLETE" && receipt.gate_verdict === "PASS") complete = true;
  }
  return { attempts, complete, logicalTaskNames, nextAttempt: attempts.size ? Math.max(...attempts) + 1 : 1 };
}

function acceptAttempt(run, logicalTaskName, attempt, launchRelative, workKey) {
  const launchFile = path.join(run, launchRelative);
  const record = {
    schema_version: 2,
    logical_task_name: logicalTaskName,
    work_key_sha256: workKey,
    attempt,
    launch_record: launchRelative,
    launch_record_sha256: hashAt(launchFile, launchRelative),
    accepted_at: new Date().toISOString(),
  };
  const file = path.join(run, "role-attempts", logicalTaskName, workKey, `attempt-${attempt}.json`);
  try {
    atomicJson(file, record, true);
  } catch (error) {
    if (error.code === "EEXIST") throw new LaunchAuthorizationError("S1_TASK_ATTEMPT_SEQUENCE", `Logical task ${logicalTaskName} already consumed accepted attempt ${attempt}.`);
    throw error;
  }
}

function rolePrompt(role, roleContractFile = ROLE_CONTRACT_FILE) {
  const source = fs.readFileSync(roleContractFile, "utf8");
  const envelope = /^## Common role envelope\s+```text\s*([\s\S]*?)```/m.exec(source)?.[1]?.trim();
  if (!envelope) throw new Error("Scientist1 common role envelope is malformed.");
  const headings = [...source.matchAll(/^## (.+)$/gm)];
  const target = role.replaceAll("_", "").toLowerCase();
  const historicalHeadings = { i2_judge: "i2specificationjudge", i4_judge: "i4alignmentjudge" };
  const accepted = new Set([target, historicalHeadings[role]].filter(Boolean));
  const headingIndex = headings.findIndex((match) => accepted.has(match[1].replaceAll(/[^a-z0-9]/gi, "").toLowerCase()));
  if (headingIndex < 0) throw new Error(`Scientist1 role card is missing for ${role}.`);
  const start = headings[headingIndex].index + headings[headingIndex][0].length;
  const end = headings[headingIndex + 1]?.index ?? source.length;
  const card = source.slice(start, end).trim();
  if (!card) throw new Error(`Scientist1 role card is empty for ${role}.`);
  const paperUnslop = roleContractFile === ROLE_CONTRACT_FILE && PAPER_UNSLOP_ROLES.has(role) ? fs.readFileSync(PAPER_UNSLOP_FILE, "utf8").trim() : null;
  return { envelope, card, paperUnslop };
}

function validatePaperStyleLaunch(run, declaredInputs, declaredOutputs) {
  const policyPath = path.join(run, "contract", "paper-style-policy.json");
  const approvalPath = path.join(run, "contract", "approval.json");
  if (!fs.existsSync(policyPath) || !fs.existsSync(approvalPath)) throw Object.assign(new Error("Paper Style Auditor can run only for an approved paper-style request."), { code: "S1_PAPER_STYLE_NOT_APPROVED" });
  const approval = readJson(approvalPath);
  const policyBytesSha256 = createHash("sha256").update(fs.readFileSync(policyPath)).digest("hex");
  if (approval.schema_version !== 2 || approval.paper_style_policy_sha256 !== policyBytesSha256) throw Object.assign(new Error("The paper-style policy is not bound to durable approval."), { code: "S1_PAPER_STYLE_NOT_APPROVED" });
  const policy = readJson(policyPath);
  if (policy.max_reviews !== 3 || policy.writing_review_limit !== 2 || !Array.isArray(policy.examples)) throw new Error("The paper-style policy has invalid review limits.");
  const requiredInputs = ["contract/paper-style-policy.json", ...policy.examples.map((example) => normalizeRolePath(run, example.frozen_path, "paper-style example"))];
  for (const required of requiredInputs) if (!declaredInputs.includes(required)) throw new Error(`Paper Style Auditor must read approved style input: ${required}.`);
  if (declaredOutputs.length !== 1) throw Object.assign(new Error("Paper Style Auditor owns one numbered review file per launch."), { code: "S1_PAPER_STYLE_OUTPUT_SCOPE" });
  const match = /^paper\/style-reviews\/review-(0[1-3])\.json$/.exec(declaredOutputs[0]);
  if (!match) throw Object.assign(new Error("Paper Style Auditor output must be paper/style-reviews/review-01.json through review-03.json."), { code: "S1_PAPER_STYLE_OUTPUT_SCOPE" });
  const round = Number(match[1]);
  const reviewDirectory = path.join(run, "paper", "style-reviews");
  const priorFiles = fs.existsSync(reviewDirectory) ? fs.readdirSync(reviewDirectory).filter((name) => /^review-0[1-3]\.json$/.test(name)).sort() : [];
  if (round !== priorFiles.length + 1) throw Object.assign(new Error(`Paper Style Auditor reviews must be contiguous; expected review ${priorFiles.length + 1}, received ${round}.`), { code: "S1_PAPER_STYLE_SEQUENCE" });
  const priorReviews = priorFiles.map((name, index) => {
    const value = readJson(path.join(reviewDirectory, name));
    if (value.round !== index + 1 || !["writing", "delivery"].includes(value.stage) || !["CONFORMANT", "NONCONFORMANT"].includes(value.style_status)) throw new Error(`Malformed prior paper-style review: ${name}.`);
    return value;
  });
  const delivery = declaredInputs.includes("paper/paper.tex");
  if (delivery) {
    if (!priorReviews.length || priorReviews.some((review) => review.stage === "delivery")) throw Object.assign(new Error("One delivery-stage paper-style review must follow the writing-stage review loop."), { code: "S1_PAPER_STYLE_SEQUENCE" });
    if (priorReviews.at(-1).style_status === "NONCONFORMANT" && priorReviews.length < policy.writing_review_limit) throw Object.assign(new Error("The remaining writing-stage review must run before the delivery review."), { code: "S1_PAPER_STYLE_SEQUENCE" });
  } else {
    if (round > policy.writing_review_limit) throw Object.assign(new Error("Writing-stage paper-style review is capped at two rounds. The remaining review is reserved for the delivered paper."), { code: "S1_PAPER_STYLE_LIMIT" });
    if (priorReviews.some((review) => review.stage === "delivery") || priorReviews.at(-1)?.style_status === "CONFORMANT") throw Object.assign(new Error("The writing-stage style loop already reached its stop condition."), { code: "S1_PAPER_STYLE_COMPLETE" });
    const draftInput = `paper/style-drafts/draft-${String(round).padStart(2, "0")}-tagged.tex`;
    if (!declaredInputs.includes(draftInput)) throw new Error(`Writing-stage paper-style review ${round} must read ${draftInput}.`);
    if (round > 1 && !declaredInputs.includes(`paper/style-reviews/review-${String(round - 1).padStart(2, "0")}.json`)) throw new Error(`Writing-stage paper-style review ${round} must read the prior review.`);
  }
}

function canonicalAssignment({ role, run, launchRelative, declaredInputs, inputArtifacts, declaredOutputs, allowedExternalSources, brief, attempt, logicalTaskName, repairBinding = null, legacy = false }) {
  const prompt = rolePrompt(role, legacy ? LEGACY_ROLE_CONTRACT_FILE : ROLE_CONTRACT_FILE);
  const binding = {
    run_path: run,
    launch_record: launchRelative,
    role,
    logical_task_name: logicalTaskName,
    attempt,
    declared_inputs: declaredInputs,
    input_artifacts: inputArtifacts,
    declared_outputs: declaredOutputs,
    allowed_external_sources: allowedExternalSources,
    task_brief: brief,
    ...(repairBinding ? { repair_binding: repairBinding } : {}),
  };
  const closing = legacy ? "Use saved artifacts as authority. Follow the frozen Scientist1 1.2 receipt contract in the role card." : "Use saved artifacts as authority. Return the compact handoff in your role receipt.";
  const paperUnslop = prompt.paperUnslop ? `\n\nAcademic paper Unslop rules\n${prompt.paperUnslop}` : "";
  return `${prompt.envelope}\n\nRole card\n${prompt.card}${paperUnslop}\n\nBinding task brief\n${JSON.stringify(binding, null, 2)}\n\n${closing}`;
}

async function prepareRoleLaunch(args, options = {}) {
  assertObject(args, "prepare_role_launch arguments");
  const run = validateRunPath(args.run_path);
  const runRecord = readJson(path.join(run, "run.json"));
  const legacy = legacyRun(run);
  if (!["running", "repairing"].includes(runRecord.state)) throw Object.assign(new Error(`Scientist1 specialists can launch only while the run is running or repairing; received ${runRecord.state}.`), { code: "S1_RUN_TERMINAL_OR_INACTIVE" });
  if (!legacy && convergenceMigrationRequired(run, runRecord)) throw Object.assign(new Error("This active Scientist1 1.3/1.4 run must execute migrate-convergence before any further specialist launch."), { code: "S1_CONVERGENCE_MIGRATION_REQUIRED" });
  if (!legacy && (typeof runRecord.approval_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(runRecord.approval_sha256) || !fs.existsSync(path.join(run, "contract", "approval.json")))) throw Object.assign(new Error("Scientist1 cannot launch research work before durable approval is bound to the run."), { code: "S1_APPROVAL_NOT_BOUND" });
  if (runRecord.pending_checkpoint) throw Object.assign(new Error(`Scientist1 cannot launch a specialist while the ${runRecord.pending_checkpoint.phase} checkpoint is pending recovery.`), { code: "S1_CHECKPOINT_PENDING" });
  if (runRecord.pending_invalidation) throw Object.assign(new Error("Scientist1 cannot launch a specialist while an invalidation is pending recovery."), { code: "S1_INVALIDATION_PENDING" });
  if (typeof args.task_name !== "string" || !/^[a-z0-9_]{1,120}$/.test(args.task_name)) throw new Error("task_name must use 1-120 lowercase letters, digits, or underscores.");
  const logicalTaskName = args.logical_task_name ?? args.task_name;
  if (typeof logicalTaskName !== "string" || !/^[a-z0-9_]{1,120}$/.test(logicalTaskName)) throw new Error("logical_task_name must use 1-120 lowercase letters, digits, or underscores.");
  const attempt = args.attempt ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be a positive integer.");
  if (typeof args.role !== "string" || !args.role) throw new Error("role is required.");
  const routing = await ensureRunRouting(run, options);
  const runtime = expectedRoleRuntime(run, args.role);
  let declaredInputs = stringArray(args.declared_inputs, "declared_inputs").map((value) => normalizeRolePath(run, value, "declared_inputs"));
  const declaredOutputs = stringArray(args.declared_outputs, "declared_outputs").map((value) => normalizeRolePath(run, value, "declared_outputs"));
  if (!declaredOutputs.length) throw new Error("declared_outputs must not be empty.");
  if (!legacy && !PAPER_STYLE_INPUT_ROLES.has(args.role) && declaredInputs.some((input) => input === "contract/paper-style-policy.json" || input.startsWith("inputs/style/"))) throw Object.assign(new Error(`Role ${args.role} cannot read paper-style inputs.`), { code: "S1_PAPER_STYLE_INPUT_FORBIDDEN" });
  if (!legacy && args.role === "paper_style_auditor") validatePaperStyleLaunch(run, declaredInputs, declaredOutputs);
  const runBinding = currentRunBinding(run);
  if (!legacy && runRecord.convergence_control && runRecord.pending_adjudication && !runRecord.active_repair && args.role !== "repair_adjudicator") throw Object.assign(new Error("A pending review or machine rejection must be independently adjudicated before more scientific work launches."), { code: "S1_REPAIR_ADJUDICATION_REQUIRED" });
  if (!legacy && runRecord.convergence_control && args.role === "repair_adjudicator" && !runRecord.pending_adjudication && !runRecord.active_repair) throw Object.assign(new Error("A Repair Adjudicator can launch only for a controller-issued pending adjudication or active repair docket."), { code: "S1_REPAIR_ADJUDICATION_NOT_PENDING" });
  let repairBinding = null;
  let dependentRegeneration = null;
  if (!legacy && runRecord.active_repair) {
    const docket = runRecord.active_repair;
    if (docket.requires_invalidation && runRecord.checkpoints?.[docket.target_phase]) throw Object.assign(new Error(`Repair docket ${docket.docket_id} targets checkpointed phase ${docket.target_phase}; run the docket-bound invalidation or contract revision before launching repair work.`), { code: "S1_REPAIR_INVALIDATION_REQUIRED" });
    repairBinding = { docket_id: docket.docket_id, semantic_digest: docket.semantic_digest, incident_path: docket.incident.path, incident_sha256: docket.incident.sha256, repair_mode: docket.repair_mode, finding_fingerprints: docket.finding_fingerprints, repair_scope: docket.repair_scope, scope_baseline: docket.scope_baseline, controller_delta: docket.controller_delta, dependent_regeneration: docket.dependent_regeneration ?? [], baseline: docket.baseline.filter((item) => docket.repair_scope.includes(item.path)) };
    const overlappingDependent = (docket.dependent_regeneration ?? []).find((item) => item.role === args.role && canonical([...item.declared_outputs].sort()) === canonical([...declaredOutputs].sort())) ?? null;
    if (docket.required_review_roles.includes(args.role) && overlappingDependent && logicalTaskName !== overlappingDependent.logical_task_name) throw Object.assign(new Error(`Closure review ${args.role} overlaps dependent ${overlappingDependent.logical_task_name}; launch that frozen logical task once and reuse its PASS receipt for both obligations.`), { code: "S1_REPAIR_OVERLAP_REUSE_REQUIRED" });
    dependentRegeneration = (docket.dependent_regeneration ?? []).find((item) => item.logical_task_name === logicalTaskName && item.role === args.role && canonical([...item.declared_outputs].sort()) === canonical([...declaredOutputs].sort())) ?? null;
    let deletedDependentInputs = [];
    if (dependentRegeneration) {
      deletedDependentInputs = dependentRegeneration.declared_inputs.filter((relative) => !fs.existsSync(path.join(run, relative)));
      if (deletedDependentInputs.some((relative) => !docket.repair_scope.includes(relative))) throw Object.assign(new Error(`Dependent regeneration ${logicalTaskName} lost a frozen input outside the exact repair scope.`), { code: "S1_REPAIR_DEPENDENT_INPUT_MISSING" });
      const readableDependentInputs = dependentRegeneration.declared_inputs.filter((relative) => !deletedDependentInputs.includes(relative));
      const suppliedReadableInputs = declaredInputs.filter((relative) => !deletedDependentInputs.includes(relative));
      if (canonical([...suppliedReadableInputs].sort()) !== canonical([...readableDependentInputs].sort()) || declaredInputs.some((relative) => !dependentRegeneration.declared_inputs.includes(relative))) throw Object.assign(new Error(`Dependent regeneration ${logicalTaskName} must preserve its controller-derived readable input path set exactly.`), { code: "S1_REPAIR_DEPENDENT_INPUT_SCOPE" });
      declaredInputs = readableDependentInputs;
    }
    const controlInputs = [docket.incident.path, runRecord.convergence_control.checklist.path];
    declaredInputs = [...new Set([...declaredInputs, ...controlInputs])];
    if (docket.required_review_roles.includes(args.role) || args.role === "repair_adjudicator" || deletedDependentInputs.length) {
      const absenceProof = ensureRepairAbsenceProof(run, docket);
      const readableScope = docket.required_review_roles.includes(args.role) || args.role === "repair_adjudicator" ? docket.repair_scope.filter((relative) => fs.existsSync(path.join(run, relative))) : [];
      declaredInputs = [...new Set([...declaredInputs, ...readableScope, ...[absenceProof].filter(Boolean)])];
    }
    if (args.role === "repair_adjudicator") {
      if (declaredOutputs.some((output) => !output.startsWith("repairs/proposals/"))) throw Object.assign(new Error("A docket-bound Repair Adjudicator may write only controller proposal files."), { code: "S1_REPAIR_OUTPUT_SCOPE" });
    } else if (docket.required_review_roles.includes(args.role)) {
      const allowed = REPAIR_REVIEW_OUTPUTS[args.role] ?? [];
      if (!allowed.length || declaredOutputs.some((output) => !repairReviewOutputAllowed(args.role, output))) throw Object.assign(new Error(`Docket closure role ${args.role} may write only its exact review outputs.`), { code: "S1_REPAIR_REVIEW_OUTPUT_SCOPE" });
    } else if (!dependentRegeneration && declaredOutputs.some((output) => !docket.repair_scope.includes(output))) {
      throw Object.assign(new Error("Repair work may write only the active docket's frozen repair scope."), { code: "S1_REPAIR_OUTPUT_SCOPE" });
    }
  } else if (!legacy && runRecord.convergence_control && args.role === "repair_adjudicator") {
    const controlInputs = [runRecord.convergence_control.checklist.path, ...(runRecord.pending_adjudication ? [runRecord.pending_adjudication.path] : [])];
    declaredInputs = [...new Set([...declaredInputs, ...controlInputs])];
  }
  const workKey = legacy ? null : taskWorkKey(args.role, declaredOutputs, runBinding.contract_revision, runBinding.charter_revision, repairBinding?.docket_id ?? null, repairBinding?.semantic_digest ?? null);
  if (!legacy) bindWorkIdentity(run, logicalTaskName, workKey, args.role, declaredOutputs, runBinding.contract_revision, runBinding.charter_revision, repairBinding?.docket_id ?? null, repairBinding?.semantic_digest ?? null);
  const allowedExternalSources = stringArray(args.allowed_external_sources ?? [], "allowed_external_sources");
  if (dependentRegeneration && repairBinding?.repair_mode !== "deterministic_delta" && canonical([...allowedExternalSources].sort()) !== canonical([...dependentRegeneration.allowed_external_sources].sort())) throw Object.assign(new Error(`Dependent regeneration ${logicalTaskName} must preserve its controller-derived external-source authority exactly.`), { code: "S1_REPAIR_DEPENDENT_SOURCE_SCOPE" });
  if (repairBinding?.repair_mode === "deterministic_delta" && allowedExternalSources.length) throw Object.assign(new Error("A deterministic checkpoint repair cannot retrieve external evidence; it must correct only the frozen machine-rejected artifact."), { code: "S1_DETERMINISTIC_REPAIR_EXTERNAL_SOURCE" });
  if (!legacy) {
    const taskState = executedLogicalTaskState(run, workKey, logicalTaskName);
    if (taskState.logicalTaskNames.size && !taskState.logicalTaskNames.has(logicalTaskName)) throw Object.assign(new Error(`Logical task name ${logicalTaskName} is an alias for existing role/output work ${[...taskState.logicalTaskNames].sort().join(", ")}; reuse its stable logical name.`), { code: "S1_LOGICAL_TASK_ALIAS" });
    if (taskState.complete) throw Object.assign(new Error(`Logical task ${logicalTaskName} already has a COMPLETE/PASS receipt and cannot be executed again.`), { code: "S1_LOGICAL_TASK_COMPLETE" });
    if (attempt !== taskState.nextAttempt) throw Object.assign(new Error(`Logical task ${logicalTaskName} requires accepted attempt ${taskState.nextAttempt}; received ${attempt}. Rejected grant authorization may reuse the current attempt, but an accepted launch may not.`), { code: "S1_TASK_ATTEMPT_SEQUENCE" });
  }
  const inputArtifacts = declaredInputs.map((relative) => bindArtifact(run, relative));
  const brief = taskBrief(args.task_brief, declaredInputs);
  const startedAt = new Date().toISOString();
  const launchRelative = `role-launches/${args.task_name}.json`;
  const launchFile = path.join(run, launchRelative);
  const assignment = canonicalAssignment({ role: args.role, run, launchRelative, declaredInputs, inputArtifacts, declaredOutputs, allowedExternalSources, brief, attempt, logicalTaskName, repairBinding, legacy });
  const launch = {
    schema_version: 1,
    task_id: `native-${args.task_name}`,
    logical_task_name: logicalTaskName,
    ...(legacy ? {} : { work_key_sha256: workKey }),
    attempt,
    contract_revision: runBinding.contract_revision,
    charter_revision: runBinding.charter_revision,
    predecessor: runBinding.predecessor,
    role: args.role,
    fork_turns: "none",
    model_tier: runtime.tier,
    model: runtime.model,
    reasoning_effort: runtime.reasoning_effort,
    model_routing_sha256: routing.routing_sha256,
    role_contract_sha256: createHash("sha256").update(fs.readFileSync(legacy ? LEGACY_ROLE_CONTRACT_FILE : ROLE_CONTRACT_FILE)).digest("hex"),
    gate_schema_version: legacy ? 1 : 2,
    ...(repairBinding ? { repair_binding: repairBinding } : {}),
    ...(legacy ? {} : { task_brief: brief, task_brief_sha256: sha256(brief) }),
    assignment,
    assignment_sha256: sha256(assignment),
    declared_inputs: declaredInputs,
    input_artifacts: inputArtifacts,
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
    work_key_sha256: workKey,
    legacy,
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
    assignment,
    assignment_sha256: launch.assignment_sha256,
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
    throw new LaunchAuthorizationError(error.code === "ENOENT" ? "S1_LAUNCH_GRANT_NOT_FOUND" : "S1_LAUNCH_GRANT_MISMATCH", error.code === "ENOENT" ? "Scientist1 launch authorization is missing or was already used." : "Scientist1 launch authorization could not be claimed.");
  }
  try {
    grant = readJson(claimed);
    if (grant.schema_version !== 1 || grant.token !== token || grant.marker !== marker || !Number.isFinite(Date.parse(grant.expires_at))) throw new LaunchAuthorizationError("S1_LAUNCH_GRANT_MISMATCH", "Scientist1 launch authorization is malformed or does not match its marker.");
    if (Date.parse(grant.expires_at) < (options.now ?? Date.now())) throw new LaunchAuthorizationError("S1_LAUNCH_GRANT_EXPIRED", "Scientist1 launch authorization expired before the specialist started.");
    const run = validateRunPath(grant.run_path);
    const runRecord = readJson(path.join(run, "run.json"));
    const legacy = grant.legacy === true && legacyRun(run);
    if (!["running", "repairing"].includes(runRecord.state)) throw new LaunchAuthorizationError("S1_RUN_TERMINAL_OR_INACTIVE", `Scientist1 specialists can launch only while the run is running or repairing; received ${runRecord.state}.`);
    if (!legacy && convergenceMigrationRequired(run, runRecord)) throw new LaunchAuthorizationError("S1_CONVERGENCE_MIGRATION_REQUIRED", "This active Scientist1 1.3/1.4 run must execute migrate-convergence before this launch can run.");
    if (!legacy && (typeof runRecord.approval_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(runRecord.approval_sha256) || !fs.existsSync(path.join(run, "contract", "approval.json")))) throw new LaunchAuthorizationError("S1_APPROVAL_NOT_BOUND", "Scientist1 cannot consume a launch before durable approval is bound to the run.");
    if (runRecord.pending_checkpoint) throw new LaunchAuthorizationError("S1_CHECKPOINT_PENDING", `Scientist1 cannot consume a launch while the ${runRecord.pending_checkpoint.phase} checkpoint is pending recovery.`);
    if (runRecord.pending_invalidation) throw new LaunchAuthorizationError("S1_INVALIDATION_PENDING", "Scientist1 cannot consume a launch while an invalidation is pending recovery.");
    const runtimeRecord = readRunRouting(run);
    const launchFile = path.join(run, normalizeRolePath(run, grant.launch_record, "launch_record"));
    const launch = readJson(launchFile);
    if (!legacy && runRecord.convergence_control && runRecord.pending_adjudication && !runRecord.active_repair && launch.role !== "repair_adjudicator") throw new LaunchAuthorizationError("S1_REPAIR_ADJUDICATION_REQUIRED", "A pending review or machine rejection must be independently adjudicated before this pre-existing grant can run.");
    if (!legacy && runRecord.convergence_control && launch.role === "repair_adjudicator" && !runRecord.pending_adjudication && !runRecord.active_repair) throw new LaunchAuthorizationError("S1_REPAIR_ADJUDICATION_NOT_PENDING", "This Repair Adjudicator grant no longer has a controller-issued frontier.");
    const runtime = expectedRoleRuntime(run, launch.role);
    const runBinding = currentRunBinding(run);
    const activeRepairBinding = runRecord.active_repair ? { docket_id: runRecord.active_repair.docket_id, semantic_digest: runRecord.active_repair.semantic_digest, incident_path: runRecord.active_repair.incident.path, incident_sha256: runRecord.active_repair.incident.sha256, repair_mode: runRecord.active_repair.repair_mode, finding_fingerprints: runRecord.active_repair.finding_fingerprints, repair_scope: runRecord.active_repair.repair_scope, scope_baseline: runRecord.active_repair.scope_baseline, controller_delta: runRecord.active_repair.controller_delta, dependent_regeneration: runRecord.active_repair.dependent_regeneration ?? [], baseline: runRecord.active_repair.baseline.filter((item) => runRecord.active_repair.repair_scope.includes(item.path)) } : null;
    const cleanTaskName = path.basename(grant.launch_record, ".json");
    const logicalTaskName = launch.logical_task_name ?? cleanTaskName;
    const workKey = legacy ? null : launchWorkKey(launch);
    const attempt = launch.attempt ?? 1;
    if (markerRole !== launch.role || launch.task_id !== `native-${cleanTaskName}` || grant.logical_task_name !== logicalTaskName || grant.work_key_sha256 !== workKey || grant.attempt !== attempt || launch.contract_revision !== runBinding.contract_revision || launch.charter_revision !== runBinding.charter_revision || canonical(launch.predecessor) !== canonical(runBinding.predecessor) || canonical(launch.repair_binding ?? null) !== canonical(activeRepairBinding) || launch.fork_turns !== "none" || launch.model_tier !== runtime.tier || launch.model !== runtime.model || launch.reasoning_effort !== runtime.reasoning_effort || launch.model_routing_sha256 !== runtimeRecord.routing_sha256) throw new LaunchAuthorizationError("S1_LAUNCH_POLICY_MISMATCH", "Scientist1 launch authorization does not match the frozen role policy, repair docket, revision, predecessor, or launch attempt.");
    if (!legacy) {
      const taskState = executedLogicalTaskState(run, workKey, logicalTaskName);
      if (taskState.logicalTaskNames.size && !taskState.logicalTaskNames.has(logicalTaskName)) throw new LaunchAuthorizationError("S1_LOGICAL_TASK_ALIAS", `Logical task name ${logicalTaskName} aliases existing role/output work.`);
      if (taskState.complete) throw new LaunchAuthorizationError("S1_LOGICAL_TASK_COMPLETE", `Logical task ${logicalTaskName} already has a COMPLETE/PASS receipt.`);
      if (attempt !== taskState.nextAttempt) throw new LaunchAuthorizationError("S1_TASK_ATTEMPT_SEQUENCE", `Logical task ${logicalTaskName} requires accepted attempt ${taskState.nextAttempt}; received ${attempt}.`);
      acceptAttempt(run, logicalTaskName, attempt, normalizeRolePath(run, grant.launch_record, "launch_record"), workKey);
    }
    return { task_name: cleanTaskName, logical_task_name: logicalTaskName, attempt, model: runtime.model, reasoning_effort: runtime.reasoning_effort, assignment: launch.assignment, assignment_sha256: launch.assignment_sha256 };
  } finally {
    try { fs.unlinkSync(claimed); } catch {}
  }
}

function peekLaunchAssignment(marker, options = {}) {
  if (typeof marker !== "string") return null;
  const match = TOKEN_PATTERN.exec(marker);
  if (!match) return null;
  const [, markerRole, token] = match;
  const file = path.join(launchGrantDirectory(options), `${token}.json`);
  let grant;
  try { grant = readJson(file); } catch { return null; }
  if (grant.schema_version !== 1 || grant.token !== token || grant.marker !== marker || Date.parse(grant.expires_at) < (options.now ?? Date.now())) return null;
  const run = validateRunPath(grant.run_path);
  const launch = readJson(path.join(run, normalizeRolePath(run, grant.launch_record, "launch_record")));
  if (launch.role !== markerRole || !nonemptyAssignment(launch.assignment, launch.assignment_sha256)) return null;
  return { assignment: launch.assignment, assignment_sha256: launch.assignment_sha256 };
}

function nonemptyAssignment(assignment, digest) {
  return typeof assignment === "string" && assignment.length > 0 && typeof digest === "string" && sha256(assignment) === digest;
}

export {
  TOKEN_PATTERN,
  LaunchAuthorizationError,
  clearLiveCatalogCache,
  consumeLaunchToken,
  createRoutingRecord,
  ensureRunRouting,
  expectedRoleRuntime,
  loadModelPolicy,
  launchGrantDirectory,
  normalizeCatalog,
  peekLaunchAssignment,
  prepareRoleLaunch,
  readLiveCatalog,
  readRunRouting,
  resolveModelCatalog,
  validateRoutingRecord,
};
