# I1 task-adaptive score verification

This reference defines the binding I1 contract. It applies in research and
external-audit modes. I1 asks three different questions and must preserve their
answers separately:

1. **Lineage:** do the TeX and PDF headline values faithfully represent the
   frozen canonical evaluation of the selected snapshot?
2. **Reproducibility:** does a fresh execution reproduce the declared estimand
   within a scientifically justified, predeclared equivalence region?
3. **Claim semantics:** does the paper identify the correct metric, unit,
   direction, population, aggregation, uncertainty, and scope?

A lineage match is not evidence of fresh reproducibility. Reproducible numbers
do not rescue a mislabeled or overstated claim. I1 passes only when all three
applicable checks pass.

## Freeze before results

In research mode, after the evaluator contract is complete and before candidate
generation, a fresh result-blind I1 policy author (compatibility role key
`i1_verifier_builder`) receives only the approved plan,
environment bootstrap, input manifests, evaluator contract and manifest, and
explicitly declared evaluator-only paths. It must not receive candidate
artifacts, candidate evaluations, producer transcripts, or paper drafts.

In external-audit mode, prefer a supplied policy proven to predate
the supplied results. Otherwise the builder freezes a result-blind audit policy
before I1 execution. It may read only the supplied protocol, evaluator
interface, declared environment, and source-bundle metadata, not paper values,
canonical values, or candidate outcomes. It cannot invent a post-hoc
equivalence margin. If the supplied design does not determine a defensible
margin, reproducibility is `NOT_ASSESSED`; lineage and claim semantics may
still be assessed.

The author writes only `contract/i1-verification-policy.json`, valid against
`i1-verification-policy.schema.json`. `coe.mjs configure` has already copied
the release-tested generic interpreter to
`contract/control-plane/i1-interpreter.mjs`; the policy binds its version and
SHA-256. The policy also freezes evaluator argv, allowed input classes, network
prohibition, safe outputs, and deterministic controls. It is a closed
declarative contract, not a per-study software project.

The Contract Auditor recomputes policy/interpreter hashes and checks the closed
essential checklist. Only a PASS contract may begin candidate work.
Suggestions are nonblocking. Unsupported semantics must be revised before
results through minimal result-blind stabilization; there is no arbitrary
pre-result repair-wave ceiling. A re-audit checks the prior finding and repair
delta without expanding the checklist. Once results exist, every repair
archives and invalidates the evidence that depends on the changed contract
before rerunning it. Never approximate unsupported semantics with a mean,
scalar, or favorable post-hoc rule. Repeat this repair-and-audit cycle until
the policy and dependent evidence pass.

## Required structured policy

The policy uses `schema_version: 2` and profile `task_adaptive_v1` unless the
study explicitly reproduces the ADRS legacy audit. It declares its mode,
freeze stage, result-blind authoring status, and:

- source bindings and hashes for the approved plan, environment, evaluator
  contract, evaluator manifest, and input manifest;
- one record per reported or gated metric: stable ID, role, name, unit,
  direction, population, estimand plus `scientist1_i1_v1` executable semantics,
  transformation, display rule, determinism class, comparison design,
  frozen canonical/audit run IDs, repetitions, randomness, fixed equivalence bounds,
  uncertainty method, noise ceiling, hardware conditions, and failure rule;
- the multi-metric decision rule, including the primary metric and every
  constraint or multiplicity method;
- frozen interpreter version/path/hash plus evaluator argv, allowed input
  classes, output locations, network prohibition, and deterministic controls;
- the four aggregate outcomes and the rule that observed variance never widens
  a scientific equivalence margin.

Equivalence bounds are scientific parameters in the metric's native units or
relative to a stable reference scale frozen independently of audit results.
They require a rationale based on domain meaning, measurement resolution,
calibration data, or an approved practical-effect threshold. The audit rerun
mean, audit standard deviation, or a favorable candidate result cannot define
or widen the bounds.

## Evaluator-class rules

### Deterministic

Freeze the input snapshot, evaluator, runtime, data, and expected numeric
representation. Require exact normalized output. A nonzero tolerance is allowed
only for a declared serialization, decimal-rounding, or ULP boundary and must
be tested at both sides. Any unexplained run-to-run variation invalidates the
deterministic assumption and produces `FAIL`, not a wider tolerance.

### Seeded or paired stochastic

Freeze the same seed, case, fold, workload, and hardware pairing keys for the
canonical and audit samples. Compare within-pair differences using the frozen
estimator and interval method. `PASS` requires the complete confidence or
credible interval for the difference to lie inside the fixed lower and upper
equivalence bounds. Missing pairs follow the predeclared failure rule; they are
never silently dropped.

### Independent stochastic

Freeze the estimator, canonical sample, audit sample size, interval method,
confidence level, resampling seed when applicable, and power or precision
rationale. Compare independent samples with the declared method. `PASS`
requires the complete interval for the difference to lie inside the fixed
equivalence bounds. An overlapping boundary is `FAIL`; a result
demonstrably outside the allowed region is `FAIL`.

### Signed or near-zero

Use native-unit absolute bounds or a hybrid bound based on a stable frozen
reference scale such as a baseline magnitude, instrument resolution, or
calibration range. Never divide by the observed rerun mean. Preserve sign in
all records. If the paper claims a direction or sign, verify that claim
separately from numerical equivalence.

### Multi-metric

Declare exactly one of `all`, `primary_and_constraints`, or
`multiplicity_controlled`. Each gated metric has its own estimand, unit,
comparison, equivalence bounds, and uncertainty rule. The common interpreter
supports only its closed scalar estimands: single seed, arithmetic mean,
linear-type-7 median/quantile, rate, and ratio. For a derived aggregate, the
frozen evaluator must emit the component metrics and a separately identified
derived scalar with its formula and missing-value rule in the evaluator
contract; represent its audit estimand using the closed surface. Never treat
weights over repetitions as metric aggregation. A passing secondary metric
cannot hide a primary or constraint failure.

### Hardware-dependent

For an exact-environment claim, freeze the hardware class, software and driver
versions, clocks or power mode, thread and device allocation, warmups,
measurement repetitions, aggregation, and environmental checks. Missing
required hardware is `NOT_ASSESSED` in external-audit mode. In research mode it
blocks the contract; an environment that becomes unavailable only at audit
produces `FAIL` and blocks completion.
For a portable claim, use a frozen same-host reference and normalized paired
comparison; do not compare raw latency, throughput, energy, or memory numbers
across unlike machines. Thermal throttling, excessive jitter, or another
failed environmental check is `FAIL`.

## Audit execution and saved evidence

The fresh I1 Score Auditor receives the frozen policy and interpreter, the
paper source and any required rendered output, selected snapshot and manifest, canonical evaluation,
approved environment, and only the evaluator-only inputs declared for I1.

The auditor first writes independent structured extractions at
`audit/i1/tex-extraction.json` and `audit/i1/pdf-extraction.json`. Each record
contains the literal displayed value, normalized numeric value, metric, unit,
direction, estimand/aggregation language, uncertainty language, exact locator,
and extraction limitations. Agent judgment is therefore explicit saved input;
the interpreter's calculations remain deterministic.

Next write `audit/i1/input-manifest.json` with every pre-execution input path,
access class, and path-bound SHA-256. Compute `execution_id` from the policy,
interpreter, input-manifest, selected-snapshot hashes, and attempt number.
Execute exactly the policy's evaluator argv in the declared private directory.
Do not modify or wrap the evaluator. Freeze locale, timezone,
concurrency, controllable seeds, and ordering as declared by the policy.

Preserve raw stdout, stderr, evaluator output, and exit metadata under
`private/evaluator/i1-runs/<execution-id>/`. Write
`audit/i1/evidence-manifest.json` with path-bound hashes for every resulting
private measurement and safe extraction record. Then write
`audit/i1/execution-receipt.json` with:

- execution ID and command argv;
- policy, interpreter, input-manifest, environment, and selected-snapshot hashes;
- start and completion times, exit status, retry count, and failure category;
- raw private artifact paths and hashes;
- safe structured output path and hash;
- undeclared access, network, environment-change, and limitation arrays.

The structured computational payload must be canonical UTF-8 JSON with stable
ordering and no timestamps or host-dependent paths. Timestamps belong only in
the execution receipt. Given the same evidence-manifest hashes, the interpreter
must produce the same payload. New irreducibly stochastic measurements may
differ and therefore create a different evidence manifest; that is evaluator
variation, not permission for nondeterministic comparison logic.

The frozen evaluator owns the policy's declared confidence, credible-interval,
or resampling computation and writes that result to its bound `result.json`.
The common interpreter does not implement a second statistics library. It
verifies the private result hash and execution identity, recomputes the frozen
estimands, exhaustive frozen run IDs/order, pairing/failure counts,
deterministic equality, noise ceilings, and
bound decision, and rejects any public value that differs from the private
payload. This keeps the statistical method task-adaptive without generating a
new verifier program for every study.

`result.json` uses schema version 2. Every metric contains complete
`canonical_runs` and `audit_runs` arrays in the policy's frozen order. Each run
has its frozen ID, `valid|missing|invalid` status, value or null, and a reason
for missing/invalid status; audit runs also carry the exact paired canonical ID
or null for an independent design. The interpreter derives counts and valid
values from this inventory. Summary counts supplied by a specialist can never
hide a dropped run.

Write the component records:

- `audit/i1/lineage.json`: TeX/PDF extraction agreement, declared display
  transformation, canonical record locator/hash, snapshot identity, and exact
  mismatch categories;
- `audit/i1/reproducibility.json`: every valid and invalid repetition or pair,
  estimator, interval, fixed bounds, noise checks, environment checks,
  comparison, and outcome per metric;
- `audit/i1/claim-semantics.json`: metric/unit/direction/population/estimand,
  aggregation, uncertainty, scope, exact paper locators, and supported or
  mismatched judgment;
- aggregate `audit/i1.json`: component hashes and verdicts, policy and interpreter
  hashes, selected-snapshot hash, evidence paths, unavailable items,
  limitations, rollback phase, and final verdict.

The public audit must not copy held-out rows, labels, private evaluator output,
secrets, or private checks. It records only policy-approved metrics and hash
references to private evidence.

## Deterministic verdict aggregation

Apply this precedence without discretion:

1. `FAIL` when any assessed component has a demonstrated mismatch, including
   incorrect lineage, metric identity, unit, direction, estimand, aggregation,
   deterministic output, frozen-bound result, or material claim semantics.
2. `NOT_ASSESSED` only in external-audit mode when a required supplied input or
   required environment is explicitly unavailable in the frozen source-bundle
   manifest and no assessed component has failed.
3. `FAIL` when reproducibility cannot be
   established because an interval crosses a bound, noise exceeds its ceiling,
   valid repetitions are insufficient, the environment check fails, or the
   frozen evaluator cannot complete after the allowed operational retry.
4. `PASS` only when lineage, reproducibility, and claim semantics all pass for
   every metric required by the multi-metric decision rule.

`FAIL` and `NOT_ASSESSED` both block promotion in a research run and require
same-run repair and re-audit; neither ends the study.
`NOT_ASSESSED` is never valid merely because a check is difficult or the
frozen policy omitted support for an input already known at contract time.

## ADRS legacy profile

`adrs_legacy_v1` exists only to reproduce the ScientistOne paper's ADRS score
audit: one scalar golden-evaluator score, exactly five independent reruns,
sample standard deviation with divisor `n - 1`, and relative acceptance
`max(1%, 3σ/|s̄|)`. The frozen policy must state that this historical rule
intentionally allows observed variance to widen the acceptance threshold.

Do not select this profile by default or because it is convenient. It is not a
general policy for signed or near-zero values, paired designs, multiple
metrics, hardware portability, or a different reported estimand. Any new study
uses `task_adaptive_v1` and keeps the equivalence margin independent of audit
variance.
