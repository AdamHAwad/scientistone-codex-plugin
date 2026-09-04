import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { clearLiveCatalogCache, consumeLaunchToken, createRoutingRecord, ensureRunRouting, launchGrantDirectory, loadModelPolicy, prepareRoleLaunch, resolveModelCatalog, validateRoutingRecord } from "../../plugins/scientist1/mcp/model-routing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientist1");
const HOOK_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8"));
const HOOK_COMMAND = HOOK_CONFIG.hooks.PreToolUse[0].hooks[0].command;
const STATE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-launch-state-"));
after(() => fs.rmSync(STATE_HOME, { recursive: true, force: true }));
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
const model = (slug, description, priority, extra = {}) => ({ slug, description, priority, visibility: "list", supported_in_api: true, supported_reasoning_levels: efforts, ...extra });

function catalog(strong = "gpt-6-astra", efficient = "gpt-6-luna", offset = 0) {
  return { models: [model(strong, "Latest frontier agentic model", 1 + offset), model(efficient, "Fast and affordable agentic model", 2 + offset), model("balanced", "Balanced everyday agentic model", 3 + offset)] };
}

function runRoot(t, name = "routing") {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), `scientist1-${name}-`));
  t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify({ state: "running", contract_revision: 1, charter_revision: 1, last_checkpoint: null, checkpoints: {}, approval_sha256: "a".repeat(64), convergence_control: { schema_version: 1, release: "1.5.0", checklist: { path: "contract/control-plane/gate-checklists.json", sha256: "b".repeat(64) } }, pending_adjudication: null, active_repair: null })}\n`);
  fs.mkdirSync(path.join(run, "contract"), { recursive: true });
  fs.mkdirSync(path.join(run, "contract/control-plane"), { recursive: true });
  fs.writeFileSync(path.join(run, "contract/control-plane/gate-checklists.json"), "{}\n");
  fs.writeFileSync(path.join(run, "contract", "run-config.json"), `${JSON.stringify({ schema_version: 4, orchestration: { task_attempt_policy: "repair_until_pass", repair_gate_policy: "invalidate_and_continue", completion_condition: "fresh_verified_delivery", review_frontier_policy: "frozen_release_checklist", rollback_policy: "independent_adjudication_only", repair_scope_policy: "exact_delta", recurrence_policy: "causal_strategy_change" } })}\n`);
  fs.writeFileSync(path.join(run, "contract", "approval.json"), `${JSON.stringify({ schema_version: 1 })}\n`);
  fs.writeFileSync(path.join(run, "study-plan.md"), "# Test plan\n");
  fs.mkdirSync(path.join(run, "selection", "selected"), { recursive: true });
  fs.writeFileSync(path.join(run, "selection", "selected", "method.txt"), "test\n");
  return run;
}

function styleRun(t, name) {
  const run = runRoot(t, name);
  fs.mkdirSync(path.join(run, "inputs", "style"), { recursive: true });
  fs.mkdirSync(path.join(run, "paper", "style-drafts"), { recursive: true });
  fs.writeFileSync(path.join(run, "inputs", "style", "01-example.txt"), "Example style\n");
  fs.writeFileSync(path.join(run, "paper", "style-drafts", "draft-01-tagged.tex"), "Draft one\n");
  const exampleSha256 = createHash("sha256").update(fs.readFileSync(path.join(run, "inputs", "style", "01-example.txt"))).digest("hex");
  const policy = {
    schema_version: 1,
    source_draft_id: "00000000-0000-4000-8000-000000000001",
    max_reviews: 3,
    writing_review_limit: 2,
    notes: "Use compact sections.",
    examples: [{ upload_id: "upload-1", original_name: "example.txt", media_type: "text/plain", frozen_path: "inputs/style/01-example.txt", source_sha256: exampleSha256, frozen_sha256: exampleSha256 }],
    criteria: ["ai_tells", "prose", "structure", "formatting", "visual_fidelity"],
    evidence_rule: "Use examples only for prose, structure, and formatting. Never copy their text or treat them as scientific evidence.",
  };
  const policyPath = path.join(run, "contract", "paper-style-policy.json");
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  const policySha256 = createHash("sha256").update(fs.readFileSync(policyPath)).digest("hex");
  fs.writeFileSync(path.join(run, "contract", "approval.json"), `${JSON.stringify({ schema_version: 2, paper_style_policy_sha256: policySha256 })}\n`);
  return run;
}

function styleInputs(draft = "paper/style-drafts/draft-01-tagged.tex") {
  return ["contract/paper-style-policy.json", "inputs/style/01-example.txt", draft];
}

function brief(input = "study-plan.md") {
  return { objective: "Complete the assigned gate.", context: "This task advances the current Scientist1 phase.", acceptance_gate: "Return only validated declared outputs.", constraints: "Preserve the frozen study plan and CoE requirements; do not add speculative work.", upstream_summary: [{ input_path: input, summary: "Binding approved study context." }] };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function workKey(role, declaredOutputs, contractRevision = 1, charterRevision = 1, repairDocketId = null, repairSemanticDigest = null) {
  return createHash("sha256").update(canonical({ contract_revision: contractRevision, charter_revision: charterRevision, role, declared_outputs: [...declaredOutputs].sort(), ...(repairDocketId ? { repair_docket_id: repairDocketId, repair_semantic_digest: repairSemanticDigest } : {}) })).digest("hex");
}

function valueHash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function boundFileHash(file, logicalPath) {
  const digest = createHash("sha256");
  const addField = (tag, value) => {
    const data = Buffer.from(String(value));
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(data.length));
    digest.update(tag);
    digest.update(length);
    digest.update(data);
  };
  addField("F", logicalPath);
  addField("S", fs.statSync(file).size);
  digest.update(fs.readFileSync(file));
  return digest.digest("hex");
}

function seedHistoricalOverlap(run, { logicalTaskName = "historical_evaluator", role = "evaluator", outputs = ["private/evaluator/package", "private/evaluator/package/result.json"], mutateLaunch = null, mutateRecord = null } = {}) {
  const key = workKey(role, outputs);
  const launchRelative = "role-launches/historical_evaluator_a1.json";
  const launchFile = path.join(run, launchRelative);
  fs.mkdirSync(path.dirname(launchFile), { recursive: true });
  const launchBrief = brief("selection/selected");
  const assignment = "Immutable historical assignment.";
  const launch = {
    schema_version: 1,
    task_id: "native-historical_evaluator_a1",
    logical_task_name: logicalTaskName,
    work_key_sha256: key,
    attempt: 1,
    contract_revision: 1,
    charter_revision: 1,
    predecessor: null,
    role,
    fork_turns: "none",
    model_tier: "efficient",
    model: "test-efficient",
    reasoning_effort: "low",
    model_routing_sha256: "a".repeat(64),
    role_contract_sha256: "b".repeat(64),
    gate_schema_version: 1,
    task_brief: launchBrief,
    task_brief_sha256: valueHash(launchBrief),
    assignment,
    assignment_sha256: valueHash(assignment),
    declared_inputs: ["selection/selected"],
    input_artifacts: [{ path: "selection/selected", sha256: "c".repeat(64) }],
    allowed_external_sources: [],
    declared_outputs: outputs,
    started_at: "2026-09-02T12:00:00.000Z",
  };
  mutateLaunch?.(launch);
  fs.writeFileSync(launchFile, `${JSON.stringify(launch)}\n`);
  const record = { schema_version: 2, logical_task_name: logicalTaskName, work_key_sha256: key, attempt: 1, launch_record: launchRelative, launch_record_sha256: boundFileHash(launchFile, launchRelative), accepted_at: "2026-09-02T12:00:00.000Z" };
  mutateRecord?.(record, { launchFile, key });
  const attemptRoot = path.join(run, "role-attempts", logicalTaskName, key);
  fs.mkdirSync(attemptRoot, { recursive: true });
  fs.writeFileSync(path.join(attemptRoot, "attempt-1.json"), `${JSON.stringify(record)}\n`);
  return { key, launchFile, attemptRoot, logicalTaskName, role, outputs };
}

function runHook(input, env = {}) {
  return spawnSync(HOOK_COMMAND, { shell: true, env: { ...process.env, SCIENTIST1_STATE_HOME: STATE_HOME, PLUGIN_ROOT: ROOT, ...env }, input: `${JSON.stringify(input)}\n`, encoding: "utf8" });
}

test("semantic routing follows future catalog meaning instead of model names", () => {
  const resolved = resolveModelCatalog(catalog());
  assert.equal(resolved.tiers.strong.model, "gpt-6-astra");
  assert.equal(resolved.tiers.efficient.model, "gpt-6-luna");

  const arbitrary = resolveModelCatalog({ models: [
    model("model-alpha", "General fast model", 1, { model_tier: "strong" }),
    model("model-beta", "General strong model", 2, { model_tier: "efficient" }),
  ] });
  assert.equal(arbitrary.tiers.strong.model, "model-alpha");
  assert.equal(arbitrary.tiers.efficient.model, "model-beta");
});

test("the bundled policy reserves deep reasoning for judgment and lowers mechanical roles", () => {
  const policy = loadModelPolicy();
  assert.deepEqual(policy.roles.i1_verifier_builder, { tier: "strong", reasoning_effort: "high" });
  assert.equal(policy.roles.evaluator.reasoning_effort, "low");
  assert.equal(policy.roles.audit_reporter.reasoning_effort, "low");
  assert.equal(policy.roles.i3_reference_auditor.reasoning_effort, "high");
  assert.doesNotThrow(() => createRoutingRecord(catalog(), policy));
});

test("every ordinary frozen policy role resolves through the real launch prompt path", async (t) => {
  const run = runRoot(t, "all-role-prompts");
  for (const role of Object.keys(loadModelPolicy().roles).filter((name) => !["repair_adjudicator", "paper_style_auditor"].includes(name)).sort()) {
    const prepared = await prepareRoleLaunch({
      run_path: run,
      task_name: `prompt_${role}`,
      role,
      declared_inputs: ["study-plan.md"],
      declared_outputs: [`role-output/${role}.json`],
      allowed_external_sources: [],
      task_brief: brief(),
    }, { catalog: catalog(), stateHome: STATE_HOME });
    assert.match(prepared.assignment, /Role card\n/);
  }
});

test("Writer, Paper Critic, and Paper Style Auditor receive the exact academic Unslop text", async (t) => {
  const unslop = fs.readFileSync(path.join(ROOT, "skills", "scientist1", "references", "paper-unslop.md"), "utf8").trim();
  const run = styleRun(t, "paper-unslop-prompts");
  for (const role of ["writer", "paper_critic"]) {
    const prepared = await prepareRoleLaunch({ run_path: run, task_name: `unslop_${role}`, role, declared_inputs: ["study-plan.md"], declared_outputs: [`role-output/${role}.json`], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
    assert.ok(prepared.assignment.includes(unslop));
  }
  const stylePrepared = await prepareRoleLaunch({ run_path: run, task_name: "unslop_paper_style", role: "paper_style_auditor", declared_inputs: styleInputs(), declared_outputs: ["paper/style-reviews/review-01.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.ok(stylePrepared.assignment.includes(unslop));
  const evaluator = await prepareRoleLaunch({ run_path: run, task_name: "no_unslop_evaluator", role: "evaluator", declared_inputs: ["selection/selected"], declared_outputs: ["private/evaluator/no-unslop.json"], allowed_external_sources: [], task_brief: brief("selection/selected") }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(evaluator.assignment.includes(unslop), false);
});

test("paper-style launch authorization enforces the two-stage three-review limit", async (t) => {
  const run = styleRun(t, "paper-style-limit");
  await assert.rejects(() => prepareRoleLaunch({ run_path: run, task_name: "style_input_leak", role: "evaluator", declared_inputs: ["inputs/style/01-example.txt"], declared_outputs: ["private/evaluator/style-leak.json"], allowed_external_sources: [], task_brief: brief("inputs/style/01-example.txt") }, { catalog: catalog(), stateHome: STATE_HOME }), /cannot read paper-style inputs/);
  await prepareRoleLaunch({ run_path: run, task_name: "style_review_01", role: "paper_style_auditor", declared_inputs: styleInputs(), declared_outputs: ["paper/style-reviews/review-01.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME });
  fs.mkdirSync(path.join(run, "paper", "style-reviews"), { recursive: true });
  fs.writeFileSync(path.join(run, "paper", "style-reviews", "review-01.json"), `${JSON.stringify({ round: 1, stage: "writing", style_status: "NONCONFORMANT" })}\n`);
  fs.writeFileSync(path.join(run, "paper", "style-drafts", "draft-02-tagged.tex"), "Draft two\n");
  fs.writeFileSync(path.join(run, "paper", "paper.tex"), "Delivered paper\n");
  await assert.rejects(() => prepareRoleLaunch({ run_path: run, task_name: "premature_delivery_review", role: "paper_style_auditor", declared_inputs: ["contract/paper-style-policy.json", "inputs/style/01-example.txt", "paper/paper.tex"], declared_outputs: ["paper/style-reviews/review-02.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME }), /remaining writing-stage review/);
  await prepareRoleLaunch({ run_path: run, task_name: "style_review_02", role: "paper_style_auditor", declared_inputs: [...styleInputs("paper/style-drafts/draft-02-tagged.tex"), "paper/style-reviews/review-01.json"], declared_outputs: ["paper/style-reviews/review-02.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME });
  fs.writeFileSync(path.join(run, "paper", "style-reviews", "review-02.json"), `${JSON.stringify({ round: 2, stage: "writing", style_status: "CONFORMANT" })}\n`);
  await prepareRoleLaunch({ run_path: run, task_name: "style_review_03", role: "paper_style_auditor", declared_inputs: ["contract/paper-style-policy.json", "inputs/style/01-example.txt", "paper/paper.tex"], declared_outputs: ["paper/style-reviews/review-03.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME });
  await assert.rejects(() => prepareRoleLaunch({ run_path: run, task_name: "style_review_04", role: "paper_style_auditor", declared_inputs: ["contract/paper-style-policy.json", "inputs/style/01-example.txt", "paper/paper.tex"], declared_outputs: ["paper/style-reviews/review-04.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME }), /review-01\.json through review-03\.json/);

  const stopped = styleRun(t, "paper-style-early-stop");
  fs.mkdirSync(path.join(stopped, "paper", "style-reviews"), { recursive: true });
  fs.writeFileSync(path.join(stopped, "paper", "style-reviews", "review-01.json"), `${JSON.stringify({ round: 1, stage: "writing", style_status: "CONFORMANT" })}\n`);
  fs.writeFileSync(path.join(stopped, "paper", "style-drafts", "draft-02-tagged.tex"), "Unneeded draft\n");
  await assert.rejects(() => prepareRoleLaunch({ run_path: stopped, task_name: "style_review_after_pass", role: "paper_style_auditor", declared_inputs: styleInputs("paper/style-drafts/draft-02-tagged.tex"), declared_outputs: ["paper/style-reviews/review-02.json"], allowed_external_sources: [], task_brief: brief("contract/paper-style-policy.json") }, { catalog: catalog(), stateHome: STATE_HOME }), /already reached its stop condition/);
});

test("every frozen 1.2 policy role resolves without changing the released role asset", async (t) => {
  const run = runRoot(t, "all-legacy-role-prompts");
  fs.writeFileSync(path.join(run, "contract", "run-config.json"), `${JSON.stringify({ schema_version: 1, mode: "research" })}\n`);
  const legacyPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, "skills", "scientist1", "references", "legacy-model-policy-1.2.0.json"), "utf8"));
  for (const role of Object.keys(legacyPolicy.roles).sort()) {
    const prepared = await prepareRoleLaunch({
      run_path: run,
      task_name: `legacy_prompt_${role}`,
      role,
      declared_inputs: ["study-plan.md"],
      declared_outputs: [`legacy-role-output/${role}.json`],
      allowed_external_sources: [],
      task_brief: brief(),
    }, { catalog: catalog(), stateHome: STATE_HOME });
    assert.match(prepared.assignment, /Role card\n/);
  }
});

test("semantic routing fails closed on ambiguity or unsupported effort", () => {
  assert.throws(() => resolveModelCatalog({ models: [
    model("strong-a", "Frontier model", 1),
    model("strong-b", "Flagship model", 1),
    model("efficient", "Fast and affordable model", 2),
  ] }), /ambiguous strong model priority tie/);
  assert.throws(() => resolveModelCatalog({ models: [
    model("strong", "Frontier model", 1),
    model("efficient", "Fast and affordable model", 2, { supported_reasoning_levels: ["low", "medium"] }),
  ] }), /does not support required reasoning effort high/);
});

test("saved routing records reject unknown fields before launch matching", () => {
  const record = { ...createRoutingRecord(catalog()), unexpected: true };
  assert.throws(() => validateRoutingRecord(record), /unknown or missing fields/);
});

test("a mechanical efficient launch resolves to low effort", async (t) => {
  const run = runRoot(t, "efficient");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "evaluation",
    role: "evaluator",
    declared_inputs: ["selection/selected"],
    declared_outputs: ["private/evaluator/evaluation.json"],
    allowed_external_sources: [],
    task_brief: brief("selection/selected"),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(prepared.model, "gpt-6-luna");
  assert.equal(prepared.reasoning_effort, "low");
  const launch = JSON.parse(fs.readFileSync(path.join(run, prepared.launch_record), "utf8"));
  assert.equal(launch.reasoning_effort, "low");
});

test("the phase-agnostic checkpoint reviewer cannot retrieve new evidence", async (t) => {
  const run = runRoot(t, "checkpoint-repair");
  fs.mkdirSync(path.join(run, "repairs/incidents"), { recursive: true });
  fs.mkdirSync(path.join(run, "repairs/control-plane"), { recursive: true });
  fs.writeFileSync(path.join(run, "repairs/incidents/mechanical.json"), "{}\n");
  fs.writeFileSync(path.join(run, "repairs/control-plane/gate-checklists-1.5.0.json"), "{}\n");
  const record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  record.convergence_control = { checklist: { path: "repairs/control-plane/gate-checklists-1.5.0.json" } };
  record.active_repair = { docket_id: "a".repeat(64), semantic_digest: "d".repeat(64), incident: { path: "repairs/incidents/mechanical.json", sha256: "b".repeat(64) }, target_phase: "ablation", requires_invalidation: false, repair_mode: "deterministic_delta", finding_fingerprints: ["c".repeat(64)], repair_scope: ["ablation/results.json"], scope_baseline: [], controller_delta: [], required_review_roles: ["checkpoint_reviewer"], baseline: [] };
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  await assert.rejects(() => prepareRoleLaunch({ run_path: run, task_name: "schema_retry", role: "checkpoint_reviewer", declared_inputs: ["study-plan.md"], declared_outputs: ["repairs/reviews/checkpoint/ablation.json"], allowed_external_sources: ["web"], task_brief: brief() }, { catalog: catalog() }), /deterministic checkpoint repair cannot retrieve external evidence/i);
});

test("a legitimacy closure reviewer can use its exact node-parameterized output", async (t) => {
  const run = runRoot(t, "legitimacy-repair");
  fs.mkdirSync(path.join(run, "repairs/incidents"), { recursive: true });
  fs.mkdirSync(path.join(run, "repairs/control-plane"), { recursive: true });
  fs.mkdirSync(path.join(run, "discovery/nodes/n1"), { recursive: true });
  fs.writeFileSync(path.join(run, "repairs/incidents/legitimacy.json"), "{}\n");
  fs.writeFileSync(path.join(run, "repairs/control-plane/gate-checklists.json"), "{}\n");
  fs.writeFileSync(path.join(run, "discovery/nodes/n1/method-report.md"), "repaired\n");
  const record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  record.convergence_control = { checklist: { path: "repairs/control-plane/gate-checklists.json" } };
  record.active_repair = { docket_id: "a".repeat(64), semantic_digest: "d".repeat(64), incident: { path: "repairs/incidents/legitimacy.json", sha256: "b".repeat(64) }, target_phase: "discovery", requires_invalidation: false, repair_mode: "scientific_delta", finding_fingerprints: ["c".repeat(64)], repair_scope: ["discovery/nodes/n1/method-report.md"], scope_baseline: [{ path: "discovery/nodes/n1/method-report.md", kind: "file", sha256: "e".repeat(64) }], controller_delta: [], dependent_regeneration: [{ role: "legitimacy_auditor", logical_task_name: "legitimacy_auditor", declared_inputs: ["study-plan.md"], declared_outputs: ["discovery/nodes/n1/legitimacy-audit.md"], allowed_external_sources: [] }], required_review_roles: ["legitimacy_auditor"], baseline: [] };
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  await assert.rejects(() => prepareRoleLaunch({ run_path: run, task_name: "duplicate_legitimacy_closure", role: "legitimacy_auditor", declared_inputs: ["study-plan.md"], declared_outputs: ["discovery/nodes/n1/legitimacy-audit.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME }), /launch that frozen logical task once and reuse its PASS receipt/i);
  const prepared = await prepareRoleLaunch({ run_path: run, task_name: "legitimacy_closure", logical_task_name: "legitimacy_auditor", role: "legitimacy_auditor", declared_inputs: ["study-plan.md"], declared_outputs: ["discovery/nodes/n1/legitimacy-audit.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(prepared.model, "gpt-6-astra");
});

test("a deleted dependent input is replaced by the exact controller absence proof", async (t) => {
  const run = runRoot(t, "deleted-dependent-input");
  fs.mkdirSync(path.join(run, "repairs/incidents"), { recursive: true });
  fs.mkdirSync(path.join(run, "repairs/control-plane"), { recursive: true });
  fs.mkdirSync(path.join(run, "discovery/nodes/n1"), { recursive: true });
  fs.writeFileSync(path.join(run, "repairs/incidents/deletion.json"), "{}\n");
  fs.writeFileSync(path.join(run, "repairs/control-plane/gate-checklists.json"), "{}\n");
  const record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  record.convergence_control = { checklist: { path: "repairs/control-plane/gate-checklists.json" } };
  record.active_repair = { docket_id: "a".repeat(64), semantic_digest: "d".repeat(64), incident: { path: "repairs/incidents/deletion.json", sha256: "b".repeat(64) }, target_phase: "discovery", requires_invalidation: false, repair_mode: "scientific_delta", finding_fingerprints: ["c".repeat(64)], repair_scope: ["discovery/nodes/n1/method-report.md"], scope_baseline: [{ path: "discovery/nodes/n1/method-report.md", kind: "file", sha256: "e".repeat(64) }], controller_delta: [], dependent_regeneration: [{ role: "legitimacy_auditor", logical_task_name: "legitimacy_auditor", declared_inputs: ["study-plan.md", "discovery/nodes/n1/method-report.md"], declared_outputs: ["discovery/nodes/n1/legitimacy-audit.md"], allowed_external_sources: [] }], required_review_roles: ["legitimacy_auditor"], baseline: [] };
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  const prepared = await prepareRoleLaunch({ run_path: run, task_name: "deleted_input_closure", logical_task_name: "legitimacy_auditor", role: "legitimacy_auditor", declared_inputs: ["study-plan.md", "discovery/nodes/n1/method-report.md"], declared_outputs: ["discovery/nodes/n1/legitimacy-audit.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  const launch = JSON.parse(fs.readFileSync(path.join(run, prepared.launch_record), "utf8"));
  const proofPath = `repairs/absence-proofs/${record.active_repair.semantic_digest}.json`;
  assert.ok(launch.declared_inputs.includes(proofPath));
  assert.equal(launch.declared_inputs.includes("discovery/nodes/n1/method-report.md"), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run, proofPath), "utf8")).absent_paths, ["discovery/nodes/n1/method-report.md"]);
});

test("a repair docket namespaces workers and closure reviewers from original output ownership", async (t) => {
  const run = runRoot(t, "repair-output-namespace");
  fs.mkdirSync(path.join(run, "contract"), { recursive: true });
  fs.writeFileSync(path.join(run, "contract/audit.md"), "original audit\n");
  fs.writeFileSync(path.join(run, "contract/generated.md"), "original generated artifact\n");
  await prepareRoleLaunch({ run_path: run, task_name: "original_auditor", role: "contract_auditor", declared_inputs: ["study-plan.md"], declared_outputs: ["contract/audit.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  await prepareRoleLaunch({ run_path: run, task_name: "original_writer", role: "writer", declared_inputs: ["study-plan.md"], declared_outputs: ["contract/generated.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  fs.mkdirSync(path.join(run, "repairs/incidents"), { recursive: true });
  fs.mkdirSync(path.join(run, "repairs/control-plane"), { recursive: true });
  fs.writeFileSync(path.join(run, "repairs/incidents/docket.json"), "{}\n");
  fs.writeFileSync(path.join(run, "repairs/control-plane/gate-checklists.json"), "{}\n");
  const record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  record.convergence_control = { checklist: { path: "repairs/control-plane/gate-checklists.json" } };
  record.active_repair = { docket_id: "a".repeat(64), semantic_digest: "d".repeat(64), incident: { path: "repairs/incidents/docket.json", sha256: "b".repeat(64) }, target_phase: "contract", requires_invalidation: false, repair_mode: "scientific_delta", finding_fingerprints: ["c".repeat(64)], repair_scope: ["contract/audit.md", "contract/generated.md"], scope_baseline: [], controller_delta: [], required_review_roles: ["contract_auditor"], baseline: [] };
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  const worker = await prepareRoleLaunch({ run_path: run, task_name: "repair_generated", role: "writer", declared_inputs: ["study-plan.md"], declared_outputs: ["contract/generated.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  const reviewer = await prepareRoleLaunch({ run_path: run, task_name: "repair_closure_auditor", role: "contract_auditor", declared_inputs: ["study-plan.md"], declared_outputs: ["contract/audit.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, worker.launch_record), "utf8")).repair_binding.docket_id, record.active_repair.docket_id);
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, reviewer.launch_record), "utf8")).repair_binding.docket_id, record.active_repair.docket_id);
  consumeLaunchToken(worker.task_name, { stateHome: STATE_HOME });
  fs.mkdirSync(path.join(run, "role-receipts"), { recursive: true });
  fs.writeFileSync(path.join(run, "role-receipts/repair_generated.json"), `${JSON.stringify({ execution_status: "COMPLETE", gate_verdict: "PASS" })}\n`);
  record.active_repair.semantic_digest = "e".repeat(64);
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  const regenerated = await prepareRoleLaunch({ run_path: run, task_name: "repair_generated_after_regression", logical_task_name: "repair_generated", role: "writer", declared_inputs: ["study-plan.md"], declared_outputs: ["contract/generated.md"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, regenerated.launch_record), "utf8")).repair_binding.semantic_digest, record.active_repair.semantic_digest);
});

test("a Repair Adjudicator cannot create work without a controller frontier", async (t) => {
  const run = runRoot(t, "no-spontaneous-adjudication");
  fs.mkdirSync(path.join(run, "repairs/control-plane"), { recursive: true });
  fs.writeFileSync(path.join(run, "repairs/control-plane/gate-checklists.json"), "{}\n");
  const record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  record.convergence_control = { checklist: { path: "repairs/control-plane/gate-checklists.json" } };
  record.pending_adjudication = null;
  record.active_repair = null;
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  await assert.rejects(() => prepareRoleLaunch({ run_path: run, task_name: "invent_repair", role: "repair_adjudicator", declared_inputs: ["study-plan.md"], declared_outputs: ["repairs/proposals/invented.json"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog() }), /only for a controller-issued pending adjudication or active repair docket/i);
});

test("unmigrated 1.3 and 1.4 runs cannot prepare or consume specialist launches", async (t) => {
  const staleRun = runRoot(t, "migration-stale-grant");
  const prepared = await prepareRoleLaunch({ run_path: staleRun, task_name: "prepared_before_downgrade", role: "literature_mapper", declared_inputs: ["study-plan.md"], declared_outputs: ["evidence/search-log.jsonl"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME });
  const staleRecord = JSON.parse(fs.readFileSync(path.join(staleRun, "run.json"), "utf8"));
  delete staleRecord.convergence_control;
  fs.writeFileSync(path.join(staleRun, "run.json"), `${JSON.stringify(staleRecord)}\n`);
  fs.writeFileSync(path.join(staleRun, "contract/run-config.json"), `${JSON.stringify({ schema_version: 3, orchestration: { task_attempt_policy: "repair_until_pass", repair_gate_policy: "invalidate_and_continue", completion_condition: "fresh_verified_delivery" } })}\n`);
  assert.throws(() => consumeLaunchToken(prepared.task_name, { stateHome: STATE_HOME }), (error) => error.code === "S1_CONVERGENCE_MIGRATION_REQUIRED");

  const blockedRun = runRoot(t, "migration-prepare-barrier");
  const blockedRecord = JSON.parse(fs.readFileSync(path.join(blockedRun, "run.json"), "utf8"));
  delete blockedRecord.convergence_control;
  fs.writeFileSync(path.join(blockedRun, "run.json"), `${JSON.stringify(blockedRecord)}\n`);
  fs.writeFileSync(path.join(blockedRun, "contract/run-config.json"), `${JSON.stringify({ schema_version: 2, orchestration: { max_task_attempts: 2, max_repair_waves_per_gate: 1 } })}\n`);
  await assert.rejects(() => prepareRoleLaunch({ run_path: blockedRun, task_name: "blocked_before_migration", role: "literature_mapper", declared_inputs: ["study-plan.md"], declared_outputs: ["evidence/search-log.jsonl"], allowed_external_sources: [], task_brief: brief() }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_CONVERGENCE_MIGRATION_REQUIRED");
});

test("a run freezes its resolution while a new run resolves a newer catalog", async (t) => {
  const first = runRoot(t, "frozen");
  const initial = await ensureRunRouting(first, { catalog: catalog("generation-a-strong", "generation-a-efficient") });
  const newerCatalog = { models: [
    model("generation-b-strong", "Latest frontier agentic model", 1),
    model("generation-b-efficient", "Fast and affordable agentic model", 2),
    model("generation-a-strong", "Prior frontier agentic model", 10),
    model("generation-a-efficient", "Prior fast and affordable agentic model", 11),
  ] };
  const resumed = await ensureRunRouting(first, { catalog: newerCatalog });
  assert.equal(resumed.routing_sha256, initial.routing_sha256);
  assert.equal(resumed.tiers.strong.model, "generation-a-strong");

  const second = runRoot(t, "new");
  const fresh = await ensureRunRouting(second, { catalog: newerCatalog });
  assert.equal(fresh.tiers.strong.model, "generation-b-strong");
  assert.equal(fresh.tiers.efficient.model, "generation-b-efficient");
});

test("an unavailable frozen route is archived and replaced for future launches", async (t) => {
  const run = runRoot(t, "unavailable");
  const first = await ensureRunRouting(run, { catalog: catalog("generation-a-strong", "generation-a-efficient") });
  const original = fs.readFileSync(path.join(run, "environment", "model-routing.json"));
  const next = await ensureRunRouting(run, { catalog: catalog("generation-b-strong", "generation-b-efficient") });
  assert.notEqual(next.routing_sha256, first.routing_sha256);
  assert.equal(next.tiers.strong.model, "generation-b-strong");
  assert.deepEqual(fs.readFileSync(path.join(run, "environment", "model-routing.json")), original);
  assert.ok(fs.existsSync(path.join(run, "environment", "routing-history", `${next.routing_sha256}.json`)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run, "environment", "model-routing-active.json"), "utf8")), { schema_version: 1, routing_sha256: next.routing_sha256, path: `environment/routing-history/${next.routing_sha256}.json` });
});

test("live catalog probes are single-flight, bounded, bypassable, and recover after failure", async (t) => {
  clearLiveCatalogCache();
  const run = runRoot(t, "catalog-cache");
  let calls = 0;
  const loader = async () => { calls += 1; await new Promise((resolve) => setImmediate(resolve)); return catalog(); };
  await Promise.all([
    ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 1_000 }),
    ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 1_000 }),
  ]);
  assert.equal(calls, 1);
  await ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 1_001 });
  assert.equal(calls, 1);
  await ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 2_000, catalogTtlMs: 10 });
  assert.equal(calls, 2);
  await ensureRunRouting(run, { catalog: catalog(), catalogLoader: async () => { throw new Error("must not run"); }, catalogContext: "explicit" });
  assert.equal(calls, 2);

  clearLiveCatalogCache();
  const retry = runRoot(t, "catalog-retry");
  let attempts = 0;
  const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error("temporary catalog failure"); return catalog(); };
  await assert.rejects(ensureRunRouting(retry, { catalogLoader: flaky, catalogContext: "account-b" }), /temporary catalog failure/);
  await ensureRunRouting(retry, { catalogLoader: flaky, catalogContext: "account-b" });
  assert.equal(attempts, 2);
});

test("the bundled hook rewrites an authorized spawn exactly once and leaves unrelated spawns alone", async (t) => {
  const run = runRoot(t, "hook");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_check",
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.match(prepared.task_name, /^s1_contract_auditor__[0-9a-f]{32}$/);
  const message = prepared.assignment;
  const first = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message, fork_turns: "all", model: "wrong", reasoning_effort: "low", agent_type: "explorer" } });
  assert.equal(first.status, 0, first.stderr);
  const output = JSON.parse(first.stdout);
  const updated = output.hookSpecificOutput.updatedInput;
  assert.deepEqual(updated, { task_name: "contract_check", message, fork_turns: "none", model: "gpt-6-astra", reasoning_effort: "high" });

  const reused = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message } });
  assert.equal(JSON.parse(reused.stdout).hookSpecificOutput.permissionDecision, "deny");

  const unrelated = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "ordinary_task", message: "ordinary assignment" } });
  assert.equal(unrelated.status, 0);
  assert.equal(unrelated.stdout, "");

  const bypass = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "contract_check", message: "This is one Scientist1 assignment. You are a fresh specialist" } });
  assert.equal(JSON.parse(bypass.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("the bundled hook denies malformed Scientist1 launch markers", () => {
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "s1_not_a_token__task", message: "role" } });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("launch grants survive different MCP and hook temporary directories", async (t) => {
  const stableHome = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-stable-home-"));
  t.after(() => fs.rmSync(stableHome, { recursive: true, force: true }));
  assert.equal(
    launchGrantDirectory({ home: stableHome, platform: "darwin", env: { TMPDIR: "/tmp/mcp-a", TMP: "/tmp/mcp-a", TEMP: "/tmp/mcp-a" } }),
    launchGrantDirectory({ home: stableHome, platform: "darwin", env: { TMPDIR: "/tmp/hook-b", TMP: "/tmp/hook-b", TEMP: "/tmp/hook-b" } }),
  );
  const run = runRoot(t, "cross-temp");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "cross_temp_contract_check",
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const hookTemp = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-hook-temp-"));
  t.after(() => fs.rmSync(hookTemp, { recursive: true, force: true }));
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message: prepared.assignment } }, { TMPDIR: hookTemp, TMP: hookTemp, TEMP: hookTemp });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "allow");
});

test("expired grants have a stable recovery code and a fresh grant can reuse the attempt", async (t) => {
  const run = runRoot(t, "retry");
  const first = await prepareRoleLaunch({
    run_path: run,
    task_name: "literature_map_a1",
    logical_task_name: "literature_map",
    attempt: 1,
    role: "literature_mapper",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["evidence/search-log.jsonl"],
    allowed_external_sources: ["scholarly_web"],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME, now: 1_000, grantTtlMs: 10 });
  assert.throws(() => consumeLaunchToken(first.task_name, { stateHome: STATE_HOME, now: 1_011 }), (error) => error.code === "S1_LAUNCH_GRANT_EXPIRED");

  const second = await prepareRoleLaunch({
    run_path: run,
    task_name: "literature_map_a2",
    logical_task_name: "literature_map",
    attempt: 1,
    role: "literature_mapper",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["evidence/search-log.jsonl"],
    allowed_external_sources: ["scholarly_web"],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: second.task_name, message: second.assignment } });
  const updated = JSON.parse(result.stdout).hookSpecificOutput.updatedInput;
  assert.equal(updated.task_name, "literature_map_a2");
  const launch = JSON.parse(fs.readFileSync(path.join(run, second.launch_record), "utf8"));
  assert.equal(launch.logical_task_name, "literature_map");
  assert.equal(launch.attempt, 1);
  assert.throws(() => consumeLaunchToken(second.task_name, { stateHome: STATE_HOME }), (error) => error.code === "S1_LAUNCH_GRANT_NOT_FOUND");
});

test("a grant minted before a repair frontier cannot run after the controller queues adjudication", async (t) => {
  const run = runRoot(t, "stale-before-pending");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "stale_literature_mapper",
    role: "literature_mapper",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["evidence/search-log.jsonl"],
    allowed_external_sources: ["scholarly_web"],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  record.convergence_control = { schema_version: 1, release: "1.5.0", checklist: { path: "contract/gate-checklists.json", sha256: "b".repeat(64) } };
  record.pending_adjudication = { path: "repairs/incidents/pending.json", sha256: "c".repeat(64) };
  record.active_repair = null;
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(record)}\n`);
  assert.throws(() => consumeLaunchToken(prepared.task_name, { stateHome: STATE_HOME }), (error) => error.code === "S1_REPAIR_ADJUDICATION_REQUIRED");
});

test("invalid spawn text does not burn a grant and accepted repairs can continue until PASS", async (t) => {
  const run = runRoot(t, "bounded-attempts");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_a1",
    logical_task_name: "contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const rejected = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message: `${prepared.assignment}\nextra` } });
  assert.equal(JSON.parse(rejected.stdout).hookSpecificOutput.permissionDecision, "deny");
  const accepted = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message: prepared.assignment } });
  assert.equal(JSON.parse(accepted.stdout).hookSpecificOutput.permissionDecision, "allow");

  fs.mkdirSync(path.join(run, "role-receipts"), { recursive: true });
  fs.writeFileSync(path.join(run, "role-receipts", "contract_a1.json"), `${JSON.stringify({ execution_status: "FAILED", gate_verdict: "FAIL" })}\n`);
  fs.unlinkSync(path.join(run, "role-receipts", "contract_a1.json"));
  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "renamed_contract_a1",
    logical_task_name: "contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_TASK_ATTEMPT_SEQUENCE");

  const retry = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_a2",
    logical_task_name: "contract",
    attempt: 2,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(retry.attempt, 2);

  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "contract_alias_a1",
    logical_task_name: "contract_alias",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_LOGICAL_TASK_ALIAS");

  assert.equal(consumeLaunchToken(retry.task_name, { stateHome: STATE_HOME }).attempt, 2);
  const third = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_a3",
    logical_task_name: "contract",
    attempt: 3,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(third.attempt, 3);
  assert.equal(consumeLaunchToken(third.task_name, { stateHome: STATE_HOME }).attempt, 3);

  const originalRecord = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  const forgedRevision = structuredClone(originalRecord);
  forgedRevision.contract_revision = 2;
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(forgedRevision)}\n`);
  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "contract_r2_a1",
    logical_task_name: "contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), /not backed by immutable invalidation history/);
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(originalRecord)}\n`);

  const pending = await prepareRoleLaunch({
    run_path: run,
    task_name: "late_contract_a1",
    logical_task_name: "late_contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/late.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const terminalRecord = structuredClone(originalRecord);
  terminalRecord.state = "complete";
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(terminalRecord)}\n`);
  assert.throws(() => consumeLaunchToken(pending.task_name, { stateHome: STATE_HOME }), (error) => error.code === "S1_RUN_TERMINAL_OR_INACTIVE");
  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "after_terminal",
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/late.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_RUN_TERMINAL_OR_INACTIVE");
});

test("exclusive work identity rejects self-overlap, cross-task prefixes, and late-conflict poisoning", async (t) => {
  const run = runRoot(t, "output-overlap");
  const args = {
    run_path: run,
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  };

  await assert.rejects(prepareRoleLaunch({
    ...args,
    task_name: "self_overlap_a1",
    logical_task_name: "self_overlap",
    declared_outputs: ["contract", "contract/audit.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND");

  const parent = await prepareRoleLaunch({
    ...args,
    task_name: "parent_a1",
    logical_task_name: "parent",
    declared_outputs: ["contract/generated"],
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(consumeLaunchToken(parent.task_name, { stateHome: STATE_HOME }).attempt, 1);

  await assert.rejects(prepareRoleLaunch({
    ...args,
    task_name: "child_a1",
    logical_task_name: "child",
    declared_outputs: ["contract/generated/audit.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND");

  await assert.rejects(prepareRoleLaunch({
    ...args,
    task_name: "late_conflict_a1",
    logical_task_name: "late_conflict",
    declared_outputs: ["contract/independent.md", "contract/generated/audit.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND");

  const clean = await prepareRoleLaunch({
    ...args,
    task_name: "clean_a1",
    logical_task_name: "clean",
    declared_outputs: ["contract/independent.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(consumeLaunchToken(clean.task_name, { stateHome: STATE_HOME }).attempt, 1, "the rejected multi-output bind must not poison an unrelated output");
});

test("an immutable accepted historical overlap can continue only as the exact same work", async (t) => {
  const run = runRoot(t, "historical-output-overlap");
  const historical = seedHistoricalOverlap(run);
  const args = {
    run_path: run,
    logical_task_name: historical.logicalTaskName,
    role: historical.role,
    declared_inputs: ["selection/selected"],
    declared_outputs: historical.outputs,
    allowed_external_sources: [],
    task_brief: brief("selection/selected"),
  };
  const retry = await prepareRoleLaunch({ ...args, task_name: "historical_evaluator_a2", attempt: 2 }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(retry.attempt, 2);
  assert.equal(consumeLaunchToken(retry.task_name, { stateHome: STATE_HOME }).attempt, 2);
  const recovery = await prepareRoleLaunch({ ...args, task_name: "historical_evaluator_a3", attempt: 3 }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(recovery.attempt, 3, "a second recovery must remain bound to the same accepted logical work package");
});

test("the historical-overlap exception rejects aliases, rebound packages, and corrupt authority", async (t) => {
  const cases = [
    {
      name: "logical alias",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record) => { record.logical_task_name = "historical_alias"; } }),
    },
    {
      name: "cross-role rebound",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { launch.role = "writer"; } }),
    },
    {
      name: "cross-revision rebound",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { launch.contract_revision = 2; } }),
    },
    {
      name: "cross-docket rebound",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { launch.repair_binding = { docket_id: "a".repeat(64), semantic_digest: "b".repeat(64) }; } }),
    },
    {
      name: "mismatched output package",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { launch.declared_outputs = ["private/evaluator/package", "private/evaluator/package/other.json"]; } }),
    },
    {
      name: "mismatched work-key metadata",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record) => { record.work_key_sha256 = "f".repeat(64); } }),
    },
    {
      name: "legacy schema without work identity",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record) => { record.schema_version = 1; delete record.work_key_sha256; } }),
    },
    {
      name: "non-string acceptance timestamp",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record) => { record.accepted_at = 0; } }),
    },
    {
      name: "stale immutable-launch hash",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record) => { record.launch_record_sha256 = "0".repeat(64); } }),
    },
    {
      name: "missing immutable launch",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (_record, context) => { fs.unlinkSync(context.launchFile); } }),
    },
    {
      name: "launch outside immutable registry",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record, context) => {
        const alternateRelative = "repairs/forged-launch.json";
        const alternateFile = path.join(run, alternateRelative);
        fs.mkdirSync(path.dirname(alternateFile), { recursive: true });
        fs.copyFileSync(context.launchFile, alternateFile);
        record.launch_record = alternateRelative;
        record.launch_record_sha256 = boundFileHash(alternateFile, alternateRelative);
      } }),
    },
    {
      name: "noncanonical launch path alias",
      seed: (run) => seedHistoricalOverlap(run, { mutateRecord: (record) => { record.launch_record = "role-launches/../role-launches/historical_evaluator_a1.json"; } }),
    },
    {
      name: "unsupported launch schema",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { launch.schema_version = 2; } }),
    },
    {
      name: "mismatched native task identity",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { launch.task_id = "native-another_task"; } }),
    },
    {
      name: "truncated launch envelope",
      seed: (run) => seedHistoricalOverlap(run, { mutateLaunch: (launch) => { delete launch.assignment; } }),
    },
    {
      name: "malformed accepted metadata",
      seed: (run) => {
        const seeded = seedHistoricalOverlap(run);
        fs.writeFileSync(path.join(seeded.attemptRoot, "attempt-1.json"), "{not-json\n");
        return seeded;
      },
    },
    {
      name: "corrupt sibling attempt beside valid authority",
      seed: (run) => {
        const seeded = seedHistoricalOverlap(run);
        fs.writeFileSync(path.join(seeded.attemptRoot, "attempt-2.json"), "{}\n");
        return seeded;
      },
    },
  ];
  for (const scenario of cases) await t.test(scenario.name, async (caseTest) => {
    const run = runRoot(caseTest, `historical-overlap-${scenario.name.replaceAll(/[^a-z0-9]+/gi, "-")}`);
    const historical = scenario.seed(run);
    await assert.rejects(prepareRoleLaunch({
      run_path: run,
      task_name: "historical_evaluator_retry",
      logical_task_name: historical.logicalTaskName,
      attempt: 2,
      role: historical.role,
      declared_inputs: ["selection/selected"],
      declared_outputs: historical.outputs,
      allowed_external_sources: [],
      task_brief: brief("selection/selected"),
    }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND" && /historical accepted overlap authority/i.test(error.message));
  });
});

test("work identity recovers a lock left by a dead launch process", async (t) => {
  const run = runRoot(t, "stale-identity-lock");
  const revisionRoot = path.join(run, "role-attempts", "_revision-1-1");
  fs.mkdirSync(revisionRoot, { recursive: true });
  fs.writeFileSync(path.join(revisionRoot, ".identity.lock"), "99999999\n");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "recovered_a1",
    logical_task_name: "recovered",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/recovered.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(prepared.attempt, 1);
  assert.equal(fs.existsSync(path.join(revisionRoot, ".identity.lock")), false);
});
