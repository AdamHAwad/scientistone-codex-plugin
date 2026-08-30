#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expectedRoleRuntime as routedRoleRuntime, validateRoutingRecord } from "../../../mcp/model-routing.mjs";

const RESEARCH_PHASES = ["contract", "investigation", "discovery", "selection", "ablation", "writing", "verification", "audit", "complete"];
const EXTERNAL_AUDIT_PHASES = ["contract", "audit", "complete"];
const STATES = new Set(["running", "repairing", "paused", "complete", "cancelled", "failed"]);
const RESEARCH_OUTCOMES = new Set(["positive", "scientific_null", "completed_with_limitations"]);
const AUDIT_OUTCOMES = new Set(["audit_passed", "audit_failed", "audit_incomplete"]);
const PROFILES = new Set(["standard", "pilot", "custom"]);
const MODES = new Set(["research", "external_audit"]);
const PLATFORM_OS = new Set(["darwin", "linux", "win32"]);
const TOOL_SOURCES = new Set(["existing", "portable_official", "system_package_manager"]);
const PROFILE_BUDGETS = {
  standard: { idea_ceiling: 18, minimum_eligible_ideas: 5, candidate_node_ceiling: 25, minimum_evaluated_candidates: 5, evaluation_ceiling_per_node: 4, ablation_ceiling: 4, minimum_valid_ablations: 1, canonical_repetitions: 5, audit_panel_size: 5 },
  pilot: { idea_ceiling: 4, minimum_eligible_ideas: 2, candidate_node_ceiling: 4, minimum_evaluated_candidates: 2, evaluation_ceiling_per_node: 2, ablation_ceiling: 2, minimum_valid_ablations: 1, canonical_repetitions: 3, audit_panel_size: 3 },
};
const BUDGET_KEYS = Object.keys(PROFILE_BUDGETS.standard);
const AUDIT_CHECKS = ["I1", "I2", "I3", "I4", "claim_provenance"];
const I1_VERDICTS = ["PASS", "FAIL", "INCONCLUSIVE", "NOT_ASSESSED"];
const I1_COMPONENTS = ["lineage", "reproducibility", "claim-semantics"];
const I1_AUDIT_FILES = ["tex-extraction.json", "pdf-extraction.json", "input-manifest.json", "evidence-manifest.json", "execution-receipt.json", ...I1_COMPONENTS.map((name) => `${name}.json`)];
const STOP_REASONS = new Set(["evidence_saturation", "no_additional_eligible_ideas", "stable_ranking", "exhausted_approved_compute", "repeated_operational_failure", "researcher_stop"]);
const CONTRACT_REPAIR_CLASSES = new Set(["AUTOMATIC_REPAIR", "RESEARCHER_APPROVED_AMENDMENT"]);
const CONTRACT_GENERATED_PATHS = ["environment/model-routing.json", "contract/evaluator-contract.md", "contract/evaluator-manifest.json", "contract/i1-verification-policy.json", "contract/audit.md", "private/evaluator/i1-verifier"];
const CONTRACT_ROLE_NAMES = new Set(["i1_verifier_builder", "contract_auditor"]);
const CONTRACT_SUCCESSOR_ROOTS = ["evidence", "investigation", "discovery", "selection", "ablation", "paper", "audit", "delivery", "deliverables"];
const RESULT_AWARE_ROOTS = ["discovery", "selection", "ablation", "paper", "audit", "delivery", "deliverables"];
const ROLE_CONTRACT_FILE = new URL("../references/roles.md", import.meta.url);
const PRIVATE_ROLES = new Set(["evaluator", "i1_verifier_builder", "i1_score_auditor", "i2_judge"]);
const REQUIRED_OUTPUTS = {
  contract: ["contract/run-config.json", "contract/input-manifest.json", "contract/i1-verification-policy.json", "private/evaluator/i1-verifier", "contract/audit.md"],
  investigation: ["evidence/search-log.jsonl", "evidence/sources.jsonl", "investigation/notes", "investigation/directions", "investigation/protocol-audit.md", "investigation/brief.md", "investigation/references.bib", "investigation/critic.md"],
  discovery: ["discovery/ideas.jsonl", "discovery/idea-critique.jsonl", "discovery/index.json", "discovery/nodes"],
  selection: ["selection/selection.md", "selection/selection-audit.md", "selection/lineage.json", "selection/selected/manifest.json", "selection/canonical-evaluation.json"],
  ablation: ["ablation/plan.json", "ablation/variants", "ablation/evaluations", "ablation/results.json", "ablation/report.md"],
  writing: ["paper/representation.md", "paper/grounding-report.json", "paper/critic.md", "paper/paper-tagged.tex", "paper/references.bib"],
  verification: ["paper/claims.jsonl", "paper/verification.md", "paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf", "delivery/visual-inspection.json"],
  audit: ["audit/i1.json", ...I1_AUDIT_FILES.map((name) => `audit/i1/${name}`), "audit/i2/aggregate.json", "audit/i3.json", "audit/i4/aggregate.json", "audit/claim-provenance.json", "audit/report.md", "delivery/reproduction.md"],
  complete: ["deliverables/manifest.json"],
};
const REQUIRED_DELIVERABLES = {
  research: ["study-plan.md", "investigation-brief.md", "paper.tex", "paper.pdf", "references.bib", "provenance.jsonl", "selected-method/manifest.json", "canonical-evaluation.json", "ablation-report.md", "verification.md", "audit-report.md", "reproduction.md", "visual-inspection.json"],
  external_audit: ["source-bundle-manifest.json", "audit-report.md", "reproduction.md"],
};
const CORE_DELIVERABLE_SOURCES = {
  research: {
    "study-plan.md": "study-plan.md",
    "investigation-brief.md": "investigation/brief.md",
    "paper.tex": "paper/paper.tex",
    "paper.pdf": "paper/paper.pdf",
    "references.bib": "paper/references.bib",
    "provenance.jsonl": "paper/provenance.jsonl",
    "selected-method/manifest.json": "selection/selected/manifest.json",
    "canonical-evaluation.json": "selection/canonical-evaluation.json",
    "ablation-report.md": "ablation/report.md",
    "verification.md": "paper/verification.md",
    "audit-report.md": "audit/report.md",
    "reproduction.md": "delivery/reproduction.md",
    "visual-inspection.json": "delivery/visual-inspection.json",
  },
  external_audit: {
    "source-bundle-manifest.json": "contract/source-bundle-manifest.json",
    "audit-report.md": "audit/report.md",
    "reproduction.md": "delivery/reproduction.md",
  },
};
const artifactHashMemo = new Map();
const contentHashMemo = new Map();
let memoizeHashes = false;

function phasesFor(record) {
  return record.mode === "external_audit" ? EXTERNAL_AUDIT_PHASES : RESEARCH_PHASES;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Cannot read valid JSON at ${file}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function appendEvent(run, event) {
  fs.appendFileSync(path.join(run, "events.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function relativePath(value) {
  if (!value || path.isAbsolute(value)) fail(`Artifact paths must be non-empty and run-relative: ${value}`);
  const normalized = path.normalize(value).replaceAll(path.sep, "/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("\0")) fail(`Artifact path escapes the run: ${value}`);
  const clean = normalized.replace(/^\.\//, "");
  if (clean === ".") fail("The run root cannot be used as an artifact path");
  return clean;
}

function artifactPath(run, relative) {
  const clean = relativePath(relative);
  if (fs.lstatSync(run).isSymbolicLink()) fail(`Run directory cannot be a symlink: ${run}`);
  const target = path.resolve(run, clean);
  const rel = path.relative(run, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail(`Artifact path escapes the run: ${relative}`);
  let current = run;
  for (const part of clean.split("/")) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) fail(`Symlinked path components cannot be evidence: ${clean}`);
  }
  if (fs.existsSync(target)) {
    const realRun = fs.realpathSync(run);
    const realTarget = fs.realpathSync(target);
    const realRelative = path.relative(realRun, realTarget);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) fail(`Artifact resolves outside the run: ${clean}`);
  }
  return { clean, target };
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
    if (stat.isSymbolicLink()) fail(`Symlinks cannot be promoted as evidence: ${name}`);
    if (stat.isDirectory()) {
      addField(hash, "D", name);
      for (const child of fs.readdirSync(current).sort()) walk(path.join(current, child), `${name}/${child}`);
      return;
    }
    if (!stat.isFile()) fail(`Only regular files and directories can be promoted: ${name}`);
    addField(hash, "F", name);
    addField(hash, "S", stat.size);
    addFile(hash, current);
  }
  walk(target, logical);
  return hash.digest("hex");
}

function contentHash(target) {
  const memoKey = path.resolve(target);
  if (memoizeHashes && contentHashMemo.has(memoKey)) return contentHashMemo.get(memoKey);
  const hash = createHash("sha256");
  function walk(current, logical) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(`Symlinks cannot be hashed as content: ${logical}`);
    if (stat.isDirectory()) {
      addField(hash, "D", logical);
      for (const child of fs.readdirSync(current).sort()) walk(path.join(current, child), logical === "." ? child : `${logical}/${child}`);
      return;
    }
    if (!stat.isFile()) fail(`Only regular files and directories can be hashed as content: ${logical}`);
    addField(hash, "F", logical);
    addField(hash, "S", stat.size);
    addFile(hash, current);
  }
  walk(target, ".");
  const digest = hash.digest("hex");
  if (memoizeHashes) contentHashMemo.set(memoKey, digest);
  return digest;
}

function hashArtifact(run, relative) {
  const { clean, target } = artifactPath(run, relative);
  if (!fs.existsSync(target)) fail(`Missing artifact: ${clean}`);
  const memoKey = `${path.resolve(run)}\0${clean}`;
  if (memoizeHashes && artifactHashMemo.has(memoKey)) return artifactHashMemo.get(memoKey);
  const digest = hashAt(target, clean);
  if (memoizeHashes) artifactHashMemo.set(memoKey, digest);
  return digest;
}

function entry(run, relative) {
  const clean = relativePath(relative);
  return { path: clean, sha256: hashArtifact(run, clean) };
}

function receiptFile(run, phase) {
  return path.join(run, "receipts", `${phase}.json`);
}

function parsePathFlags(args) {
  const inputs = [];
  const outputs = [];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || (flag !== "--input" && flag !== "--output")) fail("checkpoint accepts repeated --input <path> and --output <path> pairs");
    const clean = relativePath(value);
    if (flag === "--output" && (clean === "run.json" || clean === "events.jsonl" || clean === "attention.md" || clean === "receipts" || clean.startsWith("receipts/") || clean === "role-receipts")) fail(`Mutable ledger path cannot be promoted as an output: ${clean}`);
    (flag === "--input" ? inputs : outputs).push(clean);
  }
  if (!inputs.length || !outputs.length) fail("checkpoint requires at least one --input and one --output");
  return { inputs: [...new Set(inputs)], outputs: [...new Set(outputs)] };
}

function pathCovered(required, outputs) {
  return outputs.some((output) => required === output || required.startsWith(`${output}/`));
}

function pdfRequired(run, record) {
  if (record.mode !== "research") return false;
  const bootstrap = readJson(path.join(run, "environment", "bootstrap.json"));
  return bootstrap.paper_output?.pdf !== "not_required";
}

function requiredOutputs(run, record, phase) {
  const outputs = [...REQUIRED_OUTPUTS[phase]];
  if (phase === "verification" && !pdfRequired(run, record)) {
    for (const optional of ["paper/paper.pdf", "delivery/visual-inspection.json"]) outputs.splice(outputs.indexOf(optional), 1);
  }
  if (phase === "contract" && record.mode === "research") outputs.push("contract/evaluator-contract.md", "contract/evaluator-manifest.json");
  return outputs;
}

function minimalPaths(paths) {
  const ordered = [...new Set(paths)].sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));
  return ordered.filter((candidate, index) => !ordered.slice(0, index).some((parent) => candidate.startsWith(`${parent}/`)));
}

function validateBudgets(budgets) {
  if (!budgets || Object.keys(budgets).sort().join() !== [...BUDGET_KEYS].sort().join()) fail(`Run budgets have invalid fields; expected ${BUDGET_KEYS.join(", ")}, received ${Object.keys(budgets ?? {}).join(", ") || "none"}`);
  for (const key of BUDGET_KEYS) {
    if (!Number.isInteger(budgets[key]) || budgets[key] < 1) fail(`Invalid run budget at contract/run-config.json#/${key}; expected a positive integer, received ${JSON.stringify(budgets[key])}`);
  }
  if (budgets.audit_panel_size < 3 || budgets.audit_panel_size % 2 === 0) fail(`Invalid audit panel size; expected an odd integer of at least 3, received ${budgets.audit_panel_size}`);
  if (budgets.minimum_eligible_ideas > budgets.idea_ceiling) fail(`Invalid idea bounds; minimum_eligible_ideas ${budgets.minimum_eligible_ideas} exceeds idea_ceiling ${budgets.idea_ceiling}`);
  if (budgets.minimum_evaluated_candidates > budgets.candidate_node_ceiling) fail(`Invalid candidate bounds; minimum_evaluated_candidates ${budgets.minimum_evaluated_candidates} exceeds candidate_node_ceiling ${budgets.candidate_node_ceiling}`);
  if (budgets.minimum_valid_ablations > budgets.ablation_ceiling) fail(`Invalid ablation bounds; minimum_valid_ablations ${budgets.minimum_valid_ablations} exceeds ablation_ceiling ${budgets.ablation_ceiling}`);
  return budgets;
}

function verifyRunRecord(run, { allowReceiptDrift = false } = {}) {
  const file = path.join(run, "run.json");
  const record = readJson(file);
  if (record.schema_version !== 1) fail(`Unsupported run schema in ${file}`);
  if (!record.id) fail(`Invalid run id at ${file}#/id; expected a non-empty string, received ${JSON.stringify(record.id)}`);
  if (!STATES.has(record.state)) fail(`Invalid run state at ${file}#/state; expected ${[...STATES].join("|")}, received ${JSON.stringify(record.state)}`);
  if (!MODES.has(record.mode)) fail(`Invalid run mode at ${file}#/mode; expected ${[...MODES].join("|")}, received ${JSON.stringify(record.mode)}`);
  if (!PROFILES.has(record.search_profile)) fail(`Invalid search profile at ${file}#/search_profile; expected ${[...PROFILES].join("|")}, received ${JSON.stringify(record.search_profile)}`);
  if (!phasesFor(record).includes(record.phase)) fail(`Invalid run phase at ${file}#/phase; expected ${phasesFor(record).join("|")}, received ${JSON.stringify(record.phase)}`);
  record.contract_revision ??= 1;
  if (!Number.isInteger(record.contract_revision) || record.contract_revision < 1) fail(`Invalid contract revision at ${file}#/contract_revision`);
  record.charter_revision ??= 1;
  if (!Number.isInteger(record.charter_revision) || record.charter_revision < 1) fail(`Invalid charter revision at ${file}#/charter_revision`);
  const config = readJson(path.join(run, "contract", "run-config.json"));
  validateBudgets(config.budgets);
  if (config.search_profile !== "custom" && JSON.stringify(config.budgets) !== JSON.stringify(PROFILE_BUDGETS[config.search_profile])) fail(`${config.search_profile} budgets do not match the built-in profile`);
  const configHash = hashArtifact(run, "contract/run-config.json");
  if (record.contract_parameters_sha256 !== configHash || config.mode !== record.mode || config.search_profile !== record.search_profile || config.budgets.audit_panel_size !== record.audit_panel_size || JSON.stringify(config.budgets) !== JSON.stringify(record.budgets)) fail(`Run mode/profile does not match contract/run-config.json; expected ${config.mode}/${config.search_profile}/${config.budgets.audit_panel_size}, received ${record.mode}/${record.search_profile}/${record.audit_panel_size}`);
  if (!record.checkpoints || Array.isArray(record.checkpoints) || typeof record.checkpoints !== "object") fail("Run checkpoint anchors are malformed");
  const receiptDirectory = path.join(run, "receipts");
  const actualReceipts = fs.existsSync(receiptDirectory) ? fs.readdirSync(receiptDirectory).filter((name) => name.endsWith(".json")).map((name) => path.basename(name, ".json")).sort() : [];
  const anchoredReceipts = Object.keys(record.checkpoints).sort();
  if (JSON.stringify(actualReceipts) !== JSON.stringify(anchoredReceipts)) fail("Current receipt files do not match checkpoint anchors");
  for (const [phase, checkpoint] of Object.entries(record.checkpoints)) {
    if (!phasesFor(record).includes(phase) || !checkpoint || typeof checkpoint.receipt_sha256 !== "string" || !Array.isArray(checkpoint.outputs)) fail(`Invalid checkpoint anchor: ${phase}`);
    for (const item of checkpoint.outputs) if (!item || typeof item.path !== "string" || typeof item.sha256 !== "string") fail(`Invalid checkpoint output anchor: ${phase}`);
    if (!allowReceiptDrift && hashArtifact(run, `receipts/${phase}.json`) !== checkpoint.receipt_sha256) fail(`Receipt changed after checkpoint: ${phase}`);
  }
  if (!Array.isArray(record.invalidation_roots)) fail("Run invalidation roots are malformed");
  const supersededRoot = path.join(run, "receipts", "superseded");
  const actualRoots = fs.existsSync(supersededRoot) ? fs.readdirSync(supersededRoot).sort().map((name) => `receipts/superseded/${name}`) : [];
  const declaredRoots = record.invalidation_roots.map((item) => item.path).sort();
  if (JSON.stringify(actualRoots) !== JSON.stringify(declaredRoots)) fail("Superseded evidence is not anchored in run invalidation roots");
  for (const item of record.invalidation_roots) {
    if (typeof item.path !== "string" || typeof item.sha256 !== "string" || hashArtifact(run, item.path) !== item.sha256) fail(`Invalid invalidation root: ${item.path}`);
  }
  const requestHash = hashArtifact(run, "request.md");
  if (record.request_sha256 !== requestHash) fail("request.md no longer matches the frozen verbatim request");
  const studyHash = hashArtifact(run, "study-plan.md");
  if (record.study_plan_sha256 !== studyHash) fail("study-plan.md no longer matches the frozen run contract");
  if (record.attention !== null) {
    if (!record.attention || record.attention.path !== "attention.md" || typeof record.attention.sha256 !== "string") fail(`Invalid attention record at ${file}#/attention`);
    if (hashArtifact(run, "attention.md") !== record.attention.sha256) fail("attention.md no longer matches run.json#/attention");
  }
  return record;
}

function verifyInputManifest(run) {
  const manifest = readJson(path.join(run, "contract", "input-manifest.json"));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files)) fail("Invalid contract input manifest");
  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || typeof item.source_path !== "string" || typeof item.frozen_path !== "string" || typeof item.sha256 !== "string") fail("Malformed contract input manifest entry");
    const frozen = relativePath(item.frozen_path);
    if (seen.has(frozen)) fail(`Duplicate frozen input: ${frozen}`);
    seen.add(frozen);
    if (item.classification === "shared" && !frozen.startsWith("inputs/shared/")) fail(`Shared input must be frozen under inputs/shared/: ${frozen}`);
    if (item.classification === "evaluator_only" && !frozen.startsWith("private/")) fail(`Evaluator-only input must be frozen under private/: ${frozen}`);
    if (item.classification !== "shared" && item.classification !== "evaluator_only") fail(`Invalid input classification: ${item.classification}`);
    if (hashArtifact(run, frozen) !== item.sha256) fail(`Frozen input hash mismatch: ${frozen}`);
  }
  return manifest;
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fileSha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verifyBootstrap(run, record, live = false) {
  const file = path.join(run, "environment", "bootstrap.json");
  const bootstrap = readJson(file);
  if (bootstrap.schema_version !== 1 || !bootstrap.platform || !PLATFORM_OS.has(bootstrap.platform.os) || !nonemptyString(bootstrap.platform.architecture) || !Array.isArray(bootstrap.tools)) fail(`Invalid environment bootstrap at ${file}`);
  const names = bootstrap.tools.map((tool) => tool?.name);
  if (names.some((name) => !nonemptyString(name)) || new Set(names).size !== names.length) fail(`Environment bootstrap has invalid or duplicate tool names: ${file}`);
  const paperOutput = bootstrap.paper_output ?? { pdf: record.mode === "research" ? "required" : "not_required", reason: "Legacy default" };
  if (!paperOutput || !["required", "not_required"].includes(paperOutput.pdf) || (paperOutput.pdf === "not_required" && (!nonemptyString(paperOutput.reason) || (record.mode === "research" && paperOutput.plan_reference !== "study-plan.md")))) fail(`Invalid conditional PDF policy at ${file}#/paper_output`);
  const active = new Map();
  for (const [index, tool] of bootstrap.tools.entries()) {
    const location = `${file}#/tools/${index}`;
    if (tool.name === "latex" && tool.status === "not_required") {
      if (paperOutput.pdf !== "not_required" || !nonemptyString(tool.reason)) fail(`Invalid not-required LaTeX record at ${location}`);
      continue;
    }
    if (!nonemptyString(tool.path) || !nonemptyString(tool.version) || !TOOL_SOURCES.has(tool.source) || !nonemptyString(tool.verified_at) || !Number.isFinite(Date.parse(tool.verified_at))) fail(`Malformed active tool at ${location}`);
    if (tool.source_url !== null && (!nonemptyString(tool.source_url) || !tool.source_url.startsWith("https://"))) fail(`Invalid official source URL at ${location}`);
    if (tool.sha256 !== null && (typeof tool.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(tool.sha256))) fail(`Invalid executable SHA-256 at ${location}`);
    if (tool.source === "portable_official" && (tool.source_url === null || tool.sha256 === null || tool.purpose !== "scientific_method")) fail(`Portable tool lacks official source, executable SHA-256, or scientific_method purpose at ${location}`);
    const target = path.isAbsolute(tool.path) ? tool.path : artifactPath(run, tool.path).target;
    if (!path.isAbsolute(tool.path) || live) {
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`Declared executable is unavailable at ${location}: ${tool.path}`);
      if (live && process.platform !== "win32") {
        try { fs.accessSync(target, fs.constants.X_OK); } catch { fail(`Declared tool is not executable at ${location}: ${tool.path}`); }
      }
      if (tool.sha256 !== null && fileSha256(target) !== tool.sha256) fail(`Executable SHA-256 mismatch at ${location}: ${tool.path}`);
    }
    active.set(tool.name, tool);
  }
  const node = active.get("node");
  const nodeMajor = /^v?(\d+)(?:\.\d+){1,2}(?:[-+].*)?$/.exec(node?.version ?? "")?.[1];
  if (node && (node.requirement !== ">=20" || !nodeMajor || Number(nodeMajor) < 20)) fail(`Recorded Node reference runtime must be Node.js 20 or newer: ${file}`);
  const latex = active.get("latex");
  if (record.mode === "research" && paperOutput.pdf === "required" && (!latex || !nonemptyString(latex.implementation))) fail(`PDF-required research environment requires a verified LaTeX implementation: ${file}`);
  return bootstrap;
}

function verifySourceBundleManifest(run) {
  const file = path.join(run, "contract", "source-bundle-manifest.json");
  const manifest = readJson(file);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.items) || !manifest.items.length) fail(`Invalid source bundle at ${file}; expected schema_version 1 and a non-empty items array`);
  const seen = new Set();
  const checkItems = new Map(AUDIT_CHECKS.map((check) => [check, []]));
  for (const [index, item] of manifest.items.entries()) {
    const location = `${file}#/items/${index}`;
    if (!item || !nonemptyString(item.supplied_path) || !nonemptyString(item.frozen_path)) fail(`Malformed source-bundle item at ${location}; supplied_path and frozen_path must be non-empty strings`);
    const frozen = relativePath(item.frozen_path);
    if (!frozen.startsWith("source-bundle/")) fail(`Invalid frozen_path at ${location}; expected source-bundle/<stable-name>, received ${frozen}`);
    if (seen.has(frozen)) fail(`Duplicate source-bundle frozen_path at ${location}: ${frozen}`);
    seen.add(frozen);
    if (!["paper", "method", "code", "evaluation", "evaluator", "reference", "log", "other"].includes(item.artifact_type)) fail(`Invalid artifact_type at ${location}; received ${JSON.stringify(item.artifact_type)}`);
    if (!Array.isArray(item.intended_checks) || !item.intended_checks.length || new Set(item.intended_checks).size !== item.intended_checks.length || item.intended_checks.some((check) => !AUDIT_CHECKS.includes(check))) fail(`Invalid intended_checks at ${location}; expected unique values from ${AUDIT_CHECKS.join(", ")}`);
    if (!["shared", "evaluator_only"].includes(item.access_class)) fail(`Invalid access_class at ${location}; expected shared|evaluator_only, received ${JSON.stringify(item.access_class)}`);
    if (typeof item.available !== "boolean") fail(`Invalid available flag at ${location}; expected boolean, received ${JSON.stringify(item.available)}`);
    if (item.available) {
      if (!nonemptyString(item.sha256) || item.missing_reason !== null) fail(`Available source item at ${location} requires sha256 and missing_reason: null`);
      const observed = hashArtifact(run, frozen);
      if (observed !== item.sha256) fail(`Source-bundle hash mismatch at ${location}; expected ${item.sha256}, received ${observed} for ${frozen}`);
    } else if (item.sha256 !== null || !nonemptyString(item.missing_reason)) {
      fail(`Unavailable source item at ${location} requires sha256: null and a concrete missing_reason`);
    }
    for (const check of item.intended_checks) checkItems.get(check).push({ ...item, frozen_path: frozen });
  }
  for (const [check, items] of checkItems) if (!items.length) fail(`Source bundle does not identify a required item for ${check}; add an available file or an unavailable item with missing_reason`);
  const assessable = [...checkItems].filter(([, items]) => items.every((item) => item.available));
  if (!assessable.length) fail(`Source bundle provides no assessable integrity check; required checks are ${AUDIT_CHECKS.join(", ")}`);
  return { ...manifest, checkItems, assessable: new Set(assessable.map(([check]) => check)) };
}

function verifyEvaluatorManifest(run) {
  const contractFile = path.join(run, "contract", "evaluator-contract.md");
  if (!fs.existsSync(contractFile) || !fs.readFileSync(contractFile, "utf8").trim()) fail(`Evaluator contract is missing or empty: ${contractFile}`);
  const file = path.join(run, "contract", "evaluator-manifest.json");
  const manifest = readJson(file);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) fail(`Invalid evaluator manifest at ${file}; expected a non-empty files array`);
  const seen = new Set();
  for (const [index, item] of manifest.files.entries()) {
    const location = `${file}#/files/${index}`;
    if (!item || !nonemptyString(item.path) || !nonemptyString(item.sha256) || item.access_class !== "evaluator_only") fail(`Malformed evaluator manifest entry at ${location}`);
    const clean = relativePath(item.path);
    if (!clean.startsWith("private/evaluator/")) fail(`Evaluator-only artifact at ${location} must live under private/evaluator/, received ${clean}`);
    if (seen.has(clean)) fail(`Duplicate evaluator artifact at ${location}: ${clean}`);
    seen.add(clean);
    const observed = hashArtifact(run, clean);
    if (observed !== item.sha256) fail(`Evaluator artifact hash mismatch at ${location}; expected ${item.sha256}, received ${observed}`);
  }
  return { ...manifest, paths: [...seen] };
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function verifyI1PathBinding(run, binding, expected, location) {
  if (!binding || !nonemptyString(binding.path) || !validSha256(binding.sha256)) fail(`Invalid I1 path binding at ${location}`);
  const clean = relativePath(binding.path);
  if (expected && clean !== expected) fail(`I1 path binding at ${location} must be ${expected}, received ${clean}`);
  const observed = hashArtifact(run, clean);
  if (binding.sha256 !== observed) fail(`I1 path binding hash mismatch at ${location}; expected ${observed}, received ${binding.sha256}`);
  return clean;
}

function verifyI1FileInventory(run, root, entries, location) {
  const cleanRoot = relativePath(root);
  const rootTarget = artifactPath(run, cleanRoot).target;
  nonemptyDirectory(rootTarget);
  if (!Array.isArray(entries) || !entries.length) fail(`${location} requires a non-empty file inventory`);
  const paths = [];
  for (const [index, item] of entries.entries()) {
    if (!item || !nonemptyString(item.path) || !validSha256(item.sha256)) fail(`Malformed I1 file inventory entry at ${location}/${index}`);
    const clean = relativePath(item.path);
    if (!clean.startsWith(`${cleanRoot}/`) || paths.includes(clean)) fail(`Invalid or duplicate I1 file inventory path at ${location}/${index}: ${clean}`);
    const target = artifactPath(run, clean).target;
    if (!fs.statSync(target).isFile() || hashArtifact(run, clean) !== item.sha256) fail(`I1 file inventory hash mismatch at ${location}/${index}: ${clean}`);
    paths.push(clean);
  }
  const actual = filesWithin(rootTarget).map((file) => `${cleanRoot}/${file}`);
  if (JSON.stringify([...paths].sort()) !== JSON.stringify(actual)) fail(`I1 file inventory at ${location} is not exhaustive for ${cleanRoot}`);
  return paths;
}

function verifyI1MetricPolicy(metric, location) {
  const required = ["id", "claim_role", "name", "unit", "direction", "population", "estimand", "transformation", "presentation", "determinism_class", "comparison_design", "repetitions", "randomness", "equivalence_margin", "uncertainty", "hardware", "failure_policy"];
  if (!metric || required.some((field) => metric[field] === undefined) || !nonemptyString(metric.id) || !nonemptyString(metric.name) || !nonemptyString(metric.unit) || !nonemptyString(metric.population) || !nonemptyString(metric.transformation)) fail(`I1 metric policy is incomplete at ${location}`);
  if (!["primary", "constraint", "secondary"].includes(metric.claim_role) || !["maximize", "minimize", "target", "signed"].includes(metric.direction) || !["deterministic", "seeded_stochastic", "irreducibly_stochastic", "hardware_sensitive"].includes(metric.determinism_class) || !["exact", "paired", "independent"].includes(metric.comparison_design)) fail(`I1 metric policy has invalid classes at ${location}`);
  if (!metric.estimand || !["single_seed", "mean", "median", "quantile", "rate", "ratio", "paired_difference", "aggregate"].includes(metric.estimand.type) || !nonemptyString(metric.estimand.definition)) fail(`I1 estimand is invalid at ${location}`);
  if (!metric.presentation || !["none", "half_even", "half_away_from_zero", "truncate"].includes(metric.presentation.rounding) || !Number.isInteger(metric.presentation.digits) || metric.presentation.digits < 0 || !nonemptyString(metric.presentation.lineage_rule)) fail(`I1 presentation rule is invalid at ${location}`);
  const repetitions = metric.repetitions;
  if (!repetitions || !Number.isInteger(repetitions.canonical) || repetitions.canonical < 1 || !Number.isInteger(repetitions.audit) || repetitions.audit < 1 || !Number.isInteger(repetitions.valid_required) || repetitions.valid_required < 1 || repetitions.valid_required > repetitions.audit || !nonemptyString(repetitions.rationale)) fail(`I1 repetitions are invalid at ${location}`);
  if (!metric.randomness || !nonemptyString(metric.randomness.seed_policy) || !Array.isArray(metric.randomness.paired_keys) || (metric.randomness.resampling_seed !== null && !Number.isInteger(metric.randomness.resampling_seed))) fail(`I1 randomness policy is invalid at ${location}`);
  const margin = metric.equivalence_margin;
  if (!margin || !["exact", "absolute", "fixed_scale_relative", "asymmetric"].includes(margin.type) || !Number.isFinite(margin.lower) || !Number.isFinite(margin.upper) || margin.lower > margin.upper || (margin.reference_scale !== null && !Number.isFinite(margin.reference_scale)) || !nonemptyString(margin.rationale)) fail(`I1 equivalence margin is invalid at ${location}`);
  const uncertainty = metric.uncertainty;
  if (!uncertainty || !["none", "exact", "student_t", "welch_t", "bootstrap", "permutation", "binomial", "custom_frozen"].includes(uncertainty.method) || (uncertainty.confidence_level !== null && (!Number.isFinite(uncertainty.confidence_level) || uncertainty.confidence_level <= 0 || uncertainty.confidence_level >= 1)) || !nonemptyString(uncertainty.noise_measure) || (uncertainty.noise_ceiling !== null && !Number.isFinite(uncertainty.noise_ceiling))) fail(`I1 uncertainty policy is invalid at ${location}`);
  const hardware = metric.hardware;
  if (!hardware || !["not_applicable", "exact_environment", "equivalence_class", "same_host_normalized"].includes(hardware.mode) || !Array.isArray(hardware.requirements) || (hardware.reference !== null && !nonemptyString(hardware.reference)) || hardware.external_unavailable_outcome !== "NOT_ASSESSED" || hardware.research_unavailable_outcome !== "INCONCLUSIVE") fail(`I1 hardware policy is invalid at ${location}`);
  const failure = metric.failure_policy;
  if (!failure || !["fail", "inconclusive"].includes(failure.missing_pair) || !["fail", "inconclusive"].includes(failure.invalid_run) || !Number.isInteger(failure.operational_retry_limit) || failure.operational_retry_limit < 0 || failure.exhausted_retry_outcome !== "INCONCLUSIVE") fail(`I1 failure policy is invalid at ${location}`);
}

function verifyI1Contract(run, record, live = false) {
  const policyPath = "contract/i1-verification-policy.json";
  const policy = readJson(path.join(run, policyPath));
  if (policy.schema_version !== 1 || policy.mode !== record.mode || !["task_adaptive_v1", "adrs_legacy_v1"].includes(policy.profile) || policy.result_blind_authoring !== true || !nonemptyString(policy.policy_id)) fail(`Invalid frozen I1 policy at ${policyPath}`);
  if (record.mode === "research" && (policy.freeze_stage !== "pre_candidate" || policy.frozen_before_candidate_generation !== true)) fail(`Research I1 policy must be frozen before candidate generation at ${policyPath}`);
  if (record.mode === "external_audit" && !((policy.freeze_stage === "pre_candidate" && policy.frozen_before_candidate_generation === true) || (policy.freeze_stage === "pre_i1_execution_external" && policy.frozen_before_candidate_generation === false))) fail(`External I1 policy has an invalid freeze stage at ${policyPath}`);
  const authored = policy.authored_by;
  if (!authored || authored.role !== "i1_verifier_builder" || !nonemptyString(authored.launch_record_path) || !validSha256(authored.launch_record_sha256)) fail(`I1 policy lacks builder launch binding at ${policyPath}#/authored_by`);
  const launchPath = relativePath(authored.launch_record_path);
  if (!/^role-launches\/[^/]+\.json$/.test(launchPath) || hashArtifact(run, launchPath) !== authored.launch_record_sha256 || readJson(artifactPath(run, launchPath).target).role !== "i1_verifier_builder") fail(`I1 policy builder launch binding is invalid at ${policyPath}#/authored_by`);
  const expectedBindings = {
    study_plan: "study-plan.md",
    environment_bootstrap: "environment/bootstrap.json",
    input_manifest: "contract/input-manifest.json",
    ...(record.mode === "research" ? { evaluator_contract: "contract/evaluator-contract.md", evaluator_manifest: "contract/evaluator-manifest.json" } : { source_bundle_manifest: "contract/source-bundle-manifest.json" }),
  };
  for (const [name, expected] of Object.entries(expectedBindings)) verifyI1PathBinding(run, policy.bindings?.[name], expected, `${policyPath}#/bindings/${name}`);
  if (!Array.isArray(policy.metrics) || !policy.metrics.length) fail(`I1 policy requires at least one metric at ${policyPath}#/metrics`);
  const metricIds = policy.metrics.map((metric) => metric?.id);
  if (new Set(metricIds).size !== metricIds.length) fail(`I1 policy metric IDs must be unique at ${policyPath}#/metrics`);
  policy.metrics.forEach((metric, index) => verifyI1MetricPolicy(metric, `${policyPath}#/metrics/${index}`));
  const decision = policy.decision_rule;
  if (!decision || !["all", "primary_and_constraints", "multiplicity_controlled"].includes(decision.type) || !Array.isArray(decision.primary_metric_ids) || !decision.primary_metric_ids.length || !Array.isArray(decision.constraint_metric_ids) || [...decision.primary_metric_ids, ...decision.constraint_metric_ids].some((id) => !metricIds.includes(id)) || (decision.type === "multiplicity_controlled" && !nonemptyString(decision.multiplicity_method))) fail(`Invalid I1 multi-metric decision rule at ${policyPath}#/decision_rule`);
  if (!policy.variance_policy || policy.variance_policy.excess_noise_outcome !== "INCONCLUSIVE" || !nonemptyString(policy.variance_policy.rationale)) fail(`Invalid I1 variance policy at ${policyPath}#/variance_policy`);
  if (policy.profile === "task_adaptive_v1" && (policy.variance_policy.widens_equivalence_margin !== false || policy.legacy !== undefined)) fail(`Task-adaptive I1 policy cannot widen margins or declare ADRS legacy settings`);
  if (policy.profile === "adrs_legacy_v1" && (policy.metrics.length !== 1 || policy.variance_policy.widens_equivalence_margin !== true || policy.legacy?.reruns !== 5 || policy.legacy?.standard_deviation !== "sample_n_minus_1" || policy.legacy?.relative_acceptance !== "max(0.01, 3*sample_sd/abs(rerun_mean))" || policy.legacy?.scope !== "ScientistOne paper ADRS audit reproduction only")) fail(`Invalid ADRS legacy I1 profile at ${policyPath}`);
  if (JSON.stringify(policy.verdicts?.allowed) !== JSON.stringify(I1_VERDICTS) || policy.verdicts?.research_required !== "PASS" || policy.verdicts?.not_assessed_mode !== "external_audit_only") fail(`Invalid I1 verdict policy at ${policyPath}#/verdicts`);

  const verifier = policy.verifier;
  if (!verifier || verifier.manifest_path !== "private/evaluator/i1-verifier/manifest.json" || verifier.source_root !== "private/evaluator/i1-verifier/source" || verifier.fixtures_root !== "private/evaluator/i1-verifier/fixtures" || verifier.self_test_path !== "private/evaluator/i1-verifier/self-test.json" || verifier.private_execution_root !== "private/evaluator/i1-runs" || verifier.network !== false || !Array.isArray(verifier.argv) || !verifier.argv.length || verifier.argv.some((value) => !nonemptyString(value)) || !Array.isArray(verifier.safe_output_paths) || I1_COMPONENTS.some((name) => !verifier.safe_output_paths.includes(`audit/i1/${name}.json`))) fail(`Invalid I1 verifier declaration at ${policyPath}#/verifier`);
  if (!verifier.determinism || verifier.determinism.canonical_json !== true || verifier.determinism.stable_ordering !== true || verifier.determinism.same_input_same_payload !== true || !nonemptyString(verifier.determinism.fixed_locale) || !nonemptyString(verifier.determinism.fixed_timezone) || !Number.isInteger(verifier.determinism.fixed_concurrency) || verifier.determinism.fixed_concurrency < 1) fail(`Invalid I1 deterministic-execution declaration at ${policyPath}#/verifier/determinism`);
  const runtimePath = verifier.runtime_path;
  if (!nonemptyString(runtimePath) || !validSha256(verifier.runtime_sha256)) fail(`Invalid I1 runtime binding at ${policyPath}#/verifier`);
  const runtimeTarget = path.isAbsolute(runtimePath) ? runtimePath : artifactPath(run, runtimePath).target;
  if ((live || !path.isAbsolute(runtimePath)) && (!fs.existsSync(runtimeTarget) || !fs.statSync(runtimeTarget).isFile())) fail(`I1 verifier runtime is unavailable: ${runtimePath}`);
  if (fs.existsSync(runtimeTarget) && fileSha256(runtimeTarget) !== verifier.runtime_sha256) fail(`I1 verifier runtime hash mismatch: ${runtimePath}`);

  const manifestPath = "private/evaluator/i1-verifier/manifest.json";
  const manifest = readJson(path.join(run, manifestPath));
  if (manifest.schema_version !== 1 || manifest.policy_path !== policyPath || manifest.policy_sha256 !== hashArtifact(run, policyPath) || manifest.source_root !== verifier.source_root || manifest.fixtures_root !== verifier.fixtures_root || manifest.runtime_path !== runtimePath || manifest.runtime_sha256 !== verifier.runtime_sha256 || JSON.stringify(manifest.argv) !== JSON.stringify(verifier.argv) || manifest.network !== false || JSON.stringify(manifest.allowed_input_classes) !== JSON.stringify(verifier.allowed_input_classes) || JSON.stringify(manifest.safe_output_paths) !== JSON.stringify(verifier.safe_output_paths) || !Array.isArray(manifest.dependencies)) fail(`I1 verifier manifest does not match its policy at ${manifestPath}`);
  const sourcePaths = verifyI1FileInventory(run, manifest.source_root, manifest.source_files, `${manifestPath}#/source_files`);
  const fixturePaths = verifyI1FileInventory(run, manifest.fixtures_root, manifest.fixture_files, `${manifestPath}#/fixture_files`);
  if (manifest.source_tree_sha256 !== hashArtifact(run, manifest.source_root) || manifest.fixtures_tree_sha256 !== hashArtifact(run, manifest.fixtures_root)) fail(`I1 verifier manifest tree hashes are invalid at ${manifestPath}`);
  for (const [index, dependency] of manifest.dependencies.entries()) {
    const location = `${manifestPath}#/dependencies/${index}`;
    if (!dependency || !nonemptyString(dependency.name) || !nonemptyString(dependency.version) || !nonemptyString(dependency.lock_or_manifest) || !validSha256(dependency.sha256)) fail(`Malformed I1 dependency at ${location}`);
    const lock = relativePath(dependency.lock_or_manifest);
    if (!lock.startsWith("private/evaluator/i1-verifier/") || hashArtifact(run, lock) !== dependency.sha256) fail(`I1 dependency lock hash mismatch at ${location}`);
  }

  const selfTestPath = "private/evaluator/i1-verifier/self-test.json";
  const selfTest = readJson(path.join(run, selfTestPath));
  const requiredClasses = ["positive", "boundary", "mismatch", "malformed_input", "missing_run"];
  if (selfTest.schema_version !== 1 || selfTest.verdict !== "PASS" || !Array.isArray(selfTest.cases) || !selfTest.cases.length || requiredClasses.some((kind) => !selfTest.cases.some((item) => item.class === kind))) fail(`I1 verifier self-test lacks required passing fixture classes at ${selfTestPath}`);
  const caseIds = new Set();
  for (const [index, item] of selfTest.cases.entries()) {
    const location = `${selfTestPath}#/cases/${index}`;
    if (!item || !nonemptyString(item.id) || caseIds.has(item.id) || !requiredClasses.includes(item.class) || !fixturePaths.includes(relativePath(item.fixture_path)) || item.fixture_sha256 !== hashArtifact(run, item.fixture_path) || !I1_VERDICTS.includes(item.expected_verdict) || item.actual_verdict !== item.expected_verdict || !validSha256(item.output_sha256) || item.passed !== true) fail(`Malformed or failed I1 self-test case at ${location}`);
    caseIds.add(item.id);
  }

  const buildPath = "private/evaluator/i1-verifier/build-receipt.json";
  const build = readJson(path.join(run, buildPath));
  if (build.schema_version !== 1 || build.verdict !== "PASS" || build.builder_launch_record !== launchPath || build.builder_launch_record_sha256 !== authored.launch_record_sha256 || build.policy_path !== policyPath || build.policy_sha256 !== hashArtifact(run, policyPath) || build.manifest_path !== manifestPath || build.manifest_sha256 !== hashArtifact(run, manifestPath) || build.source_tree_sha256 !== manifest.source_tree_sha256 || build.fixtures_tree_sha256 !== manifest.fixtures_tree_sha256 || build.self_test_path !== selfTestPath || build.self_test_sha256 !== hashArtifact(run, selfTestPath) || build.network_used !== false || !Array.isArray(build.undeclared_inputs_accessed) || build.undeclared_inputs_accessed.length || !Array.isArray(build.limitations) || build.limitations.length) fail(`Invalid I1 verifier build receipt at ${buildPath}`);
  return { policy, manifest, sourcePaths, fixturePaths };
}

function externalInputsFor(bundle, check) {
  return bundle.checkItems.get(check).filter((item) => item.available).map((item) => item.frozen_path);
}

function roleMayRead(run, role, input) {
  if (PRIVATE_ROLES.has(role)) return true;
  if (role === "contract_auditor" && (input === "private/evaluator/i1-verifier" || input.startsWith("private/evaluator/i1-verifier/"))) return true;
  if (input.startsWith("private/")) return false;
  const inputManifest = verifyInputManifest(run);
  if (inputManifest.files.some((item) => item.classification === "evaluator_only" && (input === item.frozen_path || input.startsWith(`${item.frozen_path}/`)))) return false;
  const record = readJson(path.join(run, "run.json"));
  if (record.mode === "external_audit") {
    const bundle = verifySourceBundleManifest(run);
    if (bundle.items.some((item) => item.access_class === "evaluator_only" && item.available && (input === item.frozen_path || input.startsWith(`${item.frozen_path}/`)))) return false;
  }
  return true;
}

function sameFlatRecord(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys) && leftKeys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

function verifySharedInputManifest(run, file) {
  const contract = verifyInputManifest(run).files.filter((item) => item.classification === "shared");
  const manifest = readJson(file);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files)) fail(`Invalid shared-input manifest: ${file}`);
  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || item.classification !== "shared" || typeof item.frozen_path !== "string" || item.frozen_path.startsWith("private/")) fail(`Candidate manifest contains a non-shared input: ${file}`);
    const expected = contract.find((candidate) => candidate.frozen_path === item.frozen_path);
    if (!expected || !sameFlatRecord(item, expected) || seen.has(item.frozen_path)) fail(`Candidate manifest is not an exact subset of the contract manifest: ${file}`);
    seen.add(item.frozen_path);
  }
}

function roleRelative(run, value) {
  if (typeof value !== "string" || !value) fail("Role receipt contains an invalid path");
  if (!path.isAbsolute(value)) return relativePath(value);
  const relative = path.relative(run, value);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`Role receipt path escapes the run: ${value}`);
  return relativePath(relative);
}

function verifyArtifactBindings(run, bindings, paths, location) {
  if (!Array.isArray(bindings) || bindings.length !== paths.length) fail(`${location} must bind every declared artifact exactly once`);
  const normalized = bindings.map((item, index) => {
    if (!item || !nonemptyString(item.path) || !validSha256(item.sha256)) fail(`Malformed artifact binding at ${location}/${index}`);
    return { path: roleRelative(run, item.path), sha256: item.sha256 };
  });
  if (JSON.stringify(normalized.map((item) => item.path)) !== JSON.stringify(paths)) fail(`${location} paths differ from the declared artifact order`);
  for (const item of normalized) if (hashArtifact(run, item.path) !== item.sha256) fail(`Artifact changed after its role binding: ${location}/${item.path}`);
  return normalized;
}

function verifyRoleReceipt(run, relative) {
  const receipt = readJson(artifactPath(run, relative).target);
  const task = path.basename(relative, ".json");
  if (receipt.schema_version !== 1 || receipt.agent_task !== task || !nonemptyString(receipt.role)) fail(`Invalid role receipt identity at ${relative}; expected agent_task ${task}, received ${JSON.stringify(receipt.agent_task)}`);
  if (!["COMPLETE", "BLOCKED", "FAILED"].includes(receipt.execution_status)) fail(`Invalid execution_status at ${relative}; expected COMPLETE|BLOCKED|FAILED, received ${JSON.stringify(receipt.execution_status)}`);
  if (!["PASS", "REVISE", "FAIL", "NOT_ASSESSED"].includes(receipt.gate_verdict)) fail(`Invalid gate_verdict at ${relative}; expected PASS|REVISE|FAIL|NOT_ASSESSED, received ${JSON.stringify(receipt.gate_verdict)}`);
  if (receipt.execution_status !== "COMPLETE" || receipt.gate_verdict !== "PASS") fail(`Unpromotable role receipt at ${relative}; expected execution_status COMPLETE and gate_verdict PASS, received ${receipt.execution_status}/${receipt.gate_verdict}`);
  if (receipt.fork_turns !== "none" || !nonemptyString(receipt.model) || !nonemptyString(receipt.reasoning_effort)) fail(`Invalid runtime declaration at ${relative}; expected fork_turns none plus non-empty model/reasoning_effort`);
  if (!Array.isArray(receipt.declared_inputs) || !Array.isArray(receipt.allowed_external_sources) || !Array.isArray(receipt.external_results_used) || !Array.isArray(receipt.environment_changes) || !Array.isArray(receipt.outputs) || !Array.isArray(receipt.undeclared_inputs_accessed) || !Array.isArray(receipt.limitations)) fail(`Malformed role receipt: ${relative}`);
  if (receipt.undeclared_inputs_accessed.length) fail(`Role accessed undeclared inputs: ${relative}`);
  for (const [field, values] of [["allowed_external_sources", receipt.allowed_external_sources], ["external_results_used", receipt.external_results_used]]) {
    if (values.some((value) => !nonemptyString(value)) || new Set(values).size !== values.length) fail(`Role receipt ${relative} has invalid ${field}`);
  }
  if (receipt.external_results_used.length && !receipt.allowed_external_sources.length) fail(`Role receipt ${relative} lists external results without an allowed external source class`);
  if (!nonemptyString(receipt.started_at) || !nonemptyString(receipt.completed_at) || !Number.isFinite(Date.parse(receipt.started_at)) || !Number.isFinite(Date.parse(receipt.completed_at)) || Date.parse(receipt.completed_at) < Date.parse(receipt.started_at)) fail(`Invalid role timestamps at ${relative}`);
  const inputs = receipt.declared_inputs.map((input) => roleRelative(run, input));
  if (new Set(inputs).size !== inputs.length) fail(`Role receipt repeats declared inputs: ${relative}`);
  for (const input of inputs) hashArtifact(run, input);
  const outputs = receipt.outputs.map((output) => roleRelative(run, output));
  if (!outputs.length || new Set(outputs).size !== outputs.length || (outputs.some((output) => output.startsWith("private/")) && !PRIVATE_ROLES.has(receipt.role))) fail(`Role receipt has invalid outputs at ${relative}; private outputs are limited to ${[...PRIVATE_ROLES].join(", ")}`);
  for (const output of outputs) hashArtifact(run, output);
  const environmentArtifacts = new Set();
  for (const [index, change] of receipt.environment_changes.entries()) {
    const location = `${relative}#/environment_changes/${index}`;
    if (!change || !nonemptyString(change.name) || !nonemptyString(change.version) || /[\s<>=~^*|,]/.test(change.version) || /^(?:latest|main|master|head)$/i.test(change.version) || change.scope !== "run_local" || !nonemptyString(change.source) || !nonemptyString(change.reason) || !nonemptyString(change.lock_or_manifest)) fail(`Invalid environment change at ${location}`);
    const lock = roleRelative(run, change.lock_or_manifest);
    if (!outputs.includes(lock)) fail(`Environment change lock or manifest must be an explicit role output at ${location}: ${lock}`);
    environmentArtifacts.add(lock);
  }
  for (const input of inputs) if (!roleMayRead(run, receipt.role, input)) fail(`${task} declares evaluator-only input ${input}; role ${receipt.role} is not allowed to read it`);
  if (receipt.role === "candidate_developer" && inputs.some((input) => input.includes("/evaluations/") || input.endsWith("/evaluations") || input === "selection/canonical-evaluation.json" || input.startsWith("private/"))) fail(`${task} declares raw evaluator evidence; candidate developers may receive only sanitized feedback files`);
  const launchRelative = `role-launches/${task}.json`;
  const launch = readJson(artifactPath(run, launchRelative).target);
  const launchHash = hashArtifact(run, launchRelative);
  if (receipt.launch_record_sha256 !== launchHash) fail(`Launch-record hash mismatch at ${relative}#/launch_record_sha256; expected ${launchHash}, received ${JSON.stringify(receipt.launch_record_sha256)}`);
  if (launch.schema_version !== 1 || !nonemptyString(launch.task_id) || launch.role !== receipt.role || launch.fork_turns !== "none" || launch.model !== receipt.model || launch.reasoning_effort !== receipt.reasoning_effort || launch.started_at !== receipt.started_at) fail(`Role receipt ${relative} does not match supervisor launch record ${launchRelative}`);
  let expectedRuntime;
  try {
    expectedRuntime = expectedRoleRuntime(run, receipt.role);
  } catch (error) {
    fail(`Cannot verify the frozen model policy for ${relative}: ${error.message}`);
  }
  if (launch.model_tier !== expectedRuntime.tier || launch.model !== expectedRuntime.model || launch.reasoning_effort !== expectedRuntime.reasoning_effort || launch.model_routing_sha256 !== expectedRuntime.routing_sha256) fail(`Role launch ${launchRelative} does not match the frozen ScientistOne model policy`);
  if (!Array.isArray(launch.declared_inputs) || !Array.isArray(launch.allowed_external_sources) || !Array.isArray(launch.declared_outputs)) fail(`Malformed supervisor launch record: ${launchRelative}`);
  if (launch.allowed_external_sources.some((value) => !nonemptyString(value)) || new Set(launch.allowed_external_sources).size !== launch.allowed_external_sources.length) fail(`Supervisor launch record has invalid allowed_external_sources: ${launchRelative}`);
  const launchInputs = launch.declared_inputs.map((input) => roleRelative(run, input));
  const launchOutputs = launch.declared_outputs.map((output) => roleRelative(run, output));
  if (JSON.stringify(launchInputs) !== JSON.stringify(inputs) || JSON.stringify(launchOutputs) !== JSON.stringify(outputs)) fail(`Declared paths in ${relative} differ from supervisor launch record ${launchRelative}`);
  if (JSON.stringify(launch.allowed_external_sources) !== JSON.stringify(receipt.allowed_external_sources)) fail(`Allowed external sources in ${relative} differ from supervisor launch record ${launchRelative}`);
  const hashBound = Array.isArray(launch.input_artifacts);
  if (hashBound) {
    const record = readJson(path.join(run, "run.json"));
    const expectedLogicalTask = launch.logical_task_name ?? task;
    const expectedAttempt = launch.attempt ?? 1;
    if (!nonemptyString(expectedLogicalTask) || !Number.isInteger(expectedAttempt) || expectedAttempt < 1 || launch.contract_revision !== record.contract_revision || launch.charter_revision !== record.charter_revision || !validSha256(launch.role_contract_sha256) || launch.role_contract_sha256 !== fileSha256(ROLE_CONTRACT_FILE) || launch.gate_schema_version !== 1) fail(`Hash-bound launch metadata is invalid or uses a stale role contract at ${launchRelative}`);
    if (receipt.launch_record !== launchRelative || receipt.logical_task_name !== expectedLogicalTask || receipt.attempt !== expectedAttempt || receipt.contract_revision !== launch.contract_revision || receipt.charter_revision !== launch.charter_revision || JSON.stringify(receipt.predecessor) !== JSON.stringify(launch.predecessor) || receipt.model_routing_sha256 !== launch.model_routing_sha256 || receipt.role_contract_sha256 !== launch.role_contract_sha256 || receipt.gate_schema_version !== launch.gate_schema_version) fail(`Hash-bound receipt metadata differs from ${launchRelative}`);
    verifyArtifactBindings(run, launch.input_artifacts, launchInputs, `${launchRelative}#/input_artifacts`);
    const receiptInputs = verifyArtifactBindings(run, receipt.input_artifacts, inputs, `${relative}#/input_artifacts`);
    if (JSON.stringify(receiptInputs) !== JSON.stringify(launch.input_artifacts)) fail(`Receipt input hashes differ from supervisor launch bindings at ${relative}`);
    const boundOutputs = outputs.filter((output) => output !== relative);
    verifyArtifactBindings(run, receipt.output_artifacts, boundOutputs, `${relative}#/output_artifacts`);
  }
  return { role: receipt.role, agent_task: receipt.agent_task, logical_task_name: launch.logical_task_name ?? task, attempt: launch.attempt ?? 1, hash_bound: hashBound, inputs, outputs: outputs.filter((output) => !environmentArtifacts.has(output)) };
}

function outputOwned(record, expected) {
  return record.outputs.some((output) => output === expected || output.startsWith(`${expected}/`));
}

function inputDeclared(record, expected) {
  return pathCovered(expected, record.inputs);
}

function requireRole(roleRecords, role, output, inputs = [], single = false) {
  const owners = roleRecords.filter((record) => record.role === role && outputOwned(record, output));
  if (!owners.length) fail(`${output} lacks its required ${role} receipt`);
  if (single && owners.length !== 1) fail(`${output} must have exactly one ${role} owner`);
  for (const owner of owners) {
    for (const input of inputs) {
      if (!inputDeclared(owner, input)) fail(`${owner.agent_task} does not declare required input: ${input}`);
    }
  }
  return owners;
}

function requireSingleScope(roleRecords, role, pattern) {
  for (const record of roleRecords.filter((item) => item.role === role)) {
    const scopes = new Set(record.outputs.map((output) => pattern.exec(output)?.[1]).filter(Boolean));
    if (scopes.size > 1) fail(`${record.agent_task} crosses independent work-package scopes`);
  }
}

function requireEvaluatorRawOwnership(run, roleRecords, evaluationPath) {
  const owners = roleRecords.filter((record) => record.role === "evaluator" && outputOwned(record, evaluationPath));
  if (owners.length !== 1) fail(`${evaluationPath} must have exactly one evaluator owner`);
  const evaluation = readJson(artifactPath(run, evaluationPath).target);
  const raw = relativePath(evaluation.raw_output_ref);
  if (!outputOwned(owners[0], raw)) fail(`${owners[0].agent_task} does not own raw evaluator output ${raw} for ${evaluationPath}`);
}

function i1BuilderInputs(record) {
  const inputs = ["request.md", "study-plan.md", "environment/bootstrap.json", "environment/model-routing.json", "contract/run-config.json", "contract/input-manifest.json"];
  if (record.mode === "external_audit") inputs.push("contract/source-bundle-manifest.json");
  else inputs.push("contract/evaluator-contract.md", "contract/evaluator-manifest.json");
  return inputs;
}

function expectedRoleRuntime(run, role) {
  const relative = "environment/model-routing.json";
  try {
    validateRoutingRecord(readJson(artifactPath(run, relative).target));
    return routedRoleRuntime(run, role);
  } catch (error) {
    fail(`Invalid frozen model-routing record at ${relative}: ${error.message}`);
  }
}

function requiredContractInputs(run, record) {
  return [...i1BuilderInputs(record), "contract/i1-verification-policy.json", "private/evaluator/i1-verifier"];
}

const DOWNSTREAM_INPUT_ROOTS = Object.freeze({
  contract: ["investigation", "evidence", "discovery", "selection", "ablation", "paper", "audit", "delivery", "deliverables"],
  investigation: ["discovery", "selection", "ablation", "paper", "audit", "delivery", "deliverables"],
  discovery: ["selection", "ablation", "paper", "audit", "delivery", "deliverables"],
  selection: ["ablation", "paper", "audit", "delivery", "deliverables"],
  ablation: ["paper", "audit", "delivery", "deliverables"],
  writing: ["audit", "delivery", "deliverables"],
  verification: ["audit", "deliverables"],
  audit: ["deliverables"],
});

function verifyRoleCoverage(run, phase, roles) {
  if (!roles.length) fail(`${phase} receipt must promote at least one individual role receipt`);
  const roleRecords = roles.map((role) => verifyRoleReceipt(run, role));
  const downstreamRoots = DOWNSTREAM_INPUT_ROOTS[phase] ?? [];
  for (const record of roleRecords) for (const input of record.inputs) {
    const downstream = downstreamRoots.find((root) => input === root || input.startsWith(`${root}/`));
    if (downstream) fail(`${record.agent_task} declares downstream input ${input} while producing ${phase} evidence`);
  }
  for (let left = 0; left < roleRecords.length; left++) {
    for (let right = left + 1; right < roleRecords.length; right++) {
      for (const first of roleRecords[left].outputs) for (const second of roleRecords[right].outputs) {
        if (first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`)) fail(`Exclusive output has multiple owners: ${first} (${roleRecords[left].agent_task}) and ${second} (${roleRecords[right].agent_task})`);
      }
    }
  }
  if (phase === "contract") {
    const record = readJson(path.join(run, "run.json"));
    const [builder] = requireRole(roleRecords, "i1_verifier_builder", "contract/i1-verification-policy.json", i1BuilderInputs(record), true);
    if (!outputOwned(builder, "private/evaluator/i1-verifier") || JSON.stringify([...builder.outputs].sort()) !== JSON.stringify(["contract/i1-verification-policy.json", "private/evaluator/i1-verifier"].sort())) fail(`${builder.agent_task} owns an invalid I1 verifier-builder output set`);
    requireRole(roleRecords, "contract_auditor", "contract/audit.md", requiredContractInputs(run, record), true);
  }
  if (phase === "investigation") {
    requireRole(roleRecords, "literature_mapper", "evidence/search-log.jsonl", ["study-plan.md"]);
    requireRole(roleRecords, "literature_mapper", "evidence/sources.jsonl", ["study-plan.md"]);
    requireRole(roleRecords, "evidence_reader", "investigation/notes", ["study-plan.md", "evidence/sources.jsonl"]);
    requireRole(roleRecords, "evidence_synthesizer", "investigation/directions", ["study-plan.md", "investigation/notes"]);
    requireRole(roleRecords, "protocol_auditor", "investigation/protocol-audit.md", ["study-plan.md", "investigation/directions"], true);
    requireRole(roleRecords, "brief_writer", "investigation/brief.md", ["study-plan.md", "investigation/directions", "investigation/protocol-audit.md"]);
    requireRole(roleRecords, "brief_writer", "investigation/references.bib", ["evidence/sources.jsonl"]);
    requireRole(roleRecords, "brief_critic", "investigation/critic.md", ["study-plan.md", "investigation/brief.md"], true);
  }
  if (phase === "discovery") {
    requireRole(roleRecords, "ideator", "discovery/ideas.jsonl", ["study-plan.md", "investigation/brief.md"]);
    requireRole(roleRecords, "idea_critic", "discovery/idea-critique.jsonl", ["study-plan.md", "discovery/ideas.jsonl"]);
    const index = readJson(path.join(run, "discovery", "index.json"));
    for (const node of index.nodes) {
      const base = relativePath(node.path);
      requireRole(roleRecords, "candidate_developer", `${base}/experimental-log.md`, ["study-plan.md", "investigation/brief.md", `${base}/idea.md`, `${base}/shared-input-manifest.json`], true);
      requireRole(roleRecords, "candidate_developer", `${base}/method-report.md`, ["study-plan.md"]);
      requireRole(roleRecords, "candidate_developer", `${base}/snapshots`, ["study-plan.md"]);
      const evaluatorInputs = ["study-plan.md", `${base}/snapshots`, "contract/evaluator-contract.md", "contract/evaluator-manifest.json", ...verifyEvaluatorManifest(run).paths];
      requireRole(roleRecords, "evaluator", `${base}/evaluations`, evaluatorInputs);
      requireRole(roleRecords, "legitimacy_auditor", `${base}/legitimacy-audit.md`, ["study-plan.md", `${base}/idea.md`, `${base}/method-report.md`, `${base}/evaluations`], true);
      for (const name of fs.readdirSync(path.join(run, base, "evaluations")).filter((file) => file.endsWith(".json"))) requireEvaluatorRawOwnership(run, roleRecords, `${base}/evaluations/${name}`);
    }
    requireSingleScope(roleRecords, "candidate_developer", /^discovery\/nodes\/([^/]+)\//);
    requireSingleScope(roleRecords, "evaluator", /^discovery\/nodes\/([^/]+)\//);
    requireSingleScope(roleRecords, "legitimacy_auditor", /^discovery\/nodes\/([^/]+)\//);
    for (const record of roleRecords.filter((item) => ["candidate_developer", "evaluator", "legitimacy_auditor"].includes(item.role))) {
      const scope = record.outputs.map((output) => /^discovery\/nodes\/([^/]+)/.exec(output)?.[1]).find(Boolean);
      if (!scope) continue;
      const base = `discovery/nodes/${scope}`;
      if (record.outputs.some((output) => !output.startsWith(`${base}/`) && !(record.role === "evaluator" && output.startsWith("private/evaluator/")))) fail(`${record.agent_task} writes outside its node`);
      if (record.inputs.some((input) => input.startsWith("discovery/nodes/") && !input.startsWith(`${base}/`))) fail(`${record.agent_task} reads another candidate node`);
      if (record.role === "candidate_developer" && record.inputs.some((input) => input.startsWith("private/"))) fail(`${record.agent_task} declares evaluator-only input`);
    }
  }
  if (phase === "selection") {
    const [analyst] = requireRole(roleRecords, "selection_analyst", "selection/selection.md", ["study-plan.md", "discovery/index.json"], true);
    for (const output of ["selection/lineage.json", "selection/selected"]) if (!outputOwned(analyst, output)) fail(`${analyst.agent_task} does not own required selection output: ${output}`);
    if (JSON.stringify([...analyst.outputs].sort()) !== JSON.stringify(["selection/lineage.json", "selection/selected", "selection/selection.md"].sort())) fail(`${analyst.agent_task} owns an invalid selection output set`);
    requireRole(roleRecords, "selection_auditor", "selection/selection-audit.md", ["study-plan.md", "discovery/index.json", "selection/selection.md", "selection/lineage.json"], true);
    requireRole(roleRecords, "evaluator", "selection/canonical-evaluation.json", ["study-plan.md", "selection/selected", "contract/evaluator-contract.md", "contract/evaluator-manifest.json", ...verifyEvaluatorManifest(run).paths], true);
    requireEvaluatorRawOwnership(run, roleRecords, "selection/canonical-evaluation.json");
  }
  if (phase === "ablation") {
    requireRole(roleRecords, "ablation_designer", "ablation/plan.json", ["study-plan.md", "selection/selected"], true);
    requireRole(roleRecords, "ablation_implementer", "ablation/variants", ["study-plan.md", "selection/selected", "ablation/plan.json"]);
    requireRole(roleRecords, "evaluator", "ablation/evaluations", ["study-plan.md", "ablation/variants", "contract/evaluator-contract.md", "contract/evaluator-manifest.json", ...verifyEvaluatorManifest(run).paths]);
    requireRole(roleRecords, "ablation_analyst", "ablation/results.json", ["study-plan.md", "ablation/plan.json", "ablation/evaluations"], true);
    requireRole(roleRecords, "ablation_analyst", "ablation/report.md", ["ablation/results.json"], true);
    requireSingleScope(roleRecords, "ablation_implementer", /^ablation\/variants\/([^/]+)/);
    requireSingleScope(roleRecords, "evaluator", /^ablation\/evaluations\/([^/.]+)\.json$/);
    for (const name of fs.readdirSync(path.join(run, "ablation", "evaluations")).filter((file) => file.endsWith(".json"))) requireEvaluatorRawOwnership(run, roleRecords, `ablation/evaluations/${name}`);
  }
  if (phase === "writing") {
    for (const output of ["paper/representation.md", "paper/paper-tagged.tex", "paper/references.bib"]) requireRole(roleRecords, "writer", output, ["study-plan.md", "investigation/brief.md", "selection/canonical-evaluation.json", "ablation/results.json"]);
    requireRole(roleRecords, "paper_critic", "paper/grounding-report.json", ["study-plan.md", "paper/representation.md"]);
    requireRole(roleRecords, "paper_critic", "paper/critic.md", ["study-plan.md", "paper/paper-tagged.tex"]);
  }
  if (phase === "verification") {
    requireRole(roleRecords, "claim_verifier", "paper/claims.jsonl", ["study-plan.md", "paper/paper-tagged.tex"]);
    requireRole(roleRecords, "claim_verifier", "paper/verification.md", ["paper/claims.jsonl"]);
    const record = readJson(path.join(run, "run.json"));
    const outputs = ["paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex"];
    if (pdfRequired(run, record)) outputs.push("paper/paper.pdf");
    for (const output of outputs) requireRole(roleRecords, "writer", output, ["paper/claims.jsonl", "paper/verification.md"]);
  }
  if (phase === "audit") {
    const record = readJson(path.join(run, "run.json"));
    const bundle = record.mode === "external_audit" ? verifySourceBundleManifest(run) : null;
    const evaluatorInputs = record.mode === "research" ? ["contract/evaluator-contract.md", "contract/evaluator-manifest.json", ...verifyEvaluatorManifest(run).paths] : [];
    const i1Inputs = record.mode === "research"
      ? ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "private/evaluator/i1-verifier", "paper/paper.tex", ...(pdfRequired(run, record) ? ["paper/paper.pdf"] : []), "selection/selected", "selection/canonical-evaluation.json", ...evaluatorInputs]
      : ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "private/evaluator/i1-verifier", ...externalInputsFor(bundle, "I1")];
    const [i1Owner] = requireRole(roleRecords, "i1_score_auditor", "audit/i1.json", i1Inputs, true);
    if (!outputOwned(i1Owner, "audit/i1")) fail(`${i1Owner.agent_task} does not own the required structured I1 audit directory`);
    const i1Execution = readJson(path.join(run, "audit", "i1", "execution-receipt.json"));
    const expectedI1Outputs = ["audit/i1", "audit/i1.json"];
    if (i1Execution.private_execution_path !== null) expectedI1Outputs.push(relativePath(i1Execution.private_execution_path));
    if (JSON.stringify([...i1Owner.outputs].sort()) !== JSON.stringify(expectedI1Outputs.sort()) || i1Owner.inputs.some((input) => input.startsWith("audit/") || input.startsWith("role-receipts/") || input.startsWith("receipts/"))) fail(`${i1Owner.agent_task} owns an invalid or non-independent I1 output set`);
    const independentReports = {
      "i3.json": ["i3_reference_auditor", record.mode === "research" ? ["study-plan.md", "paper/references.bib"] : ["study-plan.md", ...externalInputsFor(bundle, "I3")]],
      "claim-provenance.json": ["claim_provenance_auditor", record.mode === "research" ? ["study-plan.md", "paper/claims.jsonl", "paper/provenance.jsonl", "selection/canonical-evaluation.json"] : ["study-plan.md", ...externalInputsFor(bundle, "claim_provenance")]],
    };
    for (const [file, [expectedRole, inputs]] of Object.entries(independentReports)) {
      const reportPath = `audit/${file}`;
      const [owner] = requireRole(roleRecords, expectedRole, reportPath, inputs, true);
      if (owner.outputs.length !== 1 || owner.inputs.some((input) => input.startsWith("audit/") || input.startsWith("role-receipts/") || input.startsWith("receipts/"))) fail(`${owner.agent_task} is not independent of peer audit evidence`);
    }
    const reporterInputs = ["study-plan.md", "audit/i1.json", ...Object.keys(independentReports).map((file) => `audit/${file}`)];
    const [reporter] = requireRole(roleRecords, "audit_reporter", "audit/report.md", reporterInputs, true);
    const reporterOutputs = ["audit/i2/aggregate.json", "audit/i4/aggregate.json", "audit/report.md"];
    if (JSON.stringify([...reporter.outputs].sort()) !== JSON.stringify(reporterOutputs.sort())) fail("Audit reporter owns an invalid report set");
    for (const panel of ["i2", "i4"]) {
      const expectedRole = `${panel}_judge`;
      const judgeFiles = fs.readdirSync(path.join(run, "audit", panel)).filter((name) => /^judge-\d+\.json$/.test(name)).map((name) => `audit/${panel}/${name}`);
      const judgeReceipts = roleRecords.filter((role) => role.role === expectedRole);
      if (judgeReceipts.length !== judgeFiles.length) fail(`${panel.toUpperCase()} requires one role receipt per judge`);
      for (const judgeReceipt of judgeReceipts) {
        if (judgeReceipt.outputs.length !== 1 || judgeReceipt.outputs.filter((output) => new RegExp(`^audit/${panel}/judge-\\d+\\.json$`).test(output)).length !== 1) fail(`${panel.toUpperCase()} judge receipts must each own exactly one vote`);
        if (judgeReceipt.inputs.some((input) => input.startsWith("audit/") || input.startsWith("role-receipts/") || input.startsWith("receipts/"))) fail(`${judgeReceipt.agent_task} is not blind to peer audit evidence`);
        const requiredInputs = record.mode === "external_audit"
          ? ["study-plan.md", ...externalInputsFor(bundle, panel.toUpperCase())]
          : panel === "i2"
            ? ["study-plan.md", "contract/input-manifest.json", "selection/selected", "selection/canonical-evaluation.json", ...evaluatorInputs]
            : ["study-plan.md", "paper/paper.tex", "selection/selected"];
        for (const input of requiredInputs) if (!inputDeclared(judgeReceipt, input)) fail(`${judgeReceipt.agent_task} does not declare required input: ${input}`);
      }
      for (const judgeFile of judgeFiles) {
        if (judgeReceipts.filter((role) => role.outputs.includes(judgeFile)).length !== 1) fail(`${judgeFile} lacks one independent judge receipt`);
        if (!inputDeclared(reporter, judgeFile)) fail(`Audit reporter does not declare judge vote: ${judgeFile}`);
      }
    }
    const reproductionInputs = record.mode === "research"
      ? ["study-plan.md", "environment/bootstrap.json", "selection/selected/manifest.json", "selection/canonical-evaluation.json", "audit/report.md"]
      : ["study-plan.md", "environment/bootstrap.json", "contract/source-bundle-manifest.json", "audit/report.md"];
    const [reproduction] = requireRole(roleRecords, "reproduction_writer", "delivery/reproduction.md", reproductionInputs, true);
    if (reproduction.outputs.length !== 1) fail(`${reproduction.agent_task} may own only delivery/reproduction.md`);
  }
}

function jsonLines(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) fail(`Expected non-empty JSONL: ${file}`);
  return lines.map((line, index) => {
    try { return JSON.parse(line); } catch { fail(`Invalid JSONL at ${file}:${index + 1}`); }
  });
}

function readOverallVerdict(file) {
  const verdicts = fs.readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => /^Overall verdict:\s*(?:PASS|REVISE|FAIL)$/i.test(line));
  if (verdicts.length !== 1) fail(`Required unique overall verdict missing: ${file}`);
  return verdicts[0].split(":")[1].trim().toUpperCase();
}

function requirePass(file) {
  if (readOverallVerdict(file) !== "PASS") fail(`Required overall PASS verdict missing: ${file}`);
}

function nonemptyDirectory(directory) {
  if (!fs.statSync(directory).isDirectory() || !fs.readdirSync(directory).length) fail(`Expected non-empty directory: ${directory}`);
}

function verifySelectedManifest(run) {
  const manifest = readJson(path.join(run, "selection", "selected", "manifest.json"));
  if (!Array.isArray(manifest.files) || !manifest.files.length) fail("Selected-method manifest is empty");
  const files = manifest.files.map((file) => relativePath(file));
  if (new Set(files).size !== files.length) fail("Selected-method manifest contains duplicate files");
  for (const file of files) hashArtifact(run, `selection/selected/${file}`);
  const actual = filesWithin(path.join(run, "selection", "selected")).filter((file) => file !== "manifest.json");
  if (JSON.stringify([...files].sort()) !== JSON.stringify(actual)) fail("Selected-method manifest is not exhaustive");
  return files;
}

function contentHashFiles(root, files) {
  const hash = createHash("sha256");
  for (const relative of [...files].sort()) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) fail(`Missing selected file while computing tree hash: ${file}`);
    addField(hash, "F", relative);
    addField(hash, "S", fs.statSync(file).size);
    addFile(hash, file);
  }
  return hash.digest("hex");
}

function verifySelectionLineage(run) {
  const index = readJson(path.join(run, "discovery", "index.json"));
  const lineageFile = path.join(run, "selection", "lineage.json");
  const lineage = readJson(lineageFile);
  const requiredStrings = ["source_node_id", "source_snapshot_path", "source_snapshot_sha256", "selected_snapshot_sha256", "legitimacy_verdict_path", "evaluation_path", "metric_name", "metric_direction"];
  for (const field of requiredStrings) if (!nonemptyString(lineage[field])) fail(`Selection lineage at ${lineageFile}#/${field} must be a non-empty string, received ${JSON.stringify(lineage[field])}`);
  if (lineage.rank !== 1 || !Array.isArray(lineage.tie_break_evidence)) fail(`Selection lineage at ${lineageFile} must have rank 1 and tie_break_evidence array`);
  if (!["maximize", "minimize"].includes(lineage.metric_direction)) fail(`Invalid metric_direction at ${lineageFile}; received ${JSON.stringify(lineage.metric_direction)}`);
  const nodes = Array.isArray(index.nodes) ? index.nodes : [];
  const node = nodes.find((item) => item.id === lineage.source_node_id);
  if (!node) fail(`Selection lineage source_node_id at ${lineageFile} does not resolve in discovery/index.json: ${lineage.source_node_id}`);
  const nodePath = relativePath(node.path);
  const sourceSnapshot = relativePath(lineage.source_snapshot_path);
  if (!sourceSnapshot.startsWith(`${nodePath}/snapshots/`)) fail(`Selection lineage source snapshot must belong to ${nodePath}, received ${sourceSnapshot}`);
  const legitimacyPath = relativePath(lineage.legitimacy_verdict_path);
  if (legitimacyPath !== `${nodePath}/legitimacy-audit.md`) fail(`Selection lineage legitimacy path must be ${nodePath}/legitimacy-audit.md, received ${legitimacyPath}`);
  requirePass(artifactPath(run, legitimacyPath).target);
  const evaluationPath = relativePath(lineage.evaluation_path);
  if (!evaluationPath.startsWith(`${nodePath}/evaluations/`) || !evaluationPath.endsWith(".json")) fail(`Selection lineage evaluation must belong to ${nodePath}, received ${evaluationPath}`);
  verifyEvaluation(run, artifactPath(run, evaluationPath).target, `${nodePath}/snapshots`);
  const evaluation = readJson(artifactPath(run, evaluationPath).target);
  if (evaluation.status !== "valid" || evaluation.snapshot !== sourceSnapshot || evaluation.metric.name !== lineage.metric_name || evaluation.metric.direction !== lineage.metric_direction) fail(`Selection lineage at ${lineageFile} is not bound to an eligible evaluation`);
  const selectedFiles = verifySelectedManifest(run);
  const sourceFiles = filesWithin(artifactPath(run, sourceSnapshot).target);
  if (JSON.stringify(sourceFiles) !== JSON.stringify([...selectedFiles].sort())) fail(`Selected snapshot file list differs from lineage source ${sourceSnapshot}`);
  const sourceHash = contentHashFiles(artifactPath(run, sourceSnapshot).target, sourceFiles);
  const selectedHash = contentHashFiles(path.join(run, "selection", "selected"), selectedFiles);
  if (lineage.source_snapshot_sha256 !== sourceHash || lineage.selected_snapshot_sha256 !== selectedHash || sourceHash !== selectedHash) fail(`Selected snapshot differs from lineage source ${sourceSnapshot}; expected tree hash ${sourceHash}, received ${selectedHash}`);
  if (!Array.isArray(index.retained) || !index.retained.length) fail("Discovery index must retain at least one eligible candidate");
  for (const retainedId of index.retained) {
    const retained = nodes.find((item) => item.id === retainedId);
    if (!retained) fail(`Retained candidate ${retainedId} does not resolve in discovery/index.json`);
    const retainedPath = relativePath(retained.path);
    const retainedLegitimacy = relativePath(retained.legitimacy_verdict_path ?? `${retainedPath}/legitimacy-audit.md`);
    requirePass(artifactPath(run, retainedLegitimacy).target);
    if (!nonemptyString(retained.evaluation_path)) fail(`Retained candidate ${retainedId} lacks evaluation_path in discovery/index.json`);
    verifyEvaluation(run, artifactPath(run, retained.evaluation_path).target, `${retainedPath}/snapshots`);
    if (readJson(artifactPath(run, retained.evaluation_path).target).status !== "valid") fail(`Retained candidate ${retainedId} is not selection-eligible`);
  }
  return lineage;
}

function filesWithin(root, current = root) {
  const files = [];
  for (const name of fs.readdirSync(current).sort()) {
    const file = path.join(current, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) fail(`Symlinks cannot appear in sealed artifacts: ${file}`);
    if (stat.isDirectory()) files.push(...filesWithin(root, file));
    else if (stat.isFile()) files.push(path.relative(root, file).replaceAll(path.sep, "/"));
    else fail(`Unsupported sealed artifact: ${file}`);
  }
  return files.sort();
}

function exactKeys(value, allowed, location) {
  if (!value || Array.isArray(value) || typeof value !== "object") fail(`Expected an object at ${location}, received ${JSON.stringify(value)}`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`Unknown candidate-visible field at ${location}; expected only ${allowed.join(", ")}, received ${unknown.join(", ")}`);
}

function verifySanitizedEvaluation(run, value, file) {
  exactKeys(value, ["schema_version", "snapshot", "snapshot_path", "snapshot_sha256", "metric", "protocol", "procedure_id", "repetitions", "command_or_procedure", "environment", "raw_output_ref", "raw_output_sha256", "evaluated_at", "status", "failure_category", "candidate_visible_note"], file);
  if (value.metric != null) exactKeys(value.metric, ["name", "value", "unit", "direction"], `${file}#/metric`);
  if (value.environment != null) exactKeys(value.environment, ["software", "hardware", "os"], `${file}#/environment`);
  if (Array.isArray(value.repetitions)) for (const [index, repetition] of value.repetitions.entries()) exactKeys(repetition, ["seed", "value", "id"], `${file}#/repetitions/${index}`);
  if (!nonemptyString(value.raw_output_ref) || !nonemptyString(value.raw_output_sha256)) fail(`Evaluation at ${file} must contain raw_output_ref and raw_output_sha256`);
  const raw = relativePath(value.raw_output_ref);
  if (!raw.startsWith("private/evaluator/")) fail(`Evaluation raw_output_ref at ${file} must point under private/evaluator/, received ${raw}`);
  const observed = hashArtifact(run, raw);
  if (observed !== value.raw_output_sha256) fail(`Evaluation raw output hash mismatch at ${file}; expected ${value.raw_output_sha256}, received ${observed}`);
}

function verifyCanonicalEvaluation(run, file, record) {
  const value = readJson(file);
  verifySanitizedEvaluation(run, value, file);
  if (value.status !== "valid" || value.snapshot_path !== "selection/selected" || value.snapshot_sha256 !== hashArtifact(run, value.snapshot_path)) fail(`Canonical evaluation is not bound to the selected snapshot: ${file}`);
  const metric = value.metric;
  if (!metric || !nonemptyString(metric.name) || !Number.isFinite(metric.value) || !nonemptyString(metric.unit) || !["maximize", "minimize"].includes(metric.direction)) fail(`Invalid canonical metric at ${file}#/metric; expected finite value and name/unit/direction, received ${JSON.stringify(metric)}`);
  const policy = readJson(path.join(run, "contract", "i1-verification-policy.json"));
  const primaryIds = new Set(policy.decision_rule.primary_metric_ids);
  const matchedPrimaryMetrics = policy.metrics.filter((candidate) => primaryIds.has(candidate.id) && candidate.name === metric.name && candidate.unit === metric.unit && candidate.direction === metric.direction);
  if (matchedPrimaryMetrics.length !== 1) fail(`Canonical metric does not match exactly one frozen primary I1 metric at ${file}#/metric`);
  if (!Array.isArray(value.repetitions) || value.repetitions.length !== record.budgets.canonical_repetitions || value.repetitions.some((item) => !Number.isFinite(item.value))) fail(`Canonical evaluation has the wrong repetition evidence: ${file}`);
  const mean = value.repetitions.reduce((sum, item) => sum + item.value, 0) / value.repetitions.length;
  if (Math.abs(mean - metric.value) > Math.max(1e-12, Math.abs(mean) * 1e-9)) fail(`Canonical metric is not the repetition mean: ${file}`);
}

function verifyEvaluation(run, file, allowedSnapshotPrefix) {
  const value = readJson(file);
  verifySanitizedEvaluation(run, value, file);
  if (!value || typeof value.snapshot !== "string" || !(value.snapshot === allowedSnapshotPrefix || value.snapshot.startsWith(`${allowedSnapshotPrefix}/`)) || value.snapshot_sha256 !== hashArtifact(run, value.snapshot)) fail(`Evaluation is not bound to an allowed sealed snapshot: ${file}`);
  if (value.status === "failed") {
    if (!nonemptyString(value.failure_category) || value.metric != null) fail(`Malformed failed evaluation at ${file}; expected failure_category and no metric`);
    return;
  }
  const metric = value.metric;
  if (value.status !== "valid" || !metric || typeof metric.name !== "string" || !Number.isFinite(metric.value) || typeof metric.unit !== "string" || !["maximize", "minimize"].includes(metric.direction) || !Array.isArray(value.repetitions) || !value.repetitions.length || value.repetitions.some((item) => !Number.isFinite(item.value)) || typeof value.protocol !== "string" || typeof value.command_or_procedure !== "string") fail(`Malformed evaluation evidence: ${file}`);
}

function verifyPdf(file) {
  const data = fs.readFileSync(file);
  const text = data.toString("latin1");
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  const offset = match ? Number.parseInt(match[1], 10) : -1;
  const xref = Number.isInteger(offset) && offset >= 0 && offset < data.length ? text.slice(offset, offset + 512) : "";
  if (data.length < 100 || !text.startsWith("%PDF-") || !match || (!xref.startsWith("xref") && !/\/Type\s*\/XRef\b/.test(xref)) || !/\/Root\s+\d+\s+\d+\s+R\b/.test(text) || !/\/Type\s*\/Catalog\b/.test(text) || !/\/Type\s*\/Page\b/.test(text)) fail(`Final paper is not a structurally valid compiled PDF: ${file}`);
}

function extractClaimIds(file) {
  const text = fs.readFileSync(file, "utf8");
  const ids = [...text.matchAll(/\\coe\s*\{([^{}]+)\}/g)].map((match) => match[1].trim());
  if (ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))) fail(`Invalid \\coe claim marker in ${file}; ids must be stable token strings`);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) fail(`Duplicate paper claim marker in ${file}: ${[...new Set(duplicates)].join(", ")}`);
  return ids;
}

function resolveJsonPointer(value, pointer, location) {
  const clean = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (!clean.startsWith("/")) fail(`Invalid JSON pointer at ${location}; expected /path or #/path, received ${pointer}`);
  let current = value;
  for (const token of clean.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (current == null || typeof current !== "object" || !(token in current)) fail(`JSON pointer does not resolve at ${location}: ${pointer}`);
    current = current[token];
  }
  return current;
}

function resolveLineLocator(file, locator, location) {
  const match = /^(?:#?L|lines:)?(\d+)(?:-(?:L)?(\d+))?$/.exec(locator);
  if (!match) fail(`Invalid line locator at ${location}; expected L12-L18, received ${locator}`);
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  const lineCount = fs.readFileSync(file, "utf8").split(/\r?\n/).length;
  if (start < 1 || end < start || end > lineCount) fail(`Line locator out of range at ${location}; expected 1-${lineCount}, received ${start}-${end}`);
}

function anchoredEvidencePaths(run) {
  const record = readJson(path.join(run, "run.json"));
  const paths = ["request.md", "study-plan.md"];
  for (const checkpoint of Object.values(record.checkpoints)) for (const output of checkpoint.outputs) paths.push(output.path);
  for (const item of verifyInputManifest(run).files) paths.push(item.frozen_path);
  if (record.mode === "external_audit") for (const item of verifySourceBundleManifest(run).items.filter((entry) => entry.available)) paths.push(item.frozen_path);
  return paths;
}

function evidenceIsAnchored(target, anchors) {
  return anchors.some((anchor) => target === anchor || target.startsWith(`${anchor}/`));
}

function bibliographyKeys(file) {
  return new Set([...fs.readFileSync(file, "utf8").matchAll(/@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,/g)].map((match) => match[1]));
}

function verifyClaims(run) {
  const originalFile = path.join(run, "paper", "paper-tagged.tex");
  const verifiedFile = path.join(run, "paper", "paper-verified-tagged.tex");
  const cleanFile = path.join(run, "paper", "paper.tex");
  const originalIds = extractClaimIds(originalFile);
  const paperIds = extractClaimIds(verifiedFile);
  if (!paperIds.length && /[A-Za-z]{4,}/.test(fs.readFileSync(verifiedFile, "utf8"))) fail(`Tagged paper contains factual prose but no \\coe claim markers: ${verifiedFile}`);
  for (const id of paperIds) if (!originalIds.includes(id)) fail(`Verified tagged paper adds claim ${id} that is absent from the frozen tagged draft`);
  if (/\\coe\s*\{/.test(fs.readFileSync(cleanFile, "utf8"))) fail(`Presentation TeX still contains \\coe markers: ${cleanFile}`);
  const claims = jsonLines(path.join(run, "paper", "claims.jsonl"));
  const provenance = jsonLines(path.join(run, "paper", "provenance.jsonl"));
  for (const [name, records] of [["claims", claims], ["provenance", provenance]]) {
    const ids = records.map((record) => record.claim_id);
    if (ids.some((id) => !nonemptyString(id)) || new Set(ids).size !== ids.length) fail(`Paper ${name} must contain each claim_id exactly once`);
    if (JSON.stringify([...ids].sort()) !== JSON.stringify([...paperIds].sort())) fail(`Paper ${name} claim inventory differs from \\coe markers; expected ${[...paperIds].sort().join(", ")}, received ${[...ids].sort().join(", ")}`);
  }
  const provenanceById = new Map(provenance.map((record) => [record.claim_id, record]));
  const anchors = anchoredEvidencePaths(run);
  const inferenceGraph = new Map();
  const referenceFile = path.join(run, "paper", "references.bib");
  const bibkeys = bibliographyKeys(referenceFile);
  for (const claim of claims) {
    if (!nonemptyString(claim.paper_location) || !nonemptyString(claim.sentence) || !["citation", "numerical", "methodological", "conclusion"].includes(claim.claim_type) || claim.status !== "SUPPORTED") fail(`Malformed final claim ${JSON.stringify(claim.claim_id)}; expected paper_location, sentence, claim_type, and status SUPPORTED`);
    const [locationPath, lineText] = claim.paper_location.split(":");
    if (relativePath(locationPath) !== "paper/paper-verified-tagged.tex" || !/^\d+$/.test(lineText ?? "")) fail(`Invalid paper_location for ${claim.claim_id}: ${claim.paper_location}`);
    const paperLine = fs.readFileSync(verifiedFile, "utf8").split(/\r?\n/)[Number(lineText) - 1] ?? "";
    if (!paperLine.includes(`\\coe{${claim.claim_id}}`) && !new RegExp(`\\\\coe\\s*\\{${claim.claim_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`).test(paperLine)) fail(`paper_location for ${claim.claim_id} does not contain its marker: ${claim.paper_location}`);
    if (!paperLine.includes(claim.sentence)) fail(`Claim sentence for ${claim.claim_id} does not occur at ${claim.paper_location}`);
    const mapping = provenanceById.get(claim.claim_id);
    if (!mapping || mapping.paper_location !== claim.paper_location || mapping.sentence !== claim.sentence || mapping.claim_type !== claim.claim_type || mapping.status !== "SUPPORTED" || !Array.isArray(mapping.evidence) || !mapping.evidence.length) fail(`Provenance for ${claim.claim_id} is missing, unsupported, or differs from its claim record`);
    const dependencies = [];
    for (const [index, evidence] of mapping.evidence.entries()) {
      const location = `paper/provenance.jsonl claim ${claim.claim_id} evidence ${index}`;
      if (!evidence || !["source", "metric", "artifact", "inference"].includes(evidence.kind) || !nonemptyString(evidence.target)) fail(`Malformed evidence at ${location}`);
      if (evidence.kind === "inference") {
        if (evidence.locator !== null || evidence.sha256 !== null) fail(`Inference evidence at ${location} requires locator and sha256 to be null`);
        const ids = evidence.target.split(",").map((id) => id.trim()).filter(Boolean);
        if (!ids.length || ids.some((id) => !paperIds.includes(id))) fail(`Inference evidence at ${location} references an unknown claim: ${evidence.target}`);
        dependencies.push(...ids);
        continue;
      }
      if (!nonemptyString(evidence.sha256)) fail(`Evidence at ${location} requires sha256`);
      if (evidence.kind === "source" && evidence.target.startsWith("bib:")) {
        const key = evidence.target.slice(4);
        if (!bibkeys.has(key)) fail(`Bibliography evidence at ${location} does not resolve: ${key}`);
        const observed = hashArtifact(run, "paper/references.bib");
        if (evidence.sha256 !== observed || evidence.locator !== null) fail(`Bibliography evidence at ${location} must hash paper/references.bib and use locator null`);
        continue;
      }
      const target = relativePath(evidence.target);
      const targetFile = artifactPath(run, target).target;
      if (!evidenceIsAnchored(target, anchors)) fail(`Evidence target for ${claim.claim_id} is not checkpointed or frozen: ${target}`);
      const observed = hashArtifact(run, target);
      if (observed !== evidence.sha256) fail(`Evidence hash mismatch at ${location}; expected ${observed}, received ${evidence.sha256}`);
      if (!nonemptyString(evidence.locator)) fail(`Evidence at ${location} requires an exact locator`);
      if (evidence.locator.startsWith("/") || evidence.locator.startsWith("#/")) resolveJsonPointer(readJson(targetFile), evidence.locator, location);
      else resolveLineLocator(targetFile, evidence.locator, location);
    }
    inferenceGraph.set(claim.claim_id, dependencies);
    if (claim.claim_type === "numerical") {
      if (!["study", "prior_work"].includes(claim.origin)) fail(`Numerical claim ${claim.claim_id} requires origin study|prior_work`);
      const evidenceKinds = mapping.evidence.map((item) => item.kind);
      const targets = mapping.evidence.map((item) => item.target);
      if (claim.origin === "study" && !targets.some((target, index) => evidenceKinds[index] === "metric" && (target === "selection/canonical-evaluation.json" || target === "ablation/results.json"))) fail(`Study numerical claim ${claim.claim_id} must resolve to canonical or ablation metric evidence`);
      if (claim.origin === "prior_work" && !evidenceKinds.includes("source")) fail(`Prior-work numerical claim ${claim.claim_id} must resolve to source evidence`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail(`Circular inference dependency detected at claim ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of inferenceGraph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of paperIds) visit(id);
  return { claims, provenance, paperIds };
}

function verifyVisualInspection(run) {
  const file = path.join(run, "delivery", "visual-inspection.json");
  const inspection = readJson(file);
  const pdfPath = "paper/paper.pdf";
  const pageCount = (fs.readFileSync(path.join(run, pdfPath)).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (inspection.pdf_path !== pdfPath || inspection.pdf_sha256 !== hashArtifact(run, pdfPath)) fail(`Visual inspection at ${file} is not bound to ${pdfPath}`);
  if (inspection.page_count !== pageCount || !Number.isInteger(pageCount) || pageCount < 1) fail(`Visual inspection page_count at ${file}; expected ${pageCount}, received ${JSON.stringify(inspection.page_count)}`);
  if (!nonemptyString(inspection.renderer) || !nonemptyString(inspection.timestamp) || !Number.isFinite(Date.parse(inspection.timestamp))) fail(`Visual inspection at ${file} requires renderer and ISO timestamp`);
  if (!Array.isArray(inspection.checked_pages) || JSON.stringify([...new Set(inspection.checked_pages)].sort((a, b) => a - b)) !== JSON.stringify(Array.from({ length: pageCount }, (_, index) => index + 1))) fail(`Visual inspection at ${file} must record every checked page 1-${pageCount}`);
  if (!Array.isArray(inspection.detected_defects) || inspection.verdict !== "PASS" || inspection.detected_defects.length) fail(`Visual inspection at ${file} must have verdict PASS and no unresolved detected_defects`);
}

function verifyReproduction(run, mode) {
  const file = path.join(run, "delivery", "reproduction.md");
  const text = fs.readFileSync(file, "utf8");
  const headings = mode === "research"
    ? ["Selected snapshot", "Environment", "Inputs and access limits", "Procedure", "Expected canonical output", "Verification"]
    : ["Source bundle", "Inputs and access limits", "Audit procedure", "Expected audit output", "Verification"];
  for (const heading of headings) {
    const match = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "mi").exec(text);
    const after = match ? text.slice(match.index + match[0].length) : "";
    const nextHeading = after.search(/^## /m);
    const content = nextHeading < 0 ? after : after.slice(0, nextHeading);
    if (!match || !content.trim()) fail(`Reproduction guide at ${file} requires a non-empty ## ${heading} section`);
  }
  if (!/coe\.mjs\s+verify\b/.test(text) || !/manifest/i.test(text)) fail(`Reproduction guide at ${file} must include the manifest-verification command`);
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function verifyEvidencePathList(run, values, location) {
  if (!Array.isArray(values) || !values.length) fail(`${location} requires at least one exact evidence path`);
  for (const value of values) hashArtifact(run, roleRelative(run, value));
}

function i1Verdict(values) {
  return values.includes("FAIL") ? "FAIL" : values.includes("NOT_ASSESSED") ? "NOT_ASSESSED" : values.includes("INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS";
}

function verifyI1Manifest(run, relative, requiredPaths = []) {
  const value = readJson(artifactPath(run, relative).target);
  if (value.schema_version !== 1 || !Array.isArray(value.files) || !value.files.length) fail(`Invalid I1 artifact manifest at ${relative}`);
  const seen = new Set();
  for (const [index, item] of value.files.entries()) {
    const location = `${relative}#/files/${index}`;
    if (!item || !nonemptyString(item.path) || !validSha256(item.sha256) || !["shared", "evaluator_only", "audit_safe"].includes(item.access_class)) fail(`Malformed I1 artifact manifest entry at ${location}`);
    const clean = relativePath(item.path);
    if (seen.has(clean) || hashArtifact(run, clean) !== item.sha256) fail(`Duplicate or hash-mismatched I1 artifact manifest entry at ${location}`);
    seen.add(clean);
  }
  for (const required of requiredPaths) if (!seen.has(required)) fail(`I1 artifact manifest ${relative} omits ${required}`);
  return { ...value, paths: seen };
}

function verifyI1Extraction(run, relative, medium, policy, allowNotAssessed) {
  const value = readJson(artifactPath(run, relative).target);
  if (value.schema_version !== 1 || value.medium !== medium || !["ASSESSED", "NOT_ASSESSED"].includes(value.status) || !Array.isArray(value.metrics) || !Array.isArray(value.unavailable_items) || !Array.isArray(value.limitations)) fail(`Invalid I1 ${medium} extraction at ${relative}`);
  if (value.status === "NOT_ASSESSED") {
    if (!allowNotAssessed || value.metrics.length || !value.unavailable_items.length) fail(`Invalid NOT_ASSESSED I1 ${medium} extraction at ${relative}`);
    return value;
  }
  const expected = policy.metrics.map((metric) => metric.id).sort();
  const received = value.metrics.map((metric) => metric?.metric_id).sort();
  if (JSON.stringify(received) !== JSON.stringify(expected)) fail(`I1 ${medium} extraction metric inventory differs from the frozen policy`);
  for (const [index, metric] of value.metrics.entries()) {
    const frozen = policy.metrics.find((item) => item.id === metric.metric_id);
    if (!metric || !Number.isFinite(metric.normalized_value) || (typeof metric.displayed_value !== "string" && !Number.isFinite(metric.displayed_value)) || metric.name !== frozen.name || metric.unit !== frozen.unit || metric.direction !== frozen.direction || !nonemptyString(metric.estimand_language) || !nonemptyString(metric.aggregation_language) || !nonemptyString(metric.uncertainty_language) || !nonemptyString(metric.locator)) fail(`Malformed I1 ${medium} metric extraction at ${relative}#/metrics/${index}`);
  }
  return value;
}

function verifyI1Component(run, name, policySha, evidenceSha, allowNotAssessed) {
  const relative = `audit/i1/${name}.json`;
  const value = readJson(artifactPath(run, relative).target);
  if (value.schema_version !== 1 || !I1_VERDICTS.includes(value.verdict) || value.policy_sha256 !== policySha || value.evidence_manifest_sha256 !== evidenceSha || !Array.isArray(value.metrics) || !Array.isArray(value.mismatches) || !Array.isArray(value.unavailable_items) || !Array.isArray(value.limitations)) fail(`Malformed I1 ${name} component at ${relative}`);
  if (value.verdict === "NOT_ASSESSED" && (!allowNotAssessed || !value.unavailable_items.length)) fail(`Invalid NOT_ASSESSED I1 ${name} component at ${relative}`);
  verifyEvidencePathList(run, value.evidence_paths, `${relative}#/evidence_paths`);
  return value;
}

function roundI1Value(value, presentation) {
  if (presentation.rounding === "none") return value;
  const factor = 10 ** presentation.digits;
  const scaled = value * factor;
  if (presentation.rounding === "truncate") return Math.trunc(scaled) / factor;
  if (presentation.rounding === "half_away_from_zero") return Math.sign(scaled) * Math.round(Math.abs(scaled)) / factor;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  if (Math.abs(fraction - 0.5) <= Number.EPSILON * Math.max(1, Math.abs(scaled))) return (floor % 2 === 0 ? floor : floor + 1) / factor;
  return Math.round(scaled) / factor;
}

function verifyI1(run, report, assessable) {
  const file = "audit/i1.json";
  const record = readJson(path.join(run, "run.json"));
  const { policy, manifest } = verifyI1Contract(run, record);
  const policySha = hashArtifact(run, "contract/i1-verification-policy.json");
  const manifestSha = hashArtifact(run, "private/evaluator/i1-verifier/manifest.json");
  const plannedPdf = record.mode === "external_audit" || pdfRequired(run, record);
  const allowNotAssessed = record.mode === "external_audit" || !plannedPdf;
  if (!report || report.schema_version !== 1 || !I1_VERDICTS.includes(report.verdict) || report.policy?.path !== "contract/i1-verification-policy.json" || report.policy?.sha256 !== policySha || report.policy?.profile !== policy.profile || report.verifier?.manifest_path !== "private/evaluator/i1-verifier/manifest.json" || report.verifier?.manifest_sha256 !== manifestSha || report.verifier?.source_tree_sha256 !== manifest.source_tree_sha256 || !Array.isArray(report.evidence_paths) || !Array.isArray(report.unavailable_items) || !Array.isArray(report.limitations)) fail(`Malformed task-adaptive I1 aggregate at ${file}`);
  if (report.verdict === "NOT_ASSESSED" && (!allowNotAssessed || !report.unavailable_items.length)) fail(`Invalid NOT_ASSESSED I1 aggregate at ${file}`);
  if (!assessable && report.verdict !== "NOT_ASSESSED") fail(`I1 reports ${report.verdict} even though required source-bundle inputs are unavailable`);
  verifyEvidencePathList(run, report.evidence_paths, `${file}#/evidence_paths`);

  const tex = verifyI1Extraction(run, "audit/i1/tex-extraction.json", "tex", policy, allowNotAssessed);
  const pdf = verifyI1Extraction(run, "audit/i1/pdf-extraction.json", "pdf", policy, allowNotAssessed);
  const comparePdf = pdf.status === "ASSESSED";
  verifyI1Manifest(run, "audit/i1/input-manifest.json", ["contract/i1-verification-policy.json", "private/evaluator/i1-verifier/manifest.json"]);
  const evidence = verifyI1Manifest(run, "audit/i1/evidence-manifest.json", ["audit/i1/tex-extraction.json", "audit/i1/pdf-extraction.json"]);
  const evidenceSha = hashArtifact(run, "audit/i1/evidence-manifest.json");
  const executionPath = "audit/i1/execution-receipt.json";
  const execution = readJson(path.join(run, executionPath));
  if (execution.schema_version !== 1 || !validSha256(execution.execution_id) || !Number.isInteger(execution.attempt) || execution.attempt < 1 || typeof execution.executed !== "boolean" || JSON.stringify(execution.argv) !== JSON.stringify(manifest.argv) || execution.policy_sha256 !== policySha || execution.verifier_manifest_sha256 !== manifestSha || execution.source_tree_sha256 !== manifest.source_tree_sha256 || execution.input_manifest_sha256 !== hashArtifact(run, "audit/i1/input-manifest.json") || !validSha256(execution.environment_sha256) || (record.mode === "research" && execution.environment_sha256 !== hashArtifact(run, "environment/bootstrap.json")) || !Array.isArray(execution.raw_artifacts) || !Array.isArray(execution.undeclared_inputs_accessed) || execution.undeclared_inputs_accessed.length || !Array.isArray(execution.network_accesses) || execution.network_accesses.length || !Array.isArray(execution.environment_changes) || execution.environment_changes.length || !Array.isArray(execution.limitations) || !Number.isInteger(execution.retry_count) || execution.retry_count < 0) fail(`Malformed I1 execution receipt at ${executionPath}`);
  const retryLimit = Math.max(...policy.metrics.map((metric) => metric.failure_policy.operational_retry_limit));
  if (execution.retry_count > retryLimit) fail(`I1 execution retry count exceeds the frozen policy at ${executionPath}`);
  if (execution.executed) {
    if (!nonemptyString(execution.started_at) || !nonemptyString(execution.completed_at) || !Number.isFinite(Date.parse(execution.started_at)) || !Number.isFinite(Date.parse(execution.completed_at)) || Date.parse(execution.completed_at) < Date.parse(execution.started_at) || !Number.isInteger(execution.exit_status) || !nonemptyString(execution.private_execution_path) || !relativePath(execution.private_execution_path).startsWith(`private/evaluator/i1-runs/${execution.execution_id}`) || !execution.raw_artifacts.length) fail(`Executed I1 receipt lacks execution evidence at ${executionPath}`);
    for (const [index, item] of execution.raw_artifacts.entries()) {
      if (!item || !nonemptyString(item.path) || !validSha256(item.sha256) || !relativePath(item.path).startsWith(`${relativePath(execution.private_execution_path)}/`) || hashArtifact(run, item.path) !== item.sha256 || !evidence.paths.has(relativePath(item.path))) fail(`Invalid I1 raw artifact at ${executionPath}#/raw_artifacts/${index}`);
    }
  } else if (execution.private_execution_path !== null || execution.raw_artifacts.length || execution.exit_status !== null) {
    fail(`Non-executed I1 receipt contains raw execution evidence at ${executionPath}`);
  }
  if (!execution.safe_output || !nonemptyString(execution.safe_output.path) || !validSha256(execution.safe_output.sha256) || hashArtifact(run, execution.safe_output.path) !== execution.safe_output.sha256) fail(`I1 execution receipt lacks a hash-bound safe output at ${executionPath}`);

  const components = Object.fromEntries(I1_COMPONENTS.map((name) => [name, verifyI1Component(run, name, policySha, evidenceSha, allowNotAssessed)]));
  const policyMetricIds = policy.metrics.map((metric) => metric.id).sort();
  for (const [name, component] of Object.entries(components)) {
    const componentIds = component.metrics.map((metric) => metric?.metric_id).sort();
    if (component.verdict !== "NOT_ASSESSED" && JSON.stringify(componentIds) !== JSON.stringify(policyMetricIds)) fail(`I1 ${name} metric inventory differs from the frozen policy`);
  }
  for (const item of components.lineage.metrics) {
    const frozen = policy.metrics.find((metric) => metric.id === item.metric_id);
    const texMetric = tex.metrics.find((metric) => metric.metric_id === item.metric_id);
    const pdfMetric = pdf.metrics.find((metric) => metric.metric_id === item.metric_id);
    if (!frozen || !texMetric || (comparePdf && !pdfMetric) || !Number.isFinite(item.canonical_value) || item.tex_value !== texMetric.normalized_value || (comparePdf ? item.pdf_value !== pdfMetric.normalized_value : item.pdf_value !== null) || !I1_VERDICTS.includes(item.verdict)) fail(`Malformed I1 lineage metric: ${JSON.stringify(item?.metric_id)}`);
    const expectedDisplay = roundI1Value(item.canonical_value, frozen.presentation);
    const texMatches = Math.abs(item.tex_value - expectedDisplay) <= 1e-12;
    const pdfMatches = comparePdf ? Math.abs(item.pdf_value - expectedDisplay) <= 1e-12 : null;
    if (item.tex_matches !== texMatches || item.pdf_matches !== pdfMatches || item.verdict !== (texMatches && (pdfMatches ?? true) ? "PASS" : "FAIL")) fail(`I1 lineage decision contradicts the frozen presentation rule for ${item.metric_id}`);
  }
  const expectedLineage = components.lineage.mismatches.length ? "FAIL" : i1Verdict(components.lineage.metrics.map((item) => item.verdict));
  if (components.lineage.verdict !== expectedLineage) fail(`I1 lineage aggregate contradicts its metric decisions`);

  for (const item of components.reproducibility.metrics) {
    const frozen = policy.metrics.find((metric) => metric.id === item.metric_id);
    if (!frozen || !Array.isArray(item.canonical_values) || !Array.isArray(item.audit_values) || item.canonical_values.some((value) => !Number.isFinite(value)) || item.audit_values.some((value) => !Number.isFinite(value)) || !item.interval || !Number.isFinite(item.interval.lower) || !Number.isFinite(item.interval.upper) || !item.equivalence_margin || item.equivalence_margin.lower !== frozen.equivalence_margin.lower || item.equivalence_margin.upper !== frozen.equivalence_margin.upper || !item.noise || typeof item.noise.within_ceiling !== "boolean" || typeof item.environment_passed !== "boolean" || typeof item.comparison_passed !== "boolean" || !I1_VERDICTS.includes(item.verdict)) fail(`Malformed I1 reproducibility metric: ${JSON.stringify(item?.metric_id)}`);
    const withinBounds = item.interval.lower >= frozen.equivalence_margin.lower && item.interval.upper <= frozen.equivalence_margin.upper;
    if (item.comparison_passed !== (withinBounds && item.noise.within_ceiling && item.environment_passed)) fail(`I1 reproducibility boundary decision is inconsistent for ${item.metric_id}`);
    const outsideBounds = item.interval.upper < frozen.equivalence_margin.lower || item.interval.lower > frozen.equivalence_margin.upper;
    const expectedMetricVerdict = !item.noise.within_ceiling || !item.environment_passed ? "INCONCLUSIVE" : item.comparison_passed ? "PASS" : outsideBounds ? "FAIL" : "INCONCLUSIVE";
    if (item.verdict !== expectedMetricVerdict) fail(`I1 reproducibility verdict contradicts its frozen bounds for ${item.metric_id}`);
    if (frozen.determinism_class === "deterministic" && (item.canonical_values.length !== frozen.repetitions.canonical || item.audit_values.length !== frozen.repetitions.audit || item.audit_values.some((value) => !item.canonical_values.includes(value)))) fail(`Deterministic I1 values do not exactly reproduce for ${item.metric_id}`);
    if (policy.profile === "adrs_legacy_v1") {
      if (item.audit_values.length !== 5 || !Number.isFinite(item.reported_value) || !Number.isFinite(item.rerun_mean) || !Number.isFinite(item.sample_standard_deviation) || !Number.isFinite(item.adaptive_relative_tolerance) || !Number.isFinite(item.relative_deviation)) fail(`ADRS legacy I1 evidence is incomplete for ${item.metric_id}`);
      const mean = item.audit_values.reduce((sum, value) => sum + value, 0) / item.audit_values.length;
      const deviation = sampleStandardDeviation(item.audit_values);
      const tolerance = Math.max(0.01, (3 * deviation) / Math.abs(mean));
      const relative = Math.abs(item.reported_value - mean) / Math.abs(mean);
      if (Math.abs(mean) === 0 || item.rerun_mean !== mean || item.sample_standard_deviation !== deviation || item.adaptive_relative_tolerance !== tolerance || item.relative_deviation !== relative || item.comparison_passed !== (relative <= tolerance && item.noise.within_ceiling && item.environment_passed)) fail(`ADRS legacy I1 arithmetic is inconsistent for ${item.metric_id}`);
    }
  }
  const expectedRepro = i1Verdict(components.reproducibility.metrics.map((item) => item.verdict));
  if (components.reproducibility.verdict !== expectedRepro) fail(`I1 reproducibility aggregate contradicts its metric decisions`);

  for (const item of components["claim-semantics"].metrics) {
    const checks = ["metric_matches", "unit_matches", "direction_matches", "estimand_matches", "aggregation_matches", "uncertainty_matches", "scope_matches"];
    if (!policy.metrics.some((metric) => metric.id === item.metric_id) || checks.some((field) => typeof item[field] !== "boolean") || !Array.isArray(item.paper_locations) || !item.paper_locations.length || !I1_VERDICTS.includes(item.verdict)) fail(`Malformed I1 claim-semantics metric: ${JSON.stringify(item?.metric_id)}`);
    const matches = checks.every((field) => item[field]);
    if (item.verdict !== (matches ? "PASS" : "FAIL")) fail(`I1 claim-semantics decision contradicts its checks for ${item.metric_id}`);
  }
  const expectedSemantics = i1Verdict(components["claim-semantics"].metrics.map((item) => item.verdict));
  if (components["claim-semantics"].verdict !== expectedSemantics) fail(`I1 claim-semantics aggregate contradicts its metric decisions`);

  if (!report.components || I1_COMPONENTS.some((name) => report.components[name]?.path !== `audit/i1/${name}.json` || report.components[name]?.sha256 !== hashArtifact(run, `audit/i1/${name}.json`) || report.components[name]?.verdict !== components[name].verdict) || report.execution_receipt?.path !== executionPath || report.execution_receipt?.sha256 !== hashArtifact(run, executionPath)) fail(`I1 aggregate component or execution bindings are invalid at ${file}`);
  const expected = i1Verdict(I1_COMPONENTS.map((name) => components[name].verdict));
  if (report.verdict !== expected) fail(`I1 aggregate verdict at ${file}; expected ${expected}, received ${report.verdict}`);
  if (!execution.executed && report.verdict === "PASS") fail(`I1 verifier was not executed; the result remains unverified and cannot PASS`);
  if ((report.verdict === "FAIL" || report.verdict === "INCONCLUSIVE") ? !["contract", "investigation", "selection", "writing", "verification", "audit"].includes(report.rollback_phase) : report.rollback_phase !== null) fail(`I1 rollback_phase is inconsistent with verdict ${report.verdict}`);
  if (record.mode === "research") {
    const canonical = readJson(path.join(run, "selection", "canonical-evaluation.json"));
    if (report.selected_snapshot_sha256 !== canonical.snapshot_sha256 || report.verdict !== "PASS") fail(`Research I1 at ${file} must bind the selected canonical snapshot and PASS`);
  } else if (report.selected_snapshot_sha256 !== null && !validSha256(report.selected_snapshot_sha256)) {
    fail(`External I1 selected_snapshot_sha256 must be a SHA-256 or null at ${file}`);
  }
}

function verifyI3(run, report, assessable) {
  const file = "audit/i3.json";
  if (!assessable) {
    if (report.verdict !== "NOT_ASSESSED" || !nonemptyString(report.reason) || !Array.isArray(report.unavailable_items) || !report.unavailable_items.length) fail(`Invalid NOT_ASSESSED I3 report at ${file}`);
    return;
  }
  if (!Array.isArray(report.entries) || !report.entries.length) fail(`I3 at ${file} requires non-empty entries`);
  const seen = new Set();
  const counts = { verified: 0, unresolved: 0, mismatch: 0 };
  for (const [index, entryValue] of report.entries.entries()) {
    const location = `${file}#/entries/${index}`;
    if (!nonemptyString(entryValue.bibkey) || seen.has(entryValue.bibkey) || !entryValue.populated_fields || typeof entryValue.populated_fields !== "object" || !Object.keys(entryValue.populated_fields).length || !entryValue.resolved_primary_record || typeof entryValue.resolved_primary_record !== "object" || !nonemptyString(entryValue.retrieved_at) || !Number.isFinite(Date.parse(entryValue.retrieved_at)) || !Array.isArray(entryValue.field_comparisons) || !entryValue.field_comparisons.length || !["verified", "unresolved", "mismatch"].includes(entryValue.status) || !nonemptyString(entryValue.evidence_path)) fail(`Malformed substantive I3 entry at ${location}`);
    seen.add(entryValue.bibkey);
    hashArtifact(run, roleRelative(run, entryValue.evidence_path));
    const fields = Object.keys(entryValue.populated_fields).sort();
    const compared = entryValue.field_comparisons.map((item) => item.field).sort();
    if (JSON.stringify(fields) !== JSON.stringify(compared) || entryValue.field_comparisons.some((item) => typeof item.matches !== "boolean" || item.expected === undefined || item.actual === undefined)) fail(`I3 field comparisons at ${location} do not cover every populated bibliographic field`);
    if ((entryValue.status === "verified" && entryValue.field_comparisons.some((item) => !item.matches)) || (entryValue.status === "mismatch" && entryValue.field_comparisons.every((item) => item.matches))) fail(`I3 status at ${location} contradicts its field comparisons`);
    counts[entryValue.status]++;
  }
  if (!report.totals || report.totals.entries !== report.entries.length || report.totals.verified !== counts.verified || report.totals.unresolved !== counts.unresolved || report.totals.mismatch !== counts.mismatch) fail(`I3 totals at ${file} do not recompute from entries`);
  const expectedPass = counts.unresolved === 0 && counts.mismatch === 0;
  if (!["PASS", "FAIL"].includes(report.verdict) || (report.verdict === "PASS") !== expectedPass) fail(`I3 verdict at ${file} contradicts entry statuses`);
  if (readJson(path.join(run, "run.json")).mode === "research") {
    const keys = bibliographyKeys(path.join(run, "paper", "references.bib"));
    if (JSON.stringify([...keys].sort()) !== JSON.stringify([...seen].sort())) fail(`I3 entry inventory differs from paper/references.bib`);
  }
}

function verifyClaimProvenanceReport(run, report, assessable) {
  const file = "audit/claim-provenance.json";
  if (!assessable) {
    if (report.verdict !== "NOT_ASSESSED" || !nonemptyString(report.reason) || !Array.isArray(report.unavailable_items) || !report.unavailable_items.length) fail(`Invalid NOT_ASSESSED claim-provenance report at ${file}`);
    return;
  }
  for (const field of ["total_numerical_claims", "assessed_count", "supported_count"]) if (!Number.isInteger(report[field]) || report[field] < 0) fail(`Invalid ${field} at ${file}; expected a non-negative integer`);
  if (report.assessed_count > report.total_numerical_claims || report.supported_count > report.assessed_count || !Number.isFinite(report.coverage_ratio) || report.coverage_ratio !== (report.total_numerical_claims ? report.supported_count / report.total_numerical_claims : 1)) fail(`Claim-provenance counts at ${file} are inconsistent`);
  if (!Array.isArray(report.mismatches) || !Array.isArray(report.unavailable_items)) fail(`Claim-provenance report at ${file} lacks mismatch or unavailable-item detail`);
  verifyEvidencePathList(run, report.evidence_paths, `${file}#/evidence_paths`);
  const expectedPass = report.coverage_ratio === 1 && !report.mismatches.length && !report.unavailable_items.length;
  if (!["PASS", "FAIL"].includes(report.verdict) || (report.verdict === "PASS") !== expectedPass) fail(`Claim-provenance verdict at ${file} contradicts its coverage`);
  if (readJson(path.join(run, "run.json")).mode === "research") {
    const numerical = jsonLines(path.join(run, "paper", "claims.jsonl")).filter((claim) => claim.claim_type === "numerical").length;
    if (report.total_numerical_claims !== numerical) fail(`Claim-provenance total at ${file}; expected ${numerical}, received ${report.total_numerical_claims}`);
  }
}

function auditOverallVerdict(run) {
  const simple = ["i1.json", "i3.json", "claim-provenance.json"].map((name) => readJson(path.join(run, "audit", name)).verdict);
  const panels = ["i2", "i4"].map((name) => {
    const aggregate = readJson(path.join(run, "audit", name, "aggregate.json"));
    return aggregate.status === "NOT_ASSESSED" ? "NOT_ASSESSED" : aggregate.flagged ? "FAIL" : "PASS";
  });
  const verdicts = [...simple, ...panels];
  return i1Verdict(verdicts);
}

function verifyAuditReport(run) {
  const file = path.join(run, "audit", "report.md");
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) fail(`Audit report is empty: ${file}`);
  const expected = auditOverallVerdict(run);
  const verdicts = [...text.matchAll(/^Overall verdict:\s*(PASS|FAIL|INCONCLUSIVE|NOT_ASSESSED)\s*$/gmi)].map((match) => match[1].toUpperCase());
  if (verdicts.length !== 1 || verdicts[0] !== expected) fail(`Audit report overall verdict at ${file}; expected ${expected}, received ${verdicts.join(", ") || "none"}`);
  const expectedChecks = {
    I1: readJson(path.join(run, "audit", "i1.json")).verdict,
    I2: (() => { const value = readJson(path.join(run, "audit", "i2", "aggregate.json")); return value.status === "NOT_ASSESSED" ? "NOT_ASSESSED" : value.flagged ? "FAIL" : "PASS"; })(),
    I3: readJson(path.join(run, "audit", "i3.json")).verdict,
    I4: (() => { const value = readJson(path.join(run, "audit", "i4", "aggregate.json")); return value.status === "NOT_ASSESSED" ? "NOT_ASSESSED" : value.flagged ? "FAIL" : "PASS"; })(),
    claim_provenance: readJson(path.join(run, "audit", "claim-provenance.json")).verdict,
  };
  for (const check of AUDIT_CHECKS) {
    const matches = [...text.matchAll(new RegExp(`^${check.replace("_", "[-_ ]")} verdict:\\s*(PASS|FAIL|INCONCLUSIVE|NOT_ASSESSED)\\s*$`, "gmi"))];
    const received = matches.map((match) => match[1].toUpperCase());
    if (received.length !== 1 || received[0] !== expectedChecks[check]) fail(`Audit report verdict for ${check} at ${file}; expected ${expectedChecks[check]}, received ${received.join(", ") || "none"}`);
  }
  if (["FAIL", "INCONCLUSIVE"].includes(expected) && !/^Rollback phase:\s*(contract|investigation|discovery|selection|ablation|writing|verification|audit)\s*$/mi.test(text)) fail(`Blocking audit report at ${file} lacks an actionable Rollback phase`);
  return expected;
}

function verifyPhaseArtifacts(run, record, phase, live = false) {
  if (phase === "contract") {
    verifyBootstrap(run, record, live);
    if (record.mode === "external_audit") verifySourceBundleManifest(run);
    else verifyEvaluatorManifest(run);
    verifyI1Contract(run, record, live);
    requirePass(path.join(run, "contract", "audit.md"));
  } else if (phase === "investigation") {
    jsonLines(path.join(run, "evidence", "search-log.jsonl"));
    jsonLines(path.join(run, "evidence", "sources.jsonl"));
    nonemptyDirectory(path.join(run, "investigation", "notes"));
    nonemptyDirectory(path.join(run, "investigation", "directions"));
    requirePass(path.join(run, "investigation", "protocol-audit.md"));
    requirePass(path.join(run, "investigation", "critic.md"));
  } else if (phase === "discovery") {
    const ideas = jsonLines(path.join(run, "discovery", "ideas.jsonl"));
    const ideaIds = ideas.map((idea) => idea.id);
    if (ideas.length > record.budgets.idea_ceiling || ideas.some((idea) => !nonemptyString(idea.id) || !["conservative", "unconventional"].includes(idea.kind)) || new Set(ideaIds).size !== ideaIds.length) fail(`Discovery ideas violate contract/run-config.json; expected at most ${record.budgets.idea_ceiling} unique typed ideas, received ${ideas.length}`);
    const critiques = jsonLines(path.join(run, "discovery", "idea-critique.jsonl"));
    const critiqueIds = critiques.map((item) => item.idea_id).sort();
    if (new Set(critiqueIds).size !== critiqueIds.length || JSON.stringify(critiqueIds) !== JSON.stringify([...ideaIds].sort())) fail("Idea critique does not cover every frozen idea exactly once");
    const eligibleIdeas = critiques.filter((item) => item.status === "eligible").length;
    if (eligibleIdeas < record.budgets.minimum_eligible_ideas) fail(`Discovery has too few eligible ideas; expected at least ${record.budgets.minimum_eligible_ideas}, received ${eligibleIdeas}`);
    const index = readJson(path.join(run, "discovery", "index.json"));
    if (!Array.isArray(index.nodes) || !index.nodes.length || index.nodes.length > record.budgets.candidate_node_ceiling || !Array.isArray(index.retained) || !index.retained.length || new Set(index.retained).size !== index.retained.length) fail(`Discovery index violates candidate bounds; expected 1-${record.budgets.candidate_node_ceiling} nodes and unique retained candidates`);
    if (index.nodes.length < record.budgets.candidate_node_ceiling && !STOP_REASONS.has(index.stop_reason)) fail(`Discovery stopped below candidate_node_ceiling ${record.budgets.candidate_node_ceiling} without an approved stop_reason`);
    const nodePaths = new Set();
    const nodeIds = new Set();
    let evaluatedCandidates = 0;
    for (const node of index.nodes) {
      if (!node || !nonemptyString(node.id) || typeof node.path !== "string" || !node.path.startsWith("discovery/nodes/") || typeof node.status !== "string") fail("Malformed discovery node index entry; expected id, path, and status");
      if (nodePaths.has(node.path)) fail(`Duplicate discovery node: ${node.path}`);
      if (nodeIds.has(node.id)) fail(`Duplicate discovery node id: ${node.id}`);
      nodePaths.add(node.path);
      nodeIds.add(node.id);
      const base = artifactPath(run, node.path).target;
      for (const required of ["idea.md", "shared-input-manifest.json", "experimental-log.md", "method-report.md", "legitimacy-audit.md"]) {
        if (!fs.existsSync(path.join(base, required))) fail(`Discovery node lacks ${required}: ${node.path}`);
      }
      verifySharedInputManifest(run, path.join(base, "shared-input-manifest.json"));
      readOverallVerdict(path.join(base, "legitimacy-audit.md"));
      nonemptyDirectory(path.join(base, "snapshots"));
      nonemptyDirectory(path.join(base, "evaluations"));
      const evaluations = fs.readdirSync(path.join(base, "evaluations")).filter((name) => name.endsWith(".json"));
      if (!evaluations.length || evaluations.length > record.budgets.evaluation_ceiling_per_node) fail(`Discovery node evaluation count at ${node.path} must be 1-${record.budgets.evaluation_ceiling_per_node}, received ${evaluations.length}`);
      let hasValid = false;
      for (const evaluation of evaluations) {
        verifyEvaluation(run, path.join(base, "evaluations", evaluation), `${node.path}/snapshots`);
        if (readJson(path.join(base, "evaluations", evaluation)).status === "valid") hasValid = true;
      }
      if (hasValid) evaluatedCandidates++;
    }
    if (evaluatedCandidates < record.budgets.minimum_evaluated_candidates) fail(`Discovery has too few evaluated candidates; expected at least ${record.budgets.minimum_evaluated_candidates}, received ${evaluatedCandidates}`);
    for (const retainedId of index.retained) if (!nodeIds.has(retainedId)) fail(`Retained candidate does not resolve in discovery/index.json: ${retainedId}`);
  } else if (phase === "selection") {
    requirePass(path.join(run, "selection", "selection-audit.md"));
    verifySelectedManifest(run);
    verifySelectionLineage(run);
    verifyCanonicalEvaluation(run, path.join(run, "selection", "canonical-evaluation.json"), record);
  } else if (phase === "ablation") {
    nonemptyDirectory(path.join(run, "ablation", "variants"));
    nonemptyDirectory(path.join(run, "ablation", "evaluations"));
    const plan = readJson(path.join(run, "ablation", "plan.json"));
    const results = readJson(path.join(run, "ablation", "results.json"));
    if (!Array.isArray(plan.ablations) || !plan.ablations.length || plan.ablations.length > record.budgets.ablation_ceiling || !Array.isArray(results.ablations) || results.ablations.length !== plan.ablations.length) fail(`Ablation evidence violates bounds; expected 1-${record.budgets.ablation_ceiling} matching plan/result rows`);
    if (plan.ablations.length < record.budgets.ablation_ceiling && !STOP_REASONS.has(plan.stop_reason)) fail(`Ablation stopped below ablation_ceiling ${record.budgets.ablation_ceiling} without an approved stop_reason`);
    if (fs.readdirSync(path.join(run, "ablation", "variants")).length < plan.ablations.length || fs.readdirSync(path.join(run, "ablation", "evaluations")).filter((name) => name.endsWith(".json")).length < plan.ablations.length) fail("Ablation variants or evaluations are missing");
    let validAblations = 0;
    for (const evaluation of fs.readdirSync(path.join(run, "ablation", "evaluations")).filter((name) => name.endsWith(".json"))) {
      verifyEvaluation(run, path.join(run, "ablation", "evaluations", evaluation), "ablation/variants");
      if (readJson(path.join(run, "ablation", "evaluations", evaluation)).status === "valid") validAblations++;
    }
    if (validAblations < record.budgets.minimum_valid_ablations) fail(`Ablation has too few valid evaluations; expected at least ${record.budgets.minimum_valid_ablations}, received ${validAblations}`);
  } else if (phase === "writing") {
    const grounding = readJson(path.join(run, "paper", "grounding-report.json"));
    if (grounding.status !== "PASS" || !Number.isInteger(grounding.factual_sentence_count) || grounding.factual_sentence_count < 1 || !Number.isInteger(grounding.resolvable_tag_count) || grounding.resolvable_tag_count < 0 || grounding.resolvable_tag_count > grounding.factual_sentence_count || !Array.isArray(grounding.unresolved_claim_ids)) fail("Paper grounding report lacks substantive counts and unresolved_claim_ids");
    const expectedRatio = grounding.resolvable_tag_count / grounding.factual_sentence_count;
    if (!Number.isFinite(grounding.grounding_ratio) || grounding.grounding_ratio !== expectedRatio || grounding.grounding_ratio < 0.8 || grounding.unresolved_claim_ids.length !== grounding.factual_sentence_count - grounding.resolvable_tag_count) fail(`Paper grounding ratio is inconsistent; expected ${expectedRatio}, received ${grounding.grounding_ratio}`);
    requirePass(path.join(run, "paper", "critic.md"));
  } else if (phase === "verification") {
    verifyClaims(run);
    requirePass(path.join(run, "paper", "verification.md"));
    if (pdfRequired(run, record)) {
      verifyPdf(path.join(run, "paper", "paper.pdf"));
      verifyVisualInspection(run);
    }
  } else if (phase === "audit") {
    const bundle = record.mode === "external_audit" ? verifySourceBundleManifest(run) : null;
    verifyI1(run, readJson(path.join(run, "audit", "i1.json")), record.mode === "research" || bundle.assessable.has("I1"));
    verifyI3(run, readJson(path.join(run, "audit", "i3.json")), record.mode === "research" || bundle.assessable.has("I3"));
    verifyClaimProvenanceReport(run, readJson(path.join(run, "audit", "claim-provenance.json")), record.mode === "research" || bundle.assessable.has("claim_provenance"));
    verifyAuditPanels(run, record);
    const overall = verifyAuditReport(run);
    if (record.mode === "research" && overall !== "PASS") fail(`Research audit did not pass; expected PASS, received ${overall}`);
    verifyReproduction(run, record.mode);
  }
}

function verifyPanelVote(run, record, panel, vote, judge) {
  const categories = panel === "i2"
    ? ["evaluator_import", "evaluator_exploitation", "specification_exploit", "data_leakage"]
    : ["incomplete_broken", "method_class_mismatch", "deceptive_dummy_artifact"];
  if (!nonemptyString(vote.judge_id) || !Array.isArray(vote.checked_categories) || !vote.checked_categories.length || vote.checked_categories.some((category) => !categories.includes(category)) || typeof vote.flagged !== "boolean" || !Array.isArray(vote.evidence_paths) || !vote.evidence_paths.length || !nonemptyString(vote.rationale) || !["PASS", "FAIL"].includes(vote.verdict) || (vote.verdict === "FAIL") !== vote.flagged) fail(`Malformed substantive ${panel.toUpperCase()} vote: ${judge}`);
  if ((vote.flagged && !categories.includes(vote.category)) || (!vote.flagged && vote.category !== null)) fail(`${panel.toUpperCase()} vote ${judge} has an inconsistent flag category`);
  for (const evidencePath of vote.evidence_paths) hashArtifact(run, roleRelative(run, evidencePath));
  if (panel === "i2") {
    if (!nonemptyString(vote.selected_snapshot_sha256) || !nonemptyString(vote.evaluator_contract_sha256)) fail(`I2 vote ${judge} lacks selected snapshot or evaluator contract hash`);
    if (record.mode === "research" && (vote.selected_snapshot_sha256 !== hashArtifact(run, "selection/selected") || vote.evaluator_contract_sha256 !== hashArtifact(run, "contract/evaluator-contract.md"))) fail(`I2 vote ${judge} is not bound to the selected snapshot and evaluator contract`);
  } else {
    if (!Array.isArray(vote.paper_method_locations) || !vote.paper_method_locations.length || !Array.isArray(vote.selected_artifacts) || !vote.selected_artifacts.length || !Array.isArray(vote.checked_core_mechanisms) || !vote.checked_core_mechanisms.length) fail(`I4 vote ${judge} lacks paper locations, selected artifacts, or checked core mechanisms`);
    if (record.mode === "research") {
      const selected = verifySelectedManifest(run).map((relative) => ({ path: `selection/selected/${relative}`, sha256: hashArtifact(run, `selection/selected/${relative}`) }));
      if (JSON.stringify([...vote.selected_artifacts].sort((a, b) => a.path.localeCompare(b.path))) !== JSON.stringify(selected)) fail(`I4 vote ${judge} selected_artifact hashes do not match selection/selected`);
    }
  }
}

function verifyAuditPanels(run, record) {
  const results = {};
  const bundle = record.mode === "external_audit" ? verifySourceBundleManifest(run) : null;
  for (const panel of ["i2", "i4"]) {
    const directory = path.join(run, "audit", panel);
    const judges = fs.readdirSync(directory).filter((name) => /^judge-\d+\.json$/.test(name)).sort();
    const aggregate = readJson(path.join(directory, "aggregate.json"));
    const assessable = record.mode === "research" || bundle.assessable.has(panel.toUpperCase());
    if (aggregate.status === "NOT_ASSESSED") {
      if (assessable || record.mode !== "external_audit" || judges.length || aggregate.judge_count !== 0 || aggregate.threshold !== null || aggregate.flag_votes !== 0 || aggregate.flagged !== null || !nonemptyString(aggregate.reason) || !Array.isArray(aggregate.unavailable_items) || !aggregate.unavailable_items.length) fail(`${panel.toUpperCase()} NOT_ASSESSED aggregate is invalid`);
      results[panel] = "NOT_ASSESSED";
      continue;
    }
    if (!assessable) fail(`${panel.toUpperCase()} reports ASSESSED even though its source-bundle contract has unavailable required items`);
    if (aggregate.status !== "ASSESSED") fail(`${panel.toUpperCase()} aggregate lacks assessability status`);
    const expected = record.audit_panel_size;
    if (!Number.isInteger(expected) || expected < 3 || expected % 2 === 0 || judges.length !== expected || aggregate.judge_count !== expected) fail(`${panel.toUpperCase()} panel has the wrong judge count`);
    const threshold = Math.floor(expected / 2) + 1;
    let actualFlagVotes = 0;
    for (const judge of judges) {
      const vote = readJson(path.join(directory, judge));
      verifyPanelVote(run, record, panel, vote, judge);
      if (vote.flagged) actualFlagVotes++;
    }
    if (aggregate.threshold !== threshold || aggregate.flag_votes !== actualFlagVotes || typeof aggregate.flagged !== "boolean" || aggregate.flagged !== (actualFlagVotes >= threshold)) fail(`${panel.toUpperCase()} aggregate is inconsistent with majority voting`);
    if (record.mode === "research" && aggregate.flagged) fail(`${panel.toUpperCase()} majority flagged the selected research method`);
    results[panel] = aggregate.flagged ? "FLAGGED" : "PASS";
  }
  return results;
}

function verifyReceipt(run, record, phase, previousPhase, sequence) {
  const file = receiptFile(run, phase);
  const receipt = readJson(file);
  if (receipt.schema_version !== 1 || receipt.phase !== phase || receipt.sequence !== sequence || (receipt.contract_revision ?? 1) !== record.contract_revision || (receipt.charter_revision ?? 1) !== record.charter_revision) fail(`Invalid ${phase} receipt metadata, contract revision, or charter revision`);
  if (phase === "complete" && receipt.outcome !== record.outcome) fail("Complete receipt does not bind the run outcome");
  if (!Array.isArray(receipt.inputs) || !Array.isArray(receipt.outputs)) fail(`Invalid ${phase} receipt entries`);
  if (phase === "contract") verifyInputManifest(run);

  if (previousPhase) {
    const expectedPath = `receipts/${previousPhase}.json`;
    const expectedHash = hashArtifact(run, expectedPath);
    if (receipt.predecessor?.path !== expectedPath || receipt.predecessor?.sha256 !== expectedHash) fail(`${phase} receipt is not bound to the current ${previousPhase} receipt`);
    if (!receipt.inputs.some((item) => item.path === expectedPath && item.sha256 === expectedHash)) fail(`${phase} inputs omit the predecessor receipt`);
  } else if (receipt.predecessor !== null) {
    fail("contract receipt must not have a predecessor");
  }

  for (const group of [receipt.inputs, receipt.outputs]) {
    for (const item of group) {
      if (!item || typeof item.path !== "string" || typeof item.sha256 !== "string") fail(`Malformed artifact entry in ${phase} receipt`);
      if (hashArtifact(run, item.path) !== item.sha256) fail(`Evidence changed after ${phase} checkpoint: ${item.path}`);
    }
  }
  for (const required of requiredOutputs(run, record, phase)) {
    hashArtifact(run, required);
    if (!pathCovered(required, receipt.outputs.map((item) => item.path))) fail(`${phase} receipt does not promote required output: ${required}`);
  }
  if (phase === "selection") {
    for (const selectedFile of verifySelectedManifest(run)) {
      const selectedPath = `selection/selected/${selectedFile}`;
      if (!pathCovered(selectedPath, receipt.outputs.map((item) => item.path))) fail(`Selection receipt omits selected artifact: ${selectedPath}`);
    }
  }
  verifyPhaseArtifacts(run, record, phase);
  if (phase === "contract") {
    for (const required of requiredContractInputs(run, record)) {
      if (!receipt.inputs.some((item) => item.path === required)) fail(`Contract receipt must bind exact input: ${required}`);
    }
  }
  if (phase !== "complete") {
    const roles = receipt.outputs.map((item) => item.path).filter((item) => /^role-receipts\/[^/]+\.json$/.test(item));
    verifyRoleCoverage(run, phase, roles);
  }
  if (phase === "audit") verifyAuditPanels(run, record);
  return receipt;
}

function verifyReceipts(run, record) {
  const phases = phasesFor(record);
  let last = null;
  let gap = false;
  for (let index = 0; index < phases.length; index++) {
    const phase = phases[index];
    const exists = fs.existsSync(receiptFile(run, phase));
    if (!exists) {
      gap = true;
      continue;
    }
    if (gap) fail(`Receipt chain is noncontiguous at ${phase}`);
    verifyReceipt(run, record, phase, index ? phases[index - 1] : null, index);
    last = phase;
  }
  return last;
}

function listFiles(root, current = root) {
  const files = [];
  for (const name of fs.readdirSync(current).sort()) {
    if (current === root && name === "manifest.json") continue;
    const file = path.join(current, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) fail(`Symlinks cannot appear in deliverables: ${file}`);
    if (stat.isDirectory()) files.push(...listFiles(root, file));
    else if (stat.isFile()) files.push(path.relative(path.dirname(root), file).replaceAll(path.sep, "/"));
    else fail(`Unsupported deliverable: ${file}`);
  }
  return files;
}

function canonicalSource(record, deliverablePath) {
  const relative = deliverablePath.replace(/^deliverables\//, "");
  if (record.mode === "research" && relative.startsWith("selected-method/")) return `selection/selected/${relative.slice("selected-method/".length)}`;
  return CORE_DELIVERABLE_SOURCES[record.mode][relative] ?? null;
}

function verifyManifest(run, record) {
  const deliverables = path.join(run, "deliverables");
  if (!fs.existsSync(deliverables)) fail("Missing deliverables directory");
  const manifest = readJson(path.join(deliverables, "manifest.json"));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files)) fail("Invalid deliverables manifest");
  const actual = listFiles(deliverables);
  const declared = manifest.files.map((item) => item.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) fail("Deliverables manifest file list does not match the directory");
  for (const item of manifest.files) {
    if (hashArtifact(run, item.path) !== item.sha256) fail(`Deliverable hash mismatch: ${item.path}`);
    const target = artifactPath(run, item.path).target;
    if (item.content_sha256 !== contentHash(target)) fail(`Deliverable content hash mismatch: ${item.path}`);
    const expectedSource = canonicalSource(record, item.path);
    if (expectedSource) {
      if (item.source !== expectedSource || typeof item.source_content_sha256 !== "string") fail(`Deliverable lacks canonical source binding: ${item.path}`);
      const source = artifactPath(run, expectedSource).target;
      const sourceHash = contentHash(source);
      if (item.source_content_sha256 !== sourceHash || item.content_sha256 !== sourceHash) fail(`Deliverable differs from canonical source: ${item.path}`);
    }
  }
  const requiredDeliverables = [...REQUIRED_DELIVERABLES[record.mode]];
  if (record.mode === "research" && !pdfRequired(run, record)) for (const optional of ["paper.pdf", "visual-inspection.json"]) requiredDeliverables.splice(requiredDeliverables.indexOf(optional), 1);
  for (const required of requiredDeliverables) {
    if (!declared.includes(`deliverables/${required}`)) fail(`Missing required deliverable: ${required}`);
  }
  if (record.mode === "research") {
    const selected = readJson(path.join(run, "selection", "selected", "manifest.json"));
    for (const selectedFile of selected.files) {
      if (typeof selectedFile !== "string" || !declared.includes(`deliverables/selected-method/${relativePath(selectedFile)}`)) fail(`Selected method file is missing from deliverables: ${selectedFile}`);
    }
  }
}

function configure(runArg, profile = "pilot", mode = "research", customProfilePath) {
  const run = path.resolve(runArg || "");
  if (!runArg || !fs.existsSync(run) || !fs.statSync(run).isDirectory()) fail("configure requires an existing run directory");
  if (fs.existsSync(path.join(run, "run.json")) || fs.existsSync(path.join(run, "contract", "run-config.json"))) fail("Run configuration already exists");
  if (!PROFILES.has(profile) || !MODES.has(mode)) fail("profile must be standard|pilot|custom and mode must be research|external_audit");
  const budgets = profile === "custom"
    ? validateBudgets(readJson(artifactPath(run, customProfilePath || "contract/custom-profile.json").target))
    : PROFILE_BUDGETS[profile];
  writeJson(path.join(run, "contract", "run-config.json"), { schema_version: 1, mode, search_profile: profile, budgets });
  process.stdout.write(`${path.join(run, "contract", "run-config.json")}\n`);
}

function init(runArg) {
  const run = path.resolve(runArg || "");
  if (!runArg || !fs.existsSync(run) || !fs.statSync(run).isDirectory()) fail("init requires an existing run directory");
  if (fs.existsSync(path.join(run, "run.json"))) fail("run.json already exists; refusing to reinitialize evidence");
  const config = readJson(path.join(run, "contract", "run-config.json"));
  if (config.schema_version !== 1 || !PROFILES.has(config.search_profile) || !MODES.has(config.mode)) fail("Invalid frozen run configuration");
  validateBudgets(config.budgets);
  if (config.search_profile !== "custom" && JSON.stringify(config.budgets) !== JSON.stringify(PROFILE_BUDGETS[config.search_profile])) fail(`${config.search_profile} budgets do not match the built-in profile`);
  for (const required of ["request.md", "study-plan.md"]) hashArtifact(run, required);
  fs.mkdirSync(path.join(run, "receipts", "superseded"), { recursive: true });
  fs.writeFileSync(path.join(run, "events.jsonl"), "", { flag: "wx" });
  const now = new Date().toISOString();
  writeJson(path.join(run, "run.json"), {
    schema_version: 1,
    id: path.basename(run),
    mode: config.mode,
    search_profile: config.search_profile,
    audit_panel_size: config.budgets.audit_panel_size,
    budgets: config.budgets,
    created_at: now,
    updated_at: now,
    state: "running",
    phase: "contract",
    outcome: null,
    request_sha256: hashArtifact(run, "request.md"),
    study_plan_sha256: hashArtifact(run, "study-plan.md"),
    contract_parameters_sha256: hashArtifact(run, "contract/run-config.json"),
    contract_revision: 1,
    charter_revision: 1,
    last_checkpoint: null,
    invalidation_roots: [],
    checkpoints: {},
    attention: null,
  });
  appendEvent(run, { event: "run_initialized", phase: "contract" });
  process.stdout.write(`${run}\n`);
}

function validatePhasePromotion(runArg, phase, args) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  const phases = phasesFor(record);
  const index = phases.indexOf(phase);
  if (index < 0) fail(`Phase ${phase} is not valid for ${record.mode} mode`);
  if (!["running", "repairing"].includes(record.state)) fail(`Cannot checkpoint while run state is ${record.state}; expected running|repairing`);
  if (record.phase !== phase) fail(`Cannot checkpoint ${phase}; run.json#/phase is ${record.phase}`);
  const allowedOutcomes = record.mode === "external_audit" ? AUDIT_OUTCOMES : RESEARCH_OUTCOMES;
  if (phase === "complete" && !allowedOutcomes.has(record.outcome)) fail(`Set a valid ${record.mode} outcome before checkpointing complete; expected ${[...allowedOutcomes].join("|")}, received ${JSON.stringify(record.outcome)}`);
  if (phase === "complete" && record.mode === "external_audit") {
    const expectedOutcome = { PASS: "audit_passed", FAIL: "audit_failed", INCONCLUSIVE: "audit_incomplete", NOT_ASSESSED: "audit_incomplete" }[auditOverallVerdict(run)];
    if (record.outcome !== expectedOutcome) fail(`External audit outcome contradicts audit/report.md; expected ${expectedOutcome}, received ${record.outcome}`);
  }
  const last = verifyReceipts(run, record);
  const expectedLast = index ? phases[index - 1] : null;
  if (last !== expectedLast) fail(`Cannot checkpoint ${phase}; expected last checkpoint ${expectedLast ?? "none"}, found ${last ?? "none"}`);
  if (fs.existsSync(receiptFile(run, phase))) fail(`${phase} already has a receipt; invalidate it before rebuilding`);
  const { inputs, outputs } = parsePathFlags(args);
  for (const required of requiredOutputs(run, record, phase)) {
    hashArtifact(run, required);
    if (!pathCovered(required, outputs)) fail(`${phase} checkpoint must include required output: ${required}`);
  }
  if (phase === "selection") {
    for (const selectedFile of verifySelectedManifest(run)) {
      const selectedPath = `selection/selected/${selectedFile}`;
      if (!pathCovered(selectedPath, outputs)) fail(`Selection checkpoint must include selected artifact: ${selectedPath}`);
    }
  }
  if (phase === "writing" && outputs.includes("paper")) fail("writing must promote its individual files, not the paper directory that verification will extend");
  verifyPhaseArtifacts(run, record, phase, phase === "contract");
  const roleOutputs = outputs.filter((item) => /^role-receipts\/[^/]+\.json$/.test(item));
  if (phase !== "complete" && !roleOutputs.length) fail(`${phase} checkpoint requires an individual role receipt output`);
  if (phase !== "complete") verifyRoleCoverage(run, phase, roleOutputs);
  if (phase === "contract") {
    verifyInputManifest(run);
    for (const required of requiredContractInputs(run, record)) {
      if (!inputs.includes(required)) fail(`Contract checkpoint must bind exact input: ${required}`);
    }
  }
  if (phase === "audit") verifyAuditPanels(run, record);
  if (phase === "complete") verifyManifest(run, record);
  return { run, record, phases, index, expectedLast, inputs, outputs };
}

function preflight(runArg, phase, args) {
  const { run, record, expectedLast, inputs, outputs } = validatePhasePromotion(runArg, phase, args);
  process.stdout.write(`${JSON.stringify({ ok: true, run, phase, state: record.state, predecessor: expectedLast, input_count: inputs.length, output_count: outputs.length })}\n`);
}

function checkpoint(runArg, phase, args) {
  const { run, record, phases, index, expectedLast, inputs, outputs } = validatePhasePromotion(runArg, phase, args);
  const previousPath = expectedLast ? `receipts/${expectedLast}.json` : null;
  if (previousPath && !inputs.includes(previousPath)) inputs.push(previousPath);
  for (const invalidation of record.invalidation_roots) {
    if (!inputs.includes(invalidation.path)) inputs.push(invalidation.path);
  }
  const predecessor = previousPath ? entry(run, previousPath) : null;
  const receipt = {
    schema_version: 1,
    phase,
    sequence: index,
    contract_revision: record.contract_revision,
    charter_revision: record.charter_revision,
    created_at: new Date().toISOString(),
    predecessor,
    inputs: inputs.sort().map((item) => entry(run, item)),
    outputs: outputs.sort().map((item) => entry(run, item)),
  };
  if (phase === "complete") receipt.outcome = record.outcome;
  writeJson(receiptFile(run, phase), receipt);
  verifyReceipt(run, record, phase, expectedLast, index);
  record.checkpoints[phase] = { receipt_sha256: hashArtifact(run, `receipts/${phase}.json`), outputs: receipt.outputs };
  record.last_checkpoint = phase;
  record.updated_at = new Date().toISOString();
  if (phase === "complete") {
    record.state = "complete";
    record.phase = "complete";
  } else {
    record.state = "running";
    record.phase = phases[index + 1];
  }
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "phase_checkpointed", phase });
  process.stdout.write(`${receiptFile(run, phase)}\n`);
}

function contractRepairReason(run, reasonArg) {
  const reason = entry(run, reasonArg);
  const source = artifactPath(run, reason.path).target;
  if (!fs.lstatSync(source).isFile() || path.extname(source) !== ".json") fail("Contract revision reason must be a regular JSON file");
  const value = readJson(source);
  exactKeys(value, ["schema_version", "classification", "charter_changed", "result_aware", "post_result_guard", "finding", "repair", "researcher_approval"], reason.path);
  if (value.schema_version !== 1 || !CONTRACT_REPAIR_CLASSES.has(value.classification) || typeof value.charter_changed !== "boolean" || typeof value.result_aware !== "boolean" || !nonemptyString(value.finding) || !nonemptyString(value.repair)) fail(`Invalid contract revision reason at ${reason.path}`);
  if (value.result_aware && value.post_result_guard !== "invalidate_and_rerun") fail(`Result-aware contract repair must invalidate and rerun every successor at ${reason.path}`);
  if (!value.result_aware && value.post_result_guard !== null) fail(`Result-blind contract repair must use a null post_result_guard at ${reason.path}`);
  if (value.classification === "AUTOMATIC_REPAIR") {
    if (value.charter_changed || value.researcher_approval !== null) fail(`Automatic contract repair cannot change the researcher charter at ${reason.path}`);
  } else {
    if (!value.charter_changed || !value.researcher_approval) fail(`A researcher-approved amendment must identify its approval evidence at ${reason.path}`);
    exactKeys(value.researcher_approval, ["path", "sha256"], `${reason.path}#/researcher_approval`);
    const approvalPath = relativePath(value.researcher_approval.path);
    if (value.researcher_approval.sha256 !== hashArtifact(run, approvalPath)) fail(`Researcher approval hash mismatch at ${reason.path}`);
  }
  return { reason, value };
}

function contractGeneratedPaths(run) {
  const paths = new Set(CONTRACT_GENERATED_PATHS.filter((relative) => fs.existsSync(path.join(run, relative))));
  const evaluatorManifest = path.join(run, "contract", "evaluator-manifest.json");
  if (fs.existsSync(evaluatorManifest)) {
    const manifest = readJson(evaluatorManifest);
    if (!Array.isArray(manifest.files)) fail("Cannot revise a malformed evaluator manifest");
    const frozenInputs = new Set(verifyInputManifest(run).files.map((item) => relativePath(item.frozen_path)));
    for (const item of manifest.files) {
      if (!item || !nonemptyString(item.path)) fail("Cannot revise a malformed evaluator manifest entry");
      const relative = relativePath(item.path);
      if (![...frozenInputs].some((input) => relative === input || relative.startsWith(`${input}/`)) && fs.existsSync(path.join(run, relative))) paths.add(relative);
    }
  }
  const receiptRoot = path.join(run, "role-receipts");
  if (fs.existsSync(receiptRoot)) {
    for (const name of fs.readdirSync(receiptRoot).filter((item) => item.endsWith(".json"))) {
      const relative = `role-receipts/${name}`;
      const receipt = readJson(path.join(receiptRoot, name));
      if (!CONTRACT_ROLE_NAMES.has(receipt.role)) continue;
      paths.add(relative);
      const launch = `role-launches/${path.basename(name, ".json")}.json`;
      if (fs.existsSync(path.join(run, launch))) paths.add(launch);
    }
  }
  return [...paths];
}

function contractSuccessorPaths(run) {
  const paths = new Set(CONTRACT_SUCCESSOR_ROOTS.filter((relative) => fs.existsSync(path.join(run, relative))));
  const protectedInputs = new Set(verifyInputManifest(run).files.map((item) => relativePath(item.frozen_path)));
  const privateRoot = path.join(run, "private", "evaluator");
  if (fs.existsSync(privateRoot)) {
    const pending = [privateRoot];
    while (pending.length) {
      const directory = pending.pop();
      for (const name of fs.readdirSync(directory)) {
        const absolute = path.join(directory, name);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) fail(`Symlinks cannot appear in contract successor evidence: ${absolute}`);
        if (stat.isDirectory()) pending.push(absolute);
        else if (stat.isFile()) {
          const relative = path.relative(run, absolute).replaceAll(path.sep, "/");
          if (relative.startsWith("private/evaluator/i1-verifier/") || [...protectedInputs].some((input) => relative === input || relative.startsWith(`${input}/`))) continue;
          paths.add(relative);
        } else fail(`Unsupported contract successor evidence: ${absolute}`);
      }
    }
  }
  const receiptRoot = path.join(run, "role-receipts");
  if (fs.existsSync(receiptRoot)) {
    for (const name of fs.readdirSync(receiptRoot).filter((item) => item.endsWith(".json"))) {
      const receipt = readJson(path.join(receiptRoot, name));
      if (CONTRACT_ROLE_NAMES.has(receipt.role)) continue;
      paths.add(`role-receipts/${name}`);
      const launch = `role-launches/${path.basename(name, ".json")}.json`;
      if (fs.existsSync(path.join(run, launch))) paths.add(launch);
    }
  }
  return [...paths];
}

function resultAwareEvidenceExists(run, record, successorPaths) {
  if (RESULT_AWARE_ROOTS.some((relative) => fs.existsSync(path.join(run, relative)))) return true;
  if (successorPaths.some((relative) => relative.startsWith("private/evaluator/"))) return true;
  const discoveryIndex = phasesFor(record).indexOf("discovery");
  return discoveryIndex >= 0 && Object.keys(record.checkpoints).some((phase) => phasesFor(record).indexOf(phase) >= discoveryIndex);
}

function removeContractGeneratedPaths(run, paths) {
  const protectedInputs = new Set(verifyInputManifest(run).files.map((item) => relativePath(item.frozen_path)));
  for (const relative of [...new Set(paths)].sort((left, right) => right.split("/").length - left.split("/").length)) {
    if ([...protectedInputs].some((input) => relative === input || relative.startsWith(`${input}/`)) || !fs.existsSync(path.join(run, relative))) continue;
    const target = artifactPath(run, relative).target;
    fs.rmSync(target, { recursive: true, force: false });
  }
}

function archiveInvalidation(run, record, phase, reason, options = {}) {
  const phases = phasesFor(record);
  const index = phases.indexOf(phase);
  const invalidatedPhases = phases.slice(index).filter((current) => record.checkpoints[current]);
  const receiptHashes = invalidatedPhases.map((current) => {
    const expectedSha256 = record.checkpoints[current].receipt_sha256;
    const observedSha256 = fs.existsSync(receiptFile(run, current)) ? hashArtifact(run, `receipts/${current}.json`) : null;
    return { phase: current, expected_sha256: expectedSha256, observed_sha256: observedSha256, status: observedSha256 === null ? "missing" : observedSha256 === expectedSha256 ? "moved" : "changed" };
  });
  const expectedOutputs = new Map();
  for (const current of invalidatedPhases) for (const item of record.checkpoints[current].outputs) expectedOutputs.set(item.path, item.sha256);
  for (const relative of options.additionalPaths ?? []) if (fs.existsSync(path.join(run, relative)) && !expectedOutputs.has(relative)) expectedOutputs.set(relative, hashArtifact(run, relative));
  for (const relative of [...expectedOutputs.keys()]) {
    const match = /^role-receipts\/([^/]+)\.json$/.exec(relative);
    if (!match) continue;
    const launch = `role-launches/${match[1]}.json`;
    if (fs.existsSync(path.join(run, launch)) && !expectedOutputs.has(launch)) expectedOutputs.set(launch, hashArtifact(run, launch));
  }
  if (!expectedOutputs.size) fail(`No ${phase} implementation evidence exists to revise`);

  const stamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
  const suffix = options.contractRevision ? `-r${record.contract_revision}` : "";
  let archive = path.join(run, "receipts", "superseded", `${stamp}-${phase}${suffix}`);
  for (let collision = 2; fs.existsSync(archive); collision += 1) archive = path.join(run, "receipts", "superseded", `${stamp}-${phase}${suffix}-${collision}`);
  fs.mkdirSync(archive, { recursive: true });
  const archivedReason = path.join(archive, "reason", path.basename(reason.path));
  fs.mkdirSync(path.dirname(archivedReason), { recursive: true });
  fs.copyFileSync(artifactPath(run, reason.path).target, archivedReason);

  const archivedArtifacts = [];
  for (const relative of minimalPaths([...expectedOutputs.keys()])) {
    const source = artifactPath(run, relative).target;
    const expectedSha256 = expectedOutputs.get(relative);
    if (!fs.existsSync(source)) {
      archivedArtifacts.push({ path: relative, archived_path: null, status: "missing", expected_sha256: expectedSha256, observed_sha256: null });
      continue;
    }
    const observedSha256 = hashArtifact(run, relative);
    const destination = path.join(archive, "artifacts", relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const preserveWorkingCopy = options.contractRevision && relative === "contract";
    if (preserveWorkingCopy) fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
    else fs.renameSync(source, destination);
    const unchanged = observedSha256 === expectedSha256;
    archivedArtifacts.push({ path: relative, archived_path: path.relative(run, destination).replaceAll(path.sep, "/"), status: preserveWorkingCopy ? unchanged ? "copied" : "copied_changed" : unchanged ? "moved" : "changed", expected_sha256: expectedSha256, observed_sha256: observedSha256 });
  }
  if (options.contractRevision) removeContractGeneratedPaths(run, options.additionalPaths ?? []);

  const moved = [];
  for (const current of invalidatedPhases) {
    const file = receiptFile(run, current);
    if (!fs.existsSync(file)) continue;
    fs.renameSync(file, path.join(archive, `${current}.json`));
    moved.push(current);
  }
  const revisionBefore = record.contract_revision;
  const revisionAfter = options.contractRevision ? revisionBefore + 1 : revisionBefore;
  writeJson(path.join(archive, "invalidation.json"), { schema_version: 1, at: new Date().toISOString(), from_phase: phase, contract_revision_before: revisionBefore, contract_revision_after: revisionAfter, reason, archived_reason: path.relative(run, archivedReason).replaceAll(path.sep, "/"), moved_receipts: moved, receipt_hashes: receiptHashes, expected_outputs: [...expectedOutputs].map(([outputPath, sha256]) => ({ path: outputPath, sha256 })), archived_artifacts: archivedArtifacts });
  return { archive, invalidatedPhases, index, revisionAfter };
}

function invalidate(runArg, phase, reasonArg) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run, { allowReceiptDrift: true });
  const phases = phasesFor(record);
  const index = phases.indexOf(phase);
  if (index < 0) fail(`Phase ${phase} is not valid for ${record.mode} mode`);
  if (phase === "contract") fail("Use revise-contract for a versioned same-run contract repair");
  const reason = entry(run, reasonArg);
  const reasonSource = artifactPath(run, reason.path).target;
  if (!fs.lstatSync(reasonSource).isFile()) fail("Invalidation reason must be a regular file");
  if (!record.checkpoints[phase]) fail(`No ${phase} checkpoint exists to invalidate`);
  const { archive, invalidatedPhases } = archiveInvalidation(run, record, phase, reason);
  const archivePath = path.relative(run, archive).replaceAll(path.sep, "/");
  record.invalidation_roots.push({ path: archivePath, sha256: hashArtifact(run, archivePath) });
  for (const current of invalidatedPhases) delete record.checkpoints[current];
  record.state = "repairing";
  record.phase = phase;
  record.last_checkpoint = index ? phases[index - 1] : null;
  record.outcome = null;
  record.updated_at = new Date().toISOString();
  record.attention = null;
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "receipt_chain_invalidated", phase, reason: reason.path, archive: archivePath });
  process.stdout.write(`${archive}\n`);
}

function reviseContract(runArg, reasonArg, amendedPlanArg) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run, { allowReceiptDrift: true });
  if (!["running", "repairing", "paused", "failed"].includes(record.state)) fail(`Cannot revise a contract while run state is ${record.state}`);
  const { reason, value } = contractRepairReason(run, reasonArg);
  const additionalPaths = contractGeneratedPaths(run);
  const successorPaths = contractSuccessorPaths(run);
  const detectedResultAwareness = resultAwareEvidenceExists(run, record, successorPaths);
  if (detectedResultAwareness && !value.result_aware) fail(`Contract repair reason must declare result_aware true because candidate or downstream evidence exists at ${reason.path}`);
  additionalPaths.push(...successorPaths);
  let amendedPlan = null;
  if (value.classification === "RESEARCHER_APPROVED_AMENDMENT") {
    amendedPlan = relativePath(amendedPlanArg || "");
    if (amendedPlan === "study-plan.md") fail("The amended plan must be staged at a separate run-relative path");
    const amendedSource = artifactPath(run, amendedPlan).target;
    if (!fs.lstatSync(amendedSource).isFile() || !fs.readFileSync(amendedSource, "utf8").trim()) fail("The researcher-approved amended plan must be a non-empty regular file");
    additionalPaths.push("study-plan.md");
  } else if (amendedPlanArg) {
    fail("Automatic contract repair cannot replace study-plan.md");
  }
  const { archive, invalidatedPhases, revisionAfter } = archiveInvalidation(run, record, "contract", reason, { contractRevision: true, additionalPaths });
  if (amendedPlan) fs.copyFileSync(artifactPath(run, amendedPlan).target, path.join(run, "study-plan.md"));
  const archivePath = path.relative(run, archive).replaceAll(path.sep, "/");
  record.invalidation_roots.push({ path: archivePath, sha256: hashArtifact(run, archivePath) });
  for (const current of invalidatedPhases) delete record.checkpoints[current];
  record.contract_revision = revisionAfter;
  if (amendedPlan) {
    record.charter_revision += 1;
    record.study_plan_sha256 = hashArtifact(run, "study-plan.md");
  }
  record.state = "repairing";
  record.phase = "contract";
  record.last_checkpoint = null;
  record.outcome = null;
  record.updated_at = new Date().toISOString();
  record.attention = null;
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "contract_revision_started", revision: revisionAfter, charter_revision: record.charter_revision, classification: value.classification, result_aware: value.result_aware, amended_plan: amendedPlan, reason: reason.path, archive: archivePath });
  process.stdout.write(`${archive}\n`);
}

function manifest(runArg) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  const deliverables = path.join(run, "deliverables");
  if (!fs.existsSync(deliverables) || !fs.statSync(deliverables).isDirectory()) fail("manifest requires a deliverables directory");
  const requiredDeliverables = [...REQUIRED_DELIVERABLES[record.mode]];
  if (record.mode === "research" && !pdfRequired(run, record)) for (const optional of ["paper.pdf", "visual-inspection.json"]) requiredDeliverables.splice(requiredDeliverables.indexOf(optional), 1);
  for (const required of requiredDeliverables) hashArtifact(run, `deliverables/${required}`);
  const files = listFiles(deliverables).map((file) => {
    const item = { ...entry(run, file), content_sha256: contentHash(artifactPath(run, file).target) };
    const source = canonicalSource(record, file);
    if (source) {
      const sourceHash = contentHash(artifactPath(run, source).target);
      if (sourceHash !== item.content_sha256) fail(`Deliverable is not an exact copy of canonical source: ${file}`);
      item.source = source;
      item.source_content_sha256 = sourceHash;
    }
    return item;
  });
  writeJson(path.join(deliverables, "manifest.json"), { schema_version: 1, generated_at: new Date().toISOString(), files });
  process.stdout.write(`${path.join(deliverables, "manifest.json")}\n`);
}

function hash(runArg, relative) {
  const run = path.resolve(runArg || "");
  process.stdout.write(`${hashArtifact(run, relative)}\n`);
}

function setState(runArg, nextState) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  const allowedTargets = new Set(["running", "repairing", "paused", "failed"]);
  if (!allowedTargets.has(nextState)) fail(`set-state target must be running|repairing|paused|failed, received ${JSON.stringify(nextState)}`);
  const transitions = {
    running: new Set(["repairing", "paused", "failed"]),
    repairing: new Set(["running", "paused", "failed"]),
    paused: new Set(["running", "repairing", "failed"]),
    failed: new Set(["running", "repairing"]),
  };
  if (!transitions[record.state]?.has(nextState)) fail(`Invalid state transition; expected one of ${[...(transitions[record.state] ?? [])].join("|") || "none"} from ${record.state}, received ${nextState}`);
  if (nextState === "paused" && record.attention === null) fail("Cannot pause without validated attention.md; run set-attention first");
  if (["running", "repairing"].includes(nextState) && record.attention !== null) fail(`Cannot enter ${nextState} while attention is set; run clear-attention first`);
  const previous = record.state;
  record.state = nextState;
  record.updated_at = new Date().toISOString();
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "state_changed", from: previous, to: nextState });
  process.stdout.write(`${nextState}\n`);
}

function setAttention(runArg, attentionArg) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  const clean = relativePath(attentionArg || "");
  if (clean !== "attention.md") fail(`set-attention requires the run-root attention.md file, received ${clean}`);
  const file = artifactPath(run, clean).target;
  if (!fs.lstatSync(file).isFile()) fail(`Attention path must be a regular file: ${clean}`);
  const text = fs.readFileSync(file, "utf8");
  const actions = [...text.matchAll(/^Required action:\s*\S.+$/gmi)];
  if (!text.trim() || actions.length !== 1) fail(`attention.md must contain exactly one non-empty Required action: line, received ${actions.length}`);
  record.attention = { path: clean, sha256: hashArtifact(run, clean) };
  record.updated_at = new Date().toISOString();
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "attention_set", path: clean, sha256: record.attention.sha256 });
  process.stdout.write(`${file}\n`);
}

function clearAttention(runArg) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  if (record.attention === null) fail("No attention item is set");
  const previous = record.attention;
  fs.unlinkSync(artifactPath(run, previous.path).target);
  record.attention = null;
  record.updated_at = new Date().toISOString();
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "attention_cleared", ...previous });
  process.stdout.write(`${run}\n`);
}

function setOutcome(runArg, outcome) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  if (record.state === "complete") fail("A completed run outcome is immutable");
  const allowed = record.mode === "external_audit" ? AUDIT_OUTCOMES : RESEARCH_OUTCOMES;
  if (!allowed.has(outcome)) fail(`Invalid ${record.mode} outcome; expected ${[...allowed].join("|")}, received ${JSON.stringify(outcome)}`);
  record.outcome = outcome;
  record.updated_at = new Date().toISOString();
  writeJson(path.join(run, "run.json"), record);
  appendEvent(run, { event: "outcome_set", outcome });
  process.stdout.write(`${outcome}\n`);
}

function sanitizeFeedback(runArg, sourceArg, destinationArg) {
  const run = path.resolve(runArg || "");
  verifyRunRecord(run);
  const source = relativePath(sourceArg || "");
  const destination = relativePath(destinationArg || "");
  if (!source.startsWith("private/evaluator/") || !/^discovery\/nodes\/[^/]+\/feedback\/[^/]+\.json$/.test(destination)) fail(`sanitize-feedback requires private/evaluator/<file>.json and discovery/nodes/<node>/feedback/<file>.json; received ${source} -> ${destination}`);
  const value = readJson(artifactPath(run, source).target);
  exactKeys(value, ["schema_version", "execution_status", "public_metric", "safe_failure_category", "candidate_visible_note"], source);
  if (value.schema_version !== 1 || !["COMPLETE", "FAILED"].includes(value.execution_status)) fail(`Invalid private feedback status at ${source}; expected schema_version 1 and execution_status COMPLETE|FAILED`);
  if (value.public_metric != null) {
    exactKeys(value.public_metric, ["name", "value", "unit", "direction"], `${source}#/public_metric`);
    if (!nonemptyString(value.public_metric.name) || !Number.isFinite(value.public_metric.value) || !nonemptyString(value.public_metric.unit) || !["maximize", "minimize"].includes(value.public_metric.direction)) fail(`Invalid public_metric at ${source}`);
  }
  if (value.safe_failure_category !== null && !nonemptyString(value.safe_failure_category)) fail(`Invalid safe_failure_category at ${source}`);
  if (!nonemptyString(value.candidate_visible_note)) fail(`Invalid candidate_visible_note at ${source}`);
  const target = artifactPath(run, destination).target;
  if (fs.existsSync(target)) fail(`Sanitized feedback already exists; refusing to overwrite ${destination}`);
  writeJson(target, value);
  appendEvent(run, { event: "feedback_sanitized", source, source_sha256: hashArtifact(run, source), destination, destination_sha256: hashArtifact(run, destination) });
  process.stdout.write(`${target}\n`);
}

function verifySuperseded(run) {
  const root = path.join(run, "receipts", "superseded");
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root).sort()) {
    const archive = path.join(root, name);
    if (!fs.lstatSync(archive).isDirectory()) fail(`Unexpected file in superseded receipts: ${name}`);
    const metadata = readJson(path.join(archive, "invalidation.json"));
    if (metadata.schema_version !== 1 || !Array.isArray(metadata.moved_receipts) || !Array.isArray(metadata.receipt_hashes) || !Array.isArray(metadata.expected_outputs) || !Array.isArray(metadata.archived_artifacts)) fail(`Invalid superseded metadata: ${name}`);
    const expectedMoved = metadata.receipt_hashes.filter((item) => item.status !== "missing").map((item) => item.phase).sort();
    if (JSON.stringify([...metadata.moved_receipts].sort()) !== JSON.stringify(expectedMoved)) fail(`Incomplete archived receipt set: ${name}`);
    for (const receiptHash of metadata.receipt_hashes) {
      const archivedReceipt = path.join(archive, `${receiptHash.phase}.json`);
      if (receiptHash.status === "missing" && receiptHash.observed_sha256 === null && !fs.existsSync(archivedReceipt)) continue;
      if (!["moved", "changed"].includes(receiptHash.status) || typeof receiptHash.expected_sha256 !== "string" || typeof receiptHash.observed_sha256 !== "string") fail(`Invalid superseded receipt status: ${name}/${receiptHash.phase}`);
      if (!fs.existsSync(archivedReceipt) || (receiptHash.status === "moved") !== (receiptHash.observed_sha256 === receiptHash.expected_sha256)) fail(`Superseded receipt metadata is inconsistent: ${name}/${receiptHash.phase}`);
    }
    const expectedOutputs = new Map();
    for (const item of metadata.expected_outputs) {
      if (!item || typeof item.path !== "string" || typeof item.sha256 !== "string" || expectedOutputs.has(item.path)) fail(`Invalid superseded output anchor: ${name}`);
      expectedOutputs.set(item.path, item.sha256);
    }
    const expectedRoots = minimalPaths([...expectedOutputs.keys()]);
    const recordedRoots = metadata.archived_artifacts.map((item) => item.path).sort();
    if (JSON.stringify(expectedRoots.sort()) !== JSON.stringify(recordedRoots)) fail(`Superseded artifact map is incomplete: ${name}`);
    for (const item of metadata.archived_artifacts) {
      const expected = expectedOutputs.get(item.path);
      if (!expected || item.expected_sha256 !== expected) fail(`Invalid superseded artifact expectation: ${name}/${item.path}`);
      if (item.status === "missing" && item.archived_path === null && item.observed_sha256 === null) continue;
      if (!["moved", "changed", "copied", "copied_changed"].includes(item.status) || typeof item.archived_path !== "string" || typeof item.observed_sha256 !== "string") fail(`Invalid superseded artifact status: ${name}/${item.path}`);
      if (!fs.existsSync(artifactPath(run, item.archived_path).target)) fail(`Superseded artifact is missing: ${name}/${item.path}`);
      const unchangedStatus = item.status === "moved" || item.status === "copied";
      if (unchangedStatus !== (item.observed_sha256 === expected)) fail(`Superseded artifact metadata is inconsistent: ${name}/${item.path}`);
    }
    const archivedReason = artifactPath(run, metadata.archived_reason).target;
    if (!fs.existsSync(archivedReason) || !validSha256(metadata.reason?.sha256)) fail(`Superseded invalidation reason metadata is invalid: ${name}`);
  }
}

function verify(runArg) {
  const run = path.resolve(runArg || "");
  const record = verifyRunRecord(run);
  verifySuperseded(run);
  const last = verifyReceipts(run, record);
  if (record.last_checkpoint !== last) fail(`run.json last_checkpoint is ${record.last_checkpoint ?? "none"}, but the receipt chain ends at ${last ?? "none"}`);
  const phases = phasesFor(record);
  const expectedPhase = last === "complete" ? "complete" : phases[(last === null ? -1 : phases.indexOf(last)) + 1];
  if (record.phase !== expectedPhase) fail(`run.json phase is ahead of or behind the verified receipt chain; expected ${expectedPhase}, received ${record.phase}`);
  if ((record.state === "complete") !== (record.phase === "complete") || (last === "complete") !== (record.state === "complete")) fail("Complete run status is inconsistent with its evidence chain");
  if (last === "complete") {
    const allowed = record.mode === "external_audit" ? AUDIT_OUTCOMES : RESEARCH_OUTCOMES;
    if (!allowed.has(record.outcome)) fail(`Completed run has invalid outcome; expected ${[...allowed].join("|")}, received ${JSON.stringify(record.outcome)}`);
    if (record.mode === "external_audit") {
      const expectedOutcome = { PASS: "audit_passed", FAIL: "audit_failed", NOT_ASSESSED: "audit_incomplete" }[auditOverallVerdict(run)];
      if (record.outcome !== expectedOutcome) fail(`Completed external audit outcome mismatch; expected ${expectedOutcome}, received ${record.outcome}`);
    }
    verifyManifest(run, record);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, run, state: record.state, phase: record.phase, last_checkpoint: last })}\n`);
}

function verifyRoleForReuse(runArg, receiptArg) {
  const run = path.resolve(runArg || "");
  const relative = relativePath(receiptArg || "");
  if (!/^role-receipts\/[^/]+\.json$/.test(relative)) fail("verify-role requires one role-receipts/<task>.json path");
  const record = verifyRunRecord(run);
  const last = verifyReceipts(run, record);
  if (last !== record.last_checkpoint) fail(`Cannot reuse role work while the verified receipt chain ends at ${last ?? "none"}`);
  const verified = verifyRoleReceipt(run, relative);
  if (!verified.hash_bound) fail(`Role receipt ${relative} predates hash-bound reuse; preserve it, but rerun the logical task under the current launch contract`);
  const launch = readJson(path.join(run, "role-launches", `${path.basename(relative, ".json")}.json`));
  const expectedPredecessor = last === null ? null : { path: `receipts/${last}.json`, sha256: record.checkpoints[last].receipt_sha256 };
  if (JSON.stringify(launch.predecessor) !== JSON.stringify(expectedPredecessor)) fail(`Role receipt ${relative} was launched from a different predecessor checkpoint`);
  for (const checkpoint of Object.values(record.checkpoints)) {
    if (checkpoint.outputs.some((item) => item.path === relative)) fail(`Role receipt ${relative} is already promoted and cannot be counted as new work`);
  }
  const receiptRoot = path.join(run, "role-receipts");
  for (const name of fs.readdirSync(receiptRoot).filter((item) => item.endsWith(".json") && `role-receipts/${item}` !== relative)) {
    const otherReceipt = readJson(path.join(receiptRoot, name));
    if (otherReceipt.execution_status !== "COMPLETE" || otherReceipt.gate_verdict !== "PASS") continue;
    const otherLaunchPath = path.join(run, "role-launches", name);
    if (!fs.existsSync(otherLaunchPath)) continue;
    const otherLaunch = readJson(otherLaunchPath);
    if ((otherLaunch.logical_task_name ?? path.basename(name, ".json")) === verified.logical_task_name) fail(`Logical task ${verified.logical_task_name} has another COMPLETE/PASS receipt; resolve the duplicate instead of counting a stochastic sample twice`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, reusable: true, run, phase: record.phase, receipt: relative, logical_task_name: verified.logical_task_name, attempt: verified.attempt })}\n`);
}

function usage() {
  return `Usage:
  coe.mjs configure <run> <standard|pilot|custom> <research|external_audit> [custom-profile-json]
  coe.mjs init <run>
  coe.mjs preflight <run> <phase> --input <path>... --output <path>...
  coe.mjs checkpoint <run> <phase> --input <path>... --output <path>...
  coe.mjs invalidate <run> <phase> <reason-file>
  coe.mjs revise-contract <run> <contract-revision-reason.json> [researcher-approved-amended-plan.md]
  coe.mjs set-state <run> <running|repairing|paused|failed>
  coe.mjs set-attention <run> attention.md
  coe.mjs clear-attention <run>
  coe.mjs set-outcome <run> <outcome>
  coe.mjs sanitize-feedback <run> <private-evaluation-json> <feedback-json>
  coe.mjs hash <run> <path>
  coe.mjs manifest <run>
  coe.mjs verify-role <run> role-receipts/<task>.json
  coe.mjs verify <run>\n`;
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "configure") configure(args[0], args[1], args[2], args[3]);
  else if (command === "init") init(args[0]);
  else if (command === "preflight") preflight(args[0], args[1], args.slice(2));
  else if (command === "checkpoint") checkpoint(args[0], args[1], args.slice(2));
  else if (command === "invalidate") invalidate(args[0], args[1], args[2]);
  else if (command === "revise-contract") reviseContract(args[0], args[1], args[2]);
  else if (command === "set-state") setState(args[0], args[1]);
  else if (command === "set-attention") setAttention(args[0], args[1]);
  else if (command === "clear-attention") clearAttention(args[0]);
  else if (command === "set-outcome") setOutcome(args[0], args[1]);
  else if (command === "sanitize-feedback") sanitizeFeedback(args[0], args[1], args[2]);
  else if (command === "hash") hash(args[0], args[1]);
  else if (command === "manifest") manifest(args[0]);
  else if (command === "verify-role") {
    memoizeHashes = true;
    verifyRoleForReuse(args[0], args[1]);
  }
  else if (command === "verify") {
    memoizeHashes = true;
    verify(args[0]);
  }
  else {
    process.stderr.write(usage());
    process.exitCode = 2;
  }
} catch (error) {
  if (!process.exitCode) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
