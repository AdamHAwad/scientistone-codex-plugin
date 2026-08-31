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
import { consumeLaunchToken, prepareRoleLaunch } from "../../plugins/scientistone/mcp/model-routing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientistone");
const COE = path.join(ROOT, "skills", "scientistone", "scripts", "coe.mjs");
const LEGACY_COE = path.join(ROOT, "skills", "scientistone", "scripts", "legacy-coe-1.2.0.mjs");
const ROLE_CONTRACT = path.join(ROOT, "skills", "scientistone", "references", "roles.md");
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function workKey(role, outputs, contractRevision, charterRevision) { return createHash("sha256").update(canonical({ contract_revision: contractRevision, charter_revision: charterRevision, role, declared_outputs: [...outputs].sort() })).digest("hex"); }

function run(...args) {
  return spawnSync(process.execPath, [COE, ...args], { encoding: "utf8" });
}

test("1.3 continues a genuine 1.2 specialist under the frozen 1.2 contracts", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-legacy-"));
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-legacy-state-"));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(stateHome, { recursive: true, force: true }); });
  put(root, "request.md", "Approved request.\n");
  put(root, "study-plan.md", "Approved plan.\n");
  assert.equal(spawnSync(process.execPath, [LEGACY_COE, "configure", root, "pilot", "research"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [LEGACY_COE, "init", root], { encoding: "utf8" }).status, 0);
  const verified = run("verify", root);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).phase, "contract");
  put(root, "contract/input-manifest.json", '{"schema_version":1,"files":[]}\n');

  const prepared = await prepareRoleLaunch({
    run_path: root,
    task_name: "legacy_contract_auditor",
    logical_task_name: "legacy_contract_auditor",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: { objective: "Audit the frozen 1.2 contract", context: "Continue an in-progress 1.2 run", acceptance_gate: "Return the 1.2 PASS/FAIL audit", constraints: "Preserve the 1.2 receipt contract", upstream_summary: [] },
  }, { catalog: TEST_CATALOG, stateHome });
  const grant = consumeLaunchToken(prepared.task_name, { stateHome });
  assert.equal(grant.task_name, "legacy_contract_auditor");
  assert.equal(fs.existsSync(path.join(root, "role-attempts")), false, "1.2 continuation must not retrofit the 1.3 attempt ledger");
  const launch = JSON.parse(fs.readFileSync(path.join(root, prepared.launch_record), "utf8"));
  const legacyRoles = path.join(ROOT, "skills", "scientistone", "references", "legacy-roles-1.2.0.md");
  assert.equal(fileHash(legacyRoles), "952424e8886f5641f0133ff74b8d07226484ba094205978bef934141ab91c973");
  assert.equal(launch.role_contract_sha256, fileHash(legacyRoles));
  assert.equal("work_key_sha256" in launch, false);
  assert.equal("task_brief" in launch, false);
  assert.match(launch.assignment, /contract_auditor/i);

  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  const receiptPath = "role-receipts/legacy_contract_auditor.json";
  put(root, receiptPath, `${JSON.stringify({
    schema_version: 1,
    role: launch.role,
    agent_task: "legacy_contract_auditor",
    logical_task_name: launch.logical_task_name,
    attempt: launch.attempt,
    contract_revision: launch.contract_revision,
    charter_revision: launch.charter_revision,
    predecessor: launch.predecessor,
    model: launch.model,
    reasoning_effort: launch.reasoning_effort,
    model_routing_sha256: launch.model_routing_sha256,
    role_contract_sha256: launch.role_contract_sha256,
    gate_schema_version: launch.gate_schema_version,
    fork_turns: "none",
    started_at: launch.started_at,
    completed_at: new Date(Date.parse(launch.started_at) + 1000).toISOString(),
    execution_status: "COMPLETE",
    gate_verdict: "PASS",
    declared_inputs: launch.declared_inputs,
    input_artifacts: launch.input_artifacts,
    allowed_external_sources: [],
    external_results_used: [],
    environment_changes: [],
    outputs: launch.declared_outputs,
    output_artifacts: [{ path: "contract/audit.md", sha256: run("hash", root, "contract/audit.md").stdout.trim() }],
    undeclared_inputs_accessed: [],
    limitations: [],
    launch_record: prepared.launch_record,
    launch_record_sha256: run("hash", root, prepared.launch_record).stdout.trim(),
  })}\n`);
  const reusable = run("verify-role", root, receiptPath);
  assert.equal(reusable.status, 0, reusable.stderr);
  assert.equal(JSON.parse(reusable.stdout).reusable, true);

  launch.role_contract_sha256 = "f".repeat(64);
  put(root, prepared.launch_record, `${JSON.stringify(launch)}\n`);
  const forgedReceipt = JSON.parse(fs.readFileSync(path.join(root, receiptPath), "utf8"));
  forgedReceipt.role_contract_sha256 = launch.role_contract_sha256;
  forgedReceipt.launch_record_sha256 = run("hash", root, prepared.launch_record).stdout.trim();
  put(root, receiptPath, `${JSON.stringify(forgedReceipt)}\n`);
  assert.match(run("verify-role", root, receiptPath).stderr, /stale role contract/i);
});

function put(root, relative, content = `${relative}\n`) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function bootstrap(root) {
  put(root, "environment/bootstrap.json", `${JSON.stringify({ schema_version: 1, platform: { os: process.platform, architecture: process.arch }, tools: [{ name: "node", requirement: ">=20", path: process.execPath, version: process.version, source: "existing", source_url: null, sha256: null, verified_at: "2026-08-17T00:00:00Z" }, { name: "latex", implementation: "test-latex", path: process.execPath, version: "1.0.0", source: "existing", source_url: null, sha256: null, verified_at: "2026-08-17T00:00:00Z" }] })}\n`);
}

function copy(root, source, destination) {
  const target = path.join(root, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, source), target);
}

function fileHash(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function minimalPdf() {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function selectedTreeHash(root, relative) {
  const file = path.join(root, relative, "method.txt");
  const digest = createHash("sha256");
  const data = fs.readFileSync(file);
  for (const [tag, value] of [["F", "method.txt"], ["S", data.length]]) {
    const field = Buffer.from(String(value));
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(field.length));
    digest.update(tag);
    digest.update(length);
    digest.update(field);
  }
  digest.update(data);
  return digest.digest("hex");
}

test("runs retain the paper-compatible pilot profile by default", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-default-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configured = run("configure", root);
  assert.equal(configured.status, 0, configured.stderr);
  const value = JSON.parse(fs.readFileSync(path.join(root, "contract/run-config.json"), "utf8"));
  assert.equal(value.search_profile, "pilot");
  assert.equal(value.mode, "research");
  assert.equal(value.budgets.candidate_node_ceiling, 4);
  assert.equal(value.budgets.audit_panel_size, 3);
});

function checkpoint(root, phase, outputs, roles) {
  if (phase !== "complete") {
    const contractInputs = ["request.md", "study-plan.md", "environment/bootstrap.json", "contract/run-config.json", "contract/input-manifest.json"];
    if (fs.existsSync(path.join(root, "contract", "source-bundle-manifest.json"))) contractInputs.push("contract/source-bundle-manifest.json");
    const mode = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8")).mode;
    if (mode === "research") {
      put(root, "private/evaluator/test-evaluator.txt", "frozen evaluator\n");
      put(root, "contract/evaluator-contract.md", "Metric, unit, direction, split, repetitions, failure rule, and sanitized feedback.\n");
      put(root, "contract/evaluator-manifest.json", `${JSON.stringify({ schema_version: 1, files: [{ path: "private/evaluator/test-evaluator.txt", sha256: run("hash", root, "private/evaluator/test-evaluator.txt").stdout.trim(), access_class: "evaluator_only" }] })}\n`);
      if (phase === "contract") contractInputs.push("contract/evaluator-contract.md", "contract/evaluator-manifest.json");
    }
    let i1Contract;
    if (phase === "contract") {
      i1Contract = seedI1Contract({ root, mode, runtime: testRuntime(root, "i1_verifier_builder"), hash: (base, relative) => run("hash", base, relative).stdout.trim(), fileHash, json: (base, relative, value) => put(base, relative, `${JSON.stringify(value)}\n`), put, startedAt: "2026-08-17T00:00:00Z" });
      outputs = [...outputs];
    }
    roles ??= phase === "contract" ? [
      { role: "i1_verifier_builder", agentTask: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs },
      { role: "contract_auditor", agentTask: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"] },
    ] : [];
    const receipts = [];
    for (const role of roles) {
      role.inputs = [...(role.inputs ?? ["study-plan.md"] )];
      role.outputs = [...role.outputs];
      if (mode === "research" && ["evaluator", "i1_score_auditor", "i2_judge"].includes(role.role)) {
        for (const input of ["contract/evaluator-contract.md", "contract/evaluator-manifest.json", "private/evaluator/test-evaluator.txt"]) if (!role.inputs.includes(input)) role.inputs.push(input);
      }
      if (role.role === "evaluator") {
        for (const output of [...role.outputs].filter((item) => item.endsWith(".json") && fs.existsSync(path.join(root, item)))) {
          const value = JSON.parse(fs.readFileSync(path.join(root, output), "utf8"));
          const raw = `private/evaluator/raw/${role.agentTask}-${path.basename(output)}.txt`;
          put(root, raw, `raw ${role.agentTask}\n`);
          delete value.raw_output_path;
          Object.assign(value, { schema_version: 1, raw_output_ref: raw, raw_output_sha256: run("hash", root, raw).stdout.trim(), evaluated_at: "2026-08-17T00:00:00Z" });
          value.environment ??= { software: ["node"], hardware: "test" };
          fs.writeFileSync(path.join(root, output), `${JSON.stringify(value)}\n`);
          if (!role.outputs.includes(raw)) role.outputs.push(raw);
        }
      }
      const launch = `role-launches/${role.agentTask}.json`;
      const runtime = testRuntime(root, role.role);
      const runRecord = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
      const taskBrief = { acceptance_gate: "Produce the declared outputs", constraints: "Use only declared inputs", context: "Synthetic regression fixture", objective: `Complete ${role.agentTask}`, upstream_summary: [] };
      const assignment = `Synthetic canonical assignment for ${role.agentTask}`;
      const key = workKey(role.role, role.outputs, runRecord.contract_revision, runRecord.charter_revision);
      if (!fs.existsSync(path.join(root, launch))) put(root, launch, `${JSON.stringify({ schema_version: 1, task_id: `native-${role.agentTask}`, logical_task_name: role.agentTask, work_key_sha256: key, attempt: 1, contract_revision: runRecord.contract_revision, charter_revision: runRecord.charter_revision, predecessor: runRecord.last_checkpoint === null ? null : { path: `receipts/${runRecord.last_checkpoint}.json`, sha256: runRecord.checkpoints[runRecord.last_checkpoint].receipt_sha256 }, role: role.role, fork_turns: "none", model_tier: runtime.tier, model: runtime.model, reasoning_effort: runtime.reasoning_effort, model_routing_sha256: runtime.routing_sha256, role_contract_sha256: fileHash(ROLE_CONTRACT), gate_schema_version: 1, task_brief: taskBrief, task_brief_sha256: createHash("sha256").update(JSON.stringify(taskBrief)).digest("hex"), assignment, assignment_sha256: createHash("sha256").update(assignment).digest("hex"), declared_inputs: role.inputs, input_artifacts: role.inputs.map((path) => ({ path, sha256: run("hash", root, path).stdout.trim() })), allowed_external_sources: role.allowedExternalSources ?? [], declared_outputs: role.outputs, started_at: "2026-08-17T00:00:00Z" })}\n`);
      const activeLaunch = JSON.parse(fs.readFileSync(path.join(root, launch), "utf8"));
      put(root, `role-attempts/${activeLaunch.logical_task_name}/${activeLaunch.work_key_sha256}/attempt-${activeLaunch.attempt}.json`, `${JSON.stringify({ schema_version: 2, logical_task_name: activeLaunch.logical_task_name, work_key_sha256: activeLaunch.work_key_sha256, attempt: activeLaunch.attempt, launch_record: launch, launch_record_sha256: run("hash", root, launch).stdout.trim(), accepted_at: "2026-08-17T00:00:00.500Z" })}\n`);
      const receipt = `role-receipts/${role.agentTask}.json`;
      put(root, receipt, `${JSON.stringify({ schema_version: 1, role: role.role, agent_task: role.agentTask, logical_task_name: activeLaunch.logical_task_name, attempt: activeLaunch.attempt, contract_revision: activeLaunch.contract_revision, charter_revision: activeLaunch.charter_revision, predecessor: activeLaunch.predecessor, model: runtime.model, reasoning_effort: runtime.reasoning_effort, model_routing_sha256: activeLaunch.model_routing_sha256, role_contract_sha256: activeLaunch.role_contract_sha256, assignment_sha256: activeLaunch.assignment_sha256, task_brief_sha256: activeLaunch.task_brief_sha256, gate_schema_version: activeLaunch.gate_schema_version, fork_turns: "none", started_at: "2026-08-17T00:00:00Z", completed_at: "2026-08-17T00:00:01Z", execution_status: "COMPLETE", gate_verdict: "PASS", declared_inputs: role.inputs, input_artifacts: role.inputs.map((path) => ({ path, sha256: run("hash", root, path).stdout.trim() })), allowed_external_sources: role.allowedExternalSources ?? [], external_results_used: role.externalResultsUsed ?? [], environment_changes: [], outputs: role.outputs, output_artifacts: role.outputs.map((path) => ({ path, sha256: run("hash", root, path).stdout.trim() })), undeclared_inputs_accessed: [], limitations: [], handoff: { summary: `Completed ${role.agentTask}`, decisions: [], evidence_ids: [], conflicts: [], unresolved: [], recommended_next_action: "Continue to the next verified gate" }, launch_record: launch, launch_record_sha256: run("hash", root, launch).stdout.trim() })}\n`);
      receipts.push(receipt);
    }
    outputs = [...outputs, ...receipts];
  }
  const flags = ["--input", "study-plan.md"];
  if (phase === "contract") {
    flags.push("--input", "request.md", "--input", "environment/bootstrap.json", "--input", "contract/run-config.json", "--input", "contract/input-manifest.json");
    if (fs.existsSync(path.join(root, "contract", "source-bundle-manifest.json"))) flags.push("--input", "contract/source-bundle-manifest.json");
    else flags.push("--input", "contract/evaluator-contract.md", "--input", "contract/evaluator-manifest.json");
    flags.push("--input", "contract/i1-verification-policy.json", "--input", "contract/control-plane/i1-interpreter.mjs");
  }
  for (const output of outputs) flags.push("--output", output);
  const preflight = run("preflight", root, phase, ...flags);
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.equal(fs.existsSync(path.join(root, "receipts", `${phase}.json`)), false);
  const result = run("checkpoint", root, phase, ...flags);
  assert.equal(result.status, 0, result.stderr);
}

function auditRoles(i1Outputs) {
  const judgeInputs = ["study-plan.md", "audit/i1.json", "audit/i3.json", "audit/claim-provenance.json"];
  for (const panel of ["i2", "i4"]) for (let index = 1; index <= 5; index++) judgeInputs.push(`audit/${panel}/judge-${index}.json`);
  const roles = [
    { role: "i1_score_auditor", agentTask: "i1_score_auditor", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "contract/control-plane/i1-interpreter.mjs", "paper/paper.tex", "paper/paper.pdf", "selection/selected", "selection/canonical-evaluation.json"], outputs: i1Outputs },
    { role: "i3_reference_auditor", agentTask: "i3_reference_auditor", inputs: ["study-plan.md", "paper/references.bib"], outputs: ["audit/i3.json"] },
    { role: "claim_provenance_auditor", agentTask: "claim_provenance_auditor", inputs: ["study-plan.md", "paper/claims.jsonl", "paper/provenance.jsonl", "selection/canonical-evaluation.json"], outputs: ["audit/claim-provenance.json"] },
    { role: "audit_reporter", agentTask: "audit_reporter", inputs: judgeInputs, outputs: ["audit/i2/aggregate.json", "audit/i4/aggregate.json", "audit/report.md"] },
    { role: "reproduction_writer", agentTask: "reproduction_writer", inputs: ["study-plan.md", "environment/bootstrap.json", "selection/selected/manifest.json", "selection/canonical-evaluation.json", "audit/report.md"], outputs: ["delivery/reproduction.md"] },
  ];
  for (const panel of ["i2", "i4"]) {
    const inputs = panel === "i2" ? ["study-plan.md", "contract/input-manifest.json", "selection/selected", "selection/canonical-evaluation.json"] : ["study-plan.md", "paper/paper.tex", "selection/selected"];
    for (let index = 1; index <= 5; index++) roles.push({ role: `${panel}_judge`, agentTask: `${panel}_judge_${index}`, inputs, outputs: [`audit/${panel}/judge-${index}.json`] });
  }
  return roles;
}

test("the CoE ledger verifies a complete chain and catches evidence drift", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-coe-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "request.md", "Find the best supported method.\n");
  put(root, "study-plan.md", "# Approved study plan\n");
  bootstrap(root);
  assert.equal(run("configure", root, "standard", "research").status, 0);
  assert.equal(run("init", root).status, 0);
  installTestRouting(root);

  put(root, "inputs/shared/observations.csv", "value\n1\n");
  const inputHash = run("hash", root, "inputs/shared/observations.csv").stdout.trim();
  put(root, "contract/input-manifest.json", `${JSON.stringify({ schema_version: 1, files: [{ source_path: "data/observations.csv", frozen_path: "inputs/shared/observations.csv", sha256: inputHash, classification: "shared", purpose: "test", may_leave_machine: false }] })}\n`);
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  checkpoint(root, "contract", ["contract"]);

  put(root, "evidence/search-log.jsonl", '{"query":"test"}\n');
  put(root, "evidence/sources.jsonl", '{"id":"source-1"}\n');
  put(root, "investigation/notes/source-1.md");
  put(root, "investigation/directions/direction-1.md");
  for (const file of ["investigation/brief.md", "investigation/references.bib"]) put(root, file);
  put(root, "investigation/protocol-audit.md", "Overall verdict: PASS\n");
  put(root, "investigation/critic.md", "Overall verdict: PASS\n");
  checkpoint(root, "investigation", ["evidence", "investigation"], [
    { role: "literature_mapper", agentTask: "literature_mapper", inputs: ["study-plan.md"], outputs: ["evidence/search-log.jsonl", "evidence/sources.jsonl"] },
    { role: "evidence_reader", agentTask: "evidence_reader", inputs: ["study-plan.md", "evidence/sources.jsonl"], outputs: ["investigation/notes/source-1.md"] },
    { role: "evidence_synthesizer", agentTask: "evidence_synthesizer", inputs: ["study-plan.md", "investigation/notes"], outputs: ["investigation/directions/direction-1.md"] },
    { role: "protocol_auditor", agentTask: "protocol_auditor", inputs: ["study-plan.md", "investigation/directions"], outputs: ["investigation/protocol-audit.md"] },
    { role: "brief_writer", agentTask: "brief_writer", inputs: ["study-plan.md", "investigation/directions", "investigation/protocol-audit.md", "evidence/sources.jsonl"], outputs: ["investigation/brief.md", "investigation/references.bib"] },
    { role: "brief_critic", agentTask: "brief_critic", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["investigation/critic.md"] },
  ]);

  const ideas = [];
  for (let index = 1; index <= 18; index++) ideas.push(JSON.stringify({ id: `idea-${index}`, kind: index <= 2 ? "conservative" : "unconventional" }));
  put(root, "discovery/ideas.jsonl", `${ideas.join("\n")}\n`);
  put(root, "discovery/idea-critique.jsonl", `${ideas.map((_, index) => JSON.stringify({ idea_id: `idea-${index + 1}`, status: "eligible" })).join("\n")}\n`);
  const sharedManifest = fs.readFileSync(path.join(root, "contract", "input-manifest.json"), "utf8");
  const nodes = [];
  const discoveryRoles = [
    { role: "ideator", agentTask: "ideator", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["discovery/ideas.jsonl"] },
    { role: "idea_critic", agentTask: "idea_critic", inputs: ["study-plan.md", "discovery/ideas.jsonl"], outputs: ["discovery/idea-critique.jsonl"] },
  ];
  for (let branch = 1; branch <= 5; branch++) {
    for (let iteration = 1; iteration <= 5; iteration++) {
      const base = `discovery/nodes/i${String(iteration).padStart(2, "0")}-b${String(branch).padStart(2, "0")}`;
      const nodeId = `i${iteration}_b${branch}`;
      nodes.push({ id: nodeId, path: base, status: "eligible", evaluation_path: `${base}/evaluations/v1.json`, legitimacy_verdict_path: `${base}/legitimacy-audit.md` });
      put(root, `${base}/idea.md`);
      put(root, `${base}/shared-input-manifest.json`, sharedManifest);
      put(root, `${base}/experimental-log.md`);
      put(root, `${base}/method-report.md`);
      put(root, `${base}/legitimacy-audit.md`, "Overall verdict: PASS\n");
      put(root, `${base}/snapshots/v1/method.txt`);
      const snapshot = `${base}/snapshots/v1`;
      put(root, `${base}/evaluations/v1.json`, `${JSON.stringify({ snapshot, snapshot_sha256: run("hash", root, snapshot).stdout.trim(), status: "valid", metric: { name: "score", value: 1, unit: "points", direction: "maximize" }, repetitions: [{ seed: 1, value: 1 }], protocol: "approved protocol", command_or_procedure: "test procedure" })}\n`);
      const suffix = `i${iteration}_b${branch}`;
      discoveryRoles.push(
        { role: "candidate_developer", agentTask: `candidate_${suffix}`, inputs: ["study-plan.md", "investigation/brief.md", `${base}/idea.md`, `${base}/shared-input-manifest.json`], outputs: [`${base}/experimental-log.md`, `${base}/method-report.md`, `${base}/snapshots/v1`] },
        { role: "evaluator", agentTask: `evaluator_${suffix}`, inputs: ["study-plan.md", `${base}/snapshots`], outputs: [`${base}/evaluations/v1.json`] },
        { role: "legitimacy_auditor", agentTask: `legitimacy_${suffix}`, inputs: ["study-plan.md", `${base}/idea.md`, `${base}/method-report.md`, `${base}/evaluations`], outputs: [`${base}/legitimacy-audit.md`] },
      );
    }
  }
  put(root, "discovery/index.json", `${JSON.stringify({ nodes, retained: ["i1_b1", "i1_b2"] })}\n`);
  checkpoint(root, "discovery", ["discovery"], discoveryRoles);

  put(root, "selection/selection.md");
  put(root, "selection/selection-audit.md", "Overall verdict: PASS\n");
  copy(root, "discovery/nodes/i01-b01/snapshots/v1/method.txt", "selection/selected/method.txt");
  put(root, "selection/selected/manifest.json", '{"files":["method.txt"]}\n');
  put(root, "selection/lineage.json", `${JSON.stringify({ source_node_id: "i1_b1", source_snapshot_path: "discovery/nodes/i01-b01/snapshots/v1", source_snapshot_sha256: selectedTreeHash(root, "discovery/nodes/i01-b01/snapshots/v1"), selected_snapshot_sha256: selectedTreeHash(root, "selection/selected"), legitimacy_verdict_path: "discovery/nodes/i01-b01/legitimacy-audit.md", evaluation_path: "discovery/nodes/i01-b01/evaluations/v1.json", metric_name: "score", metric_direction: "maximize", rank: 1, tie_break_evidence: [] })}\n`);
  const selectedHash = run("hash", root, "selection/selected").stdout.trim();
  const canonicalRepetitions = Array.from({ length: 5 }, (_, index) => ({ seed: index, value: 1 }));
  const canonical = { status: "valid", snapshot_path: "selection/selected", snapshot_sha256: selectedHash, repetitions: canonicalRepetitions, metric: { id: "score", name: "score", value: 1, unit: "points", direction: "maximize", estimand: "mean", estimand_parameters: {}, repetitions: canonicalRepetitions } };
  put(root, "selection/canonical-evaluation.json", `${JSON.stringify({ ...canonical, snapshot_sha256: "0".repeat(64) })}\n`);
  const selectionRoles = [
    { role: "selection_analyst", agentTask: "selection_analyst", inputs: ["study-plan.md", "discovery/index.json"], outputs: ["selection/selection.md", "selection/lineage.json", "selection/selected"] },
    { role: "selection_auditor", agentTask: "selection_auditor", inputs: ["study-plan.md", "discovery/index.json", "selection/selection.md", "selection/lineage.json"], outputs: ["selection/selection-audit.md"] },
    { role: "evaluator", agentTask: "canonical_evaluator", inputs: ["study-plan.md", "selection/selected"], outputs: ["selection/canonical-evaluation.json"] },
  ];
  const clearUnacceptedSelectionLaunches = () => {
    for (const { agentTask } of selectionRoles) {
      fs.rmSync(path.join(root, "role-launches", `${agentTask}.json`), { force: true });
      fs.rmSync(path.join(root, "role-receipts", `${agentTask}.json`), { force: true });
      fs.rmSync(path.join(root, "role-attempts", agentTask), { recursive: true, force: true });
    }
  };
  put(root, "selection/selected/unlisted.txt", "must be manifested\n");
  assert.throws(() => checkpoint(root, "selection", ["selection"], selectionRoles), /not exhaustive/);
  clearUnacceptedSelectionLaunches();
  fs.unlinkSync(path.join(root, "selection", "selected", "unlisted.txt"));
  assert.throws(() => checkpoint(root, "selection", ["selection"], selectionRoles), /Canonical evaluation is not bound/);
  clearUnacceptedSelectionLaunches();
  put(root, "selection/canonical-evaluation.json", `${JSON.stringify(canonical)}\n`);
  checkpoint(root, "selection", ["selection"], selectionRoles);

  const ablations = Array.from({ length: 4 }, (_, index) => ({ id: `v${index + 1}` }));
  put(root, "ablation/plan.json", `${JSON.stringify({ ablations })}\n`);
  const ablationRoles = [{ role: "ablation_designer", agentTask: "ablation_designer", inputs: ["study-plan.md", "selection/selected"], outputs: ["ablation/plan.json"] }];
  for (const { id } of ablations) {
    put(root, `ablation/variants/${id}/method.txt`);
    const snapshot = `ablation/variants/${id}`;
    put(root, `ablation/evaluations/${id}.json`, `${JSON.stringify({ snapshot, snapshot_sha256: run("hash", root, snapshot).stdout.trim(), status: "valid", metric: { name: "score", value: 1, unit: "points", direction: "maximize" }, repetitions: [{ seed: 1, value: 1 }], protocol: "approved protocol", command_or_procedure: "test procedure" })}\n`);
    ablationRoles.push(
      { role: "ablation_implementer", agentTask: `ablation_implementer_${id}`, inputs: ["study-plan.md", "selection/selected", "ablation/plan.json"], outputs: [`ablation/variants/${id}`] },
      { role: "evaluator", agentTask: `ablation_evaluator_${id}`, inputs: ["study-plan.md", "ablation/variants"], outputs: [`ablation/evaluations/${id}.json`] },
    );
  }
  put(root, "ablation/results.json", `${JSON.stringify({ ablations })}\n`);
  put(root, "ablation/report.md");
  ablationRoles.push({ role: "ablation_analyst", agentTask: "ablation_analyst", inputs: ["study-plan.md", "ablation/plan.json", "ablation/evaluations", "ablation/results.json"], outputs: ["ablation/results.json", "ablation/report.md"] });
  checkpoint(root, "ablation", ["ablation"], ablationRoles);

  const writing = ["paper/representation.md", "paper/grounding-report.json", "paper/critic.md", "paper/paper-tagged.tex", "paper/references.bib"];
  for (const file of writing) put(root, file, file === "paper/grounding-report.json" ? '{"status":"PASS","factual_sentence_count":1,"resolvable_tag_count":1,"grounding_ratio":1,"unresolved_claim_ids":[]}\n' : file === "paper/critic.md" ? "Overall verdict: PASS\n" : undefined);
  put(root, "paper/paper-tagged.tex", "\\documentclass{article}\n\\newcommand{\\coe}[1]{}\nClaim. \\coe{c1}\n");
  put(root, "paper/references.bib", "@article{source1,title={Source}}\n");
  checkpoint(root, "writing", writing, [
    { role: "writer", agentTask: "writer_draft", inputs: ["study-plan.md", "investigation/brief.md", "selection/canonical-evaluation.json", "ablation/results.json"], outputs: ["paper/representation.md", "paper/paper-tagged.tex", "paper/references.bib"] },
    { role: "paper_critic", agentTask: "paper_critic", inputs: ["study-plan.md", "paper/representation.md", "paper/paper-tagged.tex"], outputs: ["paper/grounding-report.json", "paper/critic.md"] },
  ]);

  const verification = ["paper/claims.jsonl", "paper/verification.md", "paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf", "delivery/visual-inspection.json"];
  for (const file of verification) {
    if (file === "paper/claims.jsonl") put(root, file, '{"claim_id":"c1","paper_location":"paper/paper-verified-tagged.tex:3","sentence":"Claim.","claim_type":"numerical","origin":"study","status":"SUPPORTED"}\n');
    else if (file === "paper/provenance.jsonl") put(root, file, `${JSON.stringify({ claim_id: "c1", paper_location: "paper/paper-verified-tagged.tex:3", sentence: "Claim.", claim_type: "numerical", status: "SUPPORTED", evidence: [{ kind: "metric", target: "selection/canonical-evaluation.json", locator: "/metric/value", sha256: run("hash", root, "selection/canonical-evaluation.json").stdout.trim() }] })}\n`);
    else if (file === "paper/verification.md") put(root, file, "Overall verdict: PASS\n");
    else if (file === "paper/paper-verified-tagged.tex") put(root, file, "\\documentclass{article}\n\\newcommand{\\coe}[1]{}\nClaim. \\coe{c1}\n");
    else if (file === "paper/paper.tex") put(root, file, "\\documentclass{article}\nClaim.\n");
    else if (file === "paper/paper.pdf") put(root, file, "not a pdf\n");
    else if (file === "delivery/visual-inspection.json") put(root, file, `${JSON.stringify({ pdf_path: "paper/paper.pdf", pdf_sha256: run("hash", root, "paper/paper.pdf").stdout.trim(), page_count: 1, renderer: "test", timestamp: "2026-08-17T00:00:00Z", checked_pages: [1], detected_defects: [], verdict: "PASS" })}\n`);
    else put(root, file);
  }
  const verificationRoles = [
    { role: "claim_verifier", agentTask: "claim_verifier", inputs: ["study-plan.md", "paper/paper-tagged.tex", "paper/claims.jsonl"], outputs: ["paper/claims.jsonl", "paper/verification.md"] },
    { role: "writer", agentTask: "writer_final", inputs: ["paper/claims.jsonl", "paper/verification.md"], outputs: ["paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf"] },
  ];
  put(root, "paper/provenance.jsonl", '{"claim_id":"c1","paper_location":"paper/paper-verified-tagged.tex:3","sentence":"Claim.","claim_type":"numerical","status":"SUPPORTED","evidence":[{"kind":"metric","target":"selection/missing.json","locator":"/metric/value","sha256":"bad"}]}\n');
  assert.throws(() => checkpoint(root, "verification", verification, verificationRoles), /Missing artifact/);
  put(root, "paper/provenance.jsonl", `${JSON.stringify({ claim_id: "c1", paper_location: "paper/paper-verified-tagged.tex:3", sentence: "Claim.", claim_type: "numerical", status: "SUPPORTED", evidence: [{ kind: "metric", target: "selection/canonical-evaluation.json", locator: "/metric/value", sha256: run("hash", root, "selection/canonical-evaluation.json").stdout.trim() }] })}\n`);
  assert.throws(() => checkpoint(root, "verification", verification, verificationRoles), /structurally valid compiled PDF/);
  put(root, "paper/paper.pdf", minimalPdf());
  put(root, "delivery/visual-inspection.json", `${JSON.stringify({ pdf_path: "paper/paper.pdf", pdf_sha256: run("hash", root, "paper/paper.pdf").stdout.trim(), page_count: 1, renderer: "test", timestamp: "2026-08-17T00:00:00Z", checked_pages: [1], detected_defects: [], verdict: "PASS" })}\n`);
  checkpoint(root, "verification", verification, verificationRoles);

  const canonicalAudit = JSON.parse(fs.readFileSync(path.join(root, "selection/canonical-evaluation.json"), "utf8"));
  const i1Audit = seedI1Audit({ root, mode: "research", selectedSnapshotSha256: canonicalAudit.snapshot_sha256, evidencePath: "selection/canonical-evaluation.json", hash: (base, relative) => run("hash", base, relative).stdout.trim(), json: (base, relative, value) => put(base, relative, `${JSON.stringify(value, null, 2)}\n`), put });
  const fields = { title: "Source" };
  put(root, "audit/i3.json", `${JSON.stringify({ verdict: "PASS", entries: [{ bibkey: "source1", populated_fields: fields, resolved_primary_record: fields, retrieved_at: "2026-08-17T00:00:00Z", field_comparisons: [{ field: "title", expected: "Source", actual: "Source", matches: true }], status: "verified", evidence_path: "paper/references.bib" }], totals: { entries: 1, verified: 1, unresolved: 0, mismatch: 0 } })}\n`);
  put(root, "audit/claim-provenance.json", `${JSON.stringify({ verdict: "PASS", total_numerical_claims: 1, assessed_count: 1, supported_count: 1, coverage_ratio: 1, mismatches: [], unavailable_items: [], evidence_paths: ["paper/provenance.jsonl"] })}\n`);
  put(root, "audit/report.md", "Overall verdict: PASS\nI1 verdict: PASS\nI2 verdict: PASS\nI3 verdict: PASS\nI4 verdict: PASS\nclaim_provenance verdict: PASS\n");
  put(root, "delivery/reproduction.md", "## Selected snapshot\nselection/selected and hash.\n## Environment\nenvironment/bootstrap.json.\n## Inputs and access limits\nShared and private inputs.\n## Procedure\nRun evaluator.\n## Expected canonical output\nselection/canonical-evaluation.json.\n## Verification\nRun `<resolved-node-path> <scientistone-skill-root>/scripts/coe.mjs verify <run>` and inspect manifest.\n");
  for (const panel of ["i2", "i4"]) {
    for (let index = 1; index <= 5; index++) put(root, `audit/${panel}/judge-${index}.json`, `${JSON.stringify(panel === "i2" ? { judge_id: `i2-${index}`, selected_snapshot_sha256: run("hash", root, "selection/selected").stdout.trim(), evaluator_contract_sha256: run("hash", root, "contract/evaluator-contract.md").stdout.trim(), checked_categories: ["evaluator_import"], flagged: false, category: null, evidence_paths: ["selection/canonical-evaluation.json"], rationale: "No violation.", verdict: "PASS" } : { judge_id: `i4-${index}`, paper_method_locations: ["paper.tex:2"], selected_artifacts: [{ path: "selection/selected/method.txt", sha256: run("hash", root, "selection/selected/method.txt").stdout.trim() }], checked_categories: ["method_class_mismatch"], checked_core_mechanisms: ["method"], flagged: false, category: null, evidence_paths: ["selection/selected/method.txt"], rationale: "Aligned.", verdict: "PASS" })}\n`);
    put(root, `audit/${panel}/aggregate.json`, '{"status":"ASSESSED","judge_count":5,"threshold":3,"flag_votes":0,"flagged":false}\n');
  }
  checkpoint(root, "audit", ["audit", "delivery/reproduction.md"], auditRoles(i1Audit.outputs));

  for (const [source, destination] of [
    ["study-plan.md", "study-plan.md"], ["investigation/brief.md", "investigation-brief.md"],
    ["paper/paper.tex", "paper.tex"], ["paper/paper.pdf", "paper.pdf"], ["paper/references.bib", "references.bib"], ["paper/provenance.jsonl", "provenance.jsonl"],
    ["selection/selected/manifest.json", "selected-method/manifest.json"], ["selection/selected/method.txt", "selected-method/method.txt"],
    ["selection/canonical-evaluation.json", "canonical-evaluation.json"], ["ablation/report.md", "ablation-report.md"],
    ["paper/verification.md", "verification.md"], ["audit/report.md", "audit-report.md"],
  ]) copy(root, source, `deliverables/${destination}`);
  copy(root, "delivery/reproduction.md", "deliverables/reproduction.md");
  copy(root, "delivery/visual-inspection.json", "deliverables/visual-inspection.json");
  assert.equal(run("manifest", root).status, 0);
  const status = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
  status.outcome = "positive";
  fs.writeFileSync(path.join(root, "run.json"), `${JSON.stringify(status, null, 2)}\n`);
  checkpoint(root, "complete", ["deliverables"]);

  assert.equal(run("verify", root).status, 0);
  const completionReceipt = JSON.parse(fs.readFileSync(path.join(root, "receipts", "complete.json"), "utf8"));
  completionReceipt.outcome = "scientific_null";
  fs.writeFileSync(path.join(root, "receipts", "complete.json"), `${JSON.stringify(completionReceipt, null, 2)}\n`);
  assert.match(run("verify", root).stderr, /Receipt changed after checkpoint/);
  completionReceipt.outcome = "positive";
  fs.writeFileSync(path.join(root, "receipts", "complete.json"), `${JSON.stringify(completionReceipt, null, 2)}\n`);
  const inconsistent = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
  inconsistent.state = "running";
  fs.writeFileSync(path.join(root, "run.json"), `${JSON.stringify(inconsistent, null, 2)}\n`);
  assert.match(run("verify", root).stderr, /Complete run status is inconsistent/);
  inconsistent.state = "complete";
  fs.writeFileSync(path.join(root, "run.json"), `${JSON.stringify(inconsistent, null, 2)}\n`);
  fs.appendFileSync(path.join(root, "paper", "paper.pdf"), "changed");
  const drift = run("verify", root);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /Evidence changed after verification checkpoint/);
});

test("invalidation preserves receipts and resumes from the earliest affected phase", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-coe-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "request.md");
  put(root, "study-plan.md");
  bootstrap(root);
  assert.equal(run("configure", root, "standard", "research").status, 0);
  assert.equal(run("init", root).status, 0);
  installTestRouting(root);
  put(root, "contract/input-manifest.json", '{"schema_version":1,"files":[]}\n');
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  checkpoint(root, "contract", ["contract"]);
  put(root, "evidence/search-log.jsonl", '{"query":"test"}\n');
  put(root, "evidence/sources.jsonl", '{"id":"source-1"}\n');
  put(root, "investigation/notes/source-1.md");
  put(root, "investigation/directions/direction-1.md");
  put(root, "investigation/protocol-audit.md", "Overall verdict: PASS\n");
  put(root, "investigation/brief.md");
  put(root, "investigation/references.bib");
  put(root, "investigation/critic.md", "Overall verdict: PASS\n");
  checkpoint(root, "investigation", ["evidence", "investigation"], [
    { role: "literature_mapper", agentTask: "literature_mapper", inputs: ["study-plan.md"], outputs: ["evidence/search-log.jsonl", "evidence/sources.jsonl"] },
    { role: "evidence_reader", agentTask: "evidence_reader", inputs: ["study-plan.md", "evidence/sources.jsonl"], outputs: ["investigation/notes/source-1.md"] },
    { role: "evidence_synthesizer", agentTask: "evidence_synthesizer", inputs: ["study-plan.md", "investigation/notes"], outputs: ["investigation/directions/direction-1.md"] },
    { role: "protocol_auditor", agentTask: "protocol_auditor", inputs: ["study-plan.md", "investigation/directions"], outputs: ["investigation/protocol-audit.md"] },
    { role: "brief_writer", agentTask: "brief_writer", inputs: ["study-plan.md", "investigation/directions", "investigation/protocol-audit.md", "evidence/sources.jsonl"], outputs: ["investigation/brief.md", "investigation/references.bib"] },
    { role: "brief_critic", agentTask: "brief_critic", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["investigation/critic.md"] },
  ]);
  put(root, "rollback.md", "Audit found a grounding defect.\n");

  assert.match(run("invalidate", root, "contract", "rollback.md").stderr, /Use revise-contract/);

  fs.appendFileSync(path.join(root, "investigation", "brief.md"), "drift\n");
  const driftedReceipt = JSON.parse(fs.readFileSync(path.join(root, "receipts", "investigation.json"), "utf8"));
  driftedReceipt.outputs = driftedReceipt.outputs.filter((item) => item.path !== "investigation");
  fs.writeFileSync(path.join(root, "receipts", "investigation.json"), `${JSON.stringify(driftedReceipt, null, 2)}\n`);
  const invalidated = run("invalidate", root, "investigation", "rollback.md");
  assert.equal(invalidated.status, 0, invalidated.stderr);
  assert.equal(fs.existsSync(path.join(root, "receipts", "investigation.json")), false);
  const [archive] = fs.readdirSync(path.join(root, "receipts", "superseded"));
  assert.ok(archive);
  assert.equal(fs.existsSync(path.join(root, "investigation", "brief.md")), false);
  assert.equal(fs.readFileSync(path.join(root, "receipts", "superseded", archive, "artifacts", "investigation", "brief.md"), "utf8"), "investigation/brief.md\ndrift\n");
  const verified = run("verify", root);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).last_checkpoint, "contract");
  fs.appendFileSync(path.join(root, "receipts", "superseded", archive, "artifacts", "investigation", "brief.md"), "tampered");
  assert.match(run("verify", root).stderr, /Invalid invalidation root|Superseded artifact changed/);
});

test("required descendants and symlinked ancestors cannot be promoted", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-boundary-"));
  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-boundary-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-outside-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(linkedRoot, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  for (const target of [root, linkedRoot]) {
    put(target, "request.md");
    put(target, "study-plan.md");
    bootstrap(target);
    assert.equal(run("configure", target, "standard", "research").status, 0);
    assert.equal(run("init", target).status, 0);
    installTestRouting(target);
  }
  put(root, "contract/input-manifest.json", '{"schema_version":1,"files":[]}\n');
  assert.match((() => { try { checkpoint(root, "contract", ["contract"]); } catch (error) { return error.message; } })(), /Missing artifact: contract\/audit.md/);
  put(root, "contract/audit.md", "Overall verdict: PASS\nOverall verdict: FAIL\n");
  assert.match((() => { try { checkpoint(root, "contract", ["contract"]); } catch (error) { return error.message; } })(), /unique overall verdict/);

  put(outside, "shared/data.csv", "value\n1\n");
  fs.symlinkSync(outside, path.join(linkedRoot, "inputs"), "dir");
  put(linkedRoot, "contract/input-manifest.json", `${JSON.stringify({ schema_version: 1, files: [{ source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: "0".repeat(64), classification: "shared" }] })}\n`);
  put(linkedRoot, "contract/audit.md", "Overall verdict: PASS\n");
  assert.match((() => { try { checkpoint(linkedRoot, "contract", ["contract"]); } catch (error) { return error.message; } })(), /Symlinked path components/);
});

test("built-in profile budgets cannot be relabelled", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-budget-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "request.md");
  put(root, "study-plan.md");
  assert.equal(run("configure", root, "standard", "research").status, 0);
  const config = JSON.parse(fs.readFileSync(path.join(root, "contract/run-config.json"), "utf8"));
  config.budgets.candidate_node_ceiling = 99;
  put(root, "contract/run-config.json", `${JSON.stringify(config)}\n`);
  assert.match(run("init", root).stderr, /budgets do not match the built-in profile/);
});

test("1.3 freezes the exact bounded attempt and repair limits", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-orchestration-limits-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "request.md");
  put(root, "study-plan.md");
  assert.equal(run("configure", root, "pilot", "research").status, 0);
  const config = JSON.parse(fs.readFileSync(path.join(root, "contract/run-config.json"), "utf8"));
  config.orchestration = { max_task_attempts: 3, max_repair_waves_per_gate: 2 };
  put(root, "contract/run-config.json", `${JSON.stringify(config)}\n`);
  assert.match(run("init", root).stderr, /requires exactly 2/);
});

test("attempt exhaustion requires immutable accepted attempts and becomes a terminal INCOMPLETE state", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-exhausted-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "request.md", "Approved request.\n");
  put(root, "study-plan.md", "Approved plan.\n");
  assert.equal(run("configure", root, "pilot", "research").status, 0);
  assert.equal(run("init", root).status, 0);
  const runRecord = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
  const key = workKey("candidate_developer", ["search/candidates/a/method"], runRecord.contract_revision, runRecord.charter_revision);
  for (const attempt of [1, 2]) {
    const launch = `role-launches/candidate_a${attempt}.json`;
    put(root, launch, `${JSON.stringify({ schema_version: 1, task_id: `native-candidate_a${attempt}`, logical_task_name: "candidate_a", work_key_sha256: key, attempt, contract_revision: runRecord.contract_revision, charter_revision: runRecord.charter_revision, role: "candidate_developer", declared_outputs: ["search/candidates/a/method"], started_at: `2026-08-17T00:00:0${attempt}Z` })}\n`);
    put(root, `role-attempts/candidate_a/${key}/attempt-${attempt}.json`, `${JSON.stringify({ schema_version: 2, logical_task_name: "candidate_a", work_key_sha256: key, attempt, launch_record: launch, launch_record_sha256: run("hash", root, launch).stdout.trim(), accepted_at: `2026-08-17T00:00:0${attempt}.500Z` })}\n`);
  }
  put(root, "failures/task-a2.txt", "Second accepted attempt failed deterministically.\n");
  put(root, "failures/exhaustion.json", `${JSON.stringify({ schema_version: 1, failure_class: "task_attempts_exhausted", logical_task_name: "candidate_a", last_failure: "Second accepted attempt failed deterministically.", exhausted_counter: 2, exhausted_limit: 2, evidence_paths: ["failures/task-a2.txt"], remaining_work: ["Correct the candidate implementation without weakening the study contract."], resume_requirement: "Start a new linked run only after the demonstrated implementation defect is corrected." })}\n`);
  put(root, "terminal/incomplete.json", `${JSON.stringify({ stale: true })}\n`);
  const result = run("exhaust", root, "failures/exhaustion.json");
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
  assert.equal(record.state, "blocked_exhausted");
  assert.equal(record.outcome, "incomplete");
  const terminal = JSON.parse(fs.readFileSync(path.join(root, "terminal/incomplete.json"), "utf8"));
  assert.equal(terminal.disposition, "INCOMPLETE");
  assert.equal(terminal.logical_task_name, "candidate_a");
  assert.equal(terminal.repair_gate, null);
  assert.equal(fs.readdirSync(path.join(root, "terminal/superseded")).length, 1, "a crash-left stale terminal record is preserved and replaced atomically");
  assert.equal(run("verify", root).status, 0);
  assert.notEqual(run("set-state", root, "running").status, 0);
  assert.equal(fs.existsSync(path.join(root, "terminal/incomplete.json")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8")).outcome, "incomplete");
  assert.equal(run("verify", root).status, 0);
  const originalTerminalBytes = fs.readFileSync(path.join(root, "terminal/incomplete.json"));
  terminal.last_failure = "tampered narrative";
  put(root, "terminal/incomplete.json", `${JSON.stringify(terminal)}\n`);
  assert.match(run("verify", root).stderr, /terminal evidence differs/i);
  fs.writeFileSync(path.join(root, "terminal/incomplete.json"), originalTerminalBytes);
  assert.equal(run("verify", root).status, 0);
  const reopened = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
  reopened.state = "running";
  reopened.outcome = null;
  reopened.terminal_anchor = null;
  put(root, "run.json", `${JSON.stringify(reopened)}\n`);
  assert.match(run("verify", root).stderr, /Terminal evidence and outcome incomplete are reserved for blocked_exhausted runs/i);
  put(root, "run.json", `${JSON.stringify(record)}\n`);
  assert.equal(run("verify", root).status, 0);
});

test("claimed exhaustion without immutable accepted attempts is rejected", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-false-exhaustion-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "request.md", "Approved request.\n");
  put(root, "study-plan.md", "Approved plan.\n");
  assert.equal(run("configure", root, "pilot", "research").status, 0);
  assert.equal(run("init", root).status, 0);
  put(root, "failures/task.txt", "Claimed failure.\n");
  put(root, "failures/exhaustion.json", `${JSON.stringify({ schema_version: 1, failure_class: "task_attempts_exhausted", logical_task_name: "candidate_a", last_failure: "Claimed failure.", exhausted_counter: 2, exhausted_limit: 2, evidence_paths: ["failures/task.txt"], remaining_work: ["Do the task."], resume_requirement: "Start a new run after correcting the cause." })}\n`);
  assert.match(run("exhaust", root, "failures/exhaustion.json").stderr, /must match exactly 2 immutable accepted attempts/);
});
