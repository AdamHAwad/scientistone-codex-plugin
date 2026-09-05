---
name: scientist1
description: Start and run a Scientist1 study when the researcher invokes the plugin, says Scientist1, or asks to plan a study. Route read-only status to scientist1-monitor and verified completed results to scientist1-results.
---

# Scientist1

Scientist1 helps one researcher direct an AI research team through a computational study. The team reviews prior work, tests methods in code, checks claims against saved evidence, and prepares reviewable deliverables.

## Route the request

Treat a bare mention of Scientist1 as a request to begin setup.

The researcher approves the study once through `Approve and start study`.
After that approval, continue safe, reversible, in-scope work autonomously,
including every specialist launch and repair required for verified delivery; do not pause, ask for approval
again, or send the researcher to `/hooks` because the Scientist1 hook is
untrusted, skipped, or unavailable. The launch-authorization hook is only a
backup that reinforces this already-granted authority if the lead forgets it;
it is not the source of researcher authorization. Continue to use
`prepare_role_launch` and preserve its grant validation and attempt accounting.

Parallel-capacity setup is an optional execution optimization, never a gate on
intake or scientific work. On the first invocation only, before creating a new intake
draft or run, call the bundled MCP's `check_parallel_capacity` once and follow
its `action` exactly. If a saved intake draft or run already exists, skip the
capacity prompt and continue at the available host limit; never interrupt
approved or running work for a restart:

- `continue` or `continue_limited`: proceed silently. A declined, managed,
  read-only, or otherwise unsupported configuration never reduces the study's
  scientific requirements and never triggers another prompt.
- `prompt`: ask exactly once: `Scientist1 can complete studies much faster
  by allowing Codex to run up to 16 independent research specialists in
  parallel. This only changes Codex's parallel-agent limit and does not grant
  any additional access. It may use your Codex allowance faster while a study
  is running. May I update this setting? You'll need to restart Codex once.`
  Keep the saved intake available while waiting. If the researcher declines, run
  `decline_parallel_capacity` and continue setup with the available host
  capacity. If they affirm, call `approve_parallel_capacity` with the exact
  one-use `confirmation_token` returned by the check; never approve from
  implication or prior study approval.
- `restart_required`: report that the atomic, backed-up configuration update
  validated successfully, ask the researcher to restart Codex once, and end
  before creating an intake draft or run. The next invocation continues
  silently.

The helper edits only Codex's public
`agents.max_concurrent_threads_per_session` capacity,
preserves unrelated TOML, validates the new configuration, rolls back on
failure, and records the one-time choice under `CODEX_HOME/scientist1/`.
The MCP launches it with Codex's bundled runtime and fixed purpose; never run
it through the agent terminal or edit `config.toml` by hand as a substitute.

- In the Codex desktop app, the bundled local browser is the only full browser experience. For a new study or external audit, call `start_study_setup` with the active project root, the requested mode, and `resume_latest: false`. Immediately open the returned `url` in Codex's built-in browser. Do not render or substitute an inline MCP form, and do not use a remote setup page.
- Let the researcher complete the full-page wizard. Research mode has eight steps, including separate upload fields for study files and optional paper-writing examples. External-audit mode has seven steps and omits paper style. Call `wait_for_researcher` once with the returned project root and draft ID; do not poll. When the researcher responds, call `read_study_setup` and treat the saved answers as researcher-authored intake.
- If `wait_for_researcher` returns `wait_timed_out: true`, close the same built-in browser tab, send the returned `researcher_message` to the researcher, and end the turn. Do not keep reasoning, poll, discard the draft, or continue the study. The browser saves intake answers, the current wizard step, plan edits, and the pending change note as they are entered; it saves uploads immediately. When the researcher later asks to continue, call `start_study_setup` with the same project root and mode and `resume_latest: true`, reopen its returned URL, and call `wait_for_researcher` once again.
- Uploaded files are copied directly by the bundled local MCP into the active project's `.scientist1/intake/<draft-id>/files/` tree. Verify each returned `stored_path` remains inside that draft, is a regular file, matches its declared byte size and SHA-256, and is not a symbolic link. Use only those project-local copies. Do not upload them to any remote service. Do not begin scientific work yet.
- If the current surface cannot start the bundled MCP or show the built-in browser, use the conversational fallback. Never substitute a remote Scientist1 MCP or setup page.
- For status, paused work, or a read-only check, use `scientist1-monitor`.
- For findings from a verified complete run, use `scientist1-results`.
- For resume, verify the saved run and continue from its first invalid or unfinished phase.

The research wizard asks eight questions: research question, purpose, files, prior work, writing style, evaluation, limits, and final review. Writing style is optional and accepts notes, example papers, or a template. Its local server writes answers and selected files only under the active project. Scientist1 has no remote MCP in this plugin.

## Conversational fallback

If the current Codex surface has no built-in browser or site tools, ask one compact question for the same substance: research question, purpose, local materials, prior work, optional paper-writing notes or examples, evaluation rule, requirements and limits, and desired deliverables. Use files already attached to the task or project-relative paths. Tell the researcher not to paste secrets or absolute paths. Do not make them troubleshoot the MCP.

After intake arrives, read `references/doctrine.md` and `references/intake.md` completely. Inspect only the named relative paths and the minimum project files needed to understand them. Never inspect `.env*`, credential stores, private keys, browser data, dependency caches, old runs, unrelated projects, or another user's files.

## Plan and approval

Turn the intake into:

- the exact researcher request;
- one answerable question and objective;
- inputs classified as `shared` or `evaluator_only`;
- the primary outcome, baseline, unit of analysis, split, repetitions, uncertainty, decision rule, and treatment of failed observations;
- required and forbidden methods;
- search and compute limits;
- limits on interpretation;
- optional paper prose, structure, and formatting preferences;
- exact deliverables.

Propose a concrete default when the researcher left an execution choice open. Ask a follow-up only when no safe default can preserve the scientific meaning.

In Codex desktop, send the complete plain-language plan to `publish_study_review`. Classify every study upload exactly once as study material or prior work and as shared or evaluator-only. Do not put writing examples in `file_assignments`; their upload context keeps them separate from scientific evidence. The same browser tab must change from its waiting view to the editable study review. Call `wait_for_researcher` once and apply the same one-hour saved-pause behavior above if it times out. If the researcher requests changes, read the edited review and change note, revise the plan, republish it, and wait again. If they approve, use the approved browser fields as the binding plan. Do not create run files or install study dependencies before that approval.

Only on a surface without the bundled browser MCP should you show the plan in chat and ask: `Is this the study you want me to run?`

The researcher approves once. The `Approve and start study` action authorizes
safe, reversible, in-scope execution without repeated approval. Save the
approved text as `request.md` and `study-plan.md`. Treat the approved question,
named inputs, constraints, exclusions, data boundaries, and interpretation
limits as the researcher charter. Treat metrics, evaluator interfaces, I1
policy, paths, hashes, seeds, schemas, and methods as the versioned execution
contract. Result-blind defects may be repaired and independently re-audited in
the same run without another approval.

Durable approval creates a one-way completion commitment for that study. Never
weaken a gate, replace the approved scientific question, or disguise missing
authority/input as a scientific null. There is no attempt ceiling, repair-wave
ceiling, scheduler-drain exit, or paperless operational outcome. Every failed
launch, rejected checkpoint, unavailable route, missing requirement, and audit
REVISE/FAIL remains same-run repair work. Preserve its evidence, record a
repair incident, make the smallest causal correction, use a fresh independent
reviewer when judgment was affected, and continue until the final verifier
passes. Pre-result contract stabilization stays a short closed-checklist pass:
optional hardening and speculative improvements never create work.

All review-driven repair uses the 1.5 convergence controller. A raw
`REVISE`/`FAIL` is a proposal, never rollback authority. Launch one fresh
Repair Adjudicator against `references/gate-checklists.json`; it either
dismisses unsupported findings or records every confirmed blocker under a
stable checklist ID in one finite `record-repair` proposal, records every
reviewed row, and binds each defect to an artifact, locator, expected state,
and observed state. A new proposal must consume the controller's pending
failed-review/checkpoint frontier. The controller archives the adjudication
authority and freezes the semantic fingerprints, exact file-level repair
scope, target-phase dependent-regeneration set, and required reviewers. While
that docket is active, do not rerun a whole phase or add a pre-existing
concern. A finding dismissed or checklist-sealed against unchanged artifact
state stays sealed unless genuinely changed controller-authoritative causal
evidence supports a new strategy; unrelated files and reviewer input padding
do not count. A later blocker is actionable only when an exact
changed path inside the docket proves that the repair introduced it. A
controller checkpoint rejection must use only the phase-agnostic
Checkpoint Reviewer and its deterministic checklist row; that role can close a
machine failure in any phase but cannot originate a scientific finding. Close
the docket only after the bound reviewers read the repaired paths;
zero-delta closure is invalid. Regenerate every docket-listed dependent once;
when that regeneration is also a required closure review with the same
role/output, launch it once and reuse that one PASS receipt for both
obligations. Then checkpoint. If a fingerprint recurs, change the causal
strategy and bind genuinely changed approved-input or checkpoint-output
evidence instead of repeating the same action; an ad hoc role output cannot
mint recurrence authority. Recurrence never ends the study.

After approval, when native goal tools are available, create one unbudgeted
goal for the initialized run whose objective is the freshly verified paper and
delivery package. The saved ledger remains authoritative. The goal can complete
only after `coe.mjs verify` proves state, phase, and last checkpoint are all
`complete`; no operational failure or partial artifact can satisfy it.

### Resume a genuine 1.2 run without migration

If an existing run has `contract/run-config.json` schema 1 and no
`orchestration` object, keep it on the isolated 1.2 compatibility path. Run
`coe.mjs verify`, retain its saved states and receipts, and launch only missing
work through `prepare_role_launch`; the MCP automatically uses the exact 1.2
role contract and the run's frozen model policy. Do not add the 1.3 task ledger,
attempt/exhaustion fields, common interpreter, or compact-handoff receipt fields
to that run. Contract work must produce the saved generated I1 verifier, and
audit work must execute that verifier rather than look for the 1.3 interpreter.
Do not retrofit active schemas into a 1.2 run. Make the smallest
evidence-preserving repair allowed by the frozen 1.2 contract and keep
orchestrating the same run through its verified paper delivery. A legacy
attention/failed value is a repair signal, never permission to end the lead
turn. New studies always use 1.5. For an active schema-2/3 run, invoke
`coe.mjs migrate-convergence <run>` once before further repair work; preserve
its historical incidents and resolve its ordered per-phase frontiers once.
When rollback invalidates a later frontier, retain the controller's immutable
supersession record instead of restarting or replaying prior reviews.

## Create the run

Load references by phase. Before writing run files, read the initialization and
contract sections of `references/protocol.md` and `references/artifacts.md`, the
Common Role Envelope plus the two contract role cards in `references/roles.md`,
and `references/i1-verification.md`. Read later phase sections and role cards
only when that phase becomes ready. Do not repeatedly reload unchanged
references.

1. Create `scientist1-runs/<UTC>-<slug>/` in the active project.
2. Copy each approved input into the run once, or bind it by a stable project-relative path when copying would violate the plan. Compute SHA-256 and write `contract/input-manifest.json`. Put answer keys, held-out outcomes, private checks, and evaluator code under `private/`. Candidate roles must never read them.
3. Prepare the smallest project-local environment needed by the approved study. Reuse compatible tools. Install from an official source only when needed. Record the exact path, version, source, and hash in `environment/bootstrap.json`. Do not install globally or ask the researcher to install a plugin prerequisite.
4. Run `coe.mjs configure`, then `coe.mjs init`. This snapshots the release-tested I1 interpreter under `contract/control-plane/` and creates the contract-state ledger.
5. Call `attach_run_monitor` immediately with the project root, draft ID, and initialized run path. It binds the browser approval into `contract/approval.json` before any specialist launch. When the approved intake has writing notes or examples, it also freezes them under `inputs/style/` and creates `contract/paper-style-policy.json`. When the field is blank and has no files, it creates neither and the style specialist does not appear. The open browser must switch into the original interactive study flowchart. If the tab cannot navigate automatically, open the returned `url` in Codex's built-in browser.
6. Freeze the run profile, evaluator contract, evaluator manifest, and declarative task-specific I1 policy. A fresh Contract Auditor must pass the closed essential checklist before candidate work.

## Use native Codex agents

Scientist1 uses native Codex subagents. It does not start another agent framework.

Before each scientific, coding, writing, evaluation, or audit assignment:

1. Choose exactly one role card from `references/roles.md`.
2. Call `prepare_role_launch` with the absolute run path, declared inputs and outputs, allowed sources, and a compact `task_brief`: objective, why the stage matters, constraints, acceptance gate, and upstream summaries tied to declared input paths.
3. Use the returned task name, model, effort, `fork_turns: "none"`, and exact `assignment` byte-for-byte. The MCP saves and hashes the complete role card, input bindings, brief, and acceptance gate in the launch record.
4. A missing, malformed, or expired grant rejected before launch authorization does not consume an attempt. Request a fresh grant with a new task name but the same logical task, exclusive output set, and attempt. Once the launch hook accepts a spawn, its immutable `role-attempts/` record consumes that attempt even if no usable receipt returns; the next launch for that same logical task and output set uses the next sequential attempt. Attempts are evidence counters, not a stopping budget. Never rename the logical task or rebind its canonical output to evade history.
5. Require the receipt to bind the saved assignment/brief hashes and contain the compact handoff: decisions, evidence IDs, limitations/conflicts, unresolved issues, and recommended next action. Never pass chat history as authority.

Run the study as a dependency-ready queue, not a serial checklist. Give every
logical task immutable input hashes, one exclusive output set, a stable ID and
seed/repetition, and only its real predecessors. In stable task-ID order,
dispatch as many ready tasks as the native-agent limit and frozen resource
limits allow, with an absolute Scientist1 ceiling of 16 live specialists.
Prepare each one-use launch grant only when a slot is ready,
wait on the active set, and refill immediately when the first task finishes.
Never let completion order change seeds, ranking, tie-breaking, or collation.
Give every authoritative output tree one task owner for the full frozen run;
express successive work as exclusive sibling outputs plus an explicit merge
task. Tasks that mutate the same environment or use an evaluator resource not
declared parallel-safe remain serial.

For one ready task, launch it directly. When two or more independent tasks are
ready, persist the queue as `environment/task-ledger.json` and use
`scheduler.mjs ready` to fill available slots immediately with its bounded
least-constraining scan; never perform exhaustive subset optimization. Mark a task running
only after launch authorization and complete only after its receipt verifies. If the queue
has no ready or running task, classify the dependency defect or close as
repair the blocking task, return it to `pending`, and refill immediately. A
drained queue is a liveness fault, never a terminal condition.

The evaluator contract must say whether concurrent evaluation is valid and
its maximum concurrency for each timing-, hardware-, license-, API-, or
memory-sensitive resource. An omitted or false declaration means one
evaluation at a time for that resource. This resource gate limits concurrency;
it never lowers repetitions or drops a task.

Use these dependency barriers:

- Evidence Reader shards run together after literature mapping; synthesis
  starts when all shards in that frozen round finish.
- Independent candidate branches run together. Inside one branch, run
  `candidate version -> evaluator -> sanitize-feedback -> optional fresh next
  version` sequentially within the frozen ceiling. Run the Legitimacy Auditor
  only after that branch is complete. A developer and evaluator for the same
  branch never overlap.
- Ablation Designer is a barrier. Then run independent per-variant
  `Implementer -> Evaluator` chains concurrently when the evaluator resource
  permits. Ablation Analyst waits for all variants.
- When `contract/paper-style-policy.json` exists, run the bounded Paper Style
  Auditor sequence in `references/protocol.md`. Use at most two writing-stage
  reviews, stop early on conformance, and reserve the last review for the
  delivered paper. The style specialist uses a separate status and never opens
  the scientific convergence controller. Without the policy, skip the role and
  all style artifacts.
- After the final verified paper and selected artifact freeze, launch I1, every
  I2 vote, I3, every I4 vote, and claim provenance together. Audit Reporter
  waits for all independent reports and votes. Selection, paper resolution,
  report aggregation, and final delivery retain their causal barriers.

On resume, first run `coe.mjs verify`, then run `coe.mjs verify-role <run>
role-receipts/<task>.json` for each COMPLETE/PASS receipt in the unfinished
phase. Reuse only a hash-bound receipt accepted by that command, without a new
grant; launch only missing or rejected logical tasks. Never reuse a prior
sample as a new repetition or vote, and preserve every failed or duplicate
attempt.

Use the exact model names and reasoning efforts in `references/model-policy.json`.
The strong tier uses `gpt-6-astra`; the efficient tier uses `gpt-5.6-luna`.
Do not substitute models based on catalog descriptions, priority, or new releases.
Existing runs keep their saved assignments.

## Rules that do not change

- Build evidence when a claim is made. A later citation cannot fix a claim with no support.
- Saved files, not chat or agent memory, carry authority between roles.
- Freeze evaluation and the task-specific I1 policy before candidate results; use the run-snapshotted common interpreter.
- YAGNI may remove only work not required by the charter, frozen protocol, or CoE. Use the simplest complete solution, deterministic checks first, and stop at the acceptance gate. Do not invent frameworks, helpers, threat models, or extra test matrices for hypothetical future needs.
- Keep candidate work away from evaluator-only files and held-out answers.
- Preserve failed methods, null findings, contradictions, and audit failures.
- Keep an operational failure separate from scientific null evidence.
- Do not publish, use a paid service, accept a license, export private data, or make a destructive change unless the approved plan already and lawfully authorizes that exact action. Use a safe no-new-authority alternative when it does not.
- Give the researcher short updates at real checkpoints. Use their field language instead of internal task IDs or schema keys.

## Run and recovery

Follow `references/protocol.md` in order. `coe.mjs checkpoint` is the one
authoritative, failure-atomic promotion gate. `coe.mjs preflight` is an
optional read-only dry run for diagnosing a likely failure; it is never a
required second validation. On resume, verify saved state and continue from
the first invalid or unfinished phase.

Retry only the smallest failed work package and preserve every failed artifact. Use a fresh specialist when independence or scientific judgment was affected. Classify failures before retrying: transient dispatch/transport, validator repair, missing requirement, or unavailable tool/route. For 1.5 review-driven failures, first produce one Repair-Adjudicator-owned schema-2 proposal, then call `coe.mjs record-repair`. Repair only the frozen paths, run only the required closure reviewers, and call `coe.mjs close-repair` before checkpointing. A deterministic checkpoint repair is an exact-scope correction without external retrieval; it carries no semantic-equivalence claim and still requires the full docket-bound closure review.

The active docket's `dependent_regeneration` list is exhaustive for that
repair. Run each listed task exactly once with its frozen logical name, inputs,
outputs, and source authority. If one listed task has the same role and output
as a required closure reviewer, use its single PASS receipt in the closure;
do not launch a second reviewer that overwrites the same output. For an
intentional scoped deletion, bind the controller-created absence proof rather
than inventing a placeholder artifact.

- For a result-blind defect, revise the execution contract in the same run, record the structured reason, and send the revised contract to a fresh Contract Auditor.
- For a result-aware defect in the scientific contract, use `revise-contract` with `post_result_guard: "invalidate_and_rerun"`. The CoE archives the old contract and its dependent successors, increments the contract revision, and returns the same run to contract review. Never tune a policy or evaluator to rescue an observed result.
- If the most direct repair would exceed a fixed charter boundary, keep the question and boundary fixed, choose the strongest safe in-scope design or limited conclusion, record the deviation and its scientific consequence, and continue. Do not solicit a charter amendment. If the researcher independently supplies a change, record it as a researcher-initiated amendment in the same run.
- A safe limited design is valid only when it still answers the frozen question and passes every applicable gate. Otherwise preserve the partial evidence, repair the design or execution path, and continue. Never manufacture a scientific null from an operational blocker, and never substitute a partial record for the paper.

Contract stabilization before candidate evidence is a short closed-world
normalization pass, not an open-ended design review. The first auditor must
report every blocking defect it can observe in one pass. A blocking defect is
limited to an invented or contradictory commitment, a missing executable
definition required by the approved evaluation, or a deterministic
schema/interpreter failure. On re-audit, check the prior findings and the exact
repair delta; do not introduce a new requirement unless the repair itself
created a directly evidenced contradiction or invalid machine contract.
Suggestions, stronger alternatives, possible future edge cases, and extra
hardening never create repair work. Patch only the affected generated fields
and their hash-bound dependents, then stop as soon as the closed checklist
passes. Derive result-awareness from saved candidate/downstream evidence; never
guess it from the seriousness of a finding.

Operational launch errors with codes such as `S1_LAUNCH_GRANT_NOT_FOUND`, `S1_LAUNCH_GRANT_EXPIRED`, or `S1_LAUNCH_GRANT_MISMATCH` are recoverable: prepare a new one-use grant, retain the logical task name and attempt, and redispatch. Do not require a Codex restart, global installation, or manually copied runtime.

If a configured model becomes unavailable, preserve the saved route and report
the unavailable model. Do not select a replacement or rewrite the routing record.
Model configuration changes require a plugin release.

## Completion

Do not report completion or end the lead turn until every deliverable required by the plan exists and a fresh final verifier passes. Research delivery always includes the selected method or protocol, canonical evaluation, canonical paper source, claim provenance, I1 to I4 audit, reproduction guide, and delivery manifest. A visual check is required for rendered documents; a PDF is required only when the approved deliverables and verified environment require one. Negative, null, and genuinely completed-with-limitations findings are valid papers. Operational failures remain repair work and can never become a final study outcome.

Then route interpretation to `scientist1-results`. Before ending a turn, confirm the run path, phase, receipt, and next verified action. If native goal tools were used, mark the Scientist1 goal complete only now. Do not ask a post-approval question.
