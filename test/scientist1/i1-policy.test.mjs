import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientist1");
const REFERENCES = path.join(ROOT, "skills", "scientist1", "references");
const protocol = fs.readFileSync(path.join(REFERENCES, "protocol.md"), "utf8");
const guide = fs.readFileSync(path.join(REFERENCES, "i1-verification.md"), "utf8");
const schema = JSON.parse(fs.readFileSync(path.join(REFERENCES, "i1-verification-policy.schema.json"), "utf8"));

function resolveLocalPointer(root, reference) {
  assert.match(reference, /^#\//, `I1 schema must use a local JSON pointer, received ${reference}`);
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], root);
}

function visit(value, callback) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (!value || typeof value !== "object") return;
  callback(value);
  for (const item of Object.values(value)) visit(item, callback);
}

test("protocol freezes a declarative I1 policy and common interpreter before candidate results", () => {
  const normalized = protocol.replace(/\s+/g, " ").toLowerCase();
  for (const required of [
    "contract/i1-verification-policy.json",
    "contract/control-plane/i1-interpreter.mjs",
    "i1-verification.md",
    "i1-verification-policy.schema.json",
    "before candidate generation or any candidate result exists",
    "variance affects uncertainty but never widens",
    "rerun all affected successors",
  ]) assert.ok(normalized.includes(required.toLowerCase()), `missing protocol requirement: ${required}`);

  assert.doesNotMatch(protocol, /Before release, a scientific owner must confirm the tolerance formula/);
});

test("I1 doctrine separates the three checks and saves hash-bound execution evidence", () => {
  const normalized = guide.replace(/\s+/g, " ");
  for (const required of [
    "**Lineage:**",
    "**Reproducibility:**",
    "**Claim semantics:**",
    "audit/i1/lineage.json",
    "audit/i1/reproducibility.json",
    "audit/i1/claim-semantics.json",
    "audit/i1/evidence-manifest.json",
    "audit/i1/execution-receipt.json",
    "private/evaluator/i1-runs/<execution-id>/",
    "Given the same evidence-manifest hashes",
  ]) assert.ok(normalized.includes(required), `missing I1 doctrine requirement: ${required}`);
});

test("I1 policy schema is closed, internally resolvable, and covers task-adaptive evaluator classes", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.mode.enum, ["research", "external_audit"]);
  assert.deepEqual(schema.properties.profile.enum, ["task_adaptive_v1", "adrs_legacy_v1"]);
  assert.equal(schema.properties.frozen_before_candidate_generation.type, "boolean");
  assert.equal(schema.properties.result_blind_authoring.const, true);
  assert.equal(schema.properties.execution.properties.network.const, false);
  assert.equal(schema.properties.interpreter.properties.version.const, "1.1.0");
  assert.equal(schema.properties.execution.properties.safe_output_paths.minItems, 3);
  assert.equal(schema.properties.execution.properties.safe_output_paths.maxItems, 3);

  const requiredRoot = new Set(schema.required);
  for (const field of ["bindings", "metrics", "decision_rule", "variance_policy", "interpreter", "execution", "verdicts"]) {
    assert.ok(requiredRoot.has(field), `root policy must require ${field}`);
  }

  const requiredMetric = new Set(schema.$defs.metric.required);
  for (const field of [
    "unit",
    "estimand",
    "determinism_class",
    "comparison_design",
    "repetitions",
    "randomness",
    "equivalence_margin",
    "uncertainty",
    "hardware",
    "failure_policy",
  ]) assert.ok(requiredMetric.has(field), `metric policy must require ${field}`);

  assert.deepEqual(schema.$defs.metric.properties.determinism_class.enum, [
    "deterministic",
    "seeded_stochastic",
    "irreducibly_stochastic",
    "hardware_sensitive",
  ]);
  assert.deepEqual(schema.$defs.metric.properties.comparison_design.enum, ["exact", "paired", "independent"]);
  assert.equal(schema.$defs.metric.allOf[0].if.properties.determinism_class.const, "deterministic");
  assert.equal(schema.$defs.metric.allOf[0].then.properties.comparison_design.const, "exact");
  assert.ok(schema.$defs.metric.properties.repetitions.required.includes("canonical_run_ids"));
  assert.ok(schema.$defs.metric.properties.repetitions.required.includes("audit_run_ids"));
  assert.deepEqual(schema.$defs.decisionRule.properties.type.enum, ["all", "primary_and_constraints", "multiplicity_controlled"]);

  visit(schema, (value) => {
    if (typeof value.$ref === "string") assert.notEqual(resolveLocalPointer(schema, value.$ref), undefined, `unresolved schema reference ${value.$ref}`);
  });
});

test("research freezes before candidates while external reconstruction stays result-blind", () => {
  const researchRule = schema.allOf.find((rule) => rule.if?.properties?.mode?.const === "research");
  assert.equal(researchRule.then.properties.freeze_stage.const, "pre_candidate");
  assert.equal(researchRule.then.properties.frozen_before_candidate_generation.const, true);
  assert.deepEqual(researchRule.then.properties.bindings.required, ["evaluator_contract", "evaluator_manifest"]);

  const externalRule = schema.allOf.find((rule) => rule.if?.properties?.mode?.const === "external_audit");
  assert.deepEqual(externalRule.then.properties.bindings.required, ["source_bundle_manifest"]);
  assert.equal(externalRule.then.oneOf[1].properties.freeze_stage.const, "pre_i1_execution_external");
  assert.equal(externalRule.then.oneOf[1].properties.frozen_before_candidate_generation.const, false);
  assert.match(protocol, /fresh result-blind I1 policy author/);
  assert.match(guide, /It cannot invent a post-hoc\s+equivalence margin/);
});

test("task-adaptive variance cannot widen margins and all aggregate verdicts are frozen", () => {
  const taskAdaptiveRule = schema.allOf.find((rule) => rule.if?.properties?.profile?.const === "task_adaptive_v1");
  assert.equal(taskAdaptiveRule.then.properties.variance_policy.properties.widens_equivalence_margin.const, false);
  assert.deepEqual(schema.properties.verdicts.properties.allowed.const, ["PASS", "FAIL", "NOT_ASSESSED"]);
  assert.equal(schema.properties.verdicts.properties.research_required.const, "PASS");
  assert.equal(schema.properties.verdicts.properties.not_assessed_mode.const, "external_audit_only");

  for (const verdict of ["`FAIL`", "`NOT_ASSESSED`", "`PASS`"]) {
    assert.ok(guide.includes(verdict), `guide must define ${verdict}`);
  }
});

test("ADRS adaptive tolerance is isolated to the explicit legacy profile", () => {
  const heading = guide.indexOf("## ADRS legacy profile");
  const formula = guide.indexOf("max(1%, 3σ/|s̄|)");
  assert.ok(heading >= 0 && formula > heading, "ADRS formula must appear only under its legacy heading");
  assert.equal(guide.match(/max\(1%, 3σ\/\|s̄\|\)/g)?.length, 1);

  const legacyRule = schema.allOf.find((rule) => rule.if?.properties?.profile?.const === "adrs_legacy_v1");
  assert.equal(legacyRule.then.required.includes("legacy"), true);
  assert.equal(legacyRule.then.properties.metrics.maxItems, 1);
  assert.equal(schema.$defs.legacy.properties.reruns.const, 5);
  assert.equal(schema.$defs.legacy.properties.standard_deviation.const, "sample_n_minus_1");
});
