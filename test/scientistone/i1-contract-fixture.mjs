import fs from "node:fs";
import path from "node:path";
import { installTestRouting, testRuntime } from "./model-routing-fixture.mjs";

// Repository-only fixture; intentionally excluded from the installed plugin.

function i1BuilderInputs(mode) {
  const inputs = ["request.md", "study-plan.md", "environment/bootstrap.json", "environment/model-routing.json", "contract/run-config.json", "contract/input-manifest.json"];
  inputs.push(mode === "research" ? "contract/evaluator-contract.md" : "contract/source-bundle-manifest.json");
  if (mode === "research") inputs.push("contract/evaluator-manifest.json");
  return inputs;
}

function seedLaunch({ root, task, role, inputs, outputs, runtime, json, startedAt }) {
  json(root, `role-launches/${task}.json`, {
    schema_version: 1,
    task_id: `native-${task}`,
    role,
    fork_turns: "none",
    model_tier: runtime.tier,
    model: runtime.model,
    reasoning_effort: runtime.reasoning_effort,
    model_routing_sha256: runtime.routing_sha256,
    declared_inputs: inputs,
    allowed_external_sources: [],
    declared_outputs: outputs,
    started_at: startedAt,
  });
}

function seedI1Contract({ root, mode, runtime, hash, fileHash, json, put, startedAt = "2026-08-22T12:00:00Z" }) {
  const builderInputs = i1BuilderInputs(mode);
  const builderOutputs = ["contract/i1-verification-policy.json", "private/evaluator/i1-verifier"];
  seedLaunch({ root, task: "i1_verifier_builder", role: "i1_verifier_builder", inputs: builderInputs, outputs: builderOutputs, runtime, json, startedAt });
  const launchHash = hash(root, "role-launches/i1_verifier_builder.json");
  const runtimeHash = fileHash(process.execPath);
  const metric = {
    id: "score",
    claim_role: "primary",
    name: "score",
    unit: "points",
    direction: "maximize",
    population: "frozen evaluation cases",
    estimand: { type: "mean", definition: "Arithmetic mean across frozen repetitions" },
    transformation: "identity",
    presentation: { rounding: "none", digits: 0, lineage_rule: "Exact displayed canonical value" },
    determinism_class: "deterministic",
    comparison_design: "exact",
    repetitions: { canonical: 2, audit: 2, valid_required: 2, rationale: "Deterministic fixture requires two confirming runs" },
    randomness: { seed_policy: "fixed ordered seeds", paired_keys: [], resampling_seed: null },
    equivalence_margin: { type: "exact", lower: 0, upper: 0, reference_scale: null, rationale: "Deterministic exact fixture" },
    uncertainty: { method: "exact", confidence_level: null, noise_measure: "none", noise_ceiling: 0 },
    hardware: { mode: "not_applicable", requirements: [], reference: null, external_unavailable_outcome: "NOT_ASSESSED", research_unavailable_outcome: "INCONCLUSIVE" },
    failure_policy: { missing_pair: "inconclusive", invalid_run: "inconclusive", operational_retry_limit: 1, exhausted_retry_outcome: "INCONCLUSIVE" },
  };
  const verifier = {
    manifest_path: "private/evaluator/i1-verifier/manifest.json",
    source_root: "private/evaluator/i1-verifier/source",
    fixtures_root: "private/evaluator/i1-verifier/fixtures",
    self_test_path: "private/evaluator/i1-verifier/self-test.json",
    runtime_path: process.execPath,
    runtime_sha256: runtimeHash,
    argv: [process.execPath, "private/evaluator/i1-verifier/source/verify.mjs", "<input-manifest>", "<private-output>"],
    network: false,
    allowed_input_classes: ["frozen_extraction", "canonical_evaluation", "selected_snapshot"],
    private_execution_root: "private/evaluator/i1-runs",
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
    schema_version: 1,
    policy_id: `test-${mode}-i1`,
    mode,
    profile: "task_adaptive_v1",
    freeze_stage: mode === "research" ? "pre_candidate" : "pre_i1_execution_external",
    frozen_before_candidate_generation: mode === "research",
    result_blind_authoring: true,
    authored_by: { role: "i1_verifier_builder", launch_record_path: "role-launches/i1_verifier_builder.json", launch_record_sha256: launchHash },
    bindings,
    metrics: [metric],
    decision_rule: { type: "all", primary_metric_ids: ["score"], constraint_metric_ids: [], multiplicity_method: null },
    variance_policy: { widens_equivalence_margin: false, excess_noise_outcome: "INCONCLUSIVE", rationale: "Variance affects uncertainty only" },
    verifier,
    verdicts: { allowed: ["PASS", "FAIL", "INCONCLUSIVE", "NOT_ASSESSED"], research_required: "PASS", not_assessed_mode: "external_audit_only" },
  });
  put(root, "private/evaluator/i1-verifier/source/verify.mjs", "// deterministic test verifier\n");
  const classes = ["positive", "boundary", "mismatch", "malformed_input", "missing_run"];
  for (const kind of classes) json(root, `private/evaluator/i1-verifier/fixtures/${kind}.json`, { class: kind });
  const sourceFiles = [{ path: "private/evaluator/i1-verifier/source/verify.mjs", sha256: hash(root, "private/evaluator/i1-verifier/source/verify.mjs") }];
  const fixtureFiles = classes.map((kind) => ({ path: `private/evaluator/i1-verifier/fixtures/${kind}.json`, sha256: hash(root, `private/evaluator/i1-verifier/fixtures/${kind}.json`) }));
  json(root, "private/evaluator/i1-verifier/self-test.json", {
    schema_version: 1,
    verdict: "PASS",
    cases: classes.map((kind) => ({ id: kind, class: kind, fixture_path: `private/evaluator/i1-verifier/fixtures/${kind}.json`, fixture_sha256: hash(root, `private/evaluator/i1-verifier/fixtures/${kind}.json`), expected_verdict: kind === "mismatch" ? "FAIL" : kind === "positive" ? "PASS" : "INCONCLUSIVE", actual_verdict: kind === "mismatch" ? "FAIL" : kind === "positive" ? "PASS" : "INCONCLUSIVE", output_sha256: "a".repeat(64), passed: true })),
  });
  json(root, "private/evaluator/i1-verifier/manifest.json", {
    schema_version: 1,
    policy_path: "contract/i1-verification-policy.json",
    policy_sha256: hash(root, "contract/i1-verification-policy.json"),
    source_root: verifier.source_root,
    source_tree_sha256: hash(root, verifier.source_root),
    source_files: sourceFiles,
    fixtures_root: verifier.fixtures_root,
    fixtures_tree_sha256: hash(root, verifier.fixtures_root),
    fixture_files: fixtureFiles,
    runtime_path: verifier.runtime_path,
    runtime_sha256: runtimeHash,
    argv: verifier.argv,
    network: false,
    dependencies: [],
    allowed_input_classes: verifier.allowed_input_classes,
    safe_output_paths: verifier.safe_output_paths,
  });
  json(root, "private/evaluator/i1-verifier/build-receipt.json", {
    schema_version: 1,
    builder_launch_record: "role-launches/i1_verifier_builder.json",
    builder_launch_record_sha256: launchHash,
    policy_path: "contract/i1-verification-policy.json",
    policy_sha256: hash(root, "contract/i1-verification-policy.json"),
    manifest_path: "private/evaluator/i1-verifier/manifest.json",
    manifest_sha256: hash(root, "private/evaluator/i1-verifier/manifest.json"),
    source_tree_sha256: hash(root, verifier.source_root),
    fixtures_tree_sha256: hash(root, verifier.fixtures_root),
    self_test_path: verifier.self_test_path,
    self_test_sha256: hash(root, verifier.self_test_path),
    network_used: false,
    undeclared_inputs_accessed: [],
    limitations: [],
    verdict: "PASS",
  });
  return { builderInputs, builderOutputs, contractAuditorInputs: [...builderInputs, ...builderOutputs] };
}

function seedI1Audit({ root, mode, selectedSnapshotSha256, evidencePath, unavailableItem = evidencePath, hash, json, put, reproducibilityVerdict = "PASS", notAssessed = false }) {
  const policy = requireRead(root, "contract/i1-verification-policy.json");
  const policySha = hash(root, "contract/i1-verification-policy.json");
  const manifestSha = hash(root, "private/evaluator/i1-verifier/manifest.json");
  const metric = policy.metrics[0];
  const extraction = (medium) => notAssessed
    ? { schema_version: 1, medium, status: "NOT_ASSESSED", metrics: [], unavailable_items: [unavailableItem], limitations: ["Required source is unavailable"] }
    : { schema_version: 1, medium, status: "ASSESSED", metrics: [{ metric_id: metric.id, displayed_value: 1, normalized_value: 1, name: metric.name, unit: metric.unit, direction: metric.direction, estimand_language: "mean", aggregation_language: "mean of repetitions", uncertainty_language: "deterministic exact", locator: `${medium}:1` }], unavailable_items: [], limitations: [] };
  json(root, "audit/i1/tex-extraction.json", extraction("tex"));
  json(root, "audit/i1/pdf-extraction.json", extraction("pdf"));
  const inputFiles = ["contract/i1-verification-policy.json", "private/evaluator/i1-verifier/manifest.json", evidencePath].map((path) => ({ path, sha256: hash(root, path), access_class: path.startsWith("private/") ? "evaluator_only" : "shared" }));
  json(root, "audit/i1/input-manifest.json", { schema_version: 1, files: inputFiles });
  if (notAssessed) {
    const evidenceFiles = ["audit/i1/tex-extraction.json", "audit/i1/pdf-extraction.json"].map((file) => ({ path: file, sha256: hash(root, file), access_class: "audit_safe" }));
    json(root, "audit/i1/evidence-manifest.json", { schema_version: 1, files: evidenceFiles });
    const evidenceSha = hash(root, "audit/i1/evidence-manifest.json");
    const componentBase = { schema_version: 1, policy_sha256: policySha, evidence_manifest_sha256: evidenceSha, verdict: "NOT_ASSESSED", metrics: [], mismatches: [], unavailable_items: [unavailableItem], limitations: ["Required source is unavailable"], evidence_paths: ["audit/i1/evidence-manifest.json"] };
    for (const component of ["lineage", "reproducibility", "claim-semantics"]) json(root, `audit/i1/${component}.json`, componentBase);
    json(root, "audit/i1/execution-receipt.json", { schema_version: 1, execution_id: null, attempt: 0, executed: false, argv: [], policy_sha256: policySha, verifier_manifest_sha256: manifestSha, source_tree_sha256: requireRead(root, "private/evaluator/i1-verifier/manifest.json").source_tree_sha256, input_manifest_sha256: hash(root, "audit/i1/input-manifest.json"), environment_sha256: hash(root, "environment/bootstrap.json"), selected_snapshot_sha256: selectedSnapshotSha256, started_at: null, completed_at: null, exit_status: null, retry_count: 0, failure_category: "unavailable_input", private_execution_path: null, raw_artifacts: [], safe_output: null, undeclared_inputs_accessed: [], network_accesses: [], environment_changes: [], limitations: ["Verifier was not executed because required source was unavailable"] });
    const manifest = requireRead(root, "private/evaluator/i1-verifier/manifest.json");
    json(root, "audit/i1.json", { schema_version: 1, verdict: "NOT_ASSESSED", policy: { path: "contract/i1-verification-policy.json", sha256: policySha, profile: policy.profile }, verifier: { manifest_path: "private/evaluator/i1-verifier/manifest.json", manifest_sha256: manifestSha, source_tree_sha256: manifest.source_tree_sha256 }, selected_snapshot_sha256: selectedSnapshotSha256, components: Object.fromEntries(["lineage", "reproducibility", "claim-semantics"].map((name) => [name, { path: `audit/i1/${name}.json`, sha256: hash(root, `audit/i1/${name}.json`), verdict: "NOT_ASSESSED" }])), execution_receipt: { path: "audit/i1/execution-receipt.json", sha256: hash(root, "audit/i1/execution-receipt.json") }, evidence_paths: ["audit/i1/evidence-manifest.json"], unavailable_items: [unavailableItem], limitations: ["Required source is unavailable"], rollback_phase: null });
    return { outputs: ["audit/i1", "audit/i1.json"], privateRoot: null };
  }
  const executionId = "b".repeat(64);
  const privateRoot = `private/evaluator/i1-runs/${executionId}`;
  put(root, `${privateRoot}/stdout.txt`, "deterministic output\n");
  const evidenceFiles = ["audit/i1/tex-extraction.json", "audit/i1/pdf-extraction.json", `${privateRoot}/stdout.txt`].map((path) => ({ path, sha256: hash(root, path), access_class: path.startsWith("private/") ? "evaluator_only" : "audit_safe" }));
  json(root, "audit/i1/evidence-manifest.json", { schema_version: 1, files: evidenceFiles });
  const evidenceSha = hash(root, "audit/i1/evidence-manifest.json");
  const componentBase = { schema_version: 1, policy_sha256: policySha, evidence_manifest_sha256: evidenceSha, mismatches: [], unavailable_items: [], limitations: [], evidence_paths: [evidencePath] };
  json(root, "audit/i1/lineage.json", { ...componentBase, verdict: "PASS", metrics: [{ metric_id: metric.id, canonical_value: 1, tex_value: 1, pdf_value: 1, tex_matches: true, pdf_matches: true, verdict: "PASS" }] });
  const interval = reproducibilityVerdict === "PASS" ? { lower: 0, upper: 0 } : { lower: -1, upper: 1 };
  const comparisonPassed = reproducibilityVerdict === "PASS";
  json(root, "audit/i1/reproducibility.json", { ...componentBase, verdict: reproducibilityVerdict, metrics: [{ metric_id: metric.id, canonical_values: [1, 1], audit_values: [1, 1], interval, equivalence_margin: { lower: 0, upper: 0 }, noise: { value: 0, ceiling: 0, within_ceiling: true }, environment_passed: true, comparison_passed: comparisonPassed, verdict: reproducibilityVerdict }] });
  const semanticChecks = { metric_matches: true, unit_matches: true, direction_matches: true, estimand_matches: true, aggregation_matches: true, uncertainty_matches: true, scope_matches: true };
  json(root, "audit/i1/claim-semantics.json", { ...componentBase, verdict: "PASS", metrics: [{ metric_id: metric.id, paper_locations: ["paper:1"], ...semanticChecks, verdict: "PASS" }] });
  const manifest = requireRead(root, "private/evaluator/i1-verifier/manifest.json");
  json(root, "audit/i1/execution-receipt.json", {
    schema_version: 1,
    execution_id: executionId,
    attempt: 1,
    executed: true,
    argv: manifest.argv,
    policy_sha256: policySha,
    verifier_manifest_sha256: manifestSha,
    source_tree_sha256: manifest.source_tree_sha256,
    input_manifest_sha256: hash(root, "audit/i1/input-manifest.json"),
    environment_sha256: hash(root, "environment/bootstrap.json"),
    selected_snapshot_sha256: selectedSnapshotSha256,
    started_at: "2026-08-22T12:00:00Z",
    completed_at: "2026-08-22T12:00:01Z",
    exit_status: 0,
    retry_count: 0,
    failure_category: null,
    private_execution_path: privateRoot,
    raw_artifacts: [{ path: `${privateRoot}/stdout.txt`, sha256: hash(root, `${privateRoot}/stdout.txt`) }],
    safe_output: { path: "audit/i1/reproducibility.json", sha256: hash(root, "audit/i1/reproducibility.json") },
    undeclared_inputs_accessed: [],
    network_accesses: [],
    environment_changes: [],
    limitations: [],
  });
  const componentVerdicts = { lineage: "PASS", reproducibility: reproducibilityVerdict, "claim-semantics": "PASS" };
  json(root, "audit/i1.json", {
    schema_version: 1,
    verdict: reproducibilityVerdict,
    policy: { path: "contract/i1-verification-policy.json", sha256: policySha, profile: policy.profile },
    verifier: { manifest_path: "private/evaluator/i1-verifier/manifest.json", manifest_sha256: manifestSha, source_tree_sha256: manifest.source_tree_sha256 },
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
