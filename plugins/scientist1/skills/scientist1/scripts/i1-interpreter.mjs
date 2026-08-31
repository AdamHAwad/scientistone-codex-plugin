import { createHash } from "node:crypto";

const INTERPRETER_VERSION = "1.1.0";

const DIRECTIONS = new Set(["maximize", "minimize", "target", "signed"]);
const ESTIMANDS = new Set(["single_seed", "mean", "median", "quantile", "rate", "ratio"]);
const DECISION_RULES = new Set(["all", "primary_and_constraints", "multiplicity_controlled"]);
const VERDICTS = new Set(["PASS", "FAIL", "NOT_ASSESSED"]);

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function quantile(values, probability, method = "linear_type7") {
  finite(probability, "quantile probability");
  if (probability < 0 || probability > 1) throw new Error("quantile probability must be between 0 and 1.");
  if (method !== "linear_type7") throw new Error(`Unsupported quantile method: ${method}.`);
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function estimandOptions(estimand) {
  if (estimand?.semantics_version !== "scientist1_i1_v1") throw new Error(`${estimand?.type ?? "unknown"} estimand must declare semantics_version scientist1_i1_v1.`);
  const options = estimand?.parameters ?? {};
  const keys = Object.keys(options).sort();
  const expected = estimand?.type === "quantile" ? ["method", "probability"] : ["rate", "ratio"].includes(estimand?.type) ? ["denominator"] : [];
  if (canonical(keys) !== canonical(expected)) throw new Error(`${estimand?.type ?? "unknown"} estimand parameters must be exactly ${expected.join(", ") || "empty"}.`);
  if (estimand?.type === "quantile") {
    finite(options.probability, "quantile probability");
    if (options.probability < 0 || options.probability > 1 || options.method !== "linear_type7") throw new Error("quantile estimands require probability in [0,1] and method linear_type7.");
  }
  if (["rate", "ratio"].includes(estimand?.type)) {
    finite(options.denominator, `${estimand.type} denominator`);
    if (options.denominator <= 0) throw new Error(`${estimand.type} denominator must be positive.`);
  }
  return options;
}

function summarize(values, estimand, options = {}) {
  if (!Array.isArray(values) || !values.length || values.some((value) => !Number.isFinite(value))) throw new Error("estimand values must be a non-empty array of finite numbers.");
  if (!ESTIMANDS.has(estimand)) throw new Error(`Unsupported estimand: ${estimand}.`);
  if (estimand === "single_seed") {
    if (values.length !== 1) throw new Error("single_seed requires exactly one value.");
    return values[0];
  }
  if (estimand === "mean") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (estimand === "median") return quantile(values, 0.5);
  if (estimand === "quantile") return quantile(values, options.probability, options.method);
  if (estimand === "rate") {
    const denominator = finite(options.denominator, "rate denominator");
    return values.reduce((sum, value) => sum + value, 0) / denominator;
  }
  if (estimand === "ratio") {
    const denominator = finite(options.denominator, "ratio denominator");
    return values.reduce((sum, value) => sum + value, 0) / values.length / denominator;
  }
  throw new Error(`Unsupported estimand: ${estimand}.`);
}

function compareInterval(interval, bounds) {
  if (!interval || !bounds) throw new Error("comparison requires interval and bounds.");
  const lower = finite(interval.lower, "interval lower");
  const upper = finite(interval.upper, "interval upper");
  const allowedLower = finite(bounds.lower, "equivalence lower");
  const allowedUpper = finite(bounds.upper, "equivalence upper");
  if (lower > upper || allowedLower > allowedUpper) throw new Error("comparison bounds are reversed.");
  if ((lower > allowedLower && upper < allowedUpper) || (allowedLower === allowedUpper && lower === allowedLower && upper === allowedUpper)) return "PASS";
  return "FAIL";
}

function aggregateVerdicts(verdicts) {
  if (!Array.isArray(verdicts) || !verdicts.length || verdicts.some((value) => !VERDICTS.has(value))) throw new Error("verdicts must be a non-empty I1 verdict array.");
  if (verdicts.includes("FAIL")) return "FAIL";
  if (verdicts.includes("NOT_ASSESSED")) return "NOT_ASSESSED";
  return "PASS";
}

function executionId(binding) {
  const required = ["policy_sha256", "interpreter_sha256", "input_manifest_sha256", "selected_snapshot_sha256", "attempt"];
  if (!binding || required.some((key) => binding[key] === undefined) || !Number.isInteger(binding.attempt) || binding.attempt < 1) throw new Error("execution binding is incomplete.");
  for (const key of required.slice(0, 3)) if (typeof binding[key] !== "string" || !/^[a-f0-9]{64}$/.test(binding[key])) throw new Error(`execution binding ${key} must be a SHA-256.`);
  if (binding.selected_snapshot_sha256 !== null && (typeof binding.selected_snapshot_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(binding.selected_snapshot_sha256))) throw new Error("execution binding selected_snapshot_sha256 must be a SHA-256 or null.");
  return createHash("sha256").update(canonical(Object.fromEntries(required.map((key) => [key, binding[key]])))).digest("hex");
}

function gatedMetricIds(policy) {
  const all = policy.metrics.map((metric) => metric.id);
  if (policy.decision_rule.type === "all") return all;
  return [...new Set([...policy.decision_rule.primary_metric_ids, ...policy.decision_rule.constraint_metric_ids])];
}

function runInventory(runs, expectedIds, label, pairedIds = null) {
  if (!Array.isArray(runs) || !Array.isArray(expectedIds) || runs.length !== expectedIds.length) throw new Error(`${label} run inventory must contain every frozen run exactly once.`);
  const valid = [];
  let missing = 0;
  let invalid = 0;
  for (const [index, run] of runs.entries()) {
    const expectedKeys = pairedIds === null ? ["failure_reason", "run_id", "status", "value"] : ["failure_reason", "paired_canonical_run_id", "run_id", "status", "value"];
    if (!run || canonical(Object.keys(run).sort()) !== canonical(expectedKeys.sort()) || run.run_id !== expectedIds[index] || !["valid", "missing", "invalid"].includes(run.status)) throw new Error(`${label} run inventory is malformed or out of frozen order at index ${index}.`);
    if (pairedIds !== null && run.paired_canonical_run_id !== pairedIds[index]) throw new Error(`${label} pairing differs from the frozen run order at ${run.run_id}.`);
    if (run.status === "valid") {
      if (!Number.isFinite(run.value) || run.failure_reason !== null) throw new Error(`${label} valid run ${run.run_id} requires a finite value and null failure_reason.`);
      valid.push(run.value);
    } else {
      if (run.value !== null || typeof run.failure_reason !== "string" || !run.failure_reason.trim()) throw new Error(`${label} ${run.status} run ${run.run_id} requires a null value and a failure reason.`);
      if (run.status === "missing") missing += 1;
      else invalid += 1;
    }
  }
  return { valid, missing, invalid };
}

function evaluateReproducibilityMetric(metric, observed) {
  if (!observed || observed.metric_id !== metric.id || !Array.isArray(observed.canonical_runs) || !Array.isArray(observed.audit_runs) || typeof observed.environment_passed !== "boolean" || !Number.isFinite(observed.noise_value)) throw new Error(`reproducibility payload is malformed for ${metric.id}.`);
  const options = estimandOptions(metric.estimand);
  const repetitions = metric.repetitions;
  const canonical = runInventory(observed.canonical_runs, repetitions.canonical_run_ids, `${metric.id} canonical`);
  if (canonical.missing || canonical.invalid) throw new Error(`canonical run inventory must be fully valid for ${metric.id}.`);
  const pairedIds = ["exact", "paired"].includes(metric.comparison_design) ? repetitions.canonical_run_ids : Array(repetitions.audit).fill(null);
  const audit = runInventory(observed.audit_runs, repetitions.audit_run_ids, `${metric.id} audit`, pairedIds);
  const canonicalEstimate = summarize(canonical.valid, metric.estimand.type, options);
  const auditEstimate = audit.valid.length ? summarize(audit.valid, metric.estimand.type, options) : null;
  if (!sameNumber(observed.canonical_estimate, canonicalEstimate) || (auditEstimate === null ? observed.audit_estimate !== null : !sameNumber(observed.audit_estimate, auditEstimate))) throw new Error(`reproducibility estimand is inconsistent for ${metric.id}.`);
  const comparisonVerdict = observed.interval === null ? "FAIL" : compareInterval(observed.interval, metric.equivalence_margin);
  const noisePassed = metric.uncertainty.noise_ceiling === null || observed.noise_value <= metric.uncertainty.noise_ceiling;
  const enough = audit.valid.length >= repetitions.valid_required;
  let verdict;
  if (audit.missing || audit.invalid) verdict = "FAIL";
  else if (!enough || !noisePassed || !observed.environment_passed) verdict = "FAIL";
  else if (metric.determinism_class === "deterministic" && ["exact", "paired"].includes(metric.comparison_design) && observed.audit_runs.some((run, index) => run.value !== observed.canonical_runs[index].value)) verdict = "FAIL";
  else verdict = comparisonVerdict;
  return { canonicalEstimate, auditEstimate, canonicalValues: canonical.valid, auditValues: audit.valid, missingCount: audit.missing, invalidCount: audit.invalid, noisePassed, enough, verdict };
}

function validatePolicySupport(policy) {
  if (!policy || policy.schema_version !== 2 || !Array.isArray(policy.metrics) || !policy.metrics.length) throw new Error("I1 policy must use schema_version 2 with at least one metric.");
  if (policy.metrics.some((metric) => !DIRECTIONS.has(metric.direction) || !ESTIMANDS.has(metric.estimand?.type) || !["exact", "paired", "independent"].includes(metric.comparison_design) || metric.uncertainty?.computed_by !== "frozen_evaluator")) throw new Error("I1 policy uses an unsupported direction, estimand, comparison, or uncertainty provider.");
  for (const metric of policy.metrics) {
    estimandOptions(metric.estimand);
    if (metric.determinism_class === "deterministic" && metric.comparison_design !== "exact") throw new Error(`deterministic metrics require exact comparison for ${metric.id}.`);
    const repetitions = metric.repetitions;
    if (!repetitions || !Number.isInteger(repetitions.canonical) || !Number.isInteger(repetitions.audit) || !Number.isInteger(repetitions.valid_required) || !Array.isArray(repetitions.canonical_run_ids) || !Array.isArray(repetitions.audit_run_ids) || repetitions.canonical_run_ids.length !== repetitions.canonical || repetitions.audit_run_ids.length !== repetitions.audit || new Set(repetitions.canonical_run_ids).size !== repetitions.canonical || new Set(repetitions.audit_run_ids).size !== repetitions.audit || [...repetitions.canonical_run_ids, ...repetitions.audit_run_ids].some((id) => typeof id !== "string" || !id)) throw new Error(`I1 policy run identities are incomplete for ${metric.id}.`);
    if (["exact", "paired"].includes(metric.comparison_design) && repetitions.canonical !== repetitions.audit) throw new Error(`${metric.comparison_design} comparison requires one frozen canonical run per audit run for ${metric.id}.`);
    if (metric.estimand.type === "single_seed" && (repetitions.canonical !== 1 || repetitions.audit !== 1 || repetitions.valid_required !== 1)) throw new Error(`single_seed requires one canonical and one audit run for ${metric.id}.`);
  }
  if (!policy.decision_rule || !DECISION_RULES.has(policy.decision_rule.type)) throw new Error("I1 policy uses an unsupported decision rule.");
  const ids = new Set(policy.metrics.map((metric) => metric.id));
  if (gatedMetricIds(policy).some((id) => !ids.has(id))) throw new Error("I1 decision rule references an unknown metric.");
  return true;
}

export {
  DECISION_RULES,
  DIRECTIONS,
  ESTIMANDS,
  INTERPRETER_VERSION,
  VERDICTS,
  aggregateVerdicts,
  compareInterval,
  evaluateReproducibilityMetric,
  executionId,
  gatedMetricIds,
  summarize,
  validatePolicySupport,
};
