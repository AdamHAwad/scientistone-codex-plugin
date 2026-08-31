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
including every bounded specialist launch; do not pause, ask for approval
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
- Let the researcher complete the seven-step full-page wizard, including its large file-upload field. Call `wait_for_researcher` once with the returned project root and draft ID; do not poll. When the researcher responds, call `read_study_setup` and treat the saved answers as researcher-authored intake.
- If `wait_for_researcher` returns `wait_timed_out: true`, close the same built-in browser tab, send the returned `researcher_message` to the researcher, and end the turn. Do not keep reasoning, poll, discard the draft, or continue the study. The browser saves intake answers, the current wizard step, plan edits, and the pending change note as they are entered; it saves uploads immediately. When the researcher later asks to continue, call `start_study_setup` with the same project root and mode and `resume_latest: true`, reopen its returned URL, and call `wait_for_researcher` once again.
- Uploaded files are copied directly by the bundled local MCP into the active project's `.scientist1/intake/<draft-id>/files/` tree. Verify each returned `stored_path` remains inside that draft, is a regular file, matches its declared byte size and SHA-256, and is not a symbolic link. Use only those project-local copies. Do not upload them to any remote service. Do not begin scientific work yet.
- If the current surface cannot start the bundled MCP or show the built-in browser, use the conversational fallback. Never substitute a remote Scientist1 MCP or setup page.
- For status, paused work, or a read-only check, use `scientist1-monitor`.
- For findings from a verified complete run, use `scientist1-results`.
- For resume, verify the saved run and continue from its first invalid or incomplete phase.

The browser wizard asks seven questions: research question, purpose, files, prior work, evaluation, limits, and final review. Its local server writes answers and selected files only under the active project. Scientist1 has no remote MCP in this plugin.

## Conversational fallback

If the current Codex surface has no built-in browser or site tools, ask one compact question for the same substance: research question, purpose, local materials, prior work, evaluation rule, requirements and limits, and desired deliverables. Use files already attached to the task or project-relative paths. Tell the researcher not to paste secrets or absolute paths. Do not make them troubleshoot the MCP.

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
- exact deliverables.

Propose a concrete default when the researcher left an execution choice open. Ask a follow-up only when no safe default can preserve the scientific meaning.

In Codex desktop, send the complete plain-language plan to `publish_study_review`. Classify every uploaded file exactly once as study material or prior work and as shared or evaluator-only. The same browser tab must change from its waiting view to the editable study review. Call `wait_for_researcher` once and apply the same one-hour saved-pause behavior above if it times out. If the researcher requests changes, read the edited review and change note, revise the plan, republish it, and wait again. If they approve, use the approved browser fields as the binding plan. Do not create run files or install study dependencies before that approval.

Only on a surface without the bundled browser MCP should you show the plan in chat and ask: `Is this the study you want me to run?`

The researcher approves once. The `Approve and start study` action authorizes
safe, reversible, in-scope execution without repeated approval. Save the
approved text as `request.md` and `study-plan.md`. Treat the approved question,
named inputs, constraints, exclusions, data boundaries, and interpretation
limits as the researcher charter. Treat metrics, evaluator interfaces, I1
policy, paths, hashes, seeds, schemas, and methods as the versioned execution
contract. Result-blind defects may be repaired and independently re-audited in
the same run without another approval.

Durable approval is not unlimited authority or an instruction to loop. Never
weaken a gate, replace the approved scientific question, or disguise missing
authority/input as a scientific null. Each executed specialist task has at
most two attempts and each gate has at most one automatic repair wave. When a
required path remains unavailable or those limits are exhausted, save
`terminal/incomplete.json`, set `blocked_exhausted`, and report the run honestly
as `INCOMPLETE` with the exact recovery condition. It is terminal for that run,
is not a completed study, and cannot receive a scientific PASS. Corrected work
starts as a new run that explicitly references the preserved incomplete record.

When native goal tools are available and their current policy authorizes one
for this request, create one bounded goal for the initialized run: advance it
until fresh verification proves completion or `blocked_exhausted` proves a
terminal `INCOMPLETE`. The saved ledger remains authoritative, and the goal
must never continue work after either terminal state.

### Resume a genuine 1.2 run without migration

If an existing run has `contract/run-config.json` schema 1 and no
`orchestration` object, keep it on the isolated 1.2 compatibility path. Run
`coe.mjs verify`, retain its saved states and receipts, and launch only missing
work through `prepare_role_launch`; the MCP automatically uses the exact 1.2
role contract and the run's frozen model policy. Do not add the 1.3 task ledger,
attempt/exhaustion fields, common interpreter, or compact-handoff receipt fields
to that run. Contract work must produce the saved generated I1 verifier, and
audit work must execute that verifier rather than look for the 1.3 interpreter.
Do not use `exhaust` on a 1.2 run. Avoid an open-ended repair loop: make the
smallest evidence-preserving repair allowed by the frozen 1.2 contract, then
record the exact blocker with its legacy attention/failed state if no valid path
remains. New studies and linked restarts always use 1.3.

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
4. Run `coe.mjs configure`, then `coe.mjs init`. This snapshots the release-tested I1 interpreter under `contract/control-plane/` and creates the contract-state ledger before any specialist launch.
5. Freeze the plan, run profile, evaluator contract, evaluator manifest, and declarative task-specific I1 policy. A fresh Contract Auditor must pass the closed essential checklist before candidate work.
6. Call `attach_run_monitor` with the project root, draft ID, and initialized run path. The open browser must switch into the original interactive study flowchart. If the tab cannot navigate automatically, open the returned `url` in Codex's built-in browser.

## Use native Codex agents

Scientist1 uses native Codex subagents. It does not start another agent framework.

Before each scientific, coding, writing, evaluation, or audit assignment:

1. Choose exactly one role card from `references/roles.md`.
2. Call `prepare_role_launch` with the absolute run path, declared inputs and outputs, allowed sources, and a compact `task_brief`: objective, why the stage matters, constraints, acceptance gate, and upstream summaries tied to declared input paths.
3. Use the returned task name, model, effort, `fork_turns: "none"`, and exact `assignment` byte-for-byte. The MCP saves and hashes the complete role card, input bindings, brief, and acceptance gate in the launch record.
4. A missing, malformed, or expired grant rejected before launch authorization does not consume an attempt. Request a fresh grant with a new task name but the same logical task, exclusive output set, and attempt. Once the launch hook accepts a spawn, its immutable `role-attempts/` record consumes that attempt even if no usable receipt returns; the next launch for that logical task uses the next attempt. The runtime derives a stable work key from contract/charter revision, role, and sorted exclusive outputs and rejects logical-name aliases within that frozen revision.
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
`blocked_exhausted`; never leave a drained run silently `running`.

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

Use the model and reasoning policy in `references/model-policy.json` when the current Codex runtime offers those choices. If it does not, use the best available native specialist and record the actual runtime. Do not invent a model name or enforcement result.

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
the first invalid or incomplete phase.

Retry only the smallest failed work package and preserve every failed artifact. Use a fresh specialist when independence or scientific judgment was affected. Classify failures before retrying: transient dispatch/transport, bounded validator repair, permanent missing requirement, or new authority/input required.

- For a result-blind defect, revise the execution contract in the same run, record the structured reason, and send the revised contract to a fresh Contract Auditor.
- For a result-aware defect in the scientific contract, use `revise-contract` with `post_result_guard: "invalidate_and_rerun"`. The CoE archives the old contract and its dependent successors, increments the contract revision, and returns the same run to contract review. Never tune a policy or evaluator to rescue an observed result.
- If the most direct repair would exceed a fixed charter boundary, keep the question and boundary fixed, choose the strongest safe in-scope design or limited conclusion, record the deviation and its scientific consequence, and continue. Do not solicit a charter amendment. If the researcher independently supplies a change, record it as a researcher-initiated amendment in the same run.
- A safe limited design is valid only when it still answers the frozen question and passes every applicable gate. Otherwise preserve the partial evidence and close `INCOMPLETE`; never manufacture a paper or scientific null from an operational blocker.

Operational launch errors with codes such as `S1_LAUNCH_GRANT_NOT_FOUND`, `S1_LAUNCH_GRANT_EXPIRED`, or `S1_LAUNCH_GRANT_MISMATCH` are recoverable: prepare a new one-use grant, retain the logical task name and attempt, and redispatch. Do not require a Codex restart, global installation, or manually copied runtime.

If a model route becomes unavailable, the MCP preserves the original route,
saves a content-addressed compatible route, and activates it only for future launches. Existing receipts remain bound
to their saved launches; route availability alone is not a scientific-contract
revision and does not invalidate unrelated scientific evidence.

## Completion

Do not report completion until every deliverable required by the plan exists and the final verifier passes. In research mode this normally includes the selected method or protocol, canonical evaluation, paper source, claim provenance, I1 to I4 audit, reproduction guide, visual check only for required rendered documents, and delivery manifest. A PDF is required only when the approved deliverables and verified environment require one. Negative, null, and genuinely completed-with-limitations findings are valid papers. `blocked_exhausted`/`INCOMPLETE` is a truthful terminal execution result, not a completed study.

Then route interpretation to `scientist1-results`. Before ending a turn, confirm the run path, phase, receipt, and next verified action. If native goal tools were used, mark the Scientist1 goal complete only now. Do not ask a post-approval question.
