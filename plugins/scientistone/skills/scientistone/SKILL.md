---
name: scientistone
description: Start and run a ScientistOne study when the researcher invokes the plugin, says ScientistOne, or asks to plan a study. Route read-only status to scientistone-monitor and verified completed results to scientistone-results.
---

# ScientistOne

ScientistOne helps one researcher direct an AI research team through a computational study. The team reviews prior work, tests methods in code, checks claims against saved evidence, and prepares reviewable deliverables.

## Route the request

Treat a bare mention of ScientistOne as a request to begin setup.

- First, call `check_for_updates` with no arguments. If it returns `restart_required: true`, tell the researcher exactly: `ScientistOne was updated. Close and reopen Codex, then start a new ScientistOne task.` Do not start or resume a study in that task. Otherwise, continue without making the researcher manage updates. An unavailable update check is not a reason to block research or troubleshoot the plugin.
- In the Codex desktop app, the bundled local browser is the only full browser experience. For a new study or external audit, call `start_study_setup` with the active project root, the requested mode, and `resume_latest: false`. Immediately open the returned `url` in Codex's built-in browser. Do not render or substitute an inline MCP form, and do not use a remote setup page.
- Let the researcher complete the seven-step full-page wizard, including its large file-upload field. Call `wait_for_researcher` once with the returned project root and draft ID; do not poll. When it returns, call `read_study_setup` and treat the saved answers as researcher-authored intake.
- Uploaded files are copied directly by the bundled local MCP into the active project's `.scientistone/intake/<draft-id>/files/` tree. Verify each returned `stored_path` remains inside that draft, is a regular file, matches its declared byte size and SHA-256, and is not a symbolic link. Use only those project-local copies. Do not upload them to any remote service. Do not begin scientific work yet.
- If the current surface cannot start the bundled MCP or show the built-in browser, use the conversational fallback. Never substitute a remote ScientistOne MCP or setup page.
- For status, paused work, or a read-only check, use `scientistone-monitor`.
- For findings from a verified complete run, use `scientistone-results`.
- For resume, verify the saved run and continue from its first invalid or incomplete phase.

The browser wizard asks seven questions: research question, purpose, files, prior work, evaluation, limits, and final review. Its local server writes answers and selected files only under the active project. ScientistOne has no remote MCP in this plugin.

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
- a negative or inconclusive outcome;
- limits on interpretation;
- exact deliverables.

Propose a concrete default when the researcher left an execution choice open. Ask a follow-up only when no safe default can preserve the scientific meaning.

In Codex desktop, send the complete plain-language plan to `publish_study_review`. Classify every uploaded file exactly once as study material or prior work and as shared or evaluator-only. The same browser tab must change from its waiting view to the editable study review. Call `wait_for_researcher` once. If the researcher requests changes, read the edited review and change note, revise the plan, republish it, and wait again. If they approve, use the approved browser fields as the binding plan. Do not create run files or install study dependencies before that approval.

Only on a surface without the bundled browser MCP should you show the plan in chat and ask: `Is this the study you want me to run?`

The researcher approves once. Save the approved text as `request.md` and `study-plan.md`. Treat the approved question, named inputs, evaluation intent, constraints, exclusions, permissions, and limits on interpretation as the researcher charter. The generated evaluator, verifier, paths, hashes, seeds, schemas, and other implementation details are the execution contract. Agents may repair and re-audit that execution contract in the same run. Changing the charter requires an explicit amended plan approved through the browser. Start a separate run only for a different research question, changed permissions, or an intentional fork that the researcher wants to preserve alongside the first study.

## Create the run

Before writing run files, read `references/protocol.md`, `references/artifacts.md`, `references/roles.md`, and `references/i1-verification.md` completely.

1. Create `scientistone-runs/<UTC>-<slug>/` in the active project.
2. Copy each approved input into the run once, or bind it by a stable project-relative path when copying would violate the plan. Compute SHA-256 and write `contract/input-manifest.json`. Put answer keys, held-out outcomes, private checks, and evaluator code under `private/`. Candidate roles must never read them.
3. Prepare the smallest project-local environment needed by the approved study. Reuse compatible tools. Install from an official source only when needed. Record the exact path, version, source, and hash in `environment/bootstrap.json`. Do not install globally or ask the researcher to install a plugin prerequisite.
4. Freeze the plan, run profile, evaluator contract, evaluator manifest, and task-specific I1 verifier. A fresh Contract Auditor must pass them before candidate work.
5. Write `run.json`, events, role-launch records, and receipts as required by `artifacts.md`.
6. Call `attach_run_monitor` with the project root, draft ID, and initialized run path. The open browser must switch into the original interactive study flowchart. If the tab cannot navigate automatically, open the returned `url` in Codex's built-in browser.

## Use native Codex agents

ScientistOne uses native Codex subagents. It does not start another agent framework.

Before each scientific, coding, writing, evaluation, or audit assignment:

1. Choose exactly one role card from `references/roles.md`.
2. Declare the absolute run path, input paths, allowed source classes, output paths, and acceptance gate.
3. Write `role-launches/<task-name>.json` before launch. Use a stable `logical_task_name`, a unique task name for this attempt, a positive attempt number, and `fork_turns: "none"` so the specialist starts fresh. If launch authorization expires or is consumed before dispatch, request a new grant for the same logical task, increment the attempt, and launch again. Do not ask the researcher to restart Codex or copy runtime files.
4. Launch the native subagent with the unchanged Common Role Envelope and one role card.
5. Compare the returned task metadata and receipt with the launch record. Record any limit that Codex could not enforce. Never claim process isolation when only prompt and file rules exist.

Use the model and reasoning policy in `references/model-policy.json` when the current Codex runtime offers those choices. If it does not, use the best available native specialist and record the actual runtime. Do not invent a model name or enforcement result.

## Rules that do not change

- Build evidence when a claim is made. A later citation cannot fix a claim with no support.
- Saved files, not chat or agent memory, carry authority between roles.
- Freeze evaluation and the task-specific I1 verifier before candidate results.
- Keep candidate work away from evaluator-only files and held-out answers.
- Preserve failed methods, null findings, contradictions, and audit failures.
- Keep an operational failure separate from scientific null evidence.
- Do not publish, use a paid service, accept a license, export private data, or make a destructive change without new authority.
- Give the researcher short updates at real checkpoints. Use their field language instead of internal task IDs or schema keys.

## Run and recovery

Follow `references/protocol.md` in order. At each phase boundary, create a receipt and run the verifier commands in `references/artifacts.md`. On resume, verify saved state and continue from the first invalid or incomplete phase.

Retry the smallest failed work package and preserve every failed artifact. Use a fresh specialist when independence or scientific judgment was affected. Treat a generated-contract defect as a repair request, not a terminal blocker:

- For a result-blind defect, revise the execution contract in the same run, record the structured reason, and send the revised contract to a fresh Contract Auditor.
- For a result-aware defect, use `revise-contract` with `post_result_guard: "invalidate_and_rerun"`. The verifier archives the old contract and every successor, increments the contract revision, and returns the same run to contract review. Never tune a verifier to rescue an observed result.
- If the repair would change the researcher charter, obtain approval for an amended plan in the browser, record its hash in the revision reason, and revise the same run. Do not infer that approval.
- Use `attention.md` only when the run lacks data, permission, authority, or a charter decision that agents cannot supply, or when safe in-scope recovery paths have been exhausted and one exact researcher action is necessary. A retry count alone is not a reason to pause.

Operational launch errors with codes such as `S1_LAUNCH_GRANT_NOT_FOUND`, `S1_LAUNCH_GRANT_EXPIRED`, or `S1_LAUNCH_GRANT_MISMATCH` are recoverable: prepare a new one-use grant, retain the logical task name, increment the attempt, and retry the same work package. Do not require a Codex restart, a global installation, or a manually copied runtime.

## Completion

Do not report completion until every deliverable required by the plan exists and the final verifier passes. In research mode this normally includes the selected method or protocol, canonical evaluation, paper source, claim provenance, I1 to I4 audit, reproduction guide, visual check for rendered documents, and delivery manifest. A PDF is required only when the approved deliverables and available verified environment require one.

Then route interpretation to `scientistone-results`. Before ending a turn, confirm the run path, phase, receipt, and next verified action. Ask one question only when the researcher must act.
