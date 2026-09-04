import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installTestRouting, seedI1Audit, seedI1Contract, testRuntime } from "./i1-contract-fixture.mjs";
import { TEST_CATALOG } from "./model-routing-fixture.mjs";
import { consumeLaunchToken, ensureRunRouting, prepareRoleLaunch } from "../../plugins/scientist1/mcp/model-routing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientist1");
const COE = path.join(ROOT, "skills", "scientist1", "scripts", "coe.mjs");
const ROLE_CONTRACT = path.join(ROOT, "skills", "scientist1", "references", "roles.md");
const GATE_CHECKLIST = JSON.parse(fs.readFileSync(path.join(ROOT, "skills", "scientist1", "references", "gate-checklists.json"), "utf8"));
const BUDGETS = { idea_ceiling: 2, minimum_eligible_ideas: 1, candidate_node_ceiling: 1, minimum_evaluated_candidates: 1, evaluation_ceiling_per_node: 1, ablation_ceiling: 1, minimum_valid_ablations: 1, canonical_repetitions: 2, audit_panel_size: 3 };

const run = (...args) => spawnSync(process.execPath, [COE, ...args], { encoding: "utf8" });
const runWithEnv = (extraEnv, ...args) => spawnSync(process.execPath, [COE, ...args], { encoding: "utf8", env: { ...process.env, ...extraEnv } });
function put(root, relative, content = `${relative}\n`) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function json(root, relative, value) { put(root, relative, `${JSON.stringify(value, null, 2)}\n`); }
function read(root, relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function copy(root, source, destination) { const target = path.join(root, destination); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, source), target); }
function hash(root, relative) { const result = run("hash", root, relative); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
function fileHash(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function approve(root, paperStylePolicySha256 = null) { const args = ["bind-approval", root, "test-draft", "2026-08-31T00:00:00Z", "Synthetic researcher approval for the regression fixture."]; if (paperStylePolicySha256) args.push(paperStylePolicySha256); const result = run(...args); assert.equal(result.status, 0, result.stderr); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function workKey(role, outputs, contractRevision, charterRevision, repairDocketId = null, repairSemanticDigest = null) { return createHash("sha256").update(canonical({ contract_revision: contractRevision, charter_revision: charterRevision, role, declared_outputs: [...outputs].sort(), ...(repairDocketId ? { repair_docket_id: repairDocketId, repair_semantic_digest: repairSemanticDigest } : {}) })).digest("hex"); }
function bootstrap(root, mode, source = "existing") {
  let tools;
  if (source === "portable_official") {
    put(root, "environment/tools/node", "#!/bin/sh\n"); put(root, "environment/tools/latex", "#!/bin/sh\n");
    fs.chmodSync(path.join(root, "environment/tools/node"), 0o755); fs.chmodSync(path.join(root, "environment/tools/latex"), 0o755);
    tools = [
      { name: "node", requirement: ">=20", path: "environment/tools/node", version: "22.0.0", source, source_url: "https://nodejs.org/", sha256: fileHash(path.join(root, "environment/tools/node")), purpose: "scientific_method", verified_at: "2026-08-22T12:00:00Z" },
      { name: "latex", implementation: "tectonic", path: "environment/tools/latex", version: "0.15.0", source, source_url: "https://github.com/tectonic-typesetting/tectonic/", sha256: fileHash(path.join(root, "environment/tools/latex")), purpose: "scientific_method", verified_at: "2026-08-22T12:00:00Z" },
    ];
  } else {
    tools = [{ name: "node", requirement: ">=20", path: process.execPath, version: process.version, source, source_url: null, sha256: null, verified_at: "2026-08-22T12:00:00Z" }];
    if (mode === "research") tools.push({ name: "latex", implementation: "test-latex", path: process.execPath, version: "1.0.0", source, source_url: null, sha256: null, verified_at: "2026-08-22T12:00:00Z" });
    else tools.push({ name: "latex", status: "not_required", reason: "No compilation is planned" });
  }
  json(root, "environment/bootstrap.json", { schema_version: 1, platform: { os: process.platform, architecture: process.arch }, tools });
}
function addField(digest, tag, value) { const data = Buffer.from(String(value)); const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(data.length)); digest.update(tag); digest.update(length); digest.update(data); }
function treeHash(root, files) { const digest = createHash("sha256"); for (const relative of [...files].sort()) { const file = path.join(root, relative); addField(digest, "F", relative); addField(digest, "S", fs.statSync(file).size); digest.update(fs.readFileSync(file)); } return digest.digest("hex"); }
function minimalPdf() {
  const objects = ["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>\nendobj\n", "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n"];
  let pdf = "%PDF-1.4\n"; const offsets = []; for (const object of objects) { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += object; } const xref = Buffer.byteLength(pdf, "latin1"); return `${pdf}xref\n0 5\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

function role(root, { role: name, task = name, logical_task_name = task, attempt = 1, inputs = ["study-plan.md"], outputs, allowed_external_sources = [], receipt_allowed_external_sources = allowed_external_sources, external_results_used = [], environment_changes = [], omit_environment_changes = false, omit_repair_scope_inputs = false, execution_status = "COMPLETE", gate_verdict = "PASS", model: modelOverride, reasoning_effort: effortOverride }) {
  const started_at = "2026-08-22T12:00:00Z";
  const record = read(root, "run.json");
  const repairBinding = record.active_repair ? { docket_id: record.active_repair.docket_id, semantic_digest: record.active_repair.semantic_digest, incident_path: record.active_repair.incident.path, incident_sha256: record.active_repair.incident.sha256, repair_mode: record.active_repair.repair_mode, finding_fingerprints: record.active_repair.finding_fingerprints, repair_scope: record.active_repair.repair_scope, scope_baseline: record.active_repair.scope_baseline, controller_delta: record.active_repair.controller_delta, baseline: record.active_repair.baseline.filter((item) => record.active_repair.repair_scope.includes(item.path)) } : null;
  if (repairBinding) {
    inputs = [...new Set([...inputs, repairBinding.incident_path, record.convergence_control.checklist.path])];
    const absentScope = record.active_repair.repair_scope.filter((relative) => !fs.existsSync(path.join(root, relative))).sort();
    let absenceProof = null;
    if (absentScope.length) {
      absenceProof = `repairs/absence-proofs/${record.active_repair.semantic_digest}.json`;
      json(root, absenceProof, { schema_version: 1, docket_id: record.active_repair.docket_id, semantic_digest: record.active_repair.semantic_digest, absent_paths: absentScope });
    }
    if (!omit_repair_scope_inputs && (record.active_repair.required_review_roles.includes(name) || name === "repair_adjudicator")) inputs = [...new Set([...inputs.filter((relative) => fs.existsSync(path.join(root, relative))), ...record.active_repair.repair_scope.filter((relative) => fs.existsSync(path.join(root, relative))), ...[absenceProof].filter(Boolean)])];
  }
  const runtime = testRuntime(root, name);
  const launchPath = `role-launches/${task}.json`;
  const seeded = fs.existsSync(path.join(root, launchPath)) && !repairBinding && modelOverride == null && effortOverride == null ? read(root, launchPath) : null;
  const model = modelOverride ?? seeded?.model ?? runtime.model;
  const reasoning_effort = effortOverride ?? seeded?.reasoning_effort ?? runtime.reasoning_effort;
  if (!seeded) {
    const task_brief = { acceptance_gate: "Produce the declared outputs", constraints: "Use only declared inputs", context: "Synthetic regression fixture", objective: `Complete ${task}`, upstream_summary: [] };
    const assignment = `Synthetic canonical assignment for ${task}`;
    const key = workKey(name, outputs, record.contract_revision, record.charter_revision, repairBinding?.docket_id ?? null, repairBinding?.semantic_digest ?? null);
    json(root, launchPath, { schema_version: 1, task_id: `native-${task}`, logical_task_name, work_key_sha256: key, attempt, contract_revision: record.contract_revision, charter_revision: record.charter_revision, predecessor: record.last_checkpoint === null ? null : { path: `receipts/${record.last_checkpoint}.json`, sha256: record.checkpoints[record.last_checkpoint].receipt_sha256 }, role: name, fork_turns: "none", model_tier: runtime.tier, model, reasoning_effort, model_routing_sha256: runtime.routing_sha256, role_contract_sha256: fileHash(ROLE_CONTRACT), gate_schema_version: repairBinding ? 2 : 1, ...(repairBinding ? { repair_binding: repairBinding } : {}), task_brief, task_brief_sha256: createHash("sha256").update(JSON.stringify(task_brief)).digest("hex"), assignment, assignment_sha256: createHash("sha256").update(assignment).digest("hex"), declared_inputs: inputs, input_artifacts: inputs.map((path) => ({ path, sha256: hash(root, path) })), allowed_external_sources, declared_outputs: outputs, started_at });
    if (name === "i1_verifier_builder" && outputs.includes("contract/i1-verification-policy.json") && fs.existsSync(path.join(root, "contract/i1-verification-policy.json"))) {
      const policy = read(root, "contract/i1-verification-policy.json");
      policy.authored_by = { role: "i1_verifier_builder", launch_record_path: launchPath, launch_record_sha256: hash(root, launchPath) };
      json(root, "contract/i1-verification-policy.json", policy);
    }
  }
  const activeLaunch = read(root, launchPath);
  json(root, `role-attempts/${activeLaunch.logical_task_name}/${activeLaunch.work_key_sha256}/attempt-${activeLaunch.attempt}.json`, { schema_version: 2, logical_task_name: activeLaunch.logical_task_name, work_key_sha256: activeLaunch.work_key_sha256, attempt: activeLaunch.attempt, launch_record: launchPath, launch_record_sha256: hash(root, launchPath), accepted_at: "2026-08-22T12:00:00.500Z" });
  const receipt = { schema_version: 1, role: name, agent_task: task, logical_task_name: activeLaunch.logical_task_name, attempt: activeLaunch.attempt, contract_revision: activeLaunch.contract_revision, charter_revision: activeLaunch.charter_revision, predecessor: activeLaunch.predecessor, model, reasoning_effort, model_routing_sha256: activeLaunch.model_routing_sha256, role_contract_sha256: activeLaunch.role_contract_sha256, assignment_sha256: activeLaunch.assignment_sha256, task_brief_sha256: activeLaunch.task_brief_sha256, gate_schema_version: activeLaunch.gate_schema_version, fork_turns: "none", started_at, completed_at: "2026-08-22T12:00:01Z", declared_inputs: inputs, input_artifacts: inputs.map((path) => ({ path, sha256: hash(root, path) })), allowed_external_sources: receipt_allowed_external_sources, external_results_used, environment_changes, outputs, output_artifacts: outputs.map((path) => ({ path, sha256: hash(root, path) })), undeclared_inputs_accessed: [], limitations: [], handoff: { summary: `Completed ${task}`, decisions: [], evidence_ids: [], conflicts: [], unresolved: [], recommended_next_action: "Continue to the next verified gate" }, execution_status, gate_verdict, launch_record: launchPath, launch_record_sha256: hash(root, launchPath) };
  if (omit_environment_changes) delete receipt.environment_changes;
  json(root, `role-receipts/${task}.json`, receipt);
  return `role-receipts/${task}.json`;
}
const REVIEW_FIXTURES = {
  contract: { role: "contract_auditor", output: "contract/audit.md", check_id: "contradictions" },
  investigation: { role: "brief_critic", output: "investigation/critic.md", check_id: "unsupported_claims" },
  discovery: { role: "idea_critic", output: "discovery/idea-critique.jsonl", check_id: "contract_fit" },
  selection: { role: "selection_auditor", output: "selection/selection-audit.md", check_id: "lineage" },
  writing: { role: "paper_critic", output: "paper/critic.md", check_id: "claim_grounding" },
  verification: { role: "claim_verifier", output: "paper/verification.md", check_id: "provenance_completeness" },
  audit: { role: "claim_provenance_auditor", output: "audit/claim-provenance.json", check_id: "coverage" },
};

function checkpointResult(root, phase, outputs, roles = [], childEnv = null) {
  const flags = ["--input", "study-plan.md"];
  if (phase === "contract") { for (const item of ["request.md", "environment/bootstrap.json", "contract/approval.json", "contract/run-config.json", "contract/input-manifest.json"]) flags.push("--input", item); if (fs.existsSync(path.join(root, "contract/source-bundle-manifest.json"))) flags.push("--input", "contract/source-bundle-manifest.json"); else for (const item of ["contract/evaluator-contract.md", "contract/evaluator-manifest.json"]) flags.push("--input", item); for (const item of ["contract/i1-verification-policy.json", "contract/control-plane/i1-interpreter.mjs", "contract/paper-style-policy.json"]) if (fs.existsSync(path.join(root, item))) flags.push("--input", item); const styleRoot = path.join(root, "inputs/style"); if (fs.existsSync(styleRoot)) for (const name of fs.readdirSync(styleRoot).sort()) flags.push("--input", `inputs/style/${name}`); }
  const roleReceipts = roles.map((item) => role(root, item));
  let record = read(root, "run.json");
  if (record.active_repair?.target_phase === phase) {
    const docket = record.active_repair;
    const reviewReceipts = [];
    for (const reviewRole of docket.required_review_roles) {
      const existing = roleReceipts.find((relative) => read(root, relative).role === reviewRole);
      if (existing) {
        reviewReceipts.push(existing);
        continue;
      }
      const fixture = Object.values(REVIEW_FIXTURES).find((item) => item.role === reviewRole);
      assert.ok(fixture, `Missing test review fixture for ${reviewRole}`);
      put(root, fixture.output, "Overall verdict: PASS\n");
      reviewReceipts.push(role(root, { role: reviewRole, task: `${reviewRole}_repair_${docket.docket_id}`, inputs: ["study-plan.md"], outputs: [fixture.output] }));
    }
    const task = `auto_close_${docket.docket_id}`;
    const proposal = `repairs/proposals/${task}.json`;
    const adjudicatorReceipt = `role-receipts/${task}.json`;
    json(root, proposal, { schema_version: 1, docket_id: docket.docket_id, resolved_fingerprints: docket.finding_fingerprints, review_receipts: reviewReceipts, adjudicator_receipt: adjudicatorReceipt, required_action: `Checkpoint ${phase} and advance.` });
    role(root, { role: "repair_adjudicator", task, inputs: [docket.incident.path, ...reviewReceipts], outputs: [proposal] });
    const closed = run("close-repair", root, proposal);
    if (closed.status !== 0) return closed;
    record = read(root, "run.json");
    assert.equal(record.active_repair, null);
  }
  for (const output of [...outputs, ...roleReceipts]) flags.push("--output", output);
  const checked = run("preflight", root, phase, ...flags);
  return checked.status === 0 ? childEnv ? runWithEnv(childEnv, "checkpoint", root, phase, ...flags) : run("checkpoint", root, phase, ...flags) : checked;
}
function checkpoint(root, phase, outputs, roles = [], childEnv = null) { const result = checkpointResult(root, phase, outputs, roles, childEnv); assert.equal(result.status, 0, result.stderr); }
function freezeAs14(root) {
  const config = read(root, "contract/run-config.json");
  config.schema_version = 3;
  config.orchestration = { task_attempt_policy: "repair_until_pass", repair_gate_policy: "invalidate_and_continue", completion_condition: "fresh_verified_delivery" };
  json(root, "contract/run-config.json", config);
  fs.rmSync(path.join(root, "contract/control-plane/gate-checklists.json"));
  const record = read(root, "run.json");
  record.orchestration = config.orchestration;
  record.contract_parameters_sha256 = hash(root, "contract/run-config.json");
  delete record.convergence_control;
  delete record.pending_adjudication;
  delete record.active_repair;
  delete record.repair_closures;
  json(root, "run.json", record);
}
function seedLegacyRepair(root, name, value) {
  const record = read(root, "run.json");
  const relative = `repairs/incidents/${name}.json`;
  json(root, relative, { schema_version: 1, at: "2026-08-31T12:00:00Z", phase: record.phase, failure_class: value.failure_class, logical_task_name: value.logical_task_name, summary: value.summary, evidence: value.evidence_paths.map((item) => ({ path: item, sha256: hash(root, item) })), required_action: value.required_action });
  record.repair_incidents.push({ path: relative, sha256: hash(root, relative) });
  record.state = "repairing";
  record.outcome = null;
  json(root, "run.json", record);
}
function seedPaperStyle(root) {
  put(root, "inputs/style/01-reference.txt", "Use short sections and direct prose.\n");
  const sourceSha256 = fileHash(path.join(root, "inputs/style/01-reference.txt"));
  json(root, "contract/paper-style-policy.json", {
    schema_version: 1,
    source_draft_id: "test-draft",
    max_reviews: 3,
    writing_review_limit: 2,
    notes: "Use short sections and direct prose.",
    examples: [{ upload_id: "style-1", original_name: "reference.txt", media_type: "text/plain", frozen_path: "inputs/style/01-reference.txt", source_sha256: sourceSha256, frozen_sha256: sourceSha256 }],
    criteria: ["ai_tells", "prose", "structure", "formatting", "visual_fidelity"],
    evidence_rule: "Use examples only for prose, structure, and formatting. Never copy their text or treat them as scientific evidence.",
  });
  return fileHash(path.join(root, "contract/paper-style-policy.json"));
}
function newRun(t, mode = "research", environmentSource = "existing", convergent = true, paperStyle = false) { const root = fs.mkdtempSync(path.join(os.tmpdir(), `scientist1-${mode}-`)); t.after(() => fs.rmSync(root, { recursive: true, force: true })); put(root, "request.md", "Approved request.\n"); put(root, "study-plan.md", "# Approved plan\n"); bootstrap(root, mode, environmentSource); json(root, "contract/custom-profile.json", BUDGETS); assert.equal(run("configure", root, "custom", mode, "contract/custom-profile.json").status, 0); assert.equal(run("init", root).status, 0); json(root, "contract/input-manifest.json", { schema_version: 1, files: [] }); approve(root, paperStyle ? seedPaperStyle(root) : null); if (!convergent) freezeAs14(root); installTestRouting(root); return root; }

function pendingReviewReceipt(root, sourceReview, reviewRole) {
  const pending = read(root, "run.json").pending_adjudication;
  if (!pending) return null;
  const incident = read(root, pending.path);
  for (const binding of incident.evidence ?? []) {
    const sourcePath = binding.source_path ?? binding.path;
    if (!/^role-receipts\/[^/]+\.json$/.test(sourcePath)) continue;
    const receipt = read(root, sourcePath);
    if (receipt.role === reviewRole && receipt.outputs.includes(sourceReview)) return sourcePath;
  }
  return null;
}

function adjudicate(root, { task, disposition = "CONFIRMED_DEFECT", sourceReview, sourceReviewReceipt: explicitSourceReviewReceipt, reviewRole = "contract_auditor", checkId = "contradictions", blockerClass = "evidence_mismatch", repairPaths = ["contract/generated.md"], introducedByPaths = [], findingEvidencePaths = [], strategy = null, targetPhase = read(root, "run.json").phase, originPhase = read(root, "run.json").phase, artifactPath = repairPaths[0] ?? sourceReview, locator = "fixture:1", expectedState = "The frozen checklist row passes.", observedState = "The cited artifact violates the frozen checklist row." }) {
  if (strategy) strategy = { cause_code: "incomplete_prior_repair", action_code: "repair_authoritative_source", procedure_paths: repairPaths, ...strategy };
  let record = read(root, "run.json");
  let sourceReviewReceipt = explicitSourceReviewReceipt ?? null;
  if (record.active_repair) {
    sourceReviewReceipt ??= role(root, { role: reviewRole, task: `${task}_source`, inputs: [...new Set([sourceReview, artifactPath, ...findingEvidencePaths, ...(strategy?.evidence_paths ?? []), ...(strategy?.procedure_paths ?? [])])], outputs: [sourceReview], gate_verdict: "REVISE" });
  } else if (record.pending_adjudication) {
    sourceReviewReceipt ??= pendingReviewReceipt(root, sourceReview, reviewRole);
  } else {
    sourceReviewReceipt ??= role(root, { role: reviewRole, task: `${task}_source`, inputs: [...new Set([sourceReview, artifactPath, ...findingEvidencePaths, ...(strategy?.evidence_paths ?? []), ...(strategy?.procedure_paths ?? [])])], outputs: [sourceReview], gate_verdict: "REVISE" });
    const queued = run("queue-review-failure", root, originPhase, sourceReviewReceipt);
    if (queued.status !== 0) return queued;
    record = read(root, "run.json");
    assert.ok(record.pending_adjudication, queued.stderr);
  }
  const pendingPath = record.pending_adjudication?.path ?? null;
  const proposal = `repairs/proposals/${task}.json`;
  const receipt = `role-receipts/${task}.json`;
  const evidencePaths = [...new Set([sourceReview, artifactPath, ...findingEvidencePaths])];
  json(root, proposal, { schema_version: 2, disposition, target_phase: targetPhase, source_review: sourceReview, source_review_receipt: sourceReviewReceipt, adjudicator_receipt: receipt, findings: [{ review_role: reviewRole, check_id: checkId, blocker_class: blockerClass, artifact_path: artifactPath, locator, expected_state: expectedState, observed_state: observedState, evidence_paths: evidencePaths, repair_paths: disposition === "REVIEWER_FALSE_POSITIVE" ? [] : repairPaths, introduced_by_paths: introducedByPaths }], required_review_roles: [reviewRole], reviewed_check_ids: { [reviewRole]: GATE_CHECKLIST.review_roles[reviewRole] }, strategy, required_action: disposition === "REVIEWER_FALSE_POSITIVE" ? "Dismiss the unsupported finding and continue the current phase." : "Repair only the frozen paths, run the named closure review, close the docket, and checkpoint the phase." });
  role(root, { role: "repair_adjudicator", task, inputs: [...new Set([sourceReview, artifactPath, ...findingEvidencePaths, sourceReviewReceipt, pendingPath, ...(strategy?.evidence_paths ?? []), read(root, "run.json").convergence_control.checklist.path].filter(Boolean))], outputs: [proposal] });
  return run("record-repair", root, proposal);
}

function openRepairDocket(root, { task, targetPhase, repairPaths, strategy = null, findingEvidencePaths = [] }) {
  const originPhase = read(root, "run.json").phase;
  const fixture = REVIEW_FIXTURES[originPhase];
  assert.ok(fixture, `Missing review fixture for ${originPhase}`);
  put(root, fixture.output, "Overall verdict: REVISE\nA controller-reviewable defect affects the exact repair scope.\n");
  const opened = adjudicate(root, {
    task,
    sourceReview: fixture.output,
    reviewRole: fixture.role,
    checkId: fixture.check_id,
    targetPhase,
    originPhase,
    artifactPath: repairPaths[0],
    repairPaths,
    findingEvidencePaths,
    strategy,
  });
  assert.equal(opened.status, 0, opened.stderr);
  return read(root, "run.json").active_repair;
}

function closeDocket(root, { task, reviewerTask, reviewRole = "contract_auditor", reviewOutput = "contract/audit.md", regenerateDependents = true }) {
  const docket = read(root, "run.json").active_repair;
  const overlap = (docket.dependent_regeneration ?? []).find((dependent) => dependent.role === reviewRole && canonical([...dependent.declared_outputs].sort()) === canonical([reviewOutput]));
  const remaining = [...(docket.dependent_regeneration ?? [])];
  const orderedDependents = [];
  while (remaining.length) {
    const readyIndex = remaining.findIndex((candidate, index) => !remaining.some((upstream, upstreamIndex) => upstreamIndex !== index && candidate.declared_inputs.some((input) => upstream.declared_outputs.some((output) => input === output || input.startsWith(`${output}/`)))));
    orderedDependents.push(remaining.splice(readyIndex < 0 ? 0 : readyIndex, 1)[0]);
  }
  if (regenerateDependents) for (const dependent of orderedDependents) {
    if (dependent === overlap) continue;
    const absentInputs = dependent.declared_inputs.filter((relative) => !fs.existsSync(path.join(root, relative)));
    const proof = absentInputs.length ? `repairs/absence-proofs/${docket.semantic_digest}.json` : null;
    role(root, { role: dependent.role, task: `${dependent.logical_task_name}_${task}_dependent`, logical_task_name: dependent.logical_task_name, inputs: [...dependent.declared_inputs.filter((relative) => fs.existsSync(path.join(root, relative))), ...[proof].filter(Boolean)], outputs: dependent.declared_outputs, allowed_external_sources: docket.repair_mode === "deterministic_delta" ? [] : dependent.allowed_external_sources });
  }
  put(root, reviewOutput, "Overall verdict: PASS\n");
  const reviewReceipt = role(root, { role: reviewRole, task: reviewerTask, logical_task_name: overlap?.logical_task_name ?? reviewerTask, inputs: overlap?.declared_inputs.filter((relative) => fs.existsSync(path.join(root, relative))) ?? ["study-plan.md"], outputs: [reviewOutput], allowed_external_sources: overlap ? (docket.repair_mode === "deterministic_delta" ? [] : overlap.allowed_external_sources) : [] });
  const proposal = `repairs/proposals/${task}.json`;
  const receipt = `role-receipts/${task}.json`;
  json(root, proposal, { schema_version: 1, docket_id: docket.docket_id, resolved_fingerprints: docket.finding_fingerprints, review_receipts: [reviewReceipt], adjudicator_receipt: receipt, required_action: `Checkpoint ${docket.target_phase} and advance.` });
  role(root, { role: "repair_adjudicator", task, inputs: [docket.incident.path, reviewReceipt], outputs: [proposal] });
  return run("close-repair", root, proposal);
}

test("1.5 freezes a finite adjudicated repair docket and rejects raw or dismissed review findings", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "contract/generated.md", "original\n");
  put(root, "contract/audit.md", "Overall verdict: REVISE\nUnsupported contradiction claim.\n");
  json(root, "repairs/proposals/unowned.json", { schema_version: 2, disposition: "CONFIRMED_DEFECT", target_phase: "contract", source_review: "contract/audit.md", source_review_receipt: null, adjudicator_receipt: "role-receipts/missing.json", findings: [{ review_role: "contract_auditor", check_id: "contradictions", blocker_class: "evidence_mismatch", artifact_path: "contract/generated.md", locator: "fixture:1", expected_state: "consistent", observed_state: "contradictory", evidence_paths: ["contract/audit.md", "contract/generated.md"], repair_paths: ["contract/generated.md"], introduced_by_paths: [] }], required_review_roles: ["contract_auditor"], reviewed_check_ids: { contract_auditor: GATE_CHECKLIST.review_roles.contract_auditor }, strategy: null, required_action: "Repair the exact file." });
  assert.match(run("record-repair", root, "repairs/proposals/unowned.json").stderr, /repair_adjudicator|Missing artifact|Cannot read valid JSON/i);
  assert.match(run("invalidate", root, "investigation", "contract/audit.md").stderr, /independently adjudicated active repair docket/i);
  const dismissed = adjudicate(root, { task: "dismiss_false_positive", disposition: "REVIEWER_FALSE_POSITIVE", sourceReview: "contract/audit.md" });
  assert.equal(dismissed.status, 0, dismissed.stderr);
  assert.equal(read(root, "run.json").active_repair, null);
  put(root, "contract/unrelated-state.md", "unrelated scientific state changed\n");
  put(root, "contract/audit.md", "Overall verdict: REVISE\nThe same unsupported contradiction claim.\n");
  const paddedReceipt = role(root, { role: "contract_auditor", task: "padded_reopen_source", inputs: ["contract/audit.md", "contract/generated.md", "contract/unrelated-state.md"], outputs: ["contract/audit.md"], gate_verdict: "REVISE" });
  const paddedReopen = adjudicate(root, { task: "padded_reopen", sourceReview: "contract/audit.md", sourceReviewReceipt: paddedReceipt });
  assert.notEqual(paddedReopen.status, 0);
  assert.match(paddedReopen.stderr, /same artifact state|input padding/i);
  const duplicateDismissal = adjudicate(root, { task: "consume_padded_duplicate", disposition: "REVIEWER_FALSE_POSITIVE", sourceReview: "contract/audit.md" });
  assert.equal(duplicateDismissal.status, 0, duplicateDismissal.stderr);
  assert.equal(read(root, "run.json").pending_adjudication, null);
  put(root, "contract/padding.json", '{"irrelevant":true}\n');
  put(root, "contract/audit.md", "Overall verdict: REVISE\nA new checklist label based only on padding.\n");
  const paddedNewFinding = adjudicate(root, { task: "padded_new_finding", sourceReview: "contract/audit.md", checkId: "charter_fidelity", findingEvidencePaths: ["contract/padding.json"] });
  assert.notEqual(paddedNewFinding.status, 0);
  assert.match(paddedNewFinding.stderr, /no changed controller-authoritative causal evidence|input padding/i);
  assert.equal(adjudicate(root, { task: "dismiss_padded_new_finding", disposition: "REVIEWER_FALSE_POSITIVE", sourceReview: "contract/audit.md", checkId: "charter_fidelity", findingEvidencePaths: ["contract/padding.json"] }).status, 0);
  json(root, "repairs/raw-contract-revision.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: false, post_result_guard: null, finding: "Raw reviewer prose.", repair: "Rollback without adjudication.", researcher_approval: null });
  const beforeRollback = read(root, "run.json");
  const rawRevision = run("revise-contract", root, "repairs/raw-contract-revision.json");
  assert.notEqual(rawRevision.status, 0);
  assert.match(rawRevision.stderr, /requires active docket incident/i);
  assert.deepEqual(read(root, "run.json").invalidation_roots, beforeRollback.invalidation_roots);
  const reopenDismissed = adjudicate(root, { task: "reopen_dismissed", sourceReview: "contract/audit.md" });
  assert.notEqual(reopenDismissed.status, 0);
  assert.match(reopenDismissed.stderr, /already closed|already dismissed|frontier is sealed|already sealed/i);

  const confirmedRoot = newRun(t, "research", "existing", true);
  put(confirmedRoot, "contract/generated.md", "original\n");
  put(confirmedRoot, "contract/audit.md", "Overall verdict: REVISE\nSupported contradiction claim.\n");
  const opened = adjudicate(confirmedRoot, { task: "confirm_contract_defect", sourceReview: "contract/audit.md" });
  assert.equal(opened.status, 0, opened.stderr);
  const docket = read(confirmedRoot, "run.json").active_repair;
  assert.ok(docket);
  assert.deepEqual(docket.repair_scope, ["contract/generated.md"]);

  put(confirmedRoot, "contract/second-review.md", "Overall verdict: REVISE\nAnother pre-existing preference.\n");
  const expansion = adjudicate(confirmedRoot, { task: "try_scope_expansion", sourceReview: "contract/second-review.md", checkId: "charter_fidelity", repairPaths: ["contract/another.md"], artifactPath: "contract/second-review.md" });
  assert.notEqual(expansion.status, 0);
  assert.match(expansion.stderr, /docket .* is frozen/i);
});

test("1.5 enforces exact repair delta and rejects unproven recurrence strategies", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "contract/generated.md", "incorrect\n");
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  role(root, { role: "contract_auditor", task: "original_contract_auditor", logical_task_name: "contract_auditor", inputs: ["contract/generated.md"], outputs: ["contract/audit.md"] });
  put(root, "contract/audit.md", "Overall verdict: REVISE\nThe generated binding contradicts its evidence.\n");
  const opened = adjudicate(root, { task: "confirm_exact_defect", sourceReview: "contract/audit.md" });
  assert.equal(opened.status, 0, opened.stderr);
  put(root, "contract/generated.md", "corrected\n");
  put(root, "contract/unrelated.md", "scope creep\n");
  const outside = closeDocket(root, { task: "closure_exact_defect", reviewerTask: "contract_recheck_exact" });
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /outside its frozen exact scope.*contract\/unrelated\.md/i);
  fs.rmSync(path.join(root, "contract/unrelated.md"));
  const closed = run("close-repair", root, "repairs/proposals/closure_exact_defect.json");
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal(read(root, "run.json").active_repair, null);
  const closure = read(root, read(root, "run.json").repair_closures.at(-1).path);
  assert.ok(closure.review_receipts.some((review) => closure.dependent_receipts.some((dependent) => dependent.source_path === review.source_path)), "one PASS receipt must satisfy overlapping dependent-regeneration and closure-review obligations");

  put(root, "contract/audit.md", "Overall verdict: REVISE\nThe same stable defect recurred.\n");
  const repeated = adjudicate(root, { task: "repeat_same_action", sourceReview: "contract/audit.md" });
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /already closed|frontier is sealed|already sealed/i);
  put(root, "contract/generated.md", "regressed after first closure\n");
  const recovered = adjudicate(root, { task: "change_causal_strategy", sourceReview: "contract/audit.md", strategy: { cause: "The earlier edit corrected prose but not the generator binding.", changed_action: "Correct the generator binding and regenerate only the declared file.", evidence_paths: ["contract/input-manifest.json", "contract/audit.md"] } });
  assert.notEqual(recovered.status, 0, recovered.stderr);
  assert.match(recovered.stderr, /no immutable approved-input or checkpoint provenance/i);
  assert.equal(adjudicate(root, { task: "dismiss_uncheckpointed_cause", disposition: "REVIEWER_FALSE_POSITIVE", sourceReview: "contract/audit.md" }).status, 0);
  put(root, "contract/alternate-cause.json", '{"cause":"new-dependent-state"}\n');
  role(root, { role: "brief_writer", task: "alternate_cause_producer", inputs: ["contract/input-manifest.json"], outputs: ["contract/alternate-cause.json"] });
  const alternateStrategy = adjudicate(root, { task: "alternate_strategy", sourceReview: "contract/audit.md", strategy: { action_code: "reconcile_exact_dependents", cause: "New evidence shows one exact dependent remained stale.", changed_action: "Regenerate the exact dependent from the newly bound state.", evidence_paths: ["contract/audit.md", "contract/alternate-cause.json"] } });
  assert.notEqual(alternateStrategy.status, 0);
  assert.match(alternateStrategy.stderr, /no immutable approved-input or checkpoint provenance/i);
  assert.equal(adjudicate(root, { task: "dismiss_unowned_cause", disposition: "REVIEWER_FALSE_POSITIVE", sourceReview: "contract/audit.md" }).status, 0);
  assert.equal(read(root, "run.json").state, "running");
});

test("1.5 reopens and closes a recurring defect only with genuinely changed checkpoint authority", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "inputs/shared/data.csv", "x\n1\n");
  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  put(root, "contract/causal-evidence.json", '{"revision":1}\n');
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [{ source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" }, { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" }] });
  writeContractArtifacts(root);
  put(root, "investigation/critic.md", "Overall verdict: REVISE\nThe contract text conflicts with the bounded investigation requirement.\n");
  const firstSource = role(root, { role: "brief_critic", task: "first_cross_phase_source", inputs: ["contract/evaluator-contract.md", "contract/causal-evidence.json"], outputs: ["investigation/critic.md"], gate_verdict: "REVISE" });
  const first = adjudicate(root, { task: "first_cross_phase_defect", sourceReview: "investigation/critic.md", sourceReviewReceipt: firstSource, reviewRole: "brief_critic", checkId: "unsupported_claims", targetPhase: "contract", originPhase: "investigation", artifactPath: "contract/evaluator-contract.md", repairPaths: ["contract/evaluator-contract.md"], findingEvidencePaths: ["contract/causal-evidence.json"] });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(run("revise-contract", root, read(root, "run.json").active_repair.incident.path).status, 0);
  put(root, "contract/evaluator-contract.md", "Corrected contract revision two.\n");
  const firstPolicy = read(root, "contract/i1-verification-policy.json");
  firstPolicy.bindings.evaluator_contract.sha256 = hash(root, "contract/evaluator-contract.md");
  json(root, "contract/i1-verification-policy.json", firstPolicy);
  const firstClosed = closeDocket(root, { task: "close_first_cross_phase", reviewerTask: "review_first_cross_phase", reviewRole: "brief_critic", reviewOutput: "investigation/critic.md" });
  assert.equal(firstClosed.status, 0, firstClosed.stderr);
  const firstClosure = read(root, read(root, "run.json").repair_closures.at(-1).path);
  const priorCausal = firstClosure.docket.baseline.find((binding) => binding.path === "contract/causal-evidence.json").sha256;
  put(root, "contract/causal-evidence.json", '{"revision":2,"new_controller_fact":true}\n');
  const checkpointArgs = ["--input", "study-plan.md", "--input", "request.md", "--input", "environment/bootstrap.json", "--input", "contract/approval.json", "--input", "contract/run-config.json", "--input", "contract/input-manifest.json", "--input", "contract/evaluator-contract.md", "--input", "contract/evaluator-manifest.json", "--input", "contract/i1-verification-policy.json", "--input", "contract/control-plane/i1-interpreter.mjs"];
  for (const output of ["contract", ...firstClosure.dependent_receipts.map((binding) => binding.source_path)]) checkpointArgs.push("--output", output);
  const promoted = run("checkpoint", root, "contract", ...checkpointArgs);
  assert.equal(promoted.status, 0, promoted.stderr);
  assert.notEqual(hash(root, "contract/causal-evidence.json"), priorCausal);
  assert.ok(read(root, "receipts/contract.json").outputs.some((binding) => binding.path === "contract"));
  put(root, "investigation/critic.md", "Overall verdict: REVISE\nThe same defect now recurs under changed checkpoint evidence.\n");
  const recurring = adjudicate(root, { task: "reopen_with_checkpoint_authority", sourceReview: "investigation/critic.md", reviewRole: "brief_critic", checkId: "unsupported_claims", targetPhase: "contract", originPhase: "investigation", artifactPath: "contract/evaluator-contract.md", repairPaths: ["contract/evaluator-contract.md"], findingEvidencePaths: ["contract/causal-evidence.json"], strategy: { cause: "The replacement contract did not account for the newly checkpointed controller fact.", changed_action: "Reconcile the exact contract field with the new checkpoint authority.", evidence_paths: ["contract/causal-evidence.json"] } });
  assert.equal(recurring.status, 0, recurring.stderr);
  const recurringIncident = read(root, read(root, "run.json").active_repair.incident.path);
  assert.equal(recurringIncident.strategy.evidence_provenance[0].kind, "checkpoint_output");
  assert.ok(recurringIncident.strategy.evidence_provenance[0].authorities.some((binding) => binding.source_path === "receipts/contract.json"));
  assert.equal(run("revise-contract", root, read(root, "run.json").active_repair.incident.path).status, 0);
  put(root, "contract/evaluator-contract.md", "Corrected contract revision three under the new fact.\n");
  const secondPolicy = read(root, "contract/i1-verification-policy.json");
  secondPolicy.bindings.evaluator_contract.sha256 = hash(root, "contract/evaluator-contract.md");
  json(root, "contract/i1-verification-policy.json", secondPolicy);
  const recurringClosed = closeDocket(root, { task: "close_checkpoint_authorized_recurrence", reviewerTask: "review_checkpoint_authorized_recurrence", reviewRole: "brief_critic", reviewOutput: "investigation/critic.md" });
  assert.equal(recurringClosed.status, 0, recurringClosed.stderr);
  assert.equal(read(root, "run.json").active_repair, null);
  assert.equal(run("verify", root).status, 0);
});

test("1.5 closes an intentional deletion when its dependent is the same required reviewer", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "contract/generated.md", "obsolete generated field\n");
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  role(root, { role: "contract_auditor", task: "deletion_original_auditor", logical_task_name: "contract_auditor", inputs: ["contract/generated.md"], outputs: ["contract/audit.md"] });
  put(root, "contract/audit.md", "Overall verdict: REVISE\nThe generated field must be absent under the frozen contract.\n");
  const opened = adjudicate(root, { task: "delete_obsolete_generated_field", sourceReview: "contract/audit.md" });
  assert.equal(opened.status, 0, opened.stderr);
  fs.rmSync(path.join(root, "contract/generated.md"));
  const closed = closeDocket(root, { task: "close_deleted_generated_field", reviewerTask: "review_deleted_generated_field" });
  assert.equal(closed.status, 0, closed.stderr);
  const closure = read(root, read(root, "run.json").repair_closures.at(-1).path);
  assert.deepEqual(closure.repaired_artifacts.map((binding) => ({ source_path: binding.source_path, state: binding.state })), [{ source_path: "contract/generated.md", state: "absent" }]);
  assert.ok(closure.absence_proof);
  assert.ok(closure.review_receipts.some((review) => closure.dependent_receipts.some((dependent) => dependent.source_path === review.source_path)));
  assert.equal(run("verify", root).status, 0);
});

test("1.5 rejects zero-delta closure, unbound closure review, and sequential late dockets", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "contract/generated.md", "incorrect\n");
  put(root, "contract/audit.md", "Overall verdict: REVISE\nA stable contract defect.\n");
  assert.equal(adjudicate(root, { task: "open_closure_guards", sourceReview: "contract/audit.md" }).status, 0);
  const docket = read(root, "run.json").active_repair;
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  const unboundReview = role(root, { role: "contract_auditor", task: "unbound_scope_review", inputs: ["study-plan.md"], outputs: ["contract/audit.md"], omit_repair_scope_inputs: true });
  json(root, "repairs/proposals/unbound-closure.json", { schema_version: 1, docket_id: docket.docket_id, resolved_fingerprints: docket.finding_fingerprints, review_receipts: [unboundReview], adjudicator_receipt: "role-receipts/unbound_closure_adjudicator.json", required_action: "Checkpoint contract." });
  role(root, { role: "repair_adjudicator", task: "unbound_closure_adjudicator", inputs: [docket.incident.path, unboundReview], outputs: ["repairs/proposals/unbound-closure.json"] });
  const unbound = run("close-repair", root, "repairs/proposals/unbound-closure.json");
  assert.notEqual(unbound.status, 0);
  assert.match(unbound.stderr, /did not read repaired artifact/i);
  const zeroDelta = closeDocket(root, { task: "zero_delta_closure", reviewerTask: "zero_delta_review" });
  assert.notEqual(zeroDelta.status, 0);
  assert.match(zeroDelta.stderr, /cannot close without a changed artifact/i);
  put(root, "contract/generated.md", "corrected\n");
  assert.equal(closeDocket(root, { task: "valid_guarded_closure", reviewerTask: "valid_guarded_review" }).status, 0);
  put(root, "contract/audit.md", "Overall verdict: REVISE\nA different pre-existing preference.\n");
  const late = adjudicate(root, { task: "late_after_closure", sourceReview: "contract/audit.md", checkId: "charter_fidelity" });
  assert.notEqual(late.status, 0);
  assert.match(late.stderr, /already closed|frontier is sealed|already sealed/i);
  assert.equal(read(root, "run.json").active_repair, null);
});

test("1.5 contract rollback requires and preserves one adjudicated exact-scope docket", (t) => {
  const root = contract(t, "existing", true);
  put(root, "investigation/critic.md", "Overall verdict: REVISE\nThe evaluator contract contradicts the current investigation brief's frozen metric.\n");
  const sourceReceipt = role(root, { role: "brief_critic", task: "post_contract_source", inputs: ["contract/evaluator-contract.md"], outputs: ["investigation/critic.md"], gate_verdict: "REVISE" });
  const rawReason = "repairs/raw-post-contract.json";
  json(root, rawReason, { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: false, post_result_guard: null, finding: "Raw rollback request.", repair: "Bypass adjudication.", researcher_approval: null });
  const raw = run("revise-contract", root, rawReason);
  assert.notEqual(raw.status, 0);
  assert.match(raw.stderr, /requires active docket incident/i);
  assert.equal(read(root, "run.json").checkpoints.contract.receipt_sha256.length, 64);

  const opened = adjudicate(root, { task: "adjudicate_post_contract", sourceReview: "investigation/critic.md", sourceReviewReceipt: sourceReceipt, reviewRole: "brief_critic", checkId: "unsupported_claims", targetPhase: "contract", originPhase: "investigation", artifactPath: "contract/evaluator-contract.md", repairPaths: ["contract/evaluator-contract.md"] });
  assert.equal(opened.status, 0, opened.stderr);
  const docket = read(root, "run.json").active_repair;
  const revised = run("revise-contract", root, docket.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  const rolled = read(root, "run.json");
  assert.equal(rolled.phase, "contract");
  assert.ok(rolled.active_repair);
  assert.equal(fs.existsSync(path.join(root, "contract/evaluator-contract.md")), true, "target baseline must survive rollback for exact repair");
  put(root, "contract/evaluator-contract.md", "Correct frozen metric contract.\n");
  const closed = closeDocket(root, { task: "close_post_contract", reviewerTask: "contract_recheck_post_contract", reviewRole: "brief_critic", reviewOutput: "investigation/critic.md" });
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal(read(root, "run.json").active_repair, null);
  put(root, "investigation/critic.md", "Overall verdict: REVISE\nA late pre-existing preference.\n");
  const late = adjudicate(root, { task: "late_after_contract_revision", sourceReview: "investigation/critic.md", reviewRole: "brief_critic", checkId: "unsupported_claims", targetPhase: "contract", artifactPath: "contract/evaluator-contract.md", repairPaths: ["contract/evaluator-contract.md"] });
  assert.notEqual(late.status, 0);
  assert.match(late.stderr, /already closed|frontier is sealed|already sealed|not the current open phase|cannot originate a contract/i);
});

test("1.5 accepts a late blocker only when the repair itself introduced it", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "contract/generated.md", "incorrect\n");
  put(root, "contract/audit.md", "Overall verdict: REVISE\nInitial binding mismatch.\n");
  assert.equal(adjudicate(root, { task: "confirm_regression_fixture", sourceReview: "contract/audit.md" }).status, 0);
  put(root, "contract/generated.md", "changed with a new deterministic error\n");
  put(root, "contract/audit.md", "Overall verdict: REVISE\nThe repair introduced a deterministic machine failure.\n");
  const regression = adjudicate(root, { task: "confirm_repair_regression", disposition: "REPAIR_REGRESSION", sourceReview: "contract/audit.md", blockerClass: "repair_regression", repairPaths: ["contract/generated.md"], introducedByPaths: ["contract/generated.md"], strategy: { cause: "The first repair introduced a new deterministic defect.", changed_action: "Repair the introduced state before closure.", evidence_paths: ["contract/generated.md"] } });
  assert.equal(regression.status, 0, regression.stderr);
  const unchangedRegression = adjudicate(root, { task: "repeat_unchanged_regression", disposition: "REPAIR_REGRESSION", sourceReview: "contract/audit.md", blockerClass: "repair_regression", repairPaths: ["contract/generated.md"], introducedByPaths: ["contract/generated.md"], strategy: { action_code: "reconcile_exact_dependents", cause: "Claimed another regression without a new edit.", changed_action: "Attempt another correction.", evidence_paths: ["contract/generated.md"] } });
  assert.notEqual(unchangedRegression.status, 0);
  assert.match(unchangedRegression.stderr, /repeats without an intervening change|no newly bound non-review causal evidence/i);
  const stale = adjudicate(root, { task: "invent_unrelated_regression", disposition: "REPAIR_REGRESSION", sourceReview: "contract/audit.md", blockerClass: "repair_regression", repairPaths: ["contract/generated.md"], introducedByPaths: ["contract/never-changed.md"], strategy: { action_code: "reconcile_exact_dependents", cause: "Claimed recurrence.", changed_action: "Try another action.", evidence_paths: ["contract/generated.md"] } });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /outside the frozen repair scope|not tied to a changed repair artifact/i);
  const expanded = read(root, "run.json").active_repair;
  json(root, "repairs/proposals/incomplete-regression-closure.json", { schema_version: 1, docket_id: expanded.docket_id, resolved_fingerprints: [expanded.finding_fingerprints[0]], review_receipts: [], adjudicator_receipt: "role-receipts/missing.json", required_action: "Checkpoint contract." });
  const incomplete = run("close-repair", root, "repairs/proposals/incomplete-regression-closure.json");
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Invalid repair closure/i);
  const closed = closeDocket(root, { task: "close_with_regression", reviewerTask: "contract_recheck_regression" });
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal(read(root, "run.json").active_repair, null);
});

test("1.5 archives immutable adjudication authority and detects archive drift", (t) => {
  const root = newRun(t, "research", "existing", true);
  put(root, "contract/generated.md", "incorrect\n");
  put(root, "contract/audit.md", "Overall verdict: REVISE\nA durable evidence mismatch.\n");
  assert.equal(adjudicate(root, { task: "durable_authority", sourceReview: "contract/audit.md" }).status, 0);
  const docket = read(root, "run.json").active_repair;
  const incident = read(root, docket.incident.path);
  put(root, "contract/audit.md", "Original live review path was reused.\n");
  put(root, "contract/generated.md", "repair in progress\n");
  fs.rmSync(path.join(root, "role-receipts/durable_authority.json"));
  assert.equal(run("verify", root).status, 0, "immutable controller snapshots must preserve authority when live work paths advance");
  fs.rmSync(path.join(root, incident.source_review.path));
  const drifted = run("verify", root);
  assert.notEqual(drifted.status, 0);
  assert.match(drifted.stderr, /Archived convergence evidence drifted|Missing artifact/i);
});

test("1.5 migrates an active 1.4 repair without rewriting its evidence history", (t) => {
  const root = newRun(t, "research", "existing", false);
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [] });
  put(root, "contract/generated.md", "legacy defect\n");
  put(root, "repairs/legacy-evidence.md", "Preserved 1.4 reviewer finding.\n");
  const legacyIncident = { failure_class: "specialist_failure", logical_task_name: "protocol_auditor", summary: "The 1.4 run is in repair.", evidence_paths: ["repairs/legacy-evidence.md"], required_action: "Migrate and adjudicate the outstanding findings once." };
  json(root, "repairs/legacy-incident.json", { schema_version: 1, ...legacyIncident });
  assert.match(run("record-repair", root, "repairs/legacy-incident.json").stderr, /S1_CONVERGENCE_MIGRATION_REQUIRED/);
  seedLegacyRepair(root, "legacy-seeded-14", legacyIncident);
  const before = read(root, "run.json").repair_incidents;
  const migrated = run("migrate-convergence", root);
  assert.equal(migrated.status, 0, migrated.stderr);
  const record = read(root, "run.json");
  assert.equal(record.convergence_control.release, "1.5.0");
  assert.deepEqual(record.repair_incidents, before);
  assert.match(record.pending_adjudication.path, /migration-frontier-contract\.json$/);
  assert.ok(read(root, record.pending_adjudication.path).evidence.some((item) => item.source_path === before.at(-1).path));
  assert.equal(run("verify", root).status, 0);
  const repeatedMigration = run("migrate-convergence", root);
  assert.equal(repeatedMigration.status, 0, repeatedMigration.stderr);
  assert.deepEqual(read(root, "run.json").convergence_control, record.convergence_control);
  const opened = adjudicate(root, { task: "migrated_frontier_adjudication", sourceReview: record.pending_adjudication.path, artifactPath: "contract/generated.md" });
  assert.equal(opened.status, 0, opened.stderr);
  put(root, "contract/generated.md", "migrated repair\n");
  const closed = closeDocket(root, { task: "migrated_frontier_closure", reviewerTask: "migrated_contract_recheck" });
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal(run("verify", root).status, 0);
});

test("1.5 migration supports active 1.3 ledgers and retries an interrupted stage atomically", (t) => {
  const root = newRun(t, "research", "existing", false);
  const config = read(root, "contract/run-config.json");
  config.schema_version = 2;
  config.orchestration = { max_task_attempts: 2, max_repair_waves_per_gate: 1 };
  json(root, "contract/run-config.json", config);
  const record = read(root, "run.json");
  record.orchestration = config.orchestration;
  record.contract_parameters_sha256 = hash(root, "contract/run-config.json");
  json(root, "run.json", record);
  put(root, "repairs/legacy-evidence.md", "Preserved 1.3 failure.\n");
  const legacyIncident = { failure_class: "specialist_failure", logical_task_name: "protocol_auditor", summary: "The 1.3 run needs repair.", evidence_paths: ["repairs/legacy-evidence.md"], required_action: "Migrate the outstanding frontier." };
  seedLegacyRepair(root, "legacy-seeded-13", legacyIncident);
  const before = read(root, "run.json");
  const interrupted = runWithEnv({ SCIENTIST1_TEST_INTERRUPT_MIGRATION: "after_stage" }, "migrate-convergence", root);
  assert.notEqual(interrupted.status, 0);
  assert.equal(read(root, "run.json").convergence_control, undefined);
  assert.deepEqual(read(root, "run.json").repair_incidents, before.repair_incidents);
  const retried = run("migrate-convergence", root);
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(read(root, "run.json").convergence_control.migrated_from, 2);
  assert.equal(run("verify", root).status, 0);
});

test("1.5 migration assigns every frontier one terminal disposition and supersedes invalidated successors", (t) => {
  const root = contract(t, "existing", true);
  freezeAs14(root);
  put(root, "repairs/legacy-contract-evidence.md", "Legacy contract defect.\n");
  put(root, "repairs/legacy-investigation-evidence.md", "Legacy investigation defect.\n");
  seedLegacyRepair(root, "legacy-investigation-frontier", { failure_class: "specialist_failure", logical_task_name: "brief_critic", summary: "Investigation frontier.", evidence_paths: ["repairs/legacy-investigation-evidence.md"], required_action: "Adjudicate once." });
  const record = read(root, "run.json");
  const contractIncident = "repairs/incidents/legacy-contract-frontier.json";
  json(root, contractIncident, { schema_version: 1, at: "2026-08-31T11:00:00Z", phase: "contract", failure_class: "specialist_failure", logical_task_name: "contract_auditor", summary: "Contract frontier.", evidence: [{ path: "repairs/legacy-contract-evidence.md", sha256: hash(root, "repairs/legacy-contract-evidence.md") }], required_action: "Adjudicate once." });
  record.repair_incidents.push({ path: contractIncident, sha256: hash(root, contractIncident) });
  json(root, "run.json", record);
  const migrated = run("migrate-convergence", root);
  assert.equal(migrated.status, 0, migrated.stderr);
  let current = read(root, "run.json");
  assert.match(current.pending_adjudication.path, /migration-frontier-contract\.json$/);
  assert.equal(current.convergence_control.frontier_queue.length, 1);
  assert.match(current.convergence_control.frontier_queue[0].path, /migration-frontier-investigation\.json$/);
  const opened = adjudicate(root, { task: "migration_contract_supersession", sourceReview: current.pending_adjudication.path, reviewRole: "contract_auditor", checkId: "contradictions", targetPhase: "contract", artifactPath: "contract/evaluator-contract.md", repairPaths: ["contract/evaluator-contract.md"] });
  assert.equal(opened.status, 0, opened.stderr);
  const revised = run("revise-contract", root, read(root, "run.json").active_repair.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  current = read(root, "run.json");
  assert.equal(current.convergence_control.frontier_queue.length, 0);
  assert.equal(current.convergence_control.superseded_frontiers.length, 1);
  assert.match(current.convergence_control.superseded_frontiers[0].frontier.path, /migration-frontier-investigation\.json$/);
  assert.equal(run("verify", root).status, 0);
  const tampered = read(root, "run.json");
  tampered.convergence_control.superseded_frontiers[0].target_phase = "selection";
  json(root, "run.json", tampered);
  assert.match(run("verify", root).stderr, /Superseded migration frontier disposition is malformed|exactly one .* disposition/i);
});

test("1.5 rejects malformed checkpoint authority and repairs a controller-proven schema failure", (t) => {
  const root = newRun(t, "research", "existing", true);
  const wrongPhase = run("checkpoint", root, "investigation", "--input", "study-plan.md", "--output", "contract");
  assert.notEqual(wrongPhase.status, 0);
  assert.equal(read(root, "run.json").pending_adjudication, null, "a wrong-phase call must not mint repair authority");
  const missingDeclaration = run("checkpoint", root, "contract", "--input", "study-plan.md", "--output", "contract/audit.md");
  assert.notEqual(missingDeclaration.status, 0);
  assert.equal(read(root, "run.json").pending_adjudication, null, "an incomplete checkpoint request must not mint repair authority");

  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [{ source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" }] });
  const rejected = writeContractArtifacts(root, undefined, null, true);
  assert.notEqual(rejected.status, 0);
  const pending = read(root, "run.json").pending_adjudication;
  assert.ok(pending);
  const authority = read(root, pending.path);
  assert.equal(authority.authority_kind, "controller_checkpoint");
  assert.deepEqual(authority.absence_paths, []);

  const upgradedProposal = "repairs/proposals/upgrade-checkpoint-authority.json";
  json(root, upgradedProposal, {
    schema_version: 2,
    disposition: "CONFIRMED_DEFECT",
    target_phase: "contract",
    source_review: pending.path,
    source_review_receipt: null,
    adjudicator_receipt: "role-receipts/upgrade_checkpoint_authority.json",
    findings: [{ review_role: "contract_auditor", check_id: "i1_bindings_and_support", blocker_class: "evidence_mismatch", artifact_path: "contract/i1-verification-policy.json", locator: "schema_version", expected_state: "The frozen I1 policy has the release-supported schema.", observed_state: "The controller rejected its schema version.", evidence_paths: [pending.path, "contract/i1-verification-policy.json"], repair_paths: ["contract/i1-verification-policy.json"], introduced_by_paths: [] }],
    required_review_roles: ["contract_auditor"],
    reviewed_check_ids: { contract_auditor: GATE_CHECKLIST.review_roles.contract_auditor },
    strategy: null,
    required_action: "Do not upgrade machine authority into scientific authority.",
  });
  role(root, { role: "repair_adjudicator", task: "upgrade_checkpoint_authority", inputs: [pending.path, "contract/i1-verification-policy.json", read(root, "run.json").convergence_control.checklist.path], outputs: [upgradedProposal] });
  const upgraded = run("record-repair", root, upgradedProposal);
  assert.notEqual(upgraded.status, 0);
  assert.match(upgraded.stderr, /controller checkpoint authority.*(?:MECHANICAL_FAILURE|checkpoint_reviewer)/i);

  const crossPhaseProposal = "repairs/proposals/cross-phase-checkpoint-role.json";
  json(root, crossPhaseProposal, {
    schema_version: 2,
    disposition: "MECHANICAL_FAILURE",
    target_phase: "contract",
    source_review: pending.path,
    source_review_receipt: null,
    adjudicator_receipt: "role-receipts/cross_phase_checkpoint_role.json",
    findings: [{ review_role: "i4_judge", check_id: GATE_CHECKLIST.review_roles.i4_judge[0], blocker_class: "deterministic_machine_failure", artifact_path: "contract/i1-verification-policy.json", locator: "schema_version", expected_state: "The I1 policy schema is valid.", observed_state: "The I1 policy schema is invalid.", evidence_paths: [pending.path, "contract/i1-verification-policy.json"], repair_paths: ["contract/i1-verification-policy.json"], introduced_by_paths: [] }],
    required_review_roles: ["i4_judge"],
    reviewed_check_ids: { i4_judge: GATE_CHECKLIST.review_roles.i4_judge },
    strategy: null,
    required_action: "Do not borrow authority from a role bound to another phase.",
  });
  role(root, { role: "repair_adjudicator", task: "cross_phase_checkpoint_role", inputs: [pending.path, read(root, "run.json").convergence_control.checklist.path], outputs: [crossPhaseProposal] });
  const crossPhase = run("record-repair", root, crossPhaseProposal);
  assert.notEqual(crossPhase.status, 0);
  assert.match(crossPhase.stderr, /controller checkpoint authority must use only.*checkpoint_reviewer/i);

  const proposal = "repairs/proposals/repair-invalid-contract.json";
  const adjudicatorReceipt = "role-receipts/repair_invalid_contract.json";
  json(root, proposal, {
    schema_version: 2,
    disposition: "MECHANICAL_FAILURE",
    target_phase: "contract",
    source_review: pending.path,
    source_review_receipt: null,
    adjudicator_receipt: adjudicatorReceipt,
    findings: [{ review_role: "checkpoint_reviewer", check_id: "deterministic_checkpoint_validation", blocker_class: "deterministic_machine_failure", artifact_path: "contract/i1-verification-policy.json", locator: "schema_version", expected_state: "The frozen I1 policy has the release-supported schema.", observed_state: "The controller rejected its schema version.", evidence_paths: [pending.path, "contract/i1-verification-policy.json"], repair_paths: ["contract/i1-verification-policy.json"], introduced_by_paths: [] }],
    required_review_roles: ["checkpoint_reviewer"],
    reviewed_check_ids: { checkpoint_reviewer: GATE_CHECKLIST.review_roles.checkpoint_reviewer },
    strategy: null,
    required_action: "Repair only contract/i1-verification-policy.json, validate the cited schema failure, and close the exact docket.",
  });
  role(root, { role: "repair_adjudicator", task: "repair_invalid_contract", inputs: [pending.path, "contract/i1-verification-policy.json", read(root, "run.json").convergence_control.checklist.path], outputs: [proposal] });
  const opened = run("record-repair", root, proposal);
  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(read(root, "run.json").active_repair.scope_baseline[0].kind, "file");
  const repairedPolicy = read(root, "contract/i1-verification-policy.json");
  repairedPolicy.schema_version = 2;
  json(root, "contract/i1-verification-policy.json", repairedPolicy);
  const closed = closeDocket(root, { task: "close_invalid_contract", reviewerTask: "review_repaired_contract", reviewRole: "checkpoint_reviewer", reviewOutput: "repairs/reviews/checkpoint/review-repaired-contract.json" });
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal(run("verify", root).status, 0);
  const closedRecord = read(root, "run.json");
  const contractRoles = closedRecord.repair_closures.length && closedRecord.last_checkpoint === null ? read(root, closedRecord.repair_closures.at(-1).path).dependent_receipts.map((binding) => binding.source_path) : [];
  const checkpointArgs = ["--input", "study-plan.md", "--input", "request.md", "--input", "environment/bootstrap.json", "--input", "contract/approval.json", "--input", "contract/run-config.json", "--input", "contract/input-manifest.json", "--input", "contract/evaluator-contract.md", "--input", "contract/evaluator-manifest.json", "--input", "contract/i1-verification-policy.json", "--input", "contract/control-plane/i1-interpreter.mjs"];
  for (const output of ["contract", ...contractRoles]) checkpointArgs.push("--output", output);
  const promoted = run("checkpoint", root, "contract", ...checkpointArgs);
  assert.equal(promoted.status, 0, promoted.stderr || "the repaired contract and its exact regenerated dependents must advance the original checkpoint");
});

function writeContractArtifacts(root, evaluatorText = "Metric score; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n", childEnv = null, returnFailure = false) {
  const contractRevision = read(root, "run.json").contract_revision;
  const contractAttempt = 1;
  const suffix = contractRevision === 1 ? "" : `_r${contractRevision}`;
  const builderTask = `i1_verifier_builder${suffix}`;
  const auditorTask = `contract_auditor${suffix}`;
  put(root, "contract/evaluator-contract.md", evaluatorText);
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  const i1Contract = seedI1Contract({ root, mode: "research", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put, builderTask, builderAttempt: contractAttempt });
  if (returnFailure) {
    const invalidPolicy = read(root, "contract/i1-verification-policy.json");
    invalidPolicy.schema_version = 999;
    json(root, "contract/i1-verification-policy.json", invalidPolicy);
  }
  const outputs = ["contract"];
  const stylePolicy = fs.existsSync(path.join(root, "contract/paper-style-policy.json")) ? read(root, "contract/paper-style-policy.json") : null;
  const styleInputs = stylePolicy ? ["contract/paper-style-policy.json", ...stylePolicy.examples.map((example) => example.frozen_path)] : [];
  const roles = [
    { role: "i1_verifier_builder", task: builderTask, logical_task_name: "i1_verifier_builder", attempt: contractAttempt, inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs },
    { role: "contract_auditor", task: auditorTask, logical_task_name: "contract_auditor", attempt: contractAttempt, inputs: [...i1Contract.contractAuditorInputs, ...styleInputs], outputs: ["contract/audit.md"] },
  ];
  if (returnFailure) {
    const flags = ["--input", "study-plan.md"];
    for (const item of ["request.md", "environment/bootstrap.json", "contract/approval.json", "contract/run-config.json", "contract/input-manifest.json", "contract/evaluator-contract.md", "contract/evaluator-manifest.json", "contract/i1-verification-policy.json", "contract/control-plane/i1-interpreter.mjs"]) flags.push("--input", item);
    for (const output of [...outputs, ...roles.map((item) => role(root, item))]) flags.push("--output", output);
    return childEnv ? runWithEnv(childEnv, "checkpoint", root, "contract", ...flags) : run("checkpoint", root, "contract", ...flags);
  }
  checkpoint(root, "contract", outputs, roles, childEnv);
}

function contract(t, environmentSource = "existing", convergent = true, paperStyle = false) {
  const root = newRun(t, "research", environmentSource, convergent, paperStyle); put(root, "inputs/shared/data.csv", "x\n1\n"); put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [{ source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" }, { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" }] });
  writeContractArtifacts(root);
  return root;
}
const evaluatorInputs = () => ["contract/evaluator-contract.md", "contract/evaluator-manifest.json", "private/evaluator/evaluate.mjs"];
function evaluation(root, snapshot, destination, id, canonical = false, values = [1]) { const raw = `private/evaluator/raw/${id}.txt`; put(root, raw, `raw ${id}\n`); const repetitions = values.map((value, seed) => ({ seed, value })); const record = { schema_version: 1, snapshot_sha256: hash(root, snapshot), metric: { id: "score", name: "score", value: values.reduce((a, b) => a + b, 0) / values.length, unit: "points", direction: "maximize", estimand: "mean", estimand_parameters: {}, repetitions }, protocol: "approved", repetitions, command_or_procedure: "node evaluate.mjs", environment: { software: ["node"], hardware: "test" }, raw_output_ref: raw, raw_output_sha256: hash(root, raw), evaluated_at: "2026-08-22T12:00:00Z", status: "valid" }; record[canonical ? "snapshot_path" : "snapshot"] = snapshot; json(root, destination, record); return raw; }
function investigate(root, attempt = 1, briefText = null, protocolText = null, directionsText = null) {
  const retry = (logicalTaskName) => ({ task: attempt === 1 ? logicalTaskName : `${logicalTaskName}_a${attempt}`, logical_task_name: logicalTaskName, attempt });
  put(root, "evidence/search-log.jsonl", '{"query":"q"}\n'); put(root, "evidence/sources.jsonl", '{"id":"s","bibkey":"smith2025"}\n'); put(root, "investigation/notes/s.md"); put(root, "investigation/directions/d.md", directionsText ?? "investigation/directions/d.md\n"); put(root, "investigation/protocol-audit.md", protocolText ?? "Overall verdict: PASS\n"); put(root, "investigation/brief.md", briefText ?? "investigation/brief.md\n"); put(root, "investigation/references.bib"); put(root, "investigation/critic.md", "Overall verdict: PASS\n");
  checkpoint(root, "investigation", ["evidence", "investigation"], [{ role: "literature_mapper", ...retry("literature_mapper"), inputs: ["study-plan.md"], outputs: ["evidence/search-log.jsonl", "evidence/sources.jsonl"] }, { role: "evidence_reader", ...retry("evidence_reader"), inputs: ["study-plan.md", "evidence/sources.jsonl"], outputs: ["investigation/notes/s.md"] }, { role: "evidence_synthesizer", ...retry("evidence_synthesizer"), inputs: ["study-plan.md", "investigation/notes"], outputs: ["investigation/directions/d.md"] }, { role: "protocol_auditor", ...retry("protocol_auditor"), inputs: ["study-plan.md", "investigation/directions"], outputs: ["investigation/protocol-audit.md"] }, { role: "brief_writer", ...retry("brief_writer"), inputs: ["study-plan.md", "investigation/directions", "investigation/protocol-audit.md", "evidence/sources.jsonl"], outputs: ["investigation/brief.md", "investigation/references.bib"] }, { role: "brief_critic", ...retry("brief_critic"), inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["investigation/critic.md"] }]);
}
function discover(root, change = null, receipt = {}) {
  put(root, "discovery/ideas.jsonl", '{"id":"i1","kind":"conservative"}\n{"id":"i2","kind":"unconventional"}\n'); put(root, "discovery/idea-critique.jsonl", change === "stop-below-min" ? '{"idea_id":"i1","status":"rejected"}\n{"idea_id":"i2","status":"rejected"}\n' : '{"idea_id":"i1","status":"eligible"}\n{"idea_id":"i2","status":"rejected"}\n'); const base = "discovery/nodes/n1"; put(root, `${base}/idea.md`); json(root, `${base}/shared-input-manifest.json`, { schema_version: 1, files: [read(root, "contract/input-manifest.json").files[0]] }); put(root, `${base}/experimental-log.md`); put(root, `${base}/method-report.md`); put(root, `${base}/legitimacy-audit.md`, "Overall verdict: PASS\n"); put(root, `${base}/snapshots/v1/method.txt`, "method\n"); const raw = evaluation(root, `${base}/snapshots/v1`, `${base}/evaluations/v1.json`, "node"); if (change === "expose") { const value = read(root, `${base}/evaluations/v1.json`); value.heldout_rows = []; json(root, `${base}/evaluations/v1.json`, value); } json(root, "discovery/index.json", { nodes: [{ id: "n1", path: base, status: "eligible", evaluation_path: `${base}/evaluations/v1.json`, legitimacy_verdict_path: `${base}/legitimacy-audit.md` }], retained: ["n1"], ...(change === "stop-below-min" ? { stop_reason: "evidence_saturation" } : {}) });
  const candidateInputs = ["study-plan.md", "investigation/brief.md", `${base}/idea.md`, `${base}/shared-input-manifest.json`]; if (change === "leak") candidateInputs.push("private/evaluator/evaluate.mjs");
  const roles = [{ role: "ideator", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["discovery/ideas.jsonl"] }, { role: "idea_critic", inputs: ["study-plan.md", "discovery/ideas.jsonl"], outputs: ["discovery/idea-critique.jsonl"] }, { role: "candidate_developer", task: "candidate", inputs: candidateInputs, outputs: [`${base}/experimental-log.md`, `${base}/method-report.md`, `${base}/snapshots/v1`], ...receipt }, { role: "evaluator", task: "node_evaluator", inputs: ["study-plan.md", `${base}/snapshots`, ...evaluatorInputs()], outputs: [`${base}/evaluations/v1.json`, raw] }, { role: "legitimacy_auditor", inputs: ["study-plan.md", `${base}/idea.md`, `${base}/method-report.md`, `${base}/evaluations`], outputs: [`${base}/legitimacy-audit.md`] }];
  if (change === "duplicate") roles.push({ role: "ideator", task: "second_ideator", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["discovery/ideas.jsonl"] });
  return checkpointResult(root, "discovery", ["discovery"], roles);
}

function select(root, changed = false, defect = null) {
  const source = "discovery/nodes/n1/snapshots/v1"; put(root, "selection/selection.md"); put(root, "selection/selection-audit.md", "Overall verdict: PASS\n"); copy(root, `${source}/method.txt`, "selection/selected/method.txt"); json(root, "selection/selected/manifest.json", { files: ["method.txt"] }); const sourceHash = treeHash(path.join(root, source), ["method.txt"]); const selectedHash = treeHash(path.join(root, "selection/selected"), ["method.txt"]); json(root, "selection/lineage.json", { source_node_id: "n1", source_snapshot_path: source, source_snapshot_sha256: sourceHash, selected_snapshot_sha256: selectedHash, legitimacy_verdict_path: "discovery/nodes/n1/legitimacy-audit.md", evaluation_path: "discovery/nodes/n1/evaluations/v1.json", metric_name: "score", metric_direction: "maximize", rank: 1, tie_break_evidence: [] }); if (changed) put(root, "selection/selected/method.txt", "different\n"); const raw = evaluation(root, "selection/selected", "selection/canonical-evaluation.json", "canonical", true, [1, 1]);
  if (defect === "metric") { const value = read(root, "selection/canonical-evaluation.json"); value.metric.unit = "wrong-units"; json(root, "selection/canonical-evaluation.json", value); }
  const canonicalInputs = ["study-plan.md", "selection/selected", ...evaluatorInputs()];
  if (defect === "downstream") { put(root, "paper/claims.jsonl", "{}\n"); canonicalInputs.push("paper/claims.jsonl"); }
  return checkpointResult(root, "selection", ["selection"], [{ role: "selection_analyst", inputs: ["study-plan.md", "discovery/index.json"], outputs: ["selection/selection.md", "selection/lineage.json", "selection/selected"] }, { role: "selection_auditor", inputs: ["study-plan.md", "discovery/index.json", "selection/selection.md", "selection/lineage.json"], outputs: ["selection/selection-audit.md"] }, { role: "evaluator", task: "canonical_evaluator", inputs: canonicalInputs, outputs: ["selection/canonical-evaluation.json", raw] }]);
}
function ablate(root) { json(root, "ablation/plan.json", { ablations: [{ id: "a1" }] }); put(root, "ablation/variants/a1/method.txt"); const raw = evaluation(root, "ablation/variants/a1", "ablation/evaluations/a1.json", "ablation"); json(root, "ablation/results.json", { ablations: [{ id: "a1", status: "valid" }] }); put(root, "ablation/report.md"); checkpoint(root, "ablation", ["ablation"], [{ role: "ablation_designer", inputs: ["study-plan.md", "selection/selected"], outputs: ["ablation/plan.json"] }, { role: "ablation_implementer", inputs: ["study-plan.md", "selection/selected", "ablation/plan.json"], outputs: ["ablation/variants/a1"] }, { role: "evaluator", task: "ablation_evaluator", inputs: ["study-plan.md", "ablation/variants", ...evaluatorInputs()], outputs: ["ablation/evaluations/a1.json", raw] }, { role: "ablation_analyst", inputs: ["study-plan.md", "ablation/plan.json", "ablation/evaluations", "ablation/results.json"], outputs: ["ablation/results.json", "ablation/report.md"] }]); }
const tagged = () => ["\\documentclass{article}", "\\newcommand{\\coe}[1]{}", "\\begin{document}", "Study score 1 \\coe{C1}; prior score 2 with \\& escape \\coe{C2}.", "\\caption{Method. \\coe{C3}}", "\\begin{tabular}{c}Conclusion \\coe{C4} \\\\ \\end{tabular}", "\\end{document}", ""].join("\n");
function styleReview(root, round, stage, paperPath, visualNotAssessed = stage === "writing") {
  const criteria = Object.fromEntries(["ai_tells", "prose", "structure", "formatting", "visual_fidelity"].map((criterion) => [criterion, { status: criterion === "visual_fidelity" && visualNotAssessed ? "NOT_ASSESSED" : "PASS", evidence: [criterion === "visual_fidelity" && visualNotAssessed ? "No rendered comparison was completed." : `${paperPath} matches the approved ${criterion} instruction.`] }]));
  const relative = `paper/style-reviews/review-${String(round).padStart(2, "0")}.json`;
  json(root, relative, { schema_version: 1, round, stage, style_status: "CONFORMANT", policy_sha256: hash(root, "contract/paper-style-policy.json"), paper_path: paperPath, paper_sha256: hash(root, paperPath), criteria, findings: [] });
  return relative;
}
function write(root, wrong = false) {
  const scientificInputs = ["study-plan.md", "investigation/brief.md", "selection/canonical-evaluation.json", "ablation/results.json"];
  put(root, "paper/representation.md"); json(root, "paper/grounding-report.json", { status: "PASS", factual_sentence_count: 4, resolvable_tag_count: 4, grounding_ratio: wrong ? 0.8 : 1, unresolved_claim_ids: [] }); put(root, "paper/critic.md", "Overall verdict: PASS\n"); put(root, "paper/paper-tagged.tex", tagged()); put(root, "paper/references.bib", "@article{smith2025,title={Prior},author={Smith},year={2025}}\n");
  const outputs = ["paper/representation.md", "paper/grounding-report.json", "paper/critic.md", "paper/paper-tagged.tex", "paper/references.bib"];
  const roles = [{ role: "writer", inputs: scientificInputs, outputs: ["paper/representation.md", "paper/paper-tagged.tex", "paper/references.bib"] }, { role: "paper_critic", inputs: ["study-plan.md", "paper/representation.md", "paper/paper-tagged.tex"], outputs: ["paper/grounding-report.json", "paper/critic.md"] }];
  if (fs.existsSync(path.join(root, "contract/paper-style-policy.json"))) {
    const policy = read(root, "contract/paper-style-policy.json");
    const styleInputs = ["contract/paper-style-policy.json", ...policy.examples.map((example) => example.frozen_path)];
    put(root, "paper/style-drafts/draft-01-tagged.tex", tagged());
    const review = styleReview(root, 1, "writing", "paper/style-drafts/draft-01-tagged.tex");
    outputs.push("paper/style-drafts/draft-01-tagged.tex", review);
    roles.splice(0, 1,
      { role: "writer", task: "initial_writer", inputs: [...scientificInputs, ...styleInputs], outputs: ["paper/representation.md", "paper/references.bib", "paper/style-drafts/draft-01-tagged.tex"] },
      { role: "paper_style_auditor", task: "paper_style_review_1", inputs: [...styleInputs, "paper/style-drafts/draft-01-tagged.tex"], outputs: [review] },
      { role: "writer", task: "style_finalizer", inputs: [...scientificInputs, "paper/style-drafts/draft-01-tagged.tex", review], outputs: ["paper/paper-tagged.tex"] },
    );
  }
  return checkpointResult(root, "writing", outputs, roles);
}
function line(id) { return tagged().split(/\r?\n/).findIndex((value) => value.includes(`\\coe{${id}}`)) + 1; }
function verifyPhase(root, change = null) {
  put(root, "paper/paper-verified-tagged.tex", tagged()); put(root, "paper/paper.tex", tagged().replaceAll(/\\coe\{[^{}]+\}/g, ""));
  const claims = [{ claim_id: "C1", paper_location: `paper/paper-verified-tagged.tex:${line("C1")}`, sentence: "Study score 1", claim_type: "numerical", origin: "study", status: "SUPPORTED" }, { claim_id: "C2", paper_location: `paper/paper-verified-tagged.tex:${line("C2")}`, sentence: "prior score 2 with \\& escape", claim_type: "numerical", origin: "prior_work", status: "SUPPORTED" }, { claim_id: "C3", paper_location: `paper/paper-verified-tagged.tex:${line("C3")}`, sentence: "Method.", claim_type: "methodological", status: "SUPPORTED" }, { claim_id: "C4", paper_location: `paper/paper-verified-tagged.tex:${line("C4")}`, sentence: "Conclusion", claim_type: "conclusion", status: "SUPPORTED" }];
  const provenance = claims.map((claim) => ({ claim_id: claim.claim_id, paper_location: claim.paper_location, sentence: claim.sentence, claim_type: claim.claim_type, status: "SUPPORTED", evidence: claim.claim_id === "C1" ? [{ kind: "metric", target: "selection/canonical-evaluation.json", locator: "/metric/value", sha256: hash(root, "selection/canonical-evaluation.json") }] : claim.claim_id === "C2" ? [{ kind: "source", target: "bib:smith2025", locator: null, sha256: hash(root, "paper/references.bib") }] : claim.claim_id === "C3" ? [{ kind: "artifact", target: "selection/selected/method.txt", locator: "L1", sha256: hash(root, "selection/selected/method.txt") }] : [{ kind: "inference", target: "C1,C2", locator: null, sha256: null }] }));
  if (change === "missing") claims.pop(); if (change === "extra") claims.push({ claim_id: "CX", paper_location: "paper/paper-verified-tagged.tex:1", sentence: "extra", claim_type: "citation", status: "SUPPORTED" }); if (change === "sentence") claims[0].sentence = "Sentence absent from paper"; if (change === "mapping") provenance[0].sentence = "Different sentence"; if (change === "target") provenance[0].evidence[0] = { kind: "metric", target: "selection/missing.json", locator: "/metric/value", sha256: "0".repeat(64) }; if (change === "cycle") provenance[0].evidence.push({ kind: "inference", target: "C4", locator: null, sha256: null }); if (change === "study_source") provenance[0].evidence = [{ kind: "source", target: "bib:smith2025", locator: null, sha256: hash(root, "paper/references.bib") }];
  put(root, "paper/claims.jsonl", `${claims.map(JSON.stringify).join("\n")}\n`); put(root, "paper/provenance.jsonl", `${provenance.map(JSON.stringify).join("\n")}\n`); put(root, "paper/verification.md", "Overall verdict: PASS\n"); put(root, "paper/paper.pdf", minimalPdf()); json(root, "delivery/visual-inspection.json", { pdf_path: "paper/paper.pdf", pdf_sha256: hash(root, "paper/paper.pdf"), page_count: 1, renderer: "test", timestamp: "2026-08-22T12:00:00Z", checked_pages: change === "visual" ? [] : [1], detected_defects: [], verdict: "PASS" });
  const outputs = ["paper/claims.jsonl", "paper/verification.md", "paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf", "delivery/visual-inspection.json"];
  const roles = [{ role: "claim_verifier", inputs: ["study-plan.md", "paper/paper-tagged.tex", "paper/claims.jsonl"], outputs: ["paper/claims.jsonl", "paper/verification.md"] }, { role: "writer", task: "final_writer", inputs: ["paper/claims.jsonl", "paper/verification.md"], outputs: ["paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf"] }];
  if (fs.existsSync(path.join(root, "contract/paper-style-policy.json"))) {
    const policy = read(root, "contract/paper-style-policy.json");
    const review = styleReview(root, 2, "delivery", "paper/paper.tex", change === "style-visual");
    outputs.push(review);
    roles.push({ role: "paper_style_auditor", task: "paper_style_delivery_review", inputs: ["contract/paper-style-policy.json", ...policy.examples.map((example) => example.frozen_path), "paper/paper.tex", "paper/paper.pdf"], outputs: [review] });
  }
  return checkpointResult(root, "verification", outputs, roles);
}
function i3(evidence = "paper/references.bib") { const fields = { title: "Prior", author: "Smith", year: 2025 }; return { verdict: "PASS", entries: [{ bibkey: "smith2025", populated_fields: fields, resolved_primary_record: fields, retrieved_at: "2026-08-22T12:00:00Z", field_comparisons: Object.entries(fields).map(([field, value]) => ({ field, expected: value, actual: value, matches: true })), status: "verified", evidence_path: evidence }], totals: { entries: 1, verified: 1, unresolved: 0, mismatch: 0 } }; }
const report = (verdict = "PASS") => `Overall verdict: ${verdict}\nI1 verdict: ${verdict}\nI2 verdict: ${verdict}\nI3 verdict: ${verdict}\nI4 verdict: ${verdict}\nclaim_provenance verdict: ${verdict}\n${verdict === "FAIL" ? "Rollback phase: verification\n" : ""}`;
const reproduction = () => "## Selected snapshot\nselection/selected and hash.\n## Environment\nenvironment/bootstrap.json.\n## Inputs and access limits\nShared input; private evaluator.\n## Procedure\nRun evaluator.\n## Expected canonical output\nselection/canonical-evaluation.json.\n## Verification\nRun `<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs verify <run>` and inspect manifest.\n";
function audit(root, change = null) {
  const selectedSnapshotSha256 = read(root, "selection/canonical-evaluation.json").snapshot_sha256;
  const i1Audit = seedI1Audit({ root, mode: "research", selectedSnapshotSha256, evidencePath: "selection/canonical-evaluation.json", hash, json, put, ...(change === "lineage-canonical" ? { canonicalValue: 2, lineageValue: 1 } : {}) });
  json(root, "audit/i3.json", i3()); json(root, "audit/claim-provenance.json", { verdict: "PASS", total_numerical_claims: 2, assessed_count: 2, supported_count: 2, coverage_ratio: 1, mismatches: [], unavailable_items: [], evidence_paths: ["paper/provenance.jsonl"] }); const roles = [{ role: "i1_score_auditor", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "contract/control-plane/i1-interpreter.mjs", "paper/paper.tex", "paper/paper.pdf", "selection/selected", "selection/canonical-evaluation.json", ...evaluatorInputs()], outputs: i1Audit.outputs }, { role: "i3_reference_auditor", inputs: ["study-plan.md", "paper/references.bib"], outputs: ["audit/i3.json"] }, { role: "claim_provenance_auditor", inputs: ["study-plan.md", "paper/claims.jsonl", "paper/provenance.jsonl", "selection/canonical-evaluation.json"], outputs: ["audit/claim-provenance.json"] }]; const votes = [];
  for (const panel of ["i2", "i4"]) { for (let n = 1; n <= 3; n++) { const file = `audit/${panel}/judge-${n}.json`; votes.push(file); if (panel === "i2") json(root, file, { judge_id: `${panel}-${n}`, selected_snapshot_sha256: hash(root, "selection/selected"), evaluator_contract_sha256: hash(root, "contract/evaluator-contract.md"), checked_categories: ["evaluator_import"], flagged: false, category: null, evidence_paths: ["selection/canonical-evaluation.json"], rationale: "No violation.", verdict: "PASS" }); else json(root, file, { judge_id: `${panel}-${n}`, paper_method_locations: ["paper.tex:5"], selected_artifacts: [{ path: "selection/selected/method.txt", sha256: hash(root, "selection/selected/method.txt") }], checked_categories: ["method_class_mismatch"], checked_core_mechanisms: ["method"], flagged: false, category: null, evidence_paths: ["selection/selected/method.txt"], rationale: "Aligned.", verdict: "PASS" }); roles.push({ role: `${panel}_judge`, task: `${panel}_${n}`, inputs: panel === "i2" ? ["study-plan.md", "contract/input-manifest.json", "selection/selected", "selection/canonical-evaluation.json", ...evaluatorInputs()] : ["study-plan.md", "paper/paper.tex", "selection/selected"], outputs: [file] }); } json(root, `audit/${panel}/aggregate.json`, { status: "ASSESSED", judge_count: 3, threshold: 2, flag_votes: 0, flagged: false }); }
  put(root, "audit/report.md", report()); put(root, "delivery/reproduction.md", reproduction()); roles.push({ role: "audit_reporter", inputs: ["study-plan.md", "audit/i1.json", "audit/i3.json", "audit/claim-provenance.json", ...votes], outputs: ["audit/i2/aggregate.json", "audit/i4/aggregate.json", "audit/report.md"] }, { role: "reproduction_writer", inputs: ["study-plan.md", "environment/bootstrap.json", "selection/selected/manifest.json", "selection/canonical-evaluation.json", "audit/report.md"], outputs: ["delivery/reproduction.md"] });
  if (change === "reporter-extra") { json(root, "audit/reporter-extra.json", { verdict: "PASS" }); roles.find((role) => role.role === "audit_reporter").outputs.push("audit/reporter-extra.json"); }
  if (change === "i1") json(root, "audit/i1.json", { verdict: "PASS" }); if (change === "i3") json(root, "audit/i3.json", { verdict: "PASS" }); if (change === "claim") json(root, "audit/claim-provenance.json", { verdict: "PASS" }); if (change === "vote") json(root, "audit/i2/judge-1.json", { flagged: false }); if (change === "report") put(root, "audit/report.md", ""); if (change === "reproduction") put(root, "delivery/reproduction.md", "");
  return checkpointResult(root, "audit", ["audit", "delivery/reproduction.md"], roles);
}

function deliver(root) {
  for (const [source, destination] of [["study-plan.md", "study-plan.md"], ["investigation/brief.md", "investigation-brief.md"], ["paper/paper.tex", "paper.tex"], ["paper/paper.pdf", "paper.pdf"], ["paper/references.bib", "references.bib"], ["paper/provenance.jsonl", "provenance.jsonl"], ["selection/selected/manifest.json", "selected-method/manifest.json"], ["selection/selected/method.txt", "selected-method/method.txt"], ["selection/canonical-evaluation.json", "canonical-evaluation.json"], ["ablation/report.md", "ablation-report.md"], ["paper/verification.md", "verification.md"], ["audit/report.md", "audit-report.md"], ["delivery/reproduction.md", "reproduction.md"], ["delivery/visual-inspection.json", "visual-inspection.json"]]) copy(root, source, `deliverables/${destination}`);
  if (fs.existsSync(path.join(root, "contract/paper-style-policy.json"))) {
    const deliveryReview = fs.readdirSync(path.join(root, "paper/style-reviews")).map((name) => `paper/style-reviews/${name}`).find((relative) => read(root, relative).stage === "delivery");
    copy(root, deliveryReview, "deliverables/paper-style-review.json");
  }
  assert.equal(run("manifest", root).status, 0); assert.equal(run("set-outcome", root, "positive").status, 0); checkpoint(root, "complete", ["deliverables"]);
}
function through(t, phase = "complete", environmentSource = "existing", paperStyle = false) { const root = contract(t, environmentSource, true, paperStyle); if (phase === "contract") return root; investigate(root); if (phase === "investigation") return root; let result = discover(root); assert.equal(result.status, 0, result.stderr); if (phase === "discovery") return root; result = select(root); assert.equal(result.status, 0, result.stderr); if (phase === "selection") return root; ablate(root); if (phase === "ablation") return root; result = write(root); assert.equal(result.status, 0, result.stderr); if (phase === "writing") return root; result = verifyPhase(root); assert.equal(result.status, 0, result.stderr); if (phase === "verification") return root; result = audit(root); assert.equal(result.status, 0, result.stderr); if (phase === "audit") return root; deliver(root); return root; }

test("paper style is approval-bound, separately owned, and checked again on the delivered paper", (t) => {
  const root = through(t, "complete", "existing", true);
  const approval = read(root, "contract/approval.json");
  assert.equal(approval.schema_version, 2);
  assert.equal(approval.paper_style_policy_sha256, fileHash(path.join(root, "contract/paper-style-policy.json")));
  assert.equal(read(root, "paper/style-reviews/review-01.json").stage, "writing");
  assert.equal(read(root, "paper/style-reviews/review-02.json").stage, "delivery");
  assert.equal(fs.readFileSync(path.join(root, "deliverables/paper-style-review.json"), "utf8"), fs.readFileSync(path.join(root, "paper/style-reviews/review-02.json"), "utf8"));
  assert.equal(fs.readFileSync(path.join(root, "paper/style-drafts/draft-01-tagged.tex"), "utf8"), fs.readFileSync(path.join(root, "paper/paper-tagged.tex"), "utf8"));
  assert.equal(run("verify", root).status, 0);
});

test("paper style rejects a fourth review file", (t) => {
  const root = through(t, "ablation", "existing", true);
  json(root, "paper/style-reviews/review-04.json", {});
  assert.match(write(root).stderr, /Unexpected paper-style review entry: review-04\.json/);
});

test("paper style requires rendered fidelity and denies style inputs to scientific roles", (t) => {
  const root = through(t, "writing", "existing", true);
  assert.match(verifyPhase(root, "style-visual").stderr, /must assess visual_fidelity/);
  put(root, "scratch/forbidden-style-read.jsonl", '{"query":"style"}\n');
  const receipt = role(root, { role: "literature_mapper", task: "forbidden_style_reader", inputs: ["study-plan.md", "inputs/style/01-reference.txt"], outputs: ["scratch/forbidden-style-read.jsonl"], allowed_external_sources: ["scholarly_web"] });
  assert.match(run("verify-role", root, receipt).stderr, /restricted or evaluator-only input inputs\/style\/01-reference\.txt/);
});

test("1.5.2 continues an active 1.5.1 approval and specialist receipt", (t) => {
  const root = newRun(t);
  const approval = read(root, "contract/approval.json");
  approval.schema_version = 1;
  delete approval.paper_style_policy_sha256;
  json(root, "contract/approval.json", approval);
  const record = read(root, "run.json");
  record.approval_sha256 = hash(root, "contract/approval.json");
  json(root, "run.json", record);
  put(root, "inputs/shared/data.csv", "x\n1\n");
  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [{ source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" }, { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" }] });
  writeContractArtifacts(root);
  put(root, "evidence/search-log.jsonl", '{"query":"legacy"}\n');
  const receiptPath = role(root, { role: "literature_mapper", task: "legacy_1_5_1_mapper", inputs: ["study-plan.md"], outputs: ["evidence/search-log.jsonl"], allowed_external_sources: ["scholarly_web"] });
  const receipt = read(root, receiptPath);
  const launch = read(root, receipt.launch_record);
  const legacyRoleContractSha256 = "86225dbd5291f424841dfb3ac1d3009503d5de04a66ba067f3e64090a789249e";
  launch.role_contract_sha256 = legacyRoleContractSha256;
  json(root, receipt.launch_record, launch);
  const acceptedPath = `role-attempts/${launch.logical_task_name}/${launch.work_key_sha256}/attempt-${launch.attempt}.json`;
  const accepted = read(root, acceptedPath);
  accepted.launch_record_sha256 = hash(root, receipt.launch_record);
  json(root, acceptedPath, accepted);
  receipt.role_contract_sha256 = legacyRoleContractSha256;
  receipt.launch_record_sha256 = hash(root, receipt.launch_record);
  json(root, receiptPath, receipt);
  const verified = run("verify-role", root, receiptPath);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).reusable, true);
});

function bundle(root, unavailable = null) { const values = [["paper.any", "paper", ["I1", "I3", "I4", "claim_provenance"], "shared"], ["method.any", "method", ["I2", "I4"], "shared"], ["evaluation.any", "evaluation", ["I1", "I2", "claim_provenance"], "shared"], ["evaluator.any", "evaluator", ["I2"], "evaluator_only"], ["references.any", "reference", ["I3", "claim_provenance"], "shared"]]; const items = values.map(([name, artifact_type, intended_checks, access_class]) => { const frozen_path = `source-bundle/${name}`; put(root, frozen_path, `${name}\n`); return { supplied_path: `/arbitrary/${name}`, frozen_path, artifact_type, sha256: hash(root, frozen_path), intended_checks, access_class, available: true, missing_reason: null }; }); if (unavailable) items.push({ supplied_path: `/arbitrary/missing-${unavailable}`, frozen_path: `source-bundle/missing-${unavailable}`, artifact_type: "other", sha256: null, intended_checks: [unavailable], access_class: "shared", available: false, missing_reason: `${unavailable} input missing` }); return items; }
function externalContract(t, unavailable = null) { const root = newRun(t, "external_audit"); json(root, "contract/input-manifest.json", { schema_version: 1, files: [] }); json(root, "contract/source-bundle-manifest.json", { schema_version: 1, items: bundle(root, unavailable) }); put(root, "contract/audit.md", "Overall verdict: PASS\n"); const i1Contract = seedI1Contract({ root, mode: "external_audit", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put }); checkpoint(root, "contract", ["contract"], [{ role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs }, { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"] }]); return root; }
function externalContractResult(root) { const i1Contract = seedI1Contract({ root, mode: "external_audit", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put }); return checkpointResult(root, "contract", ["contract"], [{ role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs }, { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"] }]); }
function externalAudit(root, falselyPassI1 = false) {
  const items = read(root, "contract/source-bundle-manifest.json").items; const paths = (check) => items.filter((item) => item.available && item.intended_checks.includes(check)).map((item) => item.frozen_path); const unavailable = (check) => items.filter((item) => !item.available && item.intended_checks.includes(check)).map((item) => item.frozen_path); const e = paths("I1")[0];
  const missingI1 = unavailable("I1");
  const i1Audit = seedI1Audit({ root, mode: "external_audit", selectedSnapshotSha256: null, evidencePath: missingI1.length && !falselyPassI1 ? "contract/source-bundle-manifest.json" : e, unavailableItem: missingI1[0], hash, json, put, notAssessed: missingI1.length > 0 && !falselyPassI1 });
  const fields = { title: "External" }; json(root, "audit/i3.json", { verdict: "PASS", entries: [{ bibkey: "external", populated_fields: fields, resolved_primary_record: fields, retrieved_at: "2026-08-22T12:00:00Z", field_comparisons: [{ field: "title", expected: "External", actual: "External", matches: true }], status: "verified", evidence_path: paths("I3")[0] }], totals: { entries: 1, verified: 1, unresolved: 0, mismatch: 0 } }); json(root, "audit/claim-provenance.json", { verdict: "PASS", total_numerical_claims: 0, assessed_count: 0, supported_count: 0, coverage_ratio: 1, mismatches: [], unavailable_items: [], evidence_paths: [paths("claim_provenance")[0]] });
  const roles = [{ role: "i1_score_auditor", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "contract/control-plane/i1-interpreter.mjs", ...paths("I1")], outputs: i1Audit.outputs }, { role: "i3_reference_auditor", inputs: ["study-plan.md", ...paths("I3")], outputs: ["audit/i3.json"] }, { role: "claim_provenance_auditor", inputs: ["study-plan.md", ...paths("claim_provenance")], outputs: ["audit/claim-provenance.json"] }]; const votes = [];
  for (const panel of ["i2", "i4"]) { for (let n = 1; n <= 3; n++) { const file = `audit/${panel}/judge-${n}.json`; votes.push(file); if (panel === "i2") json(root, file, { judge_id: `${panel}-${n}`, selected_snapshot_sha256: "a".repeat(64), evaluator_contract_sha256: "b".repeat(64), checked_categories: ["evaluator_import"], flagged: false, category: null, evidence_paths: [paths("I2")[0]], rationale: "Checked.", verdict: "PASS" }); else json(root, file, { judge_id: `${panel}-${n}`, paper_method_locations: ["source"], selected_artifacts: [{ path: paths("I4")[0], sha256: hash(root, paths("I4")[0]) }], checked_categories: ["method_class_mismatch"], checked_core_mechanisms: ["method"], flagged: false, category: null, evidence_paths: [paths("I4")[0]], rationale: "Checked.", verdict: "PASS" }); roles.push({ role: `${panel}_judge`, task: `${panel}_${n}`, inputs: ["study-plan.md", ...paths(panel.toUpperCase())], outputs: [file] }); } json(root, `audit/${panel}/aggregate.json`, { status: "ASSESSED", judge_count: 3, threshold: 2, flag_votes: 0, flagged: false }); }
  const auditVerdicts = missingI1.length && !falselyPassI1
    ? "Overall verdict: NOT_ASSESSED\nI1 verdict: NOT_ASSESSED\nI2 verdict: PASS\nI3 verdict: PASS\nI4 verdict: PASS\nclaim_provenance verdict: PASS\n"
    : report();
  put(root, "audit/report.md", auditVerdicts); put(root, "delivery/reproduction.md", "## Source bundle\ncontract/source-bundle-manifest.json.\n## Inputs and access limits\nFrozen inputs.\n## Audit procedure\nRun audits.\n## Expected audit output\naudit/report.md.\n## Verification\nRun `<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs verify <run>` and inspect manifest.\n"); roles.push({ role: "audit_reporter", inputs: ["study-plan.md", "audit/i1.json", "audit/i3.json", "audit/claim-provenance.json", ...votes], outputs: ["audit/i2/aggregate.json", "audit/i4/aggregate.json", "audit/report.md"] }, { role: "reproduction_writer", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/source-bundle-manifest.json", "audit/report.md"], outputs: ["delivery/reproduction.md"] }); return checkpointResult(root, "audit", ["audit", "delivery/reproduction.md"], roles);
}

test("existing compatible shared tools are recorded without installation", (t) => {
  const root = contract(t);
  assert.ok(read(root, "environment/bootstrap.json").tools.every((tool) => tool.status === "not_required" || tool.source === "existing"));
  const verified = run("verify", root);
  assert.equal(verified.status, 0, verified.stderr);
});

test("checkpoint retries recover journal-only and journal-plus-receipt interruptions", (t) => {
  for (const interruption of ["after_journal", "after_receipt"]) {
    const root = newRun(t);
    put(root, "inputs/shared/data.csv", "x\n1\n");
    put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
    json(root, "contract/input-manifest.json", { schema_version: 1, files: [{ source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" }, { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" }] });
    assert.throws(() => writeContractArtifacts(root, undefined, { SCIENTIST1_TEST_INTERRUPT_CHECKPOINT: interruption }), /Injected checkpoint interruption/);
    const interrupted = read(root, "run.json");
    assert.equal(interrupted.pending_checkpoint.phase, "contract");
    assert.equal(fs.existsSync(path.join(root, "receipts/contract.json")), interruption === "after_receipt");
    const interruptedVerify = run("verify", root);
    if (interruption === "after_journal") assert.equal(interruptedVerify.status, 0, interruptedVerify.stderr);
    else assert.notEqual(interruptedVerify.status, 0, "an unanchored candidate receipt must not verify as promoted");

    const retry = run("checkpoint", root, "contract",
      "--input", "study-plan.md",
      "--input", "request.md",
      "--input", "environment/bootstrap.json",
      "--input", "contract/approval.json",
      "--input", "contract/run-config.json",
      "--input", "contract/input-manifest.json",
      "--input", "contract/evaluator-contract.md",
      "--input", "contract/evaluator-manifest.json",
      "--input", "contract/i1-verification-policy.json",
      "--input", "contract/control-plane/i1-interpreter.mjs",
      "--output", "contract",
      "--output", "role-receipts/i1_verifier_builder.json",
      "--output", "role-receipts/contract_auditor.json");
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(read(root, "run.json").pending_checkpoint, null);
    const verified = run("verify", root);
    assert.equal(verified.status, 0, verified.stderr);
  }
});

test("an interrupted invalidation rolls forward exactly once on retry", (t) => {
  const root = through(t, "investigation");
  put(root, "investigation/brief.md", "The investigation brief has a bounded defect.\n");
  const docket = openRepairDocket(root, { task: "interruptible_investigation_repair", targetPhase: "investigation", repairPaths: ["investigation/brief.md"] });
  const interrupted = runWithEnv({ SCIENTIST1_TEST_INTERRUPT_INVALIDATION: "after_journal" }, "invalidate", root, "investigation", docket.incident.path);
  assert.notEqual(interrupted.status, 0);
  assert.match(interrupted.stderr, /Injected invalidation interruption/);
  assert.equal(read(root, "run.json").pending_invalidation.kind, "invalidate");
  assert.match(run("verify", root).stderr, /interrupted invalidate/i);

  const recovered = run("invalidate", root, "investigation", docket.incident.path);
  assert.equal(recovered.status, 0, recovered.stderr);
  const record = read(root, "run.json");
  assert.equal(record.pending_invalidation, null);
  assert.equal(record.repair_waves.investigation, 1);
  assert.equal(record.invalidation_roots.length, 1);
  assert.equal(fs.readdirSync(path.join(root, "receipts/superseded")).length, 1);
  const verified = run("verify", root);
  assert.equal(verified.status, 0, verified.stderr);
});

test("the CoE rejects a launch whose model or effort differs from the frozen role policy", (t) => {
  const root = newRun(t);
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [] });
  put(root, "contract/evaluator-contract.md", "Metric and protocol.\n");
  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  const i1Contract = seedI1Contract({ root, mode: "research", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put });
  const result = checkpointResult(root, "contract", ["contract"], [{ role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs }, { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"], model: "wrong-model", reasoning_effort: "low" }]);
  assert.match(result.stderr, /does not match the frozen Scientist1 model policy/);
});

test("portable run-local tools support a complete verified chain", (t) => {
  const root = through(t, "complete", "portable_official");
  const verified = run("verify", root);
  assert.equal(verified.status, 0, verified.stderr);
  assert.ok(read(root, "environment/bootstrap.json").tools.every((tool) => tool.path.startsWith("environment/tools/")));
});

test("a pinned specialist dependency with a declared lockfile is promotable", (t) => {
  const root = through(t, "investigation");
  const lock = "discovery/nodes/n1/requirements.lock";
  put(root, lock, "numpy==2.3.2\n");
  const outputs = ["discovery/nodes/n1/experimental-log.md", "discovery/nodes/n1/method-report.md", "discovery/nodes/n1/snapshots/v1", lock];
  const environment_changes = [{ name: "numpy", version: "2.3.2", scope: "run_local", source: "pypi", lock_or_manifest: lock, reason: "Required by the candidate implementation" }];
  assert.equal(discover(root, null, { outputs, environment_changes }).status, 0);
});

test("incomplete bootstrap and unrecorded or unsafe dependency changes block promotion", (t) => {
  const missing = newRun(t);
  fs.unlinkSync(path.join(missing, "environment/bootstrap.json"));
  json(missing, "contract/input-manifest.json", { schema_version: 1, files: [] });
  put(missing, "contract/evaluator-contract.md", "Metric and protocol.\n");
  put(missing, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(missing, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(missing, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(missing, "contract/audit.md", "Overall verdict: PASS\n");
  const contractInputs = ["request.md", "study-plan.md", "environment/bootstrap.json", "contract/run-config.json", "contract/input-manifest.json", "contract/evaluator-contract.md", "contract/evaluator-manifest.json"];
  assert.throws(() => checkpointResult(missing, "contract", ["contract"], [{ role: "contract_auditor", inputs: contractInputs, outputs: ["contract/audit.md"] }]), /Missing artifact|Cannot read valid JSON/);

  for (const change of [
    { name: "numpy", version: "latest", scope: "run_local", source: "pypi", reason: "test" },
    { name: "numpy", version: "2.3.2", scope: "global", source: "pypi", reason: "test" },
  ]) {
    const root = through(t, "investigation");
    const lock = "discovery/nodes/n1/requirements.lock";
    put(root, lock, "numpy==2.3.2\n");
    change.lock_or_manifest = lock;
    const outputs = ["discovery/nodes/n1/experimental-log.md", "discovery/nodes/n1/method-report.md", "discovery/nodes/n1/snapshots/v1", lock];
    assert.match(discover(root, null, { outputs, environment_changes: [change] }).stderr, /Invalid environment change/);
  }
  const omitted = through(t, "investigation");
  assert.match(discover(omitted, null, { omit_environment_changes: true }).stderr, /Malformed role receipt/);
});

test("complete research chain verifies and retains hash-ledger drift detection", (t) => { const root = through(t); const before = fs.readFileSync(path.join(root, "run.json"), "utf8"); assert.equal(run("verify", root).status, 0); assert.equal(fs.readFileSync(path.join(root, "run.json"), "utf8"), before); fs.appendFileSync(path.join(root, "paper/paper.pdf"), "drift"); assert.match(run("verify", root).stderr, /Evidence changed after verification checkpoint/); });
test("only COMPLETE plus PASS launches promote, and output ownership is exclusive", (t) => { for (const [execution_status, gate_verdict] of [["BLOCKED", "PASS"], ["FAILED", "PASS"], ["COMPLETE", "REVISE"], ["COMPLETE", "FAIL"], ["COMPLETE", "NOT_ASSESSED"]]) { const root = through(t, "investigation"); const result = discover(root, null, { execution_status, gate_verdict }); assert.match(result.stderr, /expected execution_status COMPLETE and gate_verdict PASS/); } const root = through(t, "investigation"); assert.match(discover(root, "duplicate").stderr, /multiple owners/); });
test("external-source permissions are bound to the supervisor launch", (t) => { const root = through(t, "investigation"); assert.match(discover(root, null, { allowed_external_sources: [], receipt_allowed_external_sources: ["web search"] }).stderr, /Allowed external sources.*differ from supervisor launch record/); });
test("evaluator access, outputs, and feedback are sanitized", (t) => { const leak = through(t, "investigation"); assert.match(discover(leak, "leak").stderr, /evaluator-only input/); const exposed = through(t, "investigation"); assert.match(discover(exposed, "expose").stderr, /Unknown candidate-visible field.*heldout_rows/); const root = contract(t); put(root, "private/evaluator/feedback.json", JSON.stringify({ schema_version: 1, execution_status: "COMPLETE", public_metric: { name: "score", value: 1, unit: "points", direction: "maximize" }, safe_failure_category: null, candidate_visible_note: "Done." })); assert.equal(run("sanitize-feedback", root, "private/evaluator/feedback.json", "discovery/nodes/n1/feedback/v1.json").status, 0); put(root, "private/evaluator/bad.json", JSON.stringify({ schema_version: 1, execution_status: "COMPLETE", public_metric: null, safe_failure_category: null, candidate_visible_note: "Done.", heldout_rows: [] })); assert.match(run("sanitize-feedback", root, "private/evaluator/bad.json", "discovery/nodes/n1/feedback/bad.json").stderr, /heldout_rows/); });
test("selection lineage is byte-bound to an eligible sealed snapshot", (t) => { const root = through(t, "discovery"); assert.match(select(root, true).stderr, /differs from lineage source/); });
test("selection preflight binds the canonical metric to frozen I1 policy and rejects downstream inputs", (t) => {
  const metric = through(t, "discovery");
  assert.match(select(metric, false, "metric").stderr, /Canonical metric does not match its frozen policy/);
  assert.equal(fs.existsSync(path.join(metric, "receipts/selection.json")), false);
  const downstream = through(t, "discovery");
  assert.match(select(downstream, false, "downstream").stderr, /declares downstream input paper\/claims\.jsonl while producing selection evidence/);
  assert.equal(fs.existsSync(path.join(downstream, "receipts/selection.json")), false);
});
test("grounding, claim inventory, exact sentences, evidence resolution, cycles, and study/prior-work sources are enforced", (t) => { const wrong = through(t, "ablation"); assert.match(write(wrong, true).stderr, /grounding ratio is inconsistent/); const base = through(t, "writing"); for (const [change, expected] of [["missing", /claim inventory differs/], ["extra", /claim inventory differs/], ["sentence", /does not occur/], ["mapping", /differs from its claim record/], ["target", /Missing artifact/], ["cycle", /Circular inference/], ["study_source", /canonical or ablation metric/]]) { const clone = fs.mkdtempSync(path.join(os.tmpdir(), "coe-claims-")); t.after(() => fs.rmSync(clone, { recursive: true, force: true })); fs.cpSync(base, clone, { recursive: true }); assert.match(verifyPhase(clone, change).stderr, expected); } assert.equal(verifyPhase(base).status, 0); });
test("substantive audits, visual inspection, reproduction, and reporter ownership reject bare or overbroad records", (t) => { const base = through(t, "verification"); for (const [change, expected] of [["i1", /Malformed task-adaptive I1 aggregate/], ["i3", /I3.*non-empty entries/], ["claim", /total_numerical_claims/], ["vote", /Malformed substantive I2 vote/], ["report", /Audit report is empty/], ["reproduction", /Reproduction guide/], ["reporter-extra", /Audit reporter owns an invalid report set/]]) { const clone = fs.mkdtempSync(path.join(os.tmpdir(), "coe-audit-")); t.after(() => fs.rmSync(clone, { recursive: true, force: true })); fs.cpSync(base, clone, { recursive: true }); assert.match(audit(clone, change).stderr, expected); } const visual = through(t, "writing"); assert.match(verifyPhase(visual, "visual").stderr, /must record every checked page/); });
test("I1 lineage must bind the displayed claim to the recomputed canonical estimate", (t) => { const root = through(t, "verification"); assert.match(audit(root, "lineage-canonical").stderr, /Malformed I1 lineage metric/); });
test("external bundles preserve evidence-limited audits without false PASS", (t) => {
  const root = externalContract(t);
  assert.equal(externalAudit(root).status, 0);
  copy(root, "contract/source-bundle-manifest.json", "deliverables/source-bundle-manifest.json");
  copy(root, "audit/report.md", "deliverables/audit-report.md");
  copy(root, "delivery/reproduction.md", "deliverables/reproduction.md");
  assert.equal(run("manifest", root).status, 0);
  assert.equal(run("set-outcome", root, "audit_passed").status, 0);
  checkpoint(root, "complete", ["deliverables"]);
  const verified = run("verify", root);
  assert.equal(verified.status, 0, verified.stderr);

  const empty = newRun(t, "external_audit");
  json(empty, "contract/input-manifest.json", { schema_version: 1, files: [] });
  json(empty, "contract/source-bundle-manifest.json", { schema_version: 1, items: [] });
  put(empty, "contract/audit.md", "Overall verdict: PASS\n");
  assert.match(externalContractResult(empty).stderr, /non-empty items/);

  const none = newRun(t, "external_audit");
  json(none, "contract/input-manifest.json", { schema_version: 1, files: [] });
  json(none, "contract/source-bundle-manifest.json", { schema_version: 1, items: bundle(none).map((item) => ({ ...item, available: false, sha256: null, missing_reason: "missing" })) });
  put(none, "contract/audit.md", "Overall verdict: PASS\n");
  assert.equal(externalContractResult(none).status, 0);

  const falsePass = externalContract(t, "I1");
  assert.match(externalAudit(falsePass, true).stderr, /reports PASS even though required source-bundle inputs are unavailable/);
  const notAssessed = externalContract(t, "I1");
  const unavailableResult = externalAudit(notAssessed);
  assert.equal(unavailableResult.status, 0, unavailableResult.stderr);
});
test("1.3 removes the obsolete pause and attention control path", (t) => { const root = contract(t); assert.equal(read(root, "run.json").phase, "investigation"); for (const args of [["set-state", root, "paused"], ["set-attention", root, "attention.md"], ["clear-attention", root]]) assert.notEqual(run(...args).status, 0); assert.equal(read(root, "run.json").state, "running"); assert.equal(run("verify", root).status, 0); const record = read(root, "run.json"); record.phase = "selection"; json(root, "run.json", record); assert.match(run("verify", root).stderr, /expected investigation, received selection/); });
test("scientific stop reasons cannot waive frozen discovery minima", (t) => {
  const root = contract(t);
  investigate(root);
  assert.match(discover(root, "stop-below-min").stderr, /too few eligible ideas/);
});
test("future model routing changes preserve the verified contract and original route", async (t) => {
  const root = contract(t);
  const original = fs.readFileSync(path.join(root, "environment/model-routing.json"));
  const newer = { models: TEST_CATALOG.models.map((item) => ({ ...item, slug: `${item.slug}-next` })) };
  const active = await ensureRunRouting(root, { catalog: newer });
  assert.match(active.tiers.strong.model, /-next$/);
  assert.deepEqual(fs.readFileSync(path.join(root, "environment/model-routing.json")), original);
  assert.equal(run("verify", root).status, 0);
});
test("native launch records produce hash-bound reusable receipts and reject drift or duplicate logical work", async (t) => {
  const root = contract(t);
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-grants-"));
  t.after(() => fs.rmSync(stateHome, { recursive: true, force: true }));

  async function completedAttempt(task, attempt, output) {
    const prepared = await prepareRoleLaunch({
      run_path: root,
      task_name: task,
      logical_task_name: "literature_map_round_1",
      attempt,
      role: "literature_mapper",
      declared_inputs: ["study-plan.md"],
      declared_outputs: [output],
      allowed_external_sources: ["scholarly_web"],
      task_brief: { objective: "Map the first literature round", context: "Investigation is ready", acceptance_gate: "Save one search-log artifact", constraints: "Use only declared study context", upstream_summary: [{ input_path: "study-plan.md", summary: "Approved research plan" }] },
    }, { catalog: TEST_CATALOG, stateHome });
    consumeLaunchToken(prepared.task_name, { stateHome });
    put(root, output, `{\"attempt\":${attempt}}\n`);
    const launch = read(root, prepared.launch_record);
    json(root, `role-receipts/${task}.json`, {
      schema_version: 1,
      role: launch.role,
      agent_task: task,
      logical_task_name: launch.logical_task_name,
      attempt: launch.attempt,
      contract_revision: launch.contract_revision,
      charter_revision: launch.charter_revision,
      predecessor: launch.predecessor,
      model: launch.model,
      reasoning_effort: launch.reasoning_effort,
      model_routing_sha256: launch.model_routing_sha256,
      role_contract_sha256: launch.role_contract_sha256,
      assignment_sha256: launch.assignment_sha256,
      task_brief_sha256: launch.task_brief_sha256,
      gate_schema_version: launch.gate_schema_version,
      fork_turns: "none",
      started_at: launch.started_at,
      completed_at: new Date(Date.parse(launch.started_at) + 1_000).toISOString(),
      declared_inputs: launch.declared_inputs,
      input_artifacts: launch.input_artifacts,
      allowed_external_sources: launch.allowed_external_sources,
      external_results_used: [],
      environment_changes: [],
      outputs: launch.declared_outputs,
      output_artifacts: [{ path: output, sha256: hash(root, output) }],
      undeclared_inputs_accessed: [],
      limitations: [],
      handoff: { summary: "Literature round completed.", decisions: [], evidence_ids: [output], conflicts: [], unresolved: [], recommended_next_action: "Review the saved search log." },
      execution_status: "COMPLETE",
      gate_verdict: "PASS",
      launch_record: prepared.launch_record,
      launch_record_sha256: hash(root, prepared.launch_record),
    });
    return `role-receipts/${task}.json`;
  }

  const first = await completedAttempt("literature_map_a1", 1, "evidence/search-log-a1.jsonl");
  const reusable = run("verify-role", root, first);
  assert.equal(reusable.status, 0, reusable.stderr);
  assert.equal(JSON.parse(reusable.stdout).reusable, true);

  fs.appendFileSync(path.join(root, "evidence/search-log-a1.jsonl"), "drift\n");
  assert.match(run("verify-role", root, first).stderr, /Artifact changed after its role binding|hash/i);
  put(root, "evidence/search-log-a1.jsonl", '{"attempt":1}\n');
  assert.equal(run("verify-role", root, first).status, 0);

  await assert.rejects(
    completedAttempt("literature_map_a2", 2, "evidence/search-log-a1.jsonl"),
    (error) => error.code === "S1_LOGICAL_TASK_COMPLETE",
  );
});
test("invalidation preserves evidence and detects every archived-tree mutation class", (t) => {
  const root = through(t, "investigation");
  fs.appendFileSync(path.join(root, "investigation/brief.md"), "drift\n");
  const docket = openRepairDocket(root, { task: "archive_investigation_repair", targetPhase: "investigation", repairPaths: ["investigation/brief.md"] });
  assert.equal(run("invalidate", root, "investigation", docket.incident.path).status, 0);
  assert.equal(read(root, "run.json").phase, "investigation");
  assert.equal(JSON.parse(run("verify", root).stdout).last_checkpoint, "contract");
  const [archive] = fs.readdirSync(path.join(root, "receipts/superseded"));
  const archived = path.join(root, "receipts/superseded", archive, "artifacts/investigation");
  const brief = path.join(archived, "brief.md");
  const original = fs.readFileSync(brief);

  fs.appendFileSync(brief, "tamper");
  assert.match(run("verify", root).stderr, /Invalid invalidation root|Superseded artifact changed/);
  fs.writeFileSync(brief, original);
  assert.equal(run("verify", root).status, 0);

  const added = path.join(archived, "added.md");
  fs.writeFileSync(added, "added\n");
  assert.match(run("verify", root).stderr, /Invalid invalidation root|Superseded artifact changed/);
  fs.rmSync(added);
  assert.equal(run("verify", root).status, 0);

  const renamed = path.join(archived, "brief-renamed.md");
  fs.renameSync(brief, renamed);
  assert.match(run("verify", root).stderr, /Invalid invalidation root|Superseded artifact changed/);
  fs.renameSync(renamed, brief);
  assert.equal(run("verify", root).status, 0);

  fs.rmSync(brief);
  assert.match(run("verify", root).stderr, /Invalid invalidation root|Superseded artifact changed/);
  fs.writeFileSync(brief, original);
  assert.equal(run("verify", root).status, 0);

  const link = path.join(archived, "brief-link.md");
  try {
    fs.symlinkSync("brief.md", link);
    assert.match(run("verify", root).stderr, /Invalid invalidation root|Symlinked path|Symlinks cannot|Superseded artifact changed/);
    fs.rmSync(link);
    assert.equal(run("verify", root).status, 0);
  } catch (error) {
    if (!new Set(["EPERM", "EACCES", "ENOTSUP"]).has(error?.code)) throw error;
    t.diagnostic(`symlink mutation case unavailable on this platform: ${error.code}`);
  }
});

test("repeated downstream repair archives every affected chain and continues the same run", (t) => {
  const root = through(t, "investigation");
  put(root, "investigation/directions/d.md", "The first investigation gate defect requires one bounded repair.\n");
  const firstDocket = openRepairDocket(root, { task: "first_investigation_repair", targetPhase: "investigation", repairPaths: ["investigation/directions/d.md"] });
  const repaired = run("invalidate", root, "investigation", firstDocket.incident.path);
  assert.equal(repaired.status, 0, repaired.stderr);
  investigate(root, 2, "Corrected investigation brief revision two.\n", null, "Corrected investigation direction revision two.\n");
  const discovery = discover(root);
  assert.equal(discovery.status, 0, discovery.stderr);
  const secondDocket = openRepairDocket(root, {
    task: "second_investigation_repair",
    targetPhase: "investigation",
    repairPaths: ["investigation/directions/d.md"],
    findingEvidencePaths: ["discovery/index.json"],
  });
  const secondRepair = run("invalidate", root, "investigation", secondDocket.incident.path);
  assert.equal(secondRepair.status, 0, secondRepair.stderr);
  const repairingRecord = read(root, "run.json");
  assert.equal(repairingRecord.state, "repairing");
  assert.equal(repairingRecord.phase, "investigation");
  assert.equal(repairingRecord.last_checkpoint, "contract");
  assert.equal(repairingRecord.repair_waves.investigation, 2);
  assert.equal(repairingRecord.invalidation_roots.length, 2);
  assert.equal(fs.existsSync(path.join(root, "receipts/investigation.json")), false);
  assert.equal(fs.existsSync(path.join(root, "terminal")), false);
  assert.equal(run("verify", root).status, 0);
  investigate(root, 3, "Corrected investigation brief revision three.\n", null, "Corrected investigation direction revision three.\n");
  assert.equal(read(root, "run.json").phase, "discovery");
  assert.equal(run("verify", root).status, 0);
});

test("a completed delivery is immutable and cannot be reopened as repair", (t) => {
  const root = through(t, "complete");
  put(root, "repairs/final-limit.md", "The final delivery gate requires a correction beyond its frozen repair budget.\n");
  const exhausted = run("invalidate", root, "complete", "repairs/final-limit.md");
  assert.notEqual(exhausted.status, 0);
  const terminalRecord = read(root, "run.json");
  assert.equal(terminalRecord.state, "complete");
  assert.equal(terminalRecord.phase, "complete");
  assert.equal(terminalRecord.last_checkpoint, "complete");
  const completedVerified = run("verify", root);
  assert.equal(completedVerified.status, 0, completedVerified.stderr);
});

test("a result-blind contract defect repairs and re-audits inside the same run", (t) => {
  const root = contract(t);
  const requestBefore = read(root, "run.json").request_sha256;
  const planBefore = read(root, "run.json").study_plan_sha256;
  const docket = openRepairDocket(root, { task: "adjudicate_contract_r1", targetPhase: "contract", repairPaths: ["contract/evaluator-contract.md"] });
  const revised = run("revise-contract", root, docket.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.phase, "contract");
  assert.equal(record.state, "repairing");
  assert.equal(record.request_sha256, requestBefore);
  assert.equal(record.study_plan_sha256, planBefore);
  assert.equal(fs.existsSync(path.join(root, "contract/run-config.json")), true);
  assert.equal(fs.existsSync(path.join(root, "contract/input-manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "private/evaluator/evaluate.mjs")), true);
  assert.equal(run("verify", root).status, 0);

  installTestRouting(root);
  writeContractArtifacts(root, "Corrected approved primary metric; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n");
  const resumed = read(root, "run.json");
  assert.equal(resumed.phase, "investigation");
  assert.equal(resumed.contract_revision, 2);
  assert.equal(run("verify", root).status, 0);
});

test("a rejected pre-checkpoint contract is repaired without restarting the study", (t) => {
  const root = newRun(t);
  put(root, "inputs/shared/data.csv", "x\n1\n");
  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [
    { source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" },
    { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" },
  ] });
  put(root, "contract/evaluator-contract.md", "Invented readiness score.\n");
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(root, "contract/audit.md", "Overall verdict: REVISE\nFinding classification: AUTOMATIC_REPAIR\nRemove the invented score.\n");
  role(root, { role: "contract_auditor", inputs: ["request.md", "study-plan.md", "contract/evaluator-contract.md", "contract/evaluator-manifest.json"], outputs: ["contract/audit.md"], gate_verdict: "REVISE" });
  const docket = openRepairDocket(root, { task: "adjudicate_pre_checkpoint_contract", targetPhase: "contract", repairPaths: ["contract/evaluator-contract.md"] });
  const revised = run("revise-contract", root, docket.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.phase, "contract");
  assert.equal(record.last_checkpoint, null);
  assert.equal(fs.existsSync(path.join(root, "role-launches/contract_auditor.json")), true, "accepted launch evidence is immutable across repair");
  assert.equal(fs.existsSync(path.join(root, "private/evaluator/evaluate.mjs")), true, "frozen evaluator-only input must survive generated-contract repair");
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/contract/audit.md")), true);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/role-receipts/contract_auditor.json")), true);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/role-launches/contract_auditor.json")), true);
  assert.equal(run("verify", root).status, 0);

  put(root, "contract/evaluator-contract.md", "Approved primary metric; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n");
  const closed = closeDocket(root, { task: "close_pre_checkpoint_contract", reviewerTask: "review_pre_checkpoint_contract" });
  assert.equal(closed.status, 0, closed.stderr);
  installTestRouting(root);
  writeContractArtifacts(root, "Approved primary metric; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n");
  assert.equal(read(root, "run.json").contract_revision, 2);
  assert.equal(run("verify", root).status, 0);
});

test("pre-result contract stabilization can make multiple minimal revisions without exhausting the run", (t) => {
  const root = contract(t);
  const requestBefore = read(root, "run.json").request_sha256;
  const planBefore = read(root, "run.json").study_plan_sha256;

  const firstDocket = openRepairDocket(root, { task: "adjudicate_contract_stabilization_r1", targetPhase: "contract", repairPaths: ["contract/evaluator-contract.md"] });
  const first = run("revise-contract", root, firstDocket.incident.path);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(read(root, "run.json").repair_waves, {});

  put(root, "contract/evaluator-contract.md", "Corrected primary metric; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n");
  const firstPolicy = read(root, "contract/i1-verification-policy.json");
  firstPolicy.bindings.evaluator_contract.sha256 = hash(root, "contract/evaluator-contract.md");
  json(root, "contract/i1-verification-policy.json", firstPolicy);
  const firstClosed = closeDocket(root, { task: "close_contract_stabilization_r1", reviewerTask: "review_contract_stabilization_r1", reviewRole: "brief_critic", reviewOutput: "investigation/critic.md" });
  assert.equal(firstClosed.status, 0, firstClosed.stderr);
  put(root, "contract/causal-evidence.json", '{"checkpoint_revision":2}\n');
  const closure = read(root, read(root, "run.json").repair_closures.at(-1).path);
  const checkpointArgs = ["--input", "study-plan.md", "--input", "request.md", "--input", "environment/bootstrap.json", "--input", "contract/approval.json", "--input", "contract/run-config.json", "--input", "contract/input-manifest.json", "--input", "contract/evaluator-contract.md", "--input", "contract/evaluator-manifest.json", "--input", "contract/i1-verification-policy.json", "--input", "contract/control-plane/i1-interpreter.mjs"];
  for (const output of ["contract", ...closure.dependent_receipts.map((binding) => binding.source_path)]) checkpointArgs.push("--output", output);
  const promoted = run("checkpoint", root, "contract", ...checkpointArgs);
  assert.equal(promoted.status, 0, promoted.stderr);
  const secondDocket = openRepairDocket(root, {
    task: "adjudicate_contract_stabilization_r2",
    targetPhase: "contract",
    repairPaths: ["contract/evaluator-contract.md"],
    findingEvidencePaths: ["contract/causal-evidence.json"],
    strategy: { cause: "The newly checkpointed contract exposes a distinct argv binding defect.", changed_action: "Correct the exact binding under the new checkpoint authority.", evidence_paths: ["contract/causal-evidence.json"] },
  });
  const second = run("revise-contract", root, secondDocket.incident.path);
  assert.equal(second.status, 0, second.stderr);

  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 3);
  assert.equal(record.state, "repairing");
  assert.equal(record.phase, "contract");
  assert.equal(record.request_sha256, requestBefore);
  assert.equal(record.study_plan_sha256, planBefore);
  assert.deepEqual(record.repair_waves, {}, "pre-result contract cleanup must not consume a downstream repair wave");
  assert.equal(fs.existsSync(path.join(root, "terminal/incomplete.json")), false);
  assert.equal(run("verify", root).status, 0);
});

test("contract result-awareness is derived from saved evidence instead of an agent guess", (t) => {
  const root = newRun(t);
  put(root, "inputs/shared/data.csv", "x\n1\n");
  put(root, "private/evaluator/generated-evaluator.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [
    { source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" },
  ] });
  put(root, "contract/evaluator-contract.md", "Approved deterministic evaluation.\n");
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/generated-evaluator.mjs", sha256: hash(root, "private/evaluator/generated-evaluator.mjs"), access_class: "evaluator_only" }] });
  json(root, "repairs/agent-claimed-awareness.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: true, post_result_guard: "invalidate_and_rerun", finding: "The generated policy uses the wrong input hash.", repair: "Correct the hash before candidate work.", researcher_approval: null });
  assert.match(run("revise-contract", root, "repairs/agent-claimed-awareness.json").stderr, /requires active docket incident/i);
  const docket = openRepairDocket(root, { task: "derive_contract_result_awareness", targetPhase: "contract", repairPaths: ["contract/evaluator-contract.md"] });
  const repaired = run("revise-contract", root, docket.incident.path);
  assert.equal(repaired.status, 0, repaired.stderr);
  const repairedRecord = read(root, "run.json");
  assert.equal(repairedRecord.contract_revision, 2);
  assert.deepEqual(repairedRecord.repair_waves, {});
  assert.equal(repairedRecord.state, "repairing");
  assert.equal(fs.existsSync(path.join(root, "terminal/incomplete.json")), false);
  const revisionEvent = fs.readFileSync(path.join(root, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse).findLast((event) => event.event === "contract_revision_started");
  assert.equal(revisionEvent.result_aware, false, "the controller must derive result awareness from saved evidence");
  assert.equal(run("verify", root).status, 0);
});

test("a late contract repair after investigation is controller-classified and archives prior work", (t) => {
  const root = through(t, "investigation");
  const docket = openRepairDocket(root, { task: "late_contract_repair_after_investigation", targetPhase: "contract", repairPaths: ["contract/evaluator-contract.md"] });
  const revised = run("revise-contract", root, docket.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(fs.existsSync(path.join(root, "investigation")), false);
  assert.equal(fs.existsSync(path.join(root, "evidence")), false);
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/investigation/brief.md")), true);
  assert.equal(run("verify", root).status, 0);
});

test("a result-aware evaluator repair archives every successor and reruns from contract", (t) => {
  const root = through(t, "selection");
  ablate(root);
  const selectedBefore = fileHash(path.join(root, "selection/canonical-evaluation.json"));
  const docket = openRepairDocket(root, { task: "result_aware_contract_repair", targetPhase: "contract", repairPaths: ["contract/i1-verification-policy.json"] });
  const revised = run("revise-contract", root, docket.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.last_checkpoint, null);
  assert.deepEqual(record.checkpoints, {});
  assert.equal(fs.existsSync(path.join(root, "selection/canonical-evaluation.json")), false);
  assert.equal(fs.existsSync(path.join(root, "role-launches/canonical_evaluator.json")), true, "accepted launch evidence is immutable across repair");
  const archiveRoot = path.join(root, record.invalidation_roots.at(-1).path);
  const metadata = JSON.parse(fs.readFileSync(path.join(archiveRoot, "invalidation.json"), "utf8"));
  const archivedSelection = metadata.archived_artifacts.find((item) => item.path === "selection");
  assert.ok(archivedSelection);
  assert.equal(fileHash(path.join(root, archivedSelection.archived_path, "canonical-evaluation.json")), selectedBefore);
  assert.equal(run("verify", root).status, 0);
});

test("post-result contract revisions preserve every repair cycle without a terminal ceiling", (t) => {
  const root = through(t, "selection");
  ablate(root);
  const firstDocket = openRepairDocket(root, { task: "result_aware_contract_r1", targetPhase: "contract", repairPaths: ["contract/i1-verification-policy.json"] });
  const first = run("revise-contract", root, firstDocket.incident.path);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(read(root, "run.json").repair_waves.contract, 1);

  const record = read(root, "run.json");
  assert.equal(record.state, "repairing");
  assert.equal(record.phase, "contract");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.repair_waves.contract, 1);
  put(root, "contract/evaluator-contract.md", "An unadjudicated second edit cannot manufacture another repair cycle.\n");
  json(root, "repairs/result-aware-r2.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: true, post_result_guard: "invalidate_and_rerun", finding: "A second result-aware policy defect remains.", repair: "Correct the remaining defect and rerun affected work.", researcher_approval: null });
  assert.match(run("revise-contract", root, "repairs/result-aware-r2.json").stderr, /requires active docket incident|controller-owned active incident/i);
  assert.equal(fs.existsSync(path.join(root, "terminal")), false);
});

test("automatic repair cannot relax the researcher charter or skip result-aware rollback", (t) => {
  const charter = contract(t);
  json(charter, "repairs/bad-charter.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: true, result_aware: false, post_result_guard: null, finding: "Constraint conflict.", repair: "Relax the constraint.", researcher_approval: null });
  assert.match(run("revise-contract", charter, "repairs/bad-charter.json").stderr, /cannot change the researcher charter/);
  const resultAware = through(t, "selection");
  json(resultAware, "repairs/bad-rollback.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: true, post_result_guard: null, finding: "Verifier defect.", repair: "Patch in place.", researcher_approval: null });
  assert.match(run("revise-contract", resultAware, "repairs/bad-rollback.json").stderr, /must invalidate and rerun every successor/);
});

test("partial uncheckpointed candidate work cannot survive a contract revision", (t) => {
  const root = contract(t);
  put(root, "discovery/nodes/partial/snapshots/v1/method.txt", "partial candidate\n");
  put(root, "private/evaluator/raw/partial.txt", "observed result\n");
  const docket = openRepairDocket(root, { task: "partial_candidate_contract_repair", targetPhase: "contract", repairPaths: ["contract/evaluator-contract.md"] });
  const revised = run("revise-contract", root, docket.incident.path);
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(fs.existsSync(path.join(root, "discovery")), false);
  assert.equal(fs.existsSync(path.join(root, "private/evaluator/raw/partial.txt")), false);
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.readFileSync(path.join(archive, "artifacts/discovery/nodes/partial/snapshots/v1/method.txt"), "utf8"), "partial candidate\n");
  assert.equal(fs.readFileSync(path.join(archive, "artifacts/private/evaluator/raw/partial.txt"), "utf8"), "observed result\n");
  assert.equal(run("verify", root).status, 0);
});

test("agent-authored amendment evidence cannot rewrite the approved charter", (t) => {
  const root = contract(t);
  const originalApproval = canonical(read(root, "contract/approval.json"));
  const originalPlan = fs.readFileSync(path.join(root, "study-plan.md"), "utf8");
  put(root, "repairs/researcher-approval.md", "Approved in the Scientist1 study review.\n");
  put(root, "repairs/amended-study-plan.md", "# Approved amended plan\n\nThe same question uses a researcher-approved primary outcome.\n");
  json(root, "repairs/approved-amendment.json", { schema_version: 1, classification: "RESEARCHER_APPROVED_AMENDMENT", charter_changed: true, result_aware: false, post_result_guard: null, finding: "The researcher approved a clearer primary outcome before results.", repair: "Replace the active plan and rebuild the generated contract.", researcher_approval: { path: "repairs/researcher-approval.md", sha256: hash(root, "repairs/researcher-approval.md") } });
  const revised = run("revise-contract", root, "repairs/approved-amendment.json", "repairs/amended-study-plan.md");
  assert.notEqual(revised.status, 0);
  assert.match(revised.stderr, /cannot accept agent-authored amendment authority/i);
  assert.equal(fs.readFileSync(path.join(root, "study-plan.md"), "utf8"), originalPlan);
  assert.equal(canonical(read(root, "contract/approval.json")), originalApproval);
  assert.equal(read(root, "run.json").charter_revision, 1);
});
