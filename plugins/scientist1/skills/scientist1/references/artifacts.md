# Artifact and evidence contract

## Run tree

Use this stable, visible layout. Add domain-specific files inside the named phase directories; do not invent a second state tree.

```text
scientist1-runs/<UTC>-<slug>/
  request.md                       exact user request
  study-plan.md                    approved researcher charter
  run.json                         small live status record
  attention.md                     legacy/pre-approval researcher action only
  events.jsonl                     append-only high-level events and repairs
  role-receipts/<agent-task>.json  one immutable receipt per specialist
  receipts/                        immutable phase hash receipts
    superseded/                    recoverably invalidated receipt chains
  environment/
    bootstrap.json                 verified shared tools and platform
    tools/                         portable shared tools when needed
  contract/
    approval.json                  hash-bound researcher approval and execution authority
    run-config.json
    input-manifest.json
    custom-profile.json             only for custom profiles
    source-bundle-manifest.json     required for external_audit
    evaluator-contract.md           candidate-visible frozen evaluation rules
    evaluator-manifest.json         hashes/access classes, no private contents
    i1-verification-policy.json      result-blind structured I1 decision policy
    control-plane/
      i1-interpreter.mjs             release-tested policy interpreter snapshot
    drafts/                         superseded contract drafts
    audit.md
  source-bundle/                   frozen external-audit supplied files
  role-launches/<agent-task>.json   supervisor-generated dispatch record
  role-attempts/<logical-task>/<work-key>/ immutable accepted launch attempts
  repairs/incidents/               immutable operational repair diagnoses
  inputs/shared/                    frozen candidate-visible inputs
  evidence/
    sources.jsonl                  one Source Record per scholarly/web source
    search-log.jsonl               queries and unfiltered result ids
    literature-map.jsonl           relevance, classification, and disposition
    fulltext/                      cached source files where permitted
  investigation/
    notes/
    directions/
    protocol-audit.md
    brief.md
    references.bib
    critic.md
  private/evaluator/               evaluator source, held-out data, raw outputs
    i1-runs/<execution-id>/         private I1 stdout/stderr/raw measurements
  discovery/
    ideas.jsonl
    idea-critique.jsonl
    index.json
    iteration-<n>-feedback.md
    nodes/i<NN>-b<NN>/
      idea.md
      shared-input-manifest.json
      workspace/                   candidate-owned method/code/protocol
      snapshots/<id>/              sealed candidate versions
      feedback/                    sanitized evaluator feedback
      experimental-log.md
      evaluations/<id>.json
      method-report.md
      legitimacy-audit.md
  selection/
    selection.md
    selection-audit.md
    lineage.json
    selected/                      sealed chosen method/code/protocol
    canonical-evaluation.json
  ablation/
    plan.json
    variants/
    evaluations/
    results.json
    report.md
  paper/
    representation.md              factual sentences still carry evidence tags
    grounding-report.json
    critic.md
    paper-tagged.tex
    paper-verified-tagged.tex       refined tagged draft; the original remains frozen
    claims.jsonl
    verification.md
    provenance.jsonl
    references.bib
    paper.tex                       clean presentation source
    paper.pdf                       only when the approved plan requires PDF
  audit/
    i1/
      tex-extraction.json
      pdf-extraction.json
      input-manifest.json
      evidence-manifest.json
      execution-receipt.json
      lineage.json
      reproducibility.json
      claim-semantics.json
    i1.json
    i2/judge-<n>.json
    i2/aggregate.json
    i3.json
    i4/judge-<n>.json
    i4/aggregate.json
    claim-provenance.json
    report.md
  deliverables/
    paper.tex
    paper.pdf                       only when the approved plan requires PDF
    references.bib
    provenance.jsonl
    audit-report.md
    reproduction.md
    visual-inspection.json          only when a rendered document is required
    ... selected method, results, plan, brief ...
    manifest.json
  delivery/
    reproduction.md                 canonical source for delivered reproduction guide
    visual-inspection.json          canonical inspection record when required
```

A completed research manifest must include the study plan, investigation brief,
paper TeX, bibliography, provenance, selected-method manifest plus selected
artifacts, canonical evaluation, ablation report, verification, audit report,
and non-empty reproduction guide. Include paper PDF and visual inspection only
when the approved plan requires PDF and a compiler is available. External
audit mode instead requires the frozen source-bundle manifest, audit report,
visual inspection when a PDF is supplied, and reproduction guide; include each
supplied paper/code/evaluation item as an additional manifest entry.

## Environment bootstrap

The lead writes `environment/bootstrap.json` before contract initialization:

```json
{
  "schema_version": 1,
  "platform": {"os": "darwin", "architecture": "arm64"},
  "paper_output": {"pdf": "required", "reason": "Approved plan requires a compiled paper", "plan_reference": "study-plan.md"},
  "tools": [
    {
      "name": "node",
      "requirement": ">=20",
      "path": "<Codex-available-runtime-path>",
      "version": "22.0.0",
      "source": "existing",
      "source_url": null,
      "sha256": null,
      "verified_at": "<ISO-8601>"
    },
    {
      "name": "latex",
      "implementation": "tectonic",
      "path": "/absolute/path/to/tectonic",
      "version": "0.15.0",
      "source": "existing",
      "source_url": null,
      "sha256": null,
      "verified_at": "<ISO-8601>"
    }
  ]
}
```

`platform.os` is `darwin`, `linux`, or `win32`; architecture is the observed
runtime architecture. Tool paths are absolute or run-relative. `source` is
`existing`, `portable_official`, or `system_package_manager`. A portable tool
records its official HTTPS source and executable SHA-256. Node and LaTeX are
not plugin-install prerequisites. Record Node 20+ when the bundled CoE and
common I1 interpreter use a Codex-provided Node runtime. The task-specific
policy may point to a different already-available evaluator runtime. `paper_output`
defaults to legacy `{ "pdf": "required" }`. Research may explicitly record
`{ "pdf": "not_required", "reason": "...", "plan_reference":
"study-plan.md" }`; in that case LaTeX, PDF, and visual inspection are omitted.
When PDF is required, record a verified LaTeX implementation. Live contract
checkpointing requires declared executables to exist; later read-only
verification does not require an absolute path from another machine to exist.
A portable download is permitted only when the approved scientific method
itself needs that tool and must record `"purpose": "scientific_method"`.
Never download Node or another runtime solely to operate CoE or I1 interpreter
control code; use a runtime Codex already exposes or record the check as
unverified/FAIL.

## `run.json`

The ledger utility creates this record:

```json
{
  "schema_version": 1,
  "id": "20260817T153000Z-example-question",
  "mode": "research",
  "search_profile": "pilot",
  "budgets": {
    "idea_ceiling": 4,
    "minimum_eligible_ideas": 2,
    "candidate_node_ceiling": 4,
    "minimum_evaluated_candidates": 2,
    "evaluation_ceiling_per_node": 2,
    "ablation_ceiling": 2,
    "minimum_valid_ablations": 1,
    "canonical_repetitions": 3,
    "audit_panel_size": 3
  },
  "orchestration": {"task_attempt_policy": "repair_until_pass", "repair_gate_policy": "invalidate_and_continue", "completion_condition": "fresh_verified_delivery", "review_frontier_policy": "frozen_release_checklist", "rollback_policy": "independent_adjudication_only", "repair_scope_policy": "exact_delta", "recurrence_policy": "causal_strategy_change"},
  "repair_waves": {},
  "repair_incidents": [],
  "convergence_control": {"schema_version": 1, "release": "1.5.0", "checklist": {"path": "contract/control-plane/gate-checklists.json", "sha256": "<sha256>"}, "migrated_from": null},
  "pending_adjudication": null,
  "active_repair": null,
  "repair_closures": [],
  "created_at": "2026-08-17T15:30:00.000Z",
  "updated_at": "2026-08-17T15:30:00.000Z",
  "state": "running",
  "phase": "contract",
  "outcome": null,
  "request_sha256": "<sha256>",
  "study_plan_sha256": "<sha256>",
  "contract_parameters_sha256": "<sha256>",
  "approval_sha256": "<sha256>",
  "contract_revision": 1,
  "charter_revision": 1,
  "last_checkpoint": null,
  "invalidation_roots": [],
  "checkpoints": {},
  "pending_checkpoint": null,
  "pending_invalidation": null,
  "terminal_anchor": null,
  "attention": null
}
```

Allowed states for an active 1.5 run are `running`, `repairing`, and `complete`.
Research phases are `contract`, `investigation`, `discovery`,
`selection`, `ablation`, `writing`, `verification`, `audit`, `complete`.
External-audit mode uses `contract`, `audit`, `complete`.

Research outcomes are `positive`, `scientific_null`, and
`completed_with_limitations`; external-audit outcomes are `audit_passed`,
and `audit_failed`. After approval, operational work remains
`running` or `repairing` until fresh final verification proves the complete
delivery. Attempts, repair cycles, failures, and superseded artifacts remain
immutable evidence; none is a stopping budget or scientific outcome.

`repair_waves` counts downstream and result-aware invalidation cycles for audit
history. Result-blind contract stabilization before candidate evidence does not
increment `repair_waves.contract`; each revision remains archived and hash-bound.
No count can terminate an approved study.

There is no post-approval pause/attention state in a 1.5 run. Review findings
first enter `pending_adjudication`. A fresh Repair Adjudicator classifies the
complete finding set against the frozen checklist. `record-repair` either
records an immutable false-positive dismissal or opens one `active_repair`
docket with stable fingerprints, exact file scope, and required reviewers.
`close-repair` compares the live scientific tree with the docket baseline,
requires the docket-bound passing receipts, anchors the closure, and clears the
docket. Deterministic checkpoint rejections in any phase bind only the
phase-agnostic Checkpoint Reviewer; its control-path review cannot create a
scientific finding. Checkpoint is the
only command that advances a verified phase or marks completion. A temporary
`pending_checkpoint` journal makes an interrupted promotion retryable; retry the
same checkpoint command and the utility removes the unanchored candidate before
validating again. Invalidation and contract revision first prepare a complete
copy, then save `pending_invalidation` before changing live evidence; retry the
same invalidation command to roll that prepared transaction forward exactly
once. Do not hand edit `run.json`. The utility never rewrites
checkpoint anchors, ID, mode, profile, creation time, schema, request hash, or
study-plan hash. Monitoring reads this file; receipt verification, not the
status label, determines scientific validity.

The approval record is bound exactly once before any specialist launch:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs bind-approval <run> <draft-id> <approved-at> <execution-authority>
```

The browser MCP calls this command from `attach_run_monitor`. Migrate an active
1.3/1.4 repair in place, preserving all prior evidence, before new repair work:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs migrate-convergence <run>
```

A 1.5 repair proposal uses schema 2 and is owned by a passing
`repair_adjudicator` receipt. It declares `disposition`, `target_phase`,
`source_review`, its hash-bound non-passing `source_review_receipt` when the
frontier came from a reviewer, `adjudicator_receipt`, every closed-checklist
finding, `required_review_roles`, complete `reviewed_check_ids`, an optional
changed causal `strategy`, and `required_action`. Each finding declares
`review_role`, stable `check_id`, allowed `blocker_class`, exact
`artifact_path` and `locator`, expected and observed state, exact
`evidence_paths`, exact file-level `repair_paths`, and
`introduced_by_paths`. The controller derives and archives a finding-local
state fingerprint from the exact artifact. Unrelated manifest changes,
uncheckpointed evidence files, and declared-input padding cannot reopen that
finding; only an artifact delta or genuinely changed controller-authoritative
causal strategy can do so. The
controller accepts a new proposal only against its
own pending checkpoint/reviewer frontier, snapshots every authority artifact
under `repairs/evidence/`, and seals all rows for that role and evidence epoch.
Then open or dismiss it with:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs record-repair <run> <repair-incident.json>
```

Close an active docket with a Repair-Adjudicator-owned schema-1 proposal that
binds the docket ID, every frozen fingerprint, and the required passing review
receipts:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs close-repair <run> <repair-closure-proposal.json>
```

Raw reviewer prose cannot authorize `invalidate`. The invalidation reason must
be the controller-owned active incident. A re-audit launch is hash-bound to the
docket semantic digest and automatically reads every live repaired path. A
confirmed docket cannot close with zero scoped changes, an unbound review, or
mutation outside its exact scope. Its closure archives explicit present/absent
post-state, any absence proof, every target-phase dependent regeneration, and
the post-repair scientific-state seal. One PASS receipt is reused when its
frozen dependent task is also the required reviewer for the same role/output;
a second overwriting launch is invalid procedure. Automatic `revise-contract` likewise accepts
only the active contract incident; an independently supplied, hash-bound
researcher amendment remains a separate explicit path.

The supported outcome and feedback operations are:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs set-outcome <run> <positive|scientific_null|completed_with_limitations|audit_passed|audit_failed>
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs sanitize-feedback <run> <private-evaluation-json> <feedback-json>
```

Revise a generated contract in place with a structured reason file:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs revise-contract <run> contract/revision-reason.json
```

For a researcher-initiated charter amendment supplied after approval, stage the
amended plan at a separate run-relative path and pass it as the final argument.
The lead must never ask for this amendment. The reason binds the researcher's
supplied change at its exact run-relative path and hash:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs revise-contract <run> contract/revision-reason.json <approved-amended-plan.md>
```

The reason object has exactly these fields:

```json
{
  "schema_version": 1,
  "classification": "AUTOMATIC_REPAIR",
  "charter_changed": false,
  "result_aware": false,
  "post_result_guard": null,
  "finding": "The pre-result policy binds the wrong evaluator argv.",
  "repair": "Correct only the argv binding and its dependent hashes, then rerun the closed audit.",
  "researcher_approval": null
}
```

Use `RESEARCHER_APPROVED_AMENDMENT` only when the researcher independently
supplied the change, with `charter_changed: true` and a `researcher_approval`
object containing the amended plan's path and SHA-256. Never use the class as
a reason to stop and solicit approval.
An automatic repair cannot replace `study-plan.md`. The command derives result
awareness from saved candidate/downstream evidence and rejects a mismatched
agent declaration. Pre-result revisions are unlimited by count but remain
limited to concrete closed-checklist defects and minimal deltas. A result-aware
repair must use `invalidate_and_rerun`; the command archives every successor
before it returns the same run to contract review and consumes the frozen
repair wave.

## CoE verifier

The JS CoE reference implementation is bundled at
`<scientist1-skill-root>/scripts/coe.mjs` and uses only the Node standard
library; it performs no agent or scientific work and does not make Node a
plugin-install prerequisite. It is the single authoritative chain verifier for
this plugin release. From the monitor or results skills, resolve the main skill
root; never invent or build a task-local replacement.

Before any contract specialist, create immutable structured mode/profile parameters:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs configure <run> pilot research
```

Pilot remains the paper-compatible default and its smaller ceilings must be
disclosed. Standard is available only when the researcher explicitly approves
its larger compute budgets. Both ceiling/minimum profiles are built in. For a custom profile,
first write `contract/custom-profile.json` with every integer field shown in
`run.json` and the scientific reason in `study-plan.md`, then pass that
run-relative path as the final argument. Then initialize the ledger and common
interpreter snapshot; the auditor reads the fully expanded run configuration:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs init <absolute-run-directory>
```

## `environment/task-ledger.json`

The executable scheduler reads this run-local queue. `capacity` is the usable
native-agent limit capped at 16. Every task has a stable ID, exact real
predecessors, one or more exclusive run-relative output trees, and any shared
evaluator resources it consumes. Each resource freezes `parallel_safe` and a
positive `max_concurrency`; false always means a limit of one.

```json
{
  "schema_version": 1,
  "capacity": 16,
  "resources": [
    { "id": "canonical-evaluator", "parallel_safe": true, "max_concurrency": 2 }
  ],
  "tasks": [
    {
      "id": "candidate.001.evaluate.001",
      "status": "pending",
      "predecessors": ["candidate.001.develop.001"],
      "outputs": ["search/candidates/001/evaluations/001"],
      "resource_ids": ["canonical-evaluator"]
    }
  ]
}
```

Valid statuses are `pending`, `running`, `complete`, and `repair_required`.
Attempt accounting is deliberately absent: immutable `role-attempts/` records
are the sole attempt authority. The ready result exposes `blocked_task_ids`,
`repair_required_task_ids`, `repair_required`, and `drained` so an empty ready
set cannot masquerade as active progress or authorize stopping.
Before dispatch and after first completion, invoke:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/scheduler.mjs ready <run>/environment/task-ledger.json
```

Only returned IDs may launch. Update `running` after accepted launch authorization and
`complete` only after the hash-bound role receipt passes. Completion order
never changes IDs, seeds, rankings, or collation.

Hash each frozen input for `contract/input-manifest.json` with the same path-bound SHA-256 algorithm used by receipts:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs hash <run> inputs/shared/observations.csv
```

For diagnosis only, preflight may inspect a finished phase without writing a
receipt or advancing `run.json`:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs preflight <run> contract \
  --input request.md --input study-plan.md --input environment/bootstrap.json \
  --input contract/run-config.json --input contract/input-manifest.json \
  --output contract --output role-receipts/<contract-auditor-task>.json
```

Checkpoint is the authoritative failure-atomic gate; preflight is not required.
Every path is run-relative and may name a file or directory:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs checkpoint <run> contract \
  --input request.md --input study-plan.md --input environment/bootstrap.json \
  --input contract/run-config.json --input contract/input-manifest.json \
  --output contract --output role-receipts/<contract-auditor-task>.json
```

The utility rejects missing paths, symlinks, path escapes, noncontiguous phases, changed predecessor evidence, and overwritten receipts. It automatically binds each receipt to the prior receipt.
Every phase receipt also binds the active `contract_revision` and
`charter_revision`. A receipt from an older revision cannot promote work under
the repaired contract.

Every promoted Markdown gate (`contract/audit.md`, protocol/brief/selection/paper critics, and `paper/verification.md`) contains exactly one machine-readable `Overall verdict: PASS|REVISE|FAIL` line. Only one overall PASS is promotable; checklist occurrences of PASS do not count.

If a downstream audit or repaired dependency invalidates an accepted
non-contract phase, first write a reason file, then recoverably supersede that
phase and every successor:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs invalidate <run> writing audit/rollback-reason.md
```

This uses the checkpoint's frozen receipt and output anchors, not the possibly changed receipt, to move receipts and all originally promoted outputs into a timestamped `receipts/superseded/` directory. Changed and missing observations are recorded beside the expected hashes. The archive root hash is retained in `run.json` and automatically added to every rebuilt phase receipt, while archived receipt, artifact, and reason hashes are rechecked on every `verify`. Resume from the invalidated phase and create new outputs and receipts at the canonical paths. The generic `invalidate` command rejects `contract`; use `revise-contract` so contract and charter revisions, result awareness, and approval are recorded.

Generate the final manifest after `deliverables/` contains only audited outputs:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs manifest <run>
```

For every core deliverable, `manifest` compares a path-independent content digest with its already checkpointed canonical source (for example `deliverables/paper.pdf` to `paper/paper.pdf`, and every selected-method file to `selection/selected/`). It refuses an unrelated or edited delivery copy.

Verify at resume, before audit, and before completion:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs verify <run>
```

`verify` checks the exact request and plan hashes, shared/evaluator-only input locations and hashes, individual role receipts, required descendants, every promoted input/output and receipt link, superseded evidence, audit-panel counts/majorities, final manifest hashes, required deliverables, and complete-state consistency. A nonzero exit blocks promotion.

For an interrupted unfinished phase, validate one completed work package before
reusing it:

```sh
<resolved-node-path> <scientist1-skill-root>/scripts/coe.mjs verify-role <run> role-receipts/<agent-task>.json
```

This is read-only. It accepts only a COMPLETE/PASS receipt from the current
predecessor whose logical task, attempt, contract/charter revision, role
contract, routing, declared input/output hashes, privacy boundary, and schema
still match. It rejects legacy unbound receipts, changed artifacts, already
promoted work, and duplicate COMPLETE/PASS logical samples. Reuse the accepted
receipt as its original sample; never count it as a new repetition or vote.

## Phase receipt requirements

The checkpoint command accepts domain-specific extra artifacts, but these minimum outputs must exist and be included; promoting only an ancestor does not excuse a missing descendant:

The contract receipt binds `environment/bootstrap.json`; execution routing is
bound per specialist launch rather than treated as a scientific contract input.
The original `environment/model-routing.json` remains immutable. A compatible
future route is stored content-addressed under `environment/routing-history/`
and selected by `environment/model-routing-active.json`; prior launch hashes
continue to resolve to their original validated record.

Each phase checkpoint must also include the individual `role-receipts/<agent-task>.json` files for every specialist whose work it promotes. Pass the individual files, not the whole growing `role-receipts/` directory.

| Phase | Minimum promoted outputs |
| --- | --- |
| contract | `contract/run-config.json`, `contract/input-manifest.json`, `contract/evaluator-contract.md` and `contract/evaluator-manifest.json` (research mode), `contract/source-bundle-manifest.json` (external-audit mode), `contract/i1-verification-policy.json`, `contract/control-plane/i1-interpreter.mjs`, the I1 Policy Author receipt, and `contract/audit.md` |
| investigation | `evidence/search-log.jsonl`, `evidence/sources.jsonl`, non-empty `investigation/notes` and `directions`, `investigation/protocol-audit.md`, `investigation/brief.md`, `investigation/references.bib`, `investigation/critic.md` |
| discovery | `discovery/ideas.jsonl`, `discovery/idea-critique.jsonl`, `discovery/index.json`, all indexed node ideas, shared manifests, sealed snapshots, experimental logs, evaluation records, reports, and legitimacy audits |
| selection | `selection/selection.md`, `selection/selection-audit.md`, `selection/lineage.json`, `selection/selected/manifest.json` plus every selected artifact, `selection/canonical-evaluation.json` |
| ablation | `ablation/plan.json`, non-empty `ablation/variants` and `evaluations`, `ablation/results.json`, `ablation/report.md` |
| writing | `paper/representation.md`, `paper/grounding-report.json`, `paper/critic.md`, `paper/paper-tagged.tex`, `paper/references.bib` |
| verification | `paper/claims.jsonl`, `paper/verification.md`, `paper/paper-verified-tagged.tex`, `paper/provenance.jsonl`, `paper/paper.tex`; add `paper/paper.pdf` when the plan requires PDF |
| audit | `audit/i1.json`, every required file under `audit/i1/`, the referenced private `i1-runs/<execution-id>/` evidence, `audit/i2/aggregate.json` plus every judge vote, `audit/i3.json`, `audit/i4/aggregate.json` plus every judge vote, `audit/claim-provenance.json`, `audit/report.md` |
| complete | `delivery/reproduction.md` and `deliverables` including `manifest.json`; add `delivery/visual-inspection.json` when the plan requires a rendered document |

### Exclusive artifact ownership

Every artifact has one producer and one reviewer or mechanical validator. The
lead may collate files only where the table says so; it may not rewrite a
specialist's scientific content.

| Artifact | Owner | Reviewer/validator |
| --- | --- | --- |
| `environment/bootstrap.json`, `contract/run-config.json`, input manifest, evaluator contract/manifest, source-bundle manifest | Lead/configure command | Contract Auditor and CoE |
| `contract/i1-verification-policy.json` | I1 Policy Author (compatibility key `i1_verifier_builder`) | Contract Auditor and CoE |
| `contract/control-plane/i1-interpreter.mjs` | CoE `configure` command from the release-tested bundle | Contract Auditor and CoE |
| `contract/audit.md` | Contract Auditor | CoE receipt/checkpoint |
| `role-launches/<agent-task>.json` | Lead from native task metadata | CoE receipt binding |
| `evidence/search-log.jsonl`, sources, literature map | Literature Mapper | CoE schema and Brief Writer |
| `investigation/notes/` | Evidence Reader | Evidence Synthesizer |
| `investigation/directions/` | Evidence Synthesizer | Protocol Auditor |
| `investigation/protocol-audit.md` | Protocol Auditor | CoE gate |
| `investigation/brief.md`, references | Brief Writer | Brief Critic |
| `investigation/critic.md` | Brief Critic | CoE gate |
| `discovery/ideas.jsonl` | Ideator | Idea Critic |
| `discovery/idea-critique.jsonl` | Idea Critic | Lead schema check |
| node `idea.md`, shared manifest, `discovery/index.json` | Lead mechanical collation | CoE hash/ownership check |
| node workspace, snapshots, log, method report | Candidate Developer | Evaluator and Legitimacy Auditor |
| node evaluations | Evaluator | Legitimacy Auditor and CoE |
| node legitimacy audit | Legitimacy Auditor | Selection Analyst |
| `selection/selection.md`, selected copy, selected manifest, lineage | Selection Analyst | Selection Auditor |
| `selection/selection-audit.md` | Selection Auditor | CoE gate |
| `selection/canonical-evaluation.json` | Evaluator | I1 Score Auditor and CoE |
| `ablation/plan.json` | Ablation Designer | CoE gate |
| `ablation/variants/` | Ablation Implementer | Evaluator and Ablation Analyst |
| `ablation/evaluations/` | Evaluator | Ablation Analyst |
| `ablation/results.json`, report | Ablation Analyst | CoE gate |
| `paper/representation.md`, tagged TeX, references | Writer | Paper Critic |
| `paper/grounding-report.json`, critic | Paper Critic | CoE gate |
| `paper/claims.jsonl`, verification | Claim Verifier | CoE resolver |
| `paper/paper-verified-tagged.tex`, paper TeX, and any required PDF | Writer | Visual reviewer when applicable and CoE |
| `audit/i1/`, its referenced private execution directory, and `audit/i1.json` | I1 Score Auditor | CoE schema and frozen policy/interpreter hashes |
| `audit/i3.json` | I3 Reference Auditor | CoE schema |
| `audit/claim-provenance.json` | Claim-Provenance Auditor | CoE schema |
| `audit/i2/judge-<n>.json`, `audit/i4/judge-<n>.json` | Independent panel judges | Audit Reporter and CoE |
| `deliverables/reproduction.md` | Reproduction Writer via `delivery/reproduction.md` | Lead and CoE copy check |
| sanitized evaluator feedback | Deterministic allowlist command | Candidate-input validation |
| delivery copies and `deliverables/manifest.json` | CoE manifest command | CoE canonical-source hashes |
| `audit/i2/aggregate.json`, `audit/i4/aggregate.json`, `audit/report.md` | Audit Reporter | CoE counts and receipt |
| `delivery/visual-inspection.json` when required | Lead or named visual reviewer | CoE hash and verdict check |

I2 and I4 vote files contain a judge ID, frozen contract/snapshot or selected
artifact hashes, checked categories, boolean `flagged`, category when flagged,
exact evidence paths, rationale, and verdict. An assessed `aggregate.json`
contains `status: "ASSESSED"`, `judge_count`, `threshold`, `flag_votes`, and
boolean `flagged`; the verifier recomputes all counts from votes and uses the
panel size frozen in `run-config.json`. In external-audit mode only, unavailable
inputs use `status: "NOT_ASSESSED"`, zero judges, null threshold/flagged, and a
concrete reason. A majority flag blocks a research run; it remains a
reportable external-audit finding.

Machine-readable gate minima:

- `discovery/ideas.jsonl`: no more than the frozen idea ceiling and at least the minimum eligible ideas unless a recorded stop reason applies; `index.json`: unique indexed candidates within the candidate-node ceiling. Every indexed node contains idea, an exact shared-only subset manifest, non-empty snapshots/evaluations within the evaluation ceiling, experimental log, method report, and legitimacy audit.
- `selection/selected/manifest.json`: non-empty unique files that all exist and are promoted; `canonical-evaluation.json`: `status: "valid"`, `snapshot_path: "selection/selected"`, a recomputed matching snapshot SHA-256, the frozen repetition count, and finite metric name/value/unit/direction.
- `ablation/plan.json` and `results.json`: no more than the ablation ceiling and at least the minimum valid ablations when valid variants exist, with corresponding variants/evaluations or a recorded stop reason.
- `paper/grounding-report.json`: `status: "PASS"` and `grounding_ratio >= 0.8`.
- `paper/claims.jsonl` and `paper/provenance.jsonl`: unique, identical claim-id sets, all `SUPPORTED`, with one of the four claim types and source-identifying evidence. When the plan requires PDF, `paper.pdf` must have a PDF header, catalog/page tree, root, resolvable `startxref`, and EOF marker before visual inspection.
- `audit/i1.json`: hash-binds the frozen policy, common interpreter, selected snapshot,
  execution receipt, and three component reports. Its verdict is
  `PASS|FAIL|NOT_ASSESSED`; research requires PASS,
  `NOT_ASSESSED` is external-audit-only, and every other outcome blocks
  completion. `i3.json` and `claim-provenance.json` retain
  `PASS|FAIL|NOT_ASSESSED`.

## Role receipt

Every specialist writes a unique `role-receipts/<agent-task>.json` named by the assignment; receipts are never overwritten or shared between roles:

```json
{
  "schema_version": 1,
  "role": "evaluator",
  "agent_task": "evaluator_i02_b03_v02",
  "launch_record": "role-launches/evaluator_i02_b03_v02.json",
  "launch_record_sha256": "<hash>",
  "logical_task_name": "evaluator_i02_b03_v02",
  "attempt": 1,
  "contract_revision": 1,
  "charter_revision": 1,
  "predecessor": { "path": "receipts/investigation.json", "sha256": "<hash>" },
  "model_routing_sha256": "<hash>",
  "role_contract_sha256": "<hash>",
  "assignment_sha256": "<hash>",
  "task_brief_sha256": "<hash>",
  "gate_schema_version": 2,
  "model": "<actual model id or declared-by-role>",
  "reasoning_effort": "<actual effort or declared-by-role>",
  "fork_turns": "none",
  "started_at": "<ISO-8601>",
  "completed_at": "<ISO-8601>",
  "declared_inputs": ["study-plan.md", "discovery/nodes/i02-b03/snapshots/v02"],
  "input_artifacts": [
    { "path": "study-plan.md", "sha256": "<hash>" },
    { "path": "discovery/nodes/i02-b03/snapshots/v02", "sha256": "<hash>" }
  ],
  "allowed_external_sources": [],
  "external_results_used": [],
  "environment_changes": [],
  "outputs": ["discovery/nodes/i02-b03/evaluations/v02.json"],
  "output_artifacts": [
    { "path": "discovery/nodes/i02-b03/evaluations/v02.json", "sha256": "<hash>" }
  ],
  "undeclared_inputs_accessed": [],
  "limitations": [],
  "handoff": {
    "summary": "Canonical evaluation completed against the frozen snapshot.",
    "decisions": ["Used the policy-declared evaluator command."],
    "evidence_ids": ["selection/canonical-evaluation.json"],
    "conflicts": [],
    "unresolved": [],
    "recommended_next_action": "Run selection checkpoint."
  },
  "execution_status": "COMPLETE",
  "gate_verdict": "PASS"
}
```

`execution_status` is `COMPLETE`, `BLOCKED`, or `FAILED`; `gate_verdict` is
`PASS`, `REVISE`, `FAIL`, or external-audit-only `NOT_ASSESSED`. Only COMPLETE
plus PASS is promotable. `Overall verdict` in a review artifact equals the
gate verdict and does not replace it. The Audit Reporter receipt is PASS when
it accurately assembles the required reports, even when `audit/report.md`
correctly concludes FAIL or NOT_ASSESSED. If an undeclared input was accessed,
record it; the lead decides whether independence was compromised and usually
reruns with a fresh specialist. The verifier resolves every declared file and
output inside the run, requires it to exist, rejects inherited context or
undeclared access, binds allowed external-source classes to the supervisor
launch record, and enforces the role-to-input/output matrix in `roles.md`.
Producer and reviewer tasks are distinct; every I2/I4 judge receipt owns one
vote. A receipt is not proof that native metadata was available; the launch
record is the supervisor's binding evidence when available.

`environment_changes` is always an array. Each installed, removed, or changed
dependency records `name`, an exact `version`, `scope: "run_local"`, `source`,
`reason`, and a `lock_or_manifest` path explicitly declared among the role's
outputs. For example:

```json
{
  "name": "numpy",
  "version": "2.3.2",
  "scope": "run_local",
  "source": "pypi",
  "lock_or_manifest": "discovery/nodes/i02-b03/requirements.lock",
  "reason": "Required by the candidate implementation"
}
```

## Supervisor launch record

Before dispatch, the lead writes one immutable launch record from native task
metadata:

```json
{
  "schema_version": 1,
  "task_id": "<native task id>",
  "task_name": "evaluator_i02_b03_v02_attempt_2",
  "logical_task_name": "evaluator_i02_b03_v02",
  "work_key_sha256": "<hash of contract/charter revision, role, and sorted exclusive outputs>",
  "attempt": 2,
  "contract_revision": 1,
  "charter_revision": 1,
  "predecessor": { "path": "receipts/discovery.json", "sha256": "<hash>" },
  "role": "evaluator",
  "fork_turns": "none",
  "model_tier": "efficient",
  "model": "<actual model>",
  "reasoning_effort": "<actual effort>",
  "model_routing_sha256": "<hash>",
  "role_contract_sha256": "<hash>",
  "gate_schema_version": 2,
  "task_brief": {
    "objective": "Evaluate the frozen selected snapshot.",
    "context": "Selection requires one canonical result.",
    "acceptance_gate": "A valid hash-bound evaluation record exists.",
    "constraints": "Use only declared inputs and the frozen evaluator.",
    "upstream_summary": [{"input_path": "selection/selected", "summary": "Frozen selected snapshot."}]
  },
  "task_brief_sha256": "<canonical task-brief hash>",
  "assignment": "<exact assignment passed to the specialist>",
  "assignment_sha256": "<assignment hash>",
  "declared_inputs": ["study-plan.md", "selection/selected"],
  "input_artifacts": [
    { "path": "study-plan.md", "sha256": "<hash>" },
    { "path": "selection/selected", "sha256": "<hash>" }
  ],
  "allowed_external_sources": [],
  "declared_outputs": ["selection/canonical-evaluation.json"],
  "started_at": "<ISO-8601>"
}
```

When the launch hook accepts that spawn, it atomically writes
`role-attempts/<logical-task>/<work-key>/attempt-<n>.json` with schema version 2, binding
the logical task, mechanically derived revision/role/output work key, attempt number,
launch path, and launch hash. Changing the caller-selected logical name cannot
reset the same role/output work. Rejected or expired grants write
no record. The CoE requires the matching record before a role receipt can be
promoted and automatically binds it into the phase receipt, so deleting a
failed specialist receipt cannot erase or reset the attempt history.

The receipt names this launch record and its SHA-256. The exact assignment is
the common role envelope, one role card, and this task brief; the spawn message
must match it byte for byte. Receipt validity is bound to that saved assignment,
not to whichever plugin role text happens to be installed later.

## Input manifest

`contract/input-manifest.json` contains:

```json
{
  "schema_version": 1,
  "files": [
    {
      "source_path": "data/observations.csv",
      "frozen_path": "inputs/shared/observations.csv",
      "sha256": "<hash>",
      "classification": "shared",
      "purpose": "model development and public validation",
      "may_leave_machine": false
    },
    {
      "source_path": "data/heldout.csv",
      "frozen_path": "private/evaluator/heldout.csv",
      "sha256": "<hash>",
      "classification": "evaluator_only",
      "purpose": "canonical held-out evaluation",
      "may_leave_machine": false
    }
  ]
}
```

Candidate work packages receive a derived manifest whose entries are exact, hash-matching subsets of the contract's `shared` entries. Evaluator-only entries and `private/` paths are absent rather than merely labelled private.

## Evaluator contract and manifest

`contract/evaluator-contract.md` is candidate-visible and freezes the metric,
unit, direction, split policy, repetitions, failure rule, eligibility of a
result, and the safe feedback fields. It contains no held-out rows, labels,
evaluator source, or private checks.

`contract/evaluator-manifest.json` records evaluator-only hashes and access
classes without revealing their contents:

```json
{
  "schema_version": 1,
  "files": [
    {
      "path": "private/evaluator/evaluate.mjs",
      "sha256": "<hash>",
      "access_class": "evaluator_only"
    },
    {
      "path": "private/evaluator/heldout.csv",
      "sha256": "<hash>",
      "access_class": "evaluator_only"
    }
  ]
}
```

Evaluator JSON includes `status`, metric summary, snapshot hash, procedure
identifier, `raw_output_ref`, and `raw_output_sha256`. Raw output references
resolve only inside `private/evaluator/`; no candidate-visible artifact may
copy private contents. Sanitized feedback is a deterministic whitelist of
execution status, public metric name/value/unit/direction, safe failure
category, and candidate-visible note; unknown fields are rejected.

## I1 policy and common interpreter

`contract/i1-verification-policy.json` validates against the bundled
`i1-verification-policy.schema.json`. Its bindings use path-bound SHA-256s.
Research policies use `mode: "research"`, `freeze_stage: "pre_candidate"`,
`frozen_before_candidate_generation: true`, and bind the evaluator contract and
manifest. External-audit policies bind the source-bundle manifest; a
reconstructed policy uses `freeze_stage: "pre_i1_execution_external"`,
`frozen_before_candidate_generation: false`, and
`result_blind_authoring: true`.

The policy uses schema version 2 and binds the release-tested interpreter copied
by `coe.mjs configure`:

```json
{
  "schema_version": 2,
  "interpreter": {
    "version": "1.1.0",
    "path": "contract/control-plane/i1-interpreter.mjs",
    "sha256": "<path-bound hash>"
  },
  "execution": {
    "evaluator_argv": ["<runtime>", "private/evaluator/evaluate.mjs", "<selected-snapshot>", "<private-output>"],
    "network": false,
    "allowed_input_classes": ["frozen_extraction", "canonical_evaluation", "selected_snapshot"],
    "private_execution_root": "private/evaluator/i1-runs",
    "safe_output_paths": ["audit/i1/lineage.json", "audit/i1/reproducibility.json", "audit/i1/claim-semantics.json"],
    "determinism": {"canonical_json": true, "fixed_locale": "C", "fixed_timezone": "UTC", "fixed_concurrency": 1, "stable_ordering": true, "same_input_same_payload": true}
  }
}
```

The I1 Policy Author declares task-specific metrics, estimands, repetition
counts, margins, uncertainty rules, hardware rules, and failure outcomes. It
does not generate code, fixtures, manifests, or a second test framework. The
Contract Auditor validates policy/interpreter compatibility before candidates;
the I1 Score Auditor later runs the frozen evaluator and applies the same
interpreter. Unsupported semantics produce REVISE, a minimal faithful policy
repair, and a fresh audit; they are never approximated with easier semantics.

## External source-bundle manifest

`contract/source-bundle-manifest.json` is required and non-empty in
`external_audit` mode. It freezes supplied files under stable run-relative
paths and maps each item to the checks it can support:

```json
{
  "schema_version": 1,
  "items": [
    {
      "supplied_path": "/absolute/or/project-relative/path",
      "frozen_path": "source-bundle/paper.pdf",
      "artifact_type": "paper",
      "sha256": "<hash or null when unavailable>",
      "intended_checks": ["I1", "I4", "claim_provenance"],
      "access_class": "shared",
      "available": true,
      "missing_reason": null
    }
  ]
}
```

Allowed `artifact_type` values are `paper`, `method`, `code`, `evaluation`,
`evaluator`, `reference`, `log`, and `other`; `access_class` is `shared` or
`evaluator_only`. An unavailable item has `available: false` and a concrete
`missing_reason`; only then may a supported check be `NOT_ASSESSED`. The
verifier derives audit inputs from this manifest, rejects an empty manifest,
and refuses completion when no check is assessable.

## Source Record

Append one JSON object per line to `evidence/sources.jsonl`:

```json
{
  "id": "doi:10.1234/example",
  "bibkey": "smith2025example",
  "title": "Example title",
  "authors": ["A. Smith"],
  "year": 2025,
  "venue": "Example Journal",
  "doi": "10.1234/example",
  "arxiv_id": null,
  "url": "https://doi.org/10.1234/example",
  "retrieved_at": "<ISO-8601>",
  "retrieval_method": "Crossref and publisher PDF",
  "local_path": "evidence/fulltext/smith2025example.pdf",
  "sha256": "<hash or null when no file may be cached>",
  "source_scope": "full_text",
  "status": "verified"
}
```

`source_scope` is `full_text`, `abstract`, or `metadata`; abstract-only and
metadata-only evidence must be labeled before it supports a claim. Save search
queries separately. A search result is discovery evidence, not support for a
scientific claim.

Each row in `evidence/literature-map.jsonl` adds relevance and disposition to a
Source Record:

```json
{
  "source_id": "doi:10.1234/example",
  "methodological_relevance": 5,
  "problem_alignment": 4,
  "classification": "direct",
  "inclusion_reason": "Reusable evaluation protocol for the approved task",
  "exclusion_reason": null
}
```

Each row in `evidence/search-log.jsonl` has:

```json
{
  "query": "exact query",
  "system": "Crossref",
  "timestamp": "<ISO-8601>",
  "result_identifier": "doi:10.1234/example",
  "rank": 1,
  "retrieval_url": "https://doi.org/10.1234/example",
  "disposition": "include",
  "limitation": null
}
```

`disposition` is `include`, `exclude`, or `unresolved`. Search and reading
stopping rules, records screened, full texts read, exclusions, and access
limitations are saved in the corresponding phase artifact.

## Experimental evidence

`experimental-log.md` is append-only and line-addressable. Each evaluation entry names the immutable snapshot hash and links to a machine-readable evaluation JSON. The evaluation JSON includes:

```json
{
  "schema_version": 1,
  "snapshot": "discovery/nodes/i02-b03/snapshots/v02",
  "snapshot_sha256": "<hash>",
  "metric": {"name": "accuracy", "value": 0.812, "unit": "fraction", "direction": "maximize"},
  "protocol": "<frozen protocol id or exact procedure>",
  "repetitions": [{"seed": 1, "value": 0.809}, {"seed": 2, "value": 0.815}],
  "command_or_procedure": "<reproducible command or documented non-code procedure>",
  "environment": {"software": ["..."], "hardware": "..."},
  "raw_output_ref": "private/evaluator/raw/v02.json",
  "raw_output_sha256": "<hash>",
  "evaluated_at": "<ISO-8601>",
  "status": "valid"
}
```

Failed evaluations use `status: "failed"`, include a safe failure category,
and never supply a selection-eligible metric.

## Selection lineage

`selection/lineage.json` binds the selected method to an eligible discovery
snapshot and evaluation:

```json
{
  "schema_version": 1,
  "source_node_id": "i02-b03",
  "source_snapshot_path": "discovery/nodes/i02-b03/snapshots/v02",
  "source_snapshot_sha256": "<tree hash>",
  "selected_snapshot_sha256": "<tree hash>",
  "legitimacy_verdict_path": "discovery/nodes/i02-b03/legitimacy-audit.md",
  "evaluation_path": "discovery/nodes/i02-b03/evaluations/v02.json",
  "metric_name": "accuracy",
  "metric_direction": "maximize",
  "rank": 1,
  "tie_break_evidence": []
}
```

The source node must exist in `discovery/index.json`, have a legitimacy PASS,
and have an eligible evaluation. The verifier checks the frozen source and
selected tree hashes, the metric/direction, frozen ranking rule, and every
retained candidate ID.

## Delivery records

`delivery/reproduction.md` is non-empty and contains these exact headings in
research mode: `## Selected snapshot`, `## Environment`, `## Inputs and access
limits`, `## Procedure`, `## Expected canonical output`, and `## Verification`.
Its sections identify the selected snapshot/hash, actual environment and
dependencies, inputs/access limits, exact command or procedure, expected
canonical output, tag stripping, and manifest/audit verification. External
audit mode uses `## Source bundle`, `## Inputs and access limits`,
`## Audit procedure`, `## Expected audit output`, and `## Verification`.

When the approved plan requires PDF, `delivery/visual-inspection.json` records its mandatory visual inspection:

```json
{
  "schema_version": 1,
  "pdf_path": "paper/paper.pdf",
  "pdf_sha256": "<hash>",
  "page_count": 12,
  "renderer": "<renderer or viewer>",
  "timestamp": "<ISO-8601>",
  "checked_pages": [1, 2, 12],
  "detected_defects": [],
  "verdict": "PASS"
}
```

The lead copies these canonical records to `deliverables/`; delivered copies
must match exactly. An empty guide or inspection record is not evidence.

## Integrity-audit schemas

The verifier rejects content-free verdicts. The following fields are required;
the verifier recomputes all derived counts and comparisons.

I1 first saves independent `tex-extraction.json` and `pdf-extraction.json`
records with metric ID, displayed and normalized value, unit, direction,
estimand/aggregation and uncertainty language, exact locator, and limitations.
`input-manifest.json` hashes every pre-execution input. The post-execution
`evidence-manifest.json` hashes both extraction records and every private raw
measurement. `execution-receipt.json` binds execution ID, attempt, argv,
policy/manifest/source/input/environment/snapshot hashes, times, exit status,
retry count, raw private artifact paths/hashes, safe output path/hash, and
undeclared-access/network/environment-change/limitation arrays.

`lineage.json`, `reproducibility.json`, and `claim-semantics.json` each have
`schema_version: 1`, `verdict: PASS|FAIL|NOT_ASSESSED`, exact
policy and evidence hashes, per-metric comparison records, evidence paths,
mismatches or unavailable items, and limitations. Reproducibility records the
declared estimator, every valid/invalid rerun or pair, interval, fixed
equivalence bounds, noise/environment checks, and per-metric outcome. The
common interpreter recomputes every supported estimand and boundary decision.
Unsupported semantics fail closed during contract audit rather than creating
study-specific verifier code.

Aggregate `audit/i1.json` contains `schema_version`, policy path/hash/profile,
interpreter version/path/hash, selected-snapshot hash when applicable,
component path/hash/verdict bindings, execution-receipt path/hash, evidence
paths, unavailable items, limitations, `rollback_phase`, and final verdict.
Verdict precedence is FAIL, then external-only NOT_ASSESSED, then PASS. A
non-PASS research result blocks promotion.

`audit/i3.json` includes every bibliography key, populated fields, resolved
primary record, retrieval time, field-by-field comparison, status, evidence
path, totals, and verdict.

Each I2 vote includes `judge_id`, selected snapshot and evaluator-contract
hashes, checked categories, `flagged`, optional category, exact evidence paths,
rationale, and verdict. Each I4 vote includes `judge_id`, paper method
locations, selected artifact paths and hashes, checked core mechanisms,
`flagged`, optional category, exact evidence, rationale, and verdict.

`audit/claim-provenance.json` includes `total_numerical_claims`,
`assessed_count`, `supported_count`, `coverage_ratio`, `mismatches`,
`unavailable_items`, `evidence_paths`, and `verdict`. `NOT_ASSESSED` requires
an external-audit missing-input reason.

`audit/i2/aggregate.json` and `audit/i4/aggregate.json` contain
`status: "ASSESSED"|"NOT_ASSESSED"`, `judge_count`, `threshold`,
`flag_votes`, `flagged`, and a reason when not assessed. `audit/report.md`
consumes I1, both aggregates, I3, and claim provenance; it is non-empty,
states every verdict and missing item, and names rollback phases for blocking
findings, including FAIL I1. Overall precedence is FAIL, then external-only
NOT_ASSESSED, then PASS. The Audit Reporter recomputes counts
from vote files.

## Claim sidecars and evidence tags

Each row in `paper/claims.jsonl` has `claim_id`, `paper_location` pointing to
the exact line in `paper/paper-verified-tagged.tex`, `claim_type` from
`citation|numerical|methodological|conclusion`, the claim sentence, and
`status: "SUPPORTED"`. Numerical rows additionally have `origin:
"study"|"prior_work"`; study numbers resolve to canonical or ablation
records, while prior-work numbers resolve to Source Records.

Each independently verifiable assertion has one stable claim ID. Split a
sentence when assertions have different evidence. Claims in captions, table
cells, figure annotations, and equation explanations also require IDs; pure
mathematical derivation steps require a method or derivation reference.
Bibliographic fields are checked through I3 rather than counted as prose
claims. A single ID may have multiple evidence references, but cannot cover two
claims with different evidence.

Use a dedicated LaTeX macro or line-end TeX comment that compiles before and
after stripping, for example:

```tex
The canonical score was 0.812. \coe{claim-012}
```

The resolver accepts only these evidence kinds and real locators. These are
sidecar fields, not free-form strings:

```json
[
  {"kind":"artifact","target":"discovery/nodes/i02-b03/experimental-log.md","locator":"L41","sha256":"<target hash>"},
  {"kind":"metric","target":"selection/canonical-evaluation.json","locator":"/metric/value","sha256":"<target hash>"},
  {"kind":"source","target":"bib:smith2025example","locator":null,"sha256":"<paper/references.bib hash>"},
  {"kind":"artifact","target":"selection/selected/main.py","locator":"L20-L48","sha256":"<target hash>"},
  {"kind":"artifact","target":"ablation/results.json","locator":"/ablations/remove_gate/value","sha256":"<target hash>"},
  {"kind":"inference","target":"claim-004,claim-009","locator":null,"sha256":null}
]
```

Never invent paths, line ranges, JSON pointers, or bibliography keys. An
`unsourced` marker blocks the claim and must be repaired or removed. The
deterministic verifier extracts every `\\coe{claim-id}` from tagged and final
TeX before stripping, requires each ID exactly once in both sidecars, rejects
sidecar IDs absent from the paper, resolves paths/locators and inference
dependencies, requires checkpointed or frozen-bundle targets, and detects
circular dependencies. It rejects an empty claim set when factual prose
exists.

`paper/provenance.jsonl` preserves the final mapping after presentation tags
are stripped:

```json
{
  "claim_id": "claim-012",
  "paper_location": "paper/paper-verified-tagged.tex:42",
  "claim_type": "numerical",
  "sentence": "The canonical score was 0.812.",
  "evidence": [
    {
      "kind": "metric",
      "target": "selection/canonical-evaluation.json",
      "locator": "/metric/value",
      "sha256": "<target hash>"
    }
  ],
  "status": "SUPPORTED"
}
```

The final `paper.tex` and PDF are presentation views. Provenance, tagged
drafts, and immutable evidence artifacts remain the audit record; the delivery
record must show that tagged and clean TeX have the same claim inventory.
