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
generation, a fresh I1 Verifier Builder receives only the approved plan,
environment bootstrap, input manifests, evaluator contract and manifest, and
explicitly declared evaluator-only paths. It must not receive candidate
artifacts, candidate evaluations, producer transcripts, or paper drafts.

In external-audit mode, prefer a supplied policy and verifier proven to predate
the supplied results. Otherwise the builder freezes a result-blind audit policy
before I1 execution. It may read only the supplied protocol, evaluator
interface, declared environment, and source-bundle metadata, not paper values,
canonical values, or candidate outcomes. It cannot invent a post-hoc
equivalence margin. If the supplied design does not determine a defensible
margin, reproducibility is `NOT_ASSESSED`; lineage and claim semantics may
still be assessed.

The builder writes:

- `contract/i1-verification-policy.json`, valid against
  `i1-verification-policy.schema.json`;
- generated task-specific source under
  `private/evaluator/i1-verifier/source/`;
- deterministic positive, boundary, mismatch, malformed-input, and missing-run
  fixtures under `private/evaluator/i1-verifier/fixtures/`;
- `private/evaluator/i1-verifier/self-test.json` with every fixture result;
- `private/evaluator/i1-verifier/manifest.json` with the policy hash, source and
  fixture hashes, frozen runtime path and hash, argv entrypoint, network set to
  false, allowed inputs, output schema, and dependency inventory;
- `private/evaluator/i1-verifier/build-receipt.json` binding the builder launch
  receipt, policy, manifest, source tree, fixtures, and PASS self-test.

Generated verifier code is an evaluator-only frozen research artifact. It uses
only the declared runtime and bundled or run-local hash-pinned dependencies. It
must not download packages, call a service, use the network, discover a global
tool, import from outside declared roots, or write outside its declared private
execution directory. Pass arguments as an argv array; never interpolate paths
or paper content into a shell command.

The Contract Auditor recomputes every hash, runs the frozen self-test command,
and checks that the policy answers all applicable scientific questions. Only a
PASS contract may begin candidate work. Because policy and code are frozen
before results, an unhandled later result type is not permission to improvise.
Use a versioned same-run contract repair. If results already exist, archive the
old contract and every successor, then rebuild and rerun them under a fresh
audit. If the direct repair would exceed a fixed researcher-charter boundary,
preserve the boundary and author the strongest safe in-scope verifier or
limited design. Continue the same run without requesting another approval.

## Required structured policy

The policy uses `schema_version: 1` and profile `task_adaptive_v1` unless the
study explicitly reproduces the ADRS legacy audit. It declares its mode,
freeze stage, result-blind authoring status, and:

- source bindings and hashes for the approved plan, environment, evaluator
  contract, evaluator manifest, and input manifest;
- one record per reported or gated metric: stable ID, role, name, unit,
  direction, population, estimand, transformation, display rule, determinism
  class, comparison design, repetitions, randomness, fixed equivalence bounds,
  uncertainty method, noise ceiling, hardware conditions, and failure rule;
- the multi-metric decision rule, including the primary metric and every
  constraint or multiplicity method;
- verifier runtime, entrypoint, allowed input classes, output locations,
  network prohibition, and deterministic-execution controls;
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
deterministic assumption and produces `INCONCLUSIVE`, not a wider tolerance.

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
equivalence bounds. An overlapping boundary is `INCONCLUSIVE`; a result
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
comparison, equivalence bounds, and uncertainty rule. A derived aggregate has
frozen components, weights, missing-value handling, and formula; verify both
the components and the aggregate. A passing secondary metric cannot hide a
primary or constraint failure.

### Hardware-dependent

For an exact-environment claim, freeze the hardware class, software and driver
versions, clocks or power mode, thread and device allocation, warmups,
measurement repetitions, aggregation, and environmental checks. Missing
required hardware is `NOT_ASSESSED` in external-audit mode. In research mode it
blocks the contract; an environment that becomes unavailable only at audit
produces `INCONCLUSIVE` and blocks completion.
For a portable claim, use a frozen same-host reference and normalized paired
comparison; do not compare raw latency, throughput, energy, or memory numbers
across unlike machines. Thermal throttling, excessive jitter, or another
failed environmental check is `INCONCLUSIVE`.

## Audit execution and saved evidence

The fresh I1 Score Auditor receives the frozen policy and verifier bundle, the
paper TeX and PDF, selected snapshot and manifest, canonical evaluation,
approved environment, and only the evaluator-only inputs declared for I1.

The auditor first writes independent structured extractions at
`audit/i1/tex-extraction.json` and `audit/i1/pdf-extraction.json`. Each record
contains the literal displayed value, normalized numeric value, metric, unit,
direction, estimand/aggregation language, uncertainty language, exact locator,
and extraction limitations. Agent judgment is therefore explicit saved input;
the verifier's calculations remain deterministic.

Next write `audit/i1/input-manifest.json` with every pre-execution input path,
access class, and path-bound SHA-256. Compute `execution_id` from the policy,
verifier manifest, input-manifest, selected-snapshot hashes, and attempt number.
Execute exactly the manifest's runtime and argv in the declared private
directory. Do not modify or wrap the source. Freeze locale, timezone,
concurrency, controllable seeds, and ordering as declared by the policy.

Preserve raw stdout, stderr, evaluator output, and exit metadata under
`private/evaluator/i1-runs/<execution-id>/`. Write
`audit/i1/evidence-manifest.json` with path-bound hashes for every resulting
private measurement and safe extraction record. Then write
`audit/i1/execution-receipt.json` with:

- execution ID and command argv;
- policy, verifier manifest, source-tree, input-manifest, environment, and
  selected-snapshot hashes;
- start and completion times, exit status, retry count, and failure category;
- raw private artifact paths and hashes;
- safe structured output path and hash;
- undeclared access, network, environment-change, and limitation arrays.

The structured computational payload must be canonical UTF-8 JSON with stable
ordering and no timestamps or host-dependent paths. Timestamps belong only in
the execution receipt. Given the same evidence-manifest hashes, the verifier
must produce the same payload. New irreducibly stochastic measurements may
differ and therefore create a different evidence manifest; that is evaluator
variation, not permission for nondeterministic comparison logic.

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
- aggregate `audit/i1.json`: component hashes and verdicts, policy and verifier
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
3. `INCONCLUSIVE` when no component has failed but reproducibility cannot be
   established because an interval crosses a bound, noise exceeds its ceiling,
   valid repetitions are insufficient, the environment check fails, or the
   frozen verifier cannot complete after the allowed operational retry.
4. `PASS` only when lineage, reproducibility, and claim semantics all pass for
   every metric required by the multi-metric decision rule.

`FAIL`, `INCONCLUSIVE`, and `NOT_ASSESSED` all block a research run.
`NOT_ASSESSED` is never valid merely because a check is difficult or the
verifier omitted support for an input already known at contract time.

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
