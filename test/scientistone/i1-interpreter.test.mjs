import assert from "node:assert/strict";
import test from "node:test";
import { aggregateVerdicts, compareInterval, evaluateReproducibilityMetric, executionId, summarize, validatePolicySupport } from "../../plugins/scientistone/skills/scientistone/scripts/i1-interpreter.mjs";

test("common I1 interpreter computes every supported estimand deterministically", () => {
  assert.equal(summarize([4], "single_seed"), 4);
  assert.equal(summarize([1, 3, 5], "mean"), 3);
  assert.equal(summarize([9, 1, 5], "median"), 5);
  assert.equal(summarize([0, 10], "quantile", { probability: 0.25, method: "linear_type7" }), 2.5);
  assert.equal(summarize([1, 1, 0], "rate", { denominator: 4 }), 0.5);
  assert.equal(summarize([2, 4], "ratio", { denominator: 2 }), 1.5);
  assert.throws(() => summarize([-1, 1], "paired_difference"), /Unsupported/);
});

test("common I1 interpreter keeps PASS, FAIL, and INCONCLUSIVE boundaries distinct", () => {
  assert.equal(compareInterval({ lower: -0.1, upper: 0.1 }, { lower: -0.2, upper: 0.2 }), "PASS");
  assert.equal(compareInterval({ lower: -0.2, upper: 0.1 }, { lower: -0.2, upper: 0.2 }), "INCONCLUSIVE");
  assert.equal(compareInterval({ lower: -0.2, upper: 0.2 }, { lower: -0.2, upper: 0.2 }), "INCONCLUSIVE");
  assert.equal(compareInterval({ lower: 0, upper: 0 }, { lower: 0, upper: 0 }), "PASS");
  assert.equal(compareInterval({ lower: 0.3, upper: 0.4 }, { lower: -0.2, upper: 0.2 }), "FAIL");
  assert.equal(compareInterval({ lower: 0.1, upper: 0.3 }, { lower: -0.2, upper: 0.2 }), "INCONCLUSIVE");
  assert.equal(aggregateVerdicts(["PASS", "NOT_ASSESSED"]), "NOT_ASSESSED");
  assert.equal(aggregateVerdicts(["PASS", "INCONCLUSIVE", "NOT_ASSESSED"]), "NOT_ASSESSED");
  assert.equal(aggregateVerdicts(["PASS", "FAIL", "INCONCLUSIVE"]), "FAIL");
});

test("common I1 interpreter accepts the task-adaptive direction and estimand surface", () => {
  for (const direction of ["maximize", "minimize", "target", "signed"]) {
    assert.equal(validatePolicySupport({ schema_version: 2, metrics: [{ id: "score", direction, estimand: { type: "mean", semantics_version: "scientistone_i1_v1", parameters: {} }, repetitions: { canonical: 1, audit: 1, valid_required: 1, canonical_run_ids: ["c1"], audit_run_ids: ["a1"] }, comparison_design: "exact", uncertainty: { computed_by: "frozen_evaluator" } }], decision_rule: { type: "all", primary_metric_ids: ["score"], constraint_metric_ids: [] } }), true);
  }
  assert.throws(() => validatePolicySupport({ schema_version: 2, metrics: [{ id: "score", direction: "maximize", estimand: { type: "quantile", semantics_version: "scientistone_i1_v1", parameters: { probability: 0.25, method: "nearest_rank" } }, repetitions: { canonical: 1, audit: 1, valid_required: 1, canonical_run_ids: ["c1"], audit_run_ids: ["a1"] }, comparison_design: "exact", uncertainty: { computed_by: "frozen_evaluator" } }], decision_rule: { type: "all", primary_metric_ids: ["score"], constraint_metric_ids: [] } }), /linear_type7/i);
  assert.throws(() => validatePolicySupport({ schema_version: 2, metrics: [{ id: "score", direction: "maximize", determinism_class: "deterministic", estimand: { type: "mean", semantics_version: "scientistone_i1_v1", parameters: {} }, repetitions: { canonical: 1, audit: 1, valid_required: 1, canonical_run_ids: ["c1"], audit_run_ids: ["a1"] }, comparison_design: "independent", uncertainty: { computed_by: "frozen_evaluator" } }], decision_rule: { type: "all", primary_metric_ids: ["score"], constraint_metric_ids: [] } }), /deterministic metrics require exact/i);
});

test("execution identity and reproducibility decisions are recomputed from frozen evidence", () => {
  const binding = { policy_sha256: "a".repeat(64), interpreter_sha256: "b".repeat(64), input_manifest_sha256: "c".repeat(64), selected_snapshot_sha256: "d".repeat(64), attempt: 1 };
  assert.equal(executionId(binding), executionId(binding));
  assert.notEqual(executionId(binding), executionId({ ...binding, attempt: 2 }));
  const metric = {
    id: "score",
    estimand: { type: "mean", semantics_version: "scientistone_i1_v1", parameters: {} },
    repetitions: { canonical: 2, audit: 2, valid_required: 2, canonical_run_ids: ["c1", "c2"], audit_run_ids: ["a1", "a2"] },
    uncertainty: { noise_ceiling: 0 },
    failure_policy: { missing_pair: "inconclusive", invalid_run: "inconclusive" },
    determinism_class: "deterministic",
    comparison_design: "exact",
    equivalence_margin: { lower: 0, upper: 0 },
  };
  const observed = {
    metric_id: "score",
    canonical_runs: [{ run_id: "c1", status: "valid", value: 1, failure_reason: null }, { run_id: "c2", status: "valid", value: 1, failure_reason: null }],
    audit_runs: [{ run_id: "a1", paired_canonical_run_id: "c1", status: "valid", value: 1, failure_reason: null }, { run_id: "a2", paired_canonical_run_id: "c2", status: "valid", value: 1, failure_reason: null }],
    canonical_estimate: 1,
    audit_estimate: 1,
    interval: { lower: 0, upper: 0 },
    noise_value: 0,
    environment_passed: true,
  };
  assert.equal(evaluateReproducibilityMetric(metric, observed).verdict, "PASS");
  assert.throws(() => evaluateReproducibilityMetric(metric, { ...observed, interval: { lower: 1, upper: -1 } }), /reversed/);
  assert.throws(() => evaluateReproducibilityMetric(metric, { ...observed, audit_estimate: 9 }), /estimand is inconsistent/);
  assert.throws(() => evaluateReproducibilityMetric(metric, { ...observed, audit_runs: observed.audit_runs.slice(0, 1) }), /every frozen run/);
  const large = {
    ...observed,
    canonical_runs: observed.canonical_runs.map((run) => ({ ...run, value: 1_000_000_000 })),
    audit_runs: observed.audit_runs.map((run) => ({ ...run, value: 1_000_000_000.5 })),
    canonical_estimate: 1_000_000_000,
    audit_estimate: 1_000_000_000.5,
  };
  assert.equal(evaluateReproducibilityMetric(metric, large).verdict, "INCONCLUSIVE", "deterministic exact drift must never pass through a relative tolerance");
});

test("run inventory derives failures and gives FAIL precedence without silent drops", () => {
  const metric = {
    id: "score",
    estimand: { type: "mean", semantics_version: "scientistone_i1_v1", parameters: {} },
    repetitions: { canonical: 2, audit: 2, valid_required: 1, canonical_run_ids: ["c1", "c2"], audit_run_ids: ["a1", "a2"] },
    uncertainty: { noise_ceiling: 0 },
    failure_policy: { missing_pair: "inconclusive", invalid_run: "fail" },
    determinism_class: "seeded_stochastic",
    comparison_design: "paired",
    equivalence_margin: { lower: -1, upper: 1 },
  };
  const observed = {
    metric_id: "score",
    canonical_runs: [{ run_id: "c1", status: "valid", value: 1, failure_reason: null }, { run_id: "c2", status: "valid", value: 1, failure_reason: null }],
    audit_runs: [{ run_id: "a1", paired_canonical_run_id: "c1", status: "valid", value: 1, failure_reason: null }, { run_id: "a2", paired_canonical_run_id: "c2", status: "invalid", value: null, failure_reason: "non-finite output" }],
    canonical_estimate: 1,
    audit_estimate: 1,
    interval: { lower: 0, upper: 0 },
    noise_value: 0,
    environment_passed: true,
  };
  const result = evaluateReproducibilityMetric(metric, observed);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.verdict, "FAIL");

  const allMissing = {
    ...observed,
    audit_runs: [{ run_id: "a1", paired_canonical_run_id: "c1", status: "missing", value: null, failure_reason: "not produced" }, { run_id: "a2", paired_canonical_run_id: "c2", status: "missing", value: null, failure_reason: "not produced" }],
    audit_estimate: null,
    interval: null,
  };
  assert.equal(evaluateReproducibilityMetric({ ...metric, failure_policy: { missing_pair: "fail", invalid_run: "fail" } }, allMissing).verdict, "FAIL");
  assert.equal(evaluateReproducibilityMetric({ ...metric, failure_policy: { missing_pair: "inconclusive", invalid_run: "fail" } }, allMissing).verdict, "INCONCLUSIVE");
});
