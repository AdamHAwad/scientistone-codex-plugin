import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executionId as computeI1ExecutionId } from "../../plugins/scientist1/skills/scientist1/scripts/i1-interpreter.mjs";
import { installTestRouting, testRuntime } from "./model-routing-fixture.mjs";

// Repository-only fixture; intentionally excluded from the installed plugin.
const INTERPRETER_SOURCE = fileURLToPath(new URL("../../plugins/scientist1/skills/scientist1/scripts/i1-interpreter.mjs", import.meta.url));
const ROLE_CONTRACT_SOURCE = fileURLToPath(new URL("../../plugins/scientist1/skills/scientist1/references/roles.md", import.meta.url));
const INTERPRETER_PATH = "contract/control-plane/i1-interpreter.mjs";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function workKey(role, outputs, contractRevision, charterRevision) {
  return createHash("sha256").update(canonical({ contract_revision: contractRevision, charter_revision: charterRevision, role, declared_outputs: [...outputs].sort() })).digest("hex");
}

function i1BuilderInputs(mode) {
  const inputs = ["request.md", "study-plan.md", "environment/bootstrap.json", "contract/run-config.json", "contract/input-manifest.json", INTERPRETER_PATH];
  inputs.push(mode === "research" ? "contract/evaluator-contract.md" : "contract/source-bundle-manifest.json");
  if (mode === "research") inputs.push("contract/evaluator-manifest.json");
  return inputs;
}

function seedLaunch({ root, task, logicalTaskName = task, attempt = 1, role, inputs, outputs, runtime, hash, json, startedAt }) {
  const run = requireRead(root, "run.json");
  const task_brief = { acceptance_gate: "Produce the declared outputs", constraints: "Use only declared inputs", context: "Synthetic I1 regression fixture", objective: `Complete ${task}`, upstream_summary: [] };
  const assignment = `Synthetic canonical assignment for ${task}`;
  const key = workKey(role, outputs, run.contract_revision, run.charter_revision);
  json(root, `role-launches/${task}.json`, {
    schema_version: 1,
    task_id: `native-${task}`,
    logical_task_name: logicalTaskName,
    work_key_sha256: key,
    attempt,
    contract_revision: run.contract_revision,
    charter_revision: run.charter_revision,
    predecessor: run.last_checkpoint === null ? null : { path: `receipts/${run.last_checkpoint}.json`, sha256: run.checkpoints[run.last_checkpoint].receipt_sha256 },
    role,
    fork_turns: "none",
    model_tier: runtime.tier,
    model: runtime.model,
    reasoning_effort: runtime.reasoning_effort,
    model_routing_sha256: runtime.routing_sha256,
    role_contract_sha256: createHash("sha256").update(fs.readFileSync(ROLE_CONTRACT_SOURCE)).digest("hex"),
    gate_schema_version: 1,
    task_brief,
    task_brief_sha256: createHash("sha256").update(JSON.stringify(task_brief)).digest("hex"),
    assignment,
    assignment_sha256: createHash("sha256").update(assignment).digest("hex"),
    declared_inputs: inputs,
    input_artifacts: inputs.map((path) => ({ path, sha256: hash(root, path) })),
    allowed_external_sources: [],
    declared_outputs: outputs,
    started_at: startedAt,
  });
  return key;
}

function seedI1Contract({ root, mode, runtime, hash, fileHash, json, put, startedAt = "2026-08-22T12:00:00Z", builderTask = "i1_verifier_builder", builderAttempt = 1 }) {
  const builderInputs = i1BuilderInputs(mode);
  const builderOutputs = ["contract/i1-verification-policy.json"];
  fs.mkdirSync(path.join(root, "contract/control-plane"), { recursive: true });
  if (!fs.existsSync(path.join(root, INTERPRETER_PATH))) fs.copyFileSync(INTERPRETER_SOURCE, path.join(root, INTERPRETER_PATH));
  const builderWorkKey = seedLaunch({ root, task: builderTask, logicalTaskName: "i1_verifier_builder", attempt: builderAttempt, role: "i1_verifier_builder", inputs: builderInputs, outputs: builderOutputs, runtime, hash, json, startedAt });
  const builderLaunch = `role-launches/${builderTask}.json`;
  const launchHash = hash(root, builderLaunch);
  json(root, `role-attempts/i1_verifier_builder/${builderWorkKey}/attempt-${builderAttempt}.json`, { schema_version: 2, logical_task_name: "i1_verifier_builder", work_key_sha256: builderWorkKey, attempt: builderAttempt, launch_record: builderLaunch, launch_record_sha256: launchHash, accepted_at: "2026-08-22T12:00:00.500Z" });
  const canonicalRepetitions = requireRead(root, "contract/run-config.json").budgets.canonical_repetitions;
  const metric = {
    id: "score",
    claim_role: "primary",
    name: "score",
    unit: "points",
    direction: "maximize",
    population: "frozen evaluation cases",
    estimand: { type: "mean", semantics_version: "scientist1_i1_v1", parameters: {} },
    transformation: "identity",
    presentation: { rounding: "none", digits: 0, lineage_rule: "Exact displayed canonical value" },
    determinism_class: "deterministic",
    comparison_design: "exact",
    repetitions: {
      canonical: canonicalRepetitions,
      audit: canonicalRepetitions,
      valid_required: canonicalRepetitions,
      canonical_run_ids: Array.from({ length: canonicalRepetitions }, (_, index) => `canonical-${index + 1}`),
      audit_run_ids: Array.from({ length: canonicalRepetitions }, (_, index) => `audit-${index + 1}`),
      rationale: "Deterministic fixture follows the frozen run profile",
    },
    randomness: { seed_policy: "fixed ordered seeds", paired_keys: [], resampling_seed: null },
    equivalence_margin: { type: "exact", lower: 0, upper: 0, reference_scale: null, rationale: "Deterministic exact fixture" },
    uncertainty: { method: "exact", computed_by: "frozen_evaluator", confidence_level: null, noise_measure: "none", noise_ceiling: 0 },
    hardware: { mode: "not_applicable", requirements: [], reference: null, external_unavailable_outcome: "NOT_ASSESSED", research_unavailable_outcome: "FAIL" },
    failure_policy: { missing_pair: "fail", invalid_run: "fail", operational_retry_limit: 1, exhausted_retry_outcome: "FAIL" },
  };
  const execution = {
    evaluator_argv: [process.execPath, "private/evaluator/evaluate.mjs", "<selected-snapshot>", "<private-output>"],
    network: false,
    allowed_input_classes: ["frozen_extraction", "canonical_evaluation", "selected_snapshot"],
    private_execution_root: "private/evaluator/i1-runs",
    evaluator_output_name: "result.json",
    safe_output_paths: ["audit/i1/lineage.json", "audit/i1/reproducibility.json", "audit/i1/claim-semantics.json"],
    determinism: { canonical_json: true, fixed_locale: "C", fixed_timezone: "UTC", fixed_concurrency: 1, stable_ordering: true, same_input_same_payload: true },
  };
  const bindings = {
    study_plan: { path: "study-plan.md", sha256: hash(root, "study-plan.md") },
    environment_bootstrap: { path: "environment/bootstrap.json", sha256: hash(root, "environment/bootstrap.json") },
    input_manifest: { path: "contract/input-manifest.json", sha256: hash(root, "contract/input-manifest.json") },
    ...(mode === "research"
      ? {
          evaluator_contract: { path: "contract/evaluator-contract.md", sha256: hash(root, "contract/evaluator-contract.md") },
          evaluator_manifest: { path: "contract/evaluator-manifest.json", sha256: hash(root, "contract/evaluator-manifest.json") },
        }
      : { source_bundle_manifest: { path: "contract/source-bundle-manifest.json", sha256: hash(root, "contract/source-bundle-manifest.json") } }),
  };
  json(root, "contract/i1-verification-policy.json", {
    schema_version: 2,
    policy_id: `test-${mode}-i1`,
    mode,
    profile: "task_adaptive_v1",
    freeze_stage: mode === "research" ? "pre_candidate" : "pre_i1_execution_external",
    frozen_before_candidate_generation: mode === "research",
    result_blind_authoring: true,
    authored_by: { role: "i1_verifier_builder", launch_record_path: builderLaunch, launch_record_sha256: launchHash },
    bindings,
    metrics: [metric],
    decision_rule: { type: "all", primary_metric_ids: ["score"], constraint_metric_ids: [], multiplicity_method: null },
    variance_policy: { widens_equivalence_margin: false, excess_noise_outcome: "FAIL", rationale: "Variance affects uncertainty only" },
    interpreter: { version: "1.1.0", path: INTERPRETER_PATH, sha256: hash(root, INTERPRETER_PATH) },
    execution,
    verdicts: { allowed: ["PASS", "FAIL", "NOT_ASSESSED"], research_required: "PASS", not_assessed_mode: "external_audit_only" },
  });
  return { builderTask, builderAttempt, builderInputs, builderOutputs, contractAuditorInputs: [...builderInputs, ...builderOutputs] };
}

function seedI1Audit({ root, mode, selectedSnapshotSha256, evidencePath, unavailableItem = evidencePath, hash, json, put, reproducibilityVerdict = "PASS", notAssessed = false, canonicalValue = 1, lineageValue = canonicalValue }) {
  const policy = requireRead(root, "contract/i1-verification-policy.json");
  const policySha = hash(root, "contract/i1-verification-policy.json");
  const interpreterSha = hash(root, INTERPRETER_PATH);
  const metric = policy.metrics[0];
  const extraction = (medium) => notAssessed
    ? { schema_version: 1, medium, status: "NOT_ASSESSED", metrics: [], unavailable_items: [unavailableItem], limitations: ["Required source is unavailable"] }
    : { schema_version: 1, medium, status: "ASSESSED", metrics: [{ metric_id: metric.id, displayed_value: lineageValue, normalized_value: lineageValue, name: metric.name, unit: metric.unit, direction: metric.direction, estimand_language: "mean", aggregation_language: "mean of repetitions", uncertainty_language: "deterministic exact", locator: `${medium}:1` }], unavailable_items: [], limitations: [] };
  json(root, "audit/i1/tex-extraction.json", extraction("tex"));
  json(root, "audit/i1/pdf-extraction.json", extraction("pdf"));
  const inputPaths = ["contract/i1-verification-policy.json", INTERPRETER_PATH];
  if (mode === "research") inputPaths.push(evidencePath, "environment/bootstrap.json", "contract/evaluator-contract.md", "contract/evaluator-manifest.json", "selection/selected");
  else {
    inputPaths.push("contract/source-bundle-manifest.json");
    inputPaths.push(...requireRead(root, "contract/source-bundle-manifest.json").items.filter((item) => item.available && item.intended_checks.includes("I1")).map((item) => item.frozen_path));
  }
  const inputFiles = [...new Set(inputPaths)].map((path) => ({ path, sha256: hash(root, path), access_class: path.startsWith("private/") ? "evaluator_only" : "shared" }));
  json(root, "audit/i1/input-manifest.json", { schema_version: 1, files: inputFiles });
  const inputManifestSha = hash(root, "audit/i1/input-manifest.json");
  if (notAssessed) {
    const evidenceFiles = ["audit/i1/tex-extraction.json", "audit/i1/pdf-extraction.json"].map((file) => ({ path: file, sha256: hash(root, file), access_class: "audit_safe" }));
    json(root, "audit/i1/evidence-manifest.json", { schema_version: 1, files: evidenceFiles });
    const evidenceSha = hash(root, "audit/i1/evidence-manifest.json");
    const componentBase = { schema_version: 1, policy_sha256: policySha, evidence_manifest_sha256: evidenceSha, verdict: "NOT_ASSESSED", metrics: [], mismatches: [], unavailable_items: [unavailableItem], limitations: ["Required source is unavailable"], evidence_paths: ["audit/i1/evidence-manifest.json"] };
    for (const component of ["lineage", "reproducibility", "claim-semantics"]) json(root, `audit/i1/${component}.json`, componentBase);
    const executionId = computeI1ExecutionId({ policy_sha256: policySha, interpreter_sha256: interpreterSha, input_manifest_sha256: inputManifestSha, selected_snapshot_sha256: selectedSnapshotSha256, attempt: 1 });
    json(root, "audit/i1/execution-receipt.json", { schema_version: 2, execution_id: executionId, attempt: 1, executed: false, argv: policy.execution.evaluator_argv, policy_sha256: policySha, interpreter_sha256: interpreterSha, input_manifest_sha256: inputManifestSha, environment_sha256: hash(root, "environment/bootstrap.json"), selected_snapshot_sha256: selectedSnapshotSha256, started_at: null, completed_at: null, exit_status: null, retry_count: 0, failure_category: "unavailable_input", private_execution_path: null, raw_artifacts: [], safe_output: null, undeclared_inputs_accessed: [], network_accesses: [], environment_changes: [], limitations: ["Evaluator was not executed because required source was unavailable"] });
    json(root, "audit/i1.json", { schema_version: 2, verdict: "NOT_ASSESSED", policy: { path: "contract/i1-verification-policy.json", sha256: policySha, profile: policy.profile }, interpreter: policy.interpreter, selected_snapshot_sha256: selectedSnapshotSha256, components: Object.fromEntries(["lineage", "reproducibility", "claim-semantics"].map((name) => [name, { path: `audit/i1/${name}.json`, sha256: hash(root, `audit/i1/${name}.json`), verdict: "NOT_ASSESSED" }])), execution_receipt: { path: "audit/i1/execution-receipt.json", sha256: hash(root, "audit/i1/execution-receipt.json") }, evidence_paths: ["audit/i1/evidence-manifest.json"], unavailable_items: [unavailableItem], limitations: ["Required source is unavailable"], rollback_phase: null });
    return { outputs: ["audit/i1", "audit/i1.json"], privateRoot: null };
  }
  const executionId = computeI1ExecutionId({ policy_sha256: policySha, interpreter_sha256: interpreterSha, input_manifest_sha256: inputManifestSha, selected_snapshot_sha256: selectedSnapshotSha256, attempt: 1 });
  const privateRoot = `private/evaluator/i1-runs/${executionId}`;
  put(root, `${privateRoot}/stdout.txt`, "deterministic output\n");
  const interval = reproducibilityVerdict === "PASS" ? { lower: 0, upper: 0 } : { lower: -1, upper: 1 };
  const comparisonPassed = reproducibilityVerdict === "PASS";
  const repeatedValues = Array.from({ length: metric.repetitions.canonical }, () => canonicalValue);
  const canonicalRuns = metric.repetitions.canonical_run_ids.map((run_id) => ({ run_id, status: "valid", value: canonicalValue, failure_reason: null }));
  const auditRuns = metric.repetitions.audit_run_ids.map((run_id, index) => ({ run_id, paired_canonical_run_id: metric.repetitions.canonical_run_ids[index], status: "valid", value: canonicalValue, failure_reason: null }));
  const evaluatorMetric = { metric_id: metric.id, estimand: metric.estimand.type, estimand_parameters: metric.estimand.parameters, comparison_design: metric.comparison_design, uncertainty_method: metric.uncertainty.method, canonical_runs: canonicalRuns, audit_runs: auditRuns, canonical_estimate: canonicalValue, audit_estimate: canonicalValue, interval, noise_value: 0, environment_passed: true };
  json(root, `${privateRoot}/result.json`, { schema_version: 2, selected_snapshot_sha256: selectedSnapshotSha256, multiplicity_method: policy.decision_rule.multiplicity_method, metrics: [evaluatorMetric] });
  const evidenceFiles = ["audit/i1/tex-extraction.json", "audit/i1/pdf-extraction.json", `${privateRoot}/stdout.txt`, `${privateRoot}/result.json`].map((path) => ({ path, sha256: hash(root, path), access_class: path.startsWith("private/") ? "evaluator_only" : "audit_safe" }));
  json(root, "audit/i1/evidence-manifest.json", { schema_version: 1, files: evidenceFiles });
  const evidenceSha = hash(root, "audit/i1/evidence-manifest.json");
  const componentBase = { schema_version: 1, policy_sha256: policySha, evidence_manifest_sha256: evidenceSha, mismatches: [], unavailable_items: [], limitations: [], evidence_paths: [evidencePath] };
  json(root, "audit/i1/lineage.json", { ...componentBase, verdict: "PASS", metrics: [{ metric_id: metric.id, canonical_value: lineageValue, tex_value: lineageValue, pdf_value: lineageValue, tex_matches: true, pdf_matches: true, verdict: "PASS" }] });
  json(root, "audit/i1/reproducibility.json", { ...componentBase, verdict: reproducibilityVerdict, metrics: [{ metric_id: metric.id, canonical_runs: canonicalRuns, audit_runs: auditRuns, canonical_values: repeatedValues, audit_values: repeatedValues, canonical_estimate: canonicalValue, audit_estimate: canonicalValue, missing_pairs: 0, invalid_runs: 0, interval, equivalence_margin: { lower: 0, upper: 0 }, noise: { value: 0, ceiling: 0, within_ceiling: true }, environment_passed: true, comparison_passed: comparisonPassed, verdict: reproducibilityVerdict }] });
  const semanticChecks = { metric_matches: true, unit_matches: true, direction_matches: true, estimand_matches: true, aggregation_matches: true, uncertainty_matches: true, scope_matches: true };
  json(root, "audit/i1/claim-semantics.json", { ...componentBase, verdict: "PASS", metrics: [{ metric_id: metric.id, paper_locations: ["paper:1"], ...semanticChecks, verdict: "PASS" }] });
  json(root, "audit/i1/execution-receipt.json", {
    schema_version: 2,
    execution_id: executionId,
    attempt: 1,
    executed: true,
    argv: policy.execution.evaluator_argv,
    policy_sha256: policySha,
    interpreter_sha256: interpreterSha,
    input_manifest_sha256: inputManifestSha,
    environment_sha256: hash(root, "environment/bootstrap.json"),
    selected_snapshot_sha256: selectedSnapshotSha256,
    started_at: "2026-08-22T12:00:00Z",
    completed_at: "2026-08-22T12:00:01Z",
    exit_status: 0,
    retry_count: 0,
    failure_category: null,
    private_execution_path: privateRoot,
    raw_artifacts: [{ path: `${privateRoot}/stdout.txt`, sha256: hash(root, `${privateRoot}/stdout.txt`) }, { path: `${privateRoot}/result.json`, sha256: hash(root, `${privateRoot}/result.json`) }],
    safe_output: { path: `${privateRoot}/result.json`, sha256: hash(root, `${privateRoot}/result.json`) },
    undeclared_inputs_accessed: [],
    network_accesses: [],
    environment_changes: [],
    limitations: [],
  });
  const componentVerdicts = { lineage: "PASS", reproducibility: reproducibilityVerdict, "claim-semantics": "PASS" };
  json(root, "audit/i1.json", {
    schema_version: 2,
    verdict: reproducibilityVerdict,
    policy: { path: "contract/i1-verification-policy.json", sha256: policySha, profile: policy.profile },
    interpreter: policy.interpreter,
    selected_snapshot_sha256: selectedSnapshotSha256,
    components: Object.fromEntries(Object.entries(componentVerdicts).map(([name, verdict]) => [name, { path: `audit/i1/${name}.json`, sha256: hash(root, `audit/i1/${name}.json`), verdict }])),
    execution_receipt: { path: "audit/i1/execution-receipt.json", sha256: hash(root, "audit/i1/execution-receipt.json") },
    evidence_paths: [evidencePath, "audit/i1/evidence-manifest.json"],
    unavailable_items: [],
    limitations: [],
    rollback_phase: reproducibilityVerdict === "PASS" ? null : "contract",
  });
  return { outputs: ["audit/i1", "audit/i1.json", privateRoot], privateRoot };
}

function requireRead(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

export { installTestRouting, seedI1Audit, seedI1Contract, testRuntime };
