# ScientistOne protocol

The lead owns phase transitions and mechanical collation. Specialists own the
bounded scientific work packages described in `roles.md`. Saved files and
verified receipts, not conversation history, carry evidence between phases.

Use `candidate method`, `eligible candidate`, `canonical evaluation`,
`approved decision rule`, and `saved evidence` consistently. Internal schema
names such as `node`, `branch`, and `contract` remain valid only where they
identify distinct machine objects.

## 0. Contract

Inputs are `request.md`, approved `study-plan.md`, frozen
`environment/bootstrap.json`, `contract/run-config.json`, and
`contract/input-manifest.json`. External-audit mode also requires
`contract/source-bundle-manifest.json`.

Before review, freeze the nine execution budgets in `run-config.json` and the
scientific investigation limits in `study-plan.md`: search stop rule and
maximum records screened; reading stop rule and maximum full texts; direction
target or a domain-specific justification; bibliography target or documented
access limitation; brief-repair limit; `idea_ceiling`,
`minimum_eligible_ideas`, `candidate_node_ceiling`,
`minimum_evaluated_candidates`, `evaluation_ceiling_per_node`,
`ablation_ceiling`, `minimum_valid_ablations`, and exact audit panel size.

The plan lists estimated maximum evaluations and compute implications before
approval. Valid stop reasons are evidence saturation under the stated rule, no
additional eligible ideas, stable ranking under a plan-defined criterion,
exhausted approved compute, repeated operational failure, or researcher stop.
Do not pad a ceiling with duplicate or unsupported work.

Use the pilot profile by default. Use the standard profile only after the
researcher explicitly approves its larger ceiling and compute estimate; a
custom profile records every changed value and scientific reason before audit.

Freeze `contract/evaluator-contract.md` with the metric, unit, direction, split
policy, repetitions, failure rule, and candidate-visible feedback fields.
Freeze `contract/evaluator-manifest.json` with hashes and access classes for
evaluator code and evaluator-only inputs; do not expose their contents.
Evaluator source, held-out material, and private raw outputs live under
`private/evaluator/`.

Before candidate generation or any candidate result exists, dispatch a fresh
I1 Verifier Builder. It writes `contract/i1-verification-policy.json` and the
task-specific verifier bundle under `private/evaluator/i1-verifier/` according
to `i1-verification.md` and
`i1-verification-policy.schema.json`. The frozen policy declares the estimand,
units, comparison design, repetitions, uncertainty, fixed equivalence bounds,
noise ceiling, hardware conditions, multi-metric decision rule, and failure
outcomes. The verifier bundle contains generated source, fixtures, a manifest,
self-test evidence, and a build receipt that binds their hashes to the policy.
It is evaluator-only and cannot be declared to candidate-facing roles.

The Contract Auditor checks both the scientific policy and the generated
verifier. It rejects a policy inferred from candidate results, a relative
margin whose scale is the observed audit mean, variance that widens an
equivalence margin, undeclared dependencies or network use, missing fixtures,
or a non-PASS self-test. A later scientific surprise cannot silently change
the policy or verifier. Repair requires invalidating the contract and every
successor, preserving the prior contract, and restarting candidate work under
the new frozen contract; if that would change an approved scientific
commitment, write `attention.md` and stop.

Spawn one fresh Contract Auditor with `fork_turns: "none"` using the Common
Role Envelope and Contract Auditor card. Its declared files are only the
contract inputs and frozen I1 verifier bundle, plus the source-bundle manifest
in external-audit mode. It writes `contract/audit.md` and its unique receipt.
Do not promote a plan with a material finding. A PASS receipt means
`execution_status: COMPLETE` and `gate_verdict: PASS`.

On REVISE, the lead repairs the contract within the researcher's approved
scientific commitments and dispatches a fresh Contract Auditor. Record the
repair and repeat until PASS. Approval is never reopened. If no faithful
repair can pass, write `attention.md` and stop before initialization.

Before dispatching any specialist, the lead writes a supervisor-generated
`role-launches/<agent-task>.json` from native task metadata. It records the
task ID, role, `fork_turns: "none"`, actual model and reasoning effort,
`declared_inputs`, allowed external sources, declared outputs, and start time.
The specialist receipt references the launch-record hash and adds completion
time, actual outputs, limitations, accidental access, `execution_status`, and
`gate_verdict`, including an `environment_changes` array. If native metadata is unavailable, describe model and
freshness as declared by the role and checked by the lead; do not call them
enforced.

Environment failures are operational. For a missing tool or package, inspect
the bootstrap, install or repair the smallest compatible run-local dependency,
verify and record it, and rerun only the affected work package. For a conflict,
preserve the failed environment record and create an isolated role environment;
do not mutate a working evaluator or another candidate's environment. Try the
official distribution, an existing compatible tool, and one isolated
alternative before marking an installation BLOCKED.

Gate: exact request, approved plan, environment bootstrap, input manifest,
evaluator contract and manifest, I1 policy, generated verifier manifest and
source, fixtures, PASS self-test, build receipt, and independent Contract
Auditor PASS are frozen and checkpointed.

## 1. Problem investigation

Goal: identify relevant methods, evidence, and gaps and produce a reproducible
experiment brief before candidate development.

### 1.1 Literature map

Spawn a fresh Literature Mapper. It uses only the named allowed external source
classes and records every query, system, timestamp, result identifier, rank,
retrieval URL, disposition, and limitation in `evidence/search-log.jsonl`.
Each mapped record has methodological-relevance and problem-alignment scores
from 1-5, classification `direct`, `adjacent`, `cross_domain`, or `exclude`,
and a specific inclusion or exclusion reason. Prefer DOI, arXiv, PubMed,
publisher, repository, standards, or official dataset records over summaries.
Never create a bibliography entry from memory.

Screen until the frozen search stop rule is met or the record ceiling is
reached. Save records screened, query coverage, exclusions, duplicates, access
limitations, and the stopping reason. A narrow field may have fewer than five
direct or adjacent records when that limitation is documented.

### 1.2 Evidence reading and synthesis

Use fresh Evidence Reader agents in parallel. Each receives only its assigned full texts plus the approved plan and writes line-addressable notes: question, method, data, protocol, results, limitations, exact supporting passages, and relevance. Do not treat an abstract as full-method evidence.

Run reading rounds until the frozen reading rule is met or the full-text
ceiling is reached. After each round, record supported directions,
disagreements, access gaps, and remaining evidence needs. A fresh Evidence
Synthesizer merges duplicate directions and preserves disagreement; do not
judge saturation by an arbitrary call count.

### 1.3 Protocol audit and experiment brief

A fresh Protocol Auditor checks each proposed direction for:

- a defined primary outcome and direction/decision rule;
- a defensible baseline or comparison;
- reproducible data split, unit of analysis, seeds/repetitions, and uncertainty;
- an I1 comparison design and equivalence margin appropriate to deterministic,
  stochastic, paired, signed or near-zero, multi-metric, and hardware-dependent
  outcomes;
- evaluator independence and leakage controls;
- feasibility under approved constraints;
- planned ablations and negative-result interpretation.

Require all applicable rubric items to pass. Repair by targeted literature/protocol work, not by lowering the gate.

A fresh Brief Writer produces `investigation/brief.md` with exactly three top-level scientific sections:

1. Relevant methods, evidence, and gaps
2. Experiment plan
3. Literature context

It includes named baselines, grounded directions, the frozen evaluation
protocol, risks, open questions, feasibility constraints, and traceable
references. A fresh Brief Critic reviews it. Writer repair stops at the frozen
brief-repair limit; record every revision and stop reason.

Gate: source cache, search log, literature map, notes, directions,
`protocol-audit.md`, final brief, bibliography, critic PASS, and receipts are
checkpointed.

## 2. Candidate discovery and refinement

Goal: develop distinct candidate methods while keeping evaluation external.

### 2.1 Ideation

One fresh Ideator owns `discovery/ideas.jsonl`; one fresh Idea Critic owns
`discovery/idea-critique.jsonl`. Do not have parallel specialists append to a
shared JSONL file. The Ideator writes up to the frozen `idea_ceiling`, meeting
`minimum_eligible_ideas` when the evidence supports them. The critic scores
novelty, feasibility, expected scientific value, and likely effect on the
approved primary outcome, and records rejected duplicates or untestable ideas.

If fewer ideas are defensible, stop with the documented reason rather than
padding the file. The lead mechanically collates each node's `idea.md`, exact
shared-only manifest, and `discovery/index.json`; the lead does not alter
scientific content. Every indexed candidate ID must resolve to one node.

### 2.2 Candidate node

Each branch iteration is a separate directory and fresh Candidate Developer.
Declared candidate files are the plan, brief, idea, shared-input manifest and
files, and sanitized predecessor/cross-branch feedback only when allowed by
the plan. Candidate-facing roles have no evaluator-only paths or external
source classes.

The candidate implements the idea's core mechanism first. It records every version in `experimental-log.md` with:

- version/snapshot id and artifact hash;
- hypothesis and exact change;
- command/procedure and environment;
- allowed validation evidence returned by the parent/evaluator;
- outcome, error, and interpretation;
- next decision.

Candidate agents may run public checks and allowed local analyses. Official
evaluation is performed by a separate Evaluator on an immutable snapshot. A
deterministic allowlist command reads the private evaluation and writes only
execution status, public metric name/value/unit/direction, safe failure
category, and a candidate-visible note. Unknown fields are rejected. Raw
evaluation nodes, held-out values, labels, evaluator source, and private
checks never enter `feedback/`.

After each evaluation, run
`coe.mjs sanitize-feedback <run> <private-evaluation-json> <feedback-json>`.

Candidate refinement remains within the frozen evaluation ceiling. A failed
execution is operational evidence, not a scientific null; a failed evaluation
has no selection-eligible metric.

### 2.3 Candidate eligibility and stopping

A fresh Legitimacy Auditor reviews every completed node for:

- idea mismatch;
- trivial/no substantive change;
- study-plan or interface violation;
- evaluator import, gaming, leakage, or hardcoding;
- claimed metrics absent from the canonical evaluation record.

Only eligible candidates with finite canonical results may rank. Preserve failed
and ineligible records. The lead writes each iteration's sanitized feedback and
records screened, eligible, evaluated, retained, and stopped counts. Stop when
the candidate-node ceiling or compute ceiling is reached, the minimum
evaluated candidates and plan-defined stable-ranking criterion are satisfied,
no additional eligible idea exists, evidence saturates, a repeated operational
failure is recorded, or the researcher stops. A run that has not met the
minimum valid work remains paused or incomplete; it does not become a
scientific null.

Gate: every indexed node has its idea, exact shared-only manifest, sealed
snapshots, experimental log, evaluation records, method report, and legitimacy
audit; the discovery index records all nodes and stop reasons; receipts pass.

## 3. Selection and canonical evaluation

1. A fresh Selection Analyst ranks only eligible candidates under the approved
   primary outcome, direction, and tie-break rules. It writes
   `selection/selection.md`, copies the exact winning sealed snapshot, writes
   its manifest, and writes `selection/lineage.json`.
2. The lineage names the indexed source node, source snapshot path and hash,
   selected snapshot hash, legitimacy PASS, eligible evaluation, metric,
   direction, rank, and tie-break evidence. Every retained candidate ID must
   resolve to an eligible indexed node.
3. A fresh Selection Auditor checks the lineage, byte/tree-hash identity of the
   selected copy, frozen ranking rule, failed/ineligible exclusions, and
   legitimacy. It writes `selection/selection-audit.md` with one overall
   verdict line.
4. A separate Evaluator performs the canonical evaluation on
   `selection/selected/` using the recorded environment; a candidate-session
   number is never the paper score.
5. Confirm selected snapshot hash, metric, unit, direction, exact canonical
   repetition count, environment, procedure identifier, and private raw output
   references in `selection/canonical-evaluation.json`.
6. If canonical evaluation materially disagrees with the discovery record,
   investigate variance or artifact mismatch. Never choose an earlier
   favorable number.

Gate: selection analysis, lineage, selected manifest and artifacts,
selection-audit PASS, canonical evaluation, and receipts are checkpointed. If
no eligible candidate improves the baseline, retain the best valid evidence
and classify the outcome honestly.

## 4. Ablation

A fresh Ablation Designer writes controlled variants. Each removes or replaces
one core component, holds other conditions fixed, uses the canonical protocol,
and states the causal question and predicted outcomes. The plan may contain up
to `ablation_ceiling` variants and must meet `minimum_valid_ablations` when
valid variants exist. Record evidence saturation, no additional eligible
variant, compute exhaustion, or operational failure rather than inventing a
variant.

Fresh Implementers create variants and fresh Evaluators apply the same
protocol. A fresh Ablation Analyst writes `ablation/results.json` and
`ablation/report.md`, preserving failures and uncertainty. Do not select a
favorable repetition or claim causality from an observed association alone.

Gate: plan, valid variants and evaluations when required, results, report,
stop reason, and receipts are checkpointed.

## 5. Evidence-first paper

### 5.1 Research representation

A fresh Writer reads the frozen plan, experiment brief, verified source notes,
selected artifacts, canonical evaluation, experimental log, ablations, and
limitations. It writes `paper/representation.md` and tagged LaTeX with
Problem, Gap, Approach, Results, and Limitations.

Each independently verifiable assertion has one stable claim ID. Split a
sentence containing assertions supported by different evidence. Captions,
table cells, figure annotations, and equation explanations require claim IDs;
pure derivation steps require a method or derivation reference. Bibliographic
fields are checked by I3, not counted as prose claims. Use a dedicated LaTeX
macro or line-end TeX comment that compiles both before and after stripping;
the stripping command and clean-output check belong in the reproduction guide.

The headline result equals the selected canonical evaluation. Distinguish
evaluated method, ablation, post-hoc idea, failure, and speculation.

### 5.2 Check and write the paper

Perform deterministic tag and path checks first. A Paper Critic writes
`paper/grounding-report.json` before `paper/critic.md`:

```json
{
  "status": "PASS",
  "factual_sentence_count": 10,
  "resolvable_tag_count": 10,
  "grounding_ratio": 1.0,
  "unresolved_claim_ids": []
}
```

`grounding_ratio` is `resolvable_tag_count / factual_sentence_count`.
Count prose, captions, table cells, figure annotations, and equation
explanations after splitting multi-assertion sentences. A tag resolves only
when its artifact and locator exist. A ratio below 0.8 after the frozen repair
limit returns to the earliest missing evidence. The critic writes one overall
verdict line and does not rewrite prose or create evidence.

The Writer resolves findings without inventing evidence, then composes the
paper from verified bibliography keys. Distinguish evaluated method, ablation,
post-hoc idea, failure, and speculation.

Compose conventional scientific LaTeX: Abstract, Introduction, Related Work, Method, Experiments/Results, Discussion and Limitations, Conclusion, and References. Use only verified bibliography keys. Write for a domain researcher unfamiliar with the run internals.

Gate: tagged representation, grounding report, critic PASS, tagged LaTeX, bibliography, and figures/tables with source links are checkpointed.

## 6. Claim verification

Extract every `\\coe{claim-id}` marker from the tagged representation, tagged
LaTeX, and final TeX before stripping. Require each extracted ID exactly once
in `paper/claims.jsonl` and `paper/provenance.jsonl`; reject sidecar IDs absent
from the paper. Resolve file paths and line ranges, JSON pointers,
bibliography keys, and inference dependencies. Every target must exist in a
checkpointed artifact or frozen source bundle. Detect circular inference
dependencies and reject an empty claim set when factual prose exists.

One fresh Claim Verifier owns the current claims file. An independent recheck
uses a separate review file until explicitly assigned the next final claims
file. Numerical study claims resolve to the canonical evaluation or a declared
ablation; prior-work numbers resolve to the cited Source Record. Each
provenance record identifies claim type, paper location, evidence kind, target,
locator, and target hash. Fresh Claim Verifiers judge against the exact bound
evidence:

- numerical: value, unit, metric, and experimental location;
- citation: assertion against the resolved work and available source text;
- methodological: prose against frozen method/protocol artifacts;
- conclusion: inference against already verified claims.

Flag `SUPPORTED`, `PARTIAL`, or `UNSUPPORTED` with reason and break code. The
Writer removes unsupported claims or repairs them once within the frozen limit,
then creates `paper/paper-verified-tagged.tex` without changing the frozen
original. Re-extract and re-verify the revised draft. The final claims file
contains only unique supported IDs and provenance contains exactly one mapping
per ID. Produce presentation `paper/paper.tex` with tags removed.

When the approved plan requires PDF and the frozen environment contains a verified compiler, compile the PDF and visually inspect it before this gate passes. Otherwise preserve the verified source document and do not install a compiler merely to satisfy the plugin.

Gate: no unsupported headline claim, all numeric claims traced, references compile, final TeX and PDF agree, and the verification report passes.

## 7. Integrity audit

Audit specialists are fresh and do not read producer transcripts. Evaluator,
I1, and I2 assignments may read only evaluator-only paths explicitly declared
for their check. No candidate-visible artifact may contain held-out rows,
labels, evaluator source, or private checks.

### I1 score verification

Follow `i1-verification.md`. I1 is three separate checks: score lineage,
fresh-rerun reproducibility, and claim semantics. No one scalar tolerance is
valid for every research task.

The fresh I1 Score Auditor reads the frozen policy and verifier bundle in
addition to the paper, selected snapshot, canonical evaluation, and explicitly
declared evaluator-only inputs. It independently records the TeX and PDF
headline extractions, writes `audit/i1/input-manifest.json`, and executes the
exact frozen verifier entrypoint. It may not edit, regenerate, patch, wrap, or
replace verifier code. Raw stdout, stderr, and evaluator output remain under
`private/evaluator/i1-runs/<execution-id>/`; the public audit records contain
only allowed values and hash references.

If the approved plan does not require PDF, record the PDF extraction medium as
not required and compare the verified source only. This does not make the I1
aggregate `NOT_ASSESSED`; lineage, reproduction, and claim semantics must still
PASS for a research run.

Save deterministic comparison artifacts at
`audit/i1/lineage.json`, `audit/i1/reproducibility.json`, and
`audit/i1/claim-semantics.json`, plus the hash-bound
`audit/i1/execution-receipt.json`. Then write aggregate `audit/i1.json` with
the frozen policy and verifier hashes, selected snapshot hash, every metric and
comparison, exact evidence paths, limitations, and one verdict:
`PASS`, `FAIL`, `INCONCLUSIVE`, or `NOT_ASSESSED`. `PASS` requires every
applicable component to pass. A lineage, metric, unit, direction, estimand,
aggregation, deterministic-output, or claim-semantics mismatch is `FAIL`.
Excess variance, an interval crossing a frozen equivalence bound, too few valid
reruns, or an execution failure after the allowed operational retry is
`INCONCLUSIVE`; variance affects uncertainty but never widens the scientific
equivalence margin. `NOT_ASSESSED` is external-audit-only and requires a
manifested missing input or unavailable required environment. Every outcome
other than `PASS` blocks a research run.

The ADRS paper rule `max(1%, 3σ/|s̄|)` is available only as the named
`adrs_legacy_v1` compatibility profile. It is not the default, must not be
inferred for a new study, and must not be used for signed, near-zero,
multi-metric, paired, or hardware-portability claims unless the frozen task is
specifically reproducing the ADRS audit procedure.

### I2 specification violation

Give each exact-size fresh judge the plan, evaluator contract/source and
manifest, selected snapshot, input manifests, and canonical results as
declared. Each vote records judge ID, contract and snapshot hashes, checked
categories, `flagged`, category if flagged, evidence paths, rationale, and
verdict. Judges independently flag evaluator import, exploitation,
specification exploit, or data leakage only with exact artifact evidence. Do
not share votes. The fresh Audit Reporter later recomputes the aggregate.

### I3 reference verification

Resolve every bibliography entry through DOI, arXiv ID, title, authors, year,
and venue using primary scholarly systems. Record every populated field,
resolved primary record, retrieval timestamp, field-by-field comparison,
status, evidence path, totals, and verdict in `audit/i3.json`. Do not silently
delete unresolved or mismatched entries.

### I4 method-artifact alignment

Give each exact-size fresh judge the paper method and selected artifacts. Each
vote records judge ID, paper method locations, selected paths and hashes,
checked core mechanisms, `flagged`, category if flagged, exact evidence,
rationale, and verdict. Ordinary omitted implementation detail is acceptable;
flag only `incomplete_broken`, `method_class_mismatch`, or
`deceptive_dummy_artifact` with evidence. Do not share votes.

The Claim-Provenance Auditor writes total numerical claims, assessed count,
supported count, coverage ratio, every mismatch, unavailable items, exact
evidence paths, and verdict. It checks study numbers against canonical or
ablation records and prior-work numbers against Source Records.

After all independent reports and votes are written, start a fresh Audit
Reporter. It reads only those declared reports and votes plus the plan, writes
`audit/i2/aggregate.json`, `audit/i4/aggregate.json`, and `audit/report.md`,
and recomputes `judge_count`, `threshold`, `flag_votes`, and `flagged` from
individual votes. It does not rerun, reinterpret, resolve disagreement, or
repair an audit. The report preserves every FAIL and NOT_ASSESSED item and
states the rollback phase for each blocking finding. An empty report or bare
verdict is invalid. Its role receipt is PASS only when this assembly is
accurate; the report's scientific verdict may still be FAIL or NOT_ASSESSED.

Gate: every applicable audit ran, each PASS includes its comparison evidence,
missing inputs are explicit, no blocking mismatch remains, aggregate counts
match votes, and the report is checkpointed. A blocking research failure rolls
back to the earliest responsible phase while preserving failed artifacts.

## 8. External-audit mode

For research produced elsewhere, do not run investigation or candidate
discovery. Freeze supplied paper, method/code, evaluator/evaluation evidence,
references, and logs under the paths in `contract/source-bundle-manifest.json`.
The manifest is non-empty and each item has `supplied_path`, `frozen_path`,
`artifact_type`, `sha256`, `intended_checks`, `access_class`, `available`, and
`missing_reason` (null when available). Derive required audit inputs from the
manifest rather than assuming research-mode filenames. Mark a check
`NOT_ASSESSED` only when a required item has `available: false` and a concrete
reason. If no check is assessable, stop with `insufficient_evidence`; do not
mark the audit complete.

For I1, prefer a supplied policy and verifier demonstrably frozen before the
external results. If they are absent, the I1 Verifier Builder works
result-blind: it may read the supplied protocol, evaluator interface, declared
environment, and source-bundle metadata, but not the paper's reported values,
canonical result values, or favorable candidate outputs before freezing the
external-audit policy and verifier. Do not invent a post-hoc equivalence margin.
When the supplied design cannot determine one, lineage and claim semantics may
still be assessed but reproducibility is `NOT_ASSESSED` with the exact missing
predeclaration recorded.

Run the Contract Auditor in `external_audit` mode, then every I1-I4 and
claim-provenance check supported by the frozen bundle. Copy the manifest into
`deliverables/`. External outcomes describe the audit itself:
`audit_passed`, `audit_failed`, or `audit_incomplete`. Never force an external
audit into `completed_with_limitations`.

## 9. Delivery

The Reproduction Writer reads `environment/bootstrap.json` and the recorded
evaluation environments, then creates canonical `delivery/reproduction.md`. When the approved plan requires a rendered document, the lead
or a named visual reviewer creates `delivery/visual-inspection.json`. The reproduction guide names selected
snapshot and hash, actual environment/dependencies, input paths and access
limits, exact command/procedure, expected canonical output, tag-stripping
check, and manifest/audit verification command. Visual inspection records PDF
hash, page count, renderer/viewer, timestamp, checked pages, defects, and
`PASS|REVISE` verdict. Empty files are invalid. Delivered copies must match
these canonical sources exactly.

Copy only audited outputs into `deliverables/`, generate `manifest.json`, and
use the validated state/checkpoint commands rather than hand-editing state or
outcome. Checkpoint `complete` only after manifest verification passes, then
run `verify` once more.

Research outcomes are `positive`, `scientific_null`, or
`completed_with_limitations`. Operationally incomplete work remains `paused`
or `failed`, never a scientific null. External-audit outcomes use the values
in Section 8.

## Canonical terminology

| Use | Avoid unless it names a distinct schema object |
| --- | --- |
| researcher | user, operator, principal |
| lead | main agent, orchestrator |
| specialist | subagent, worker agent |
| study plan | contract, scientific law |
| candidate method | node, branch, attempt when no distinction is needed |
| canonical evaluation | official evaluation, benchmark pass |
| approved decision rule | strongest, promising, best-looking |
| eligible candidate | legitimate node |
| saved evidence | grounded evidence, evidence fabric |
| source record | retrieved scholarly record |
| prior work | research field |
| candidate discovery and refinement | explore/exploit loop |
| cross-branch feedback | swarm feedback |
| not assessed | unknown, unavailable verdict |
| verified receipt | completed stage, green phase |
