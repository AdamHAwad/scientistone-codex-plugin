---
name: scientistone-monitor
description: Read the status and integrity of an existing ScientistOne run without changing it. Use for status checks, paused or failed runs, and deciding whether to resume.
---

# ScientistOne monitor

A ScientistOne status comes from its saved run record and verified checkpoints, not an agent's claim that work is done. This skill is read-only. Read the local run files directly, and use the bundled local MCP to present them in the original interactive browser monitor.

Before acting, read completely:

- `../scientistone/references/doctrine.md`
- `../scientistone/references/artifacts.md`
- the phase sections of `../scientistone/references/protocol.md`
- `Recovery and pause rules` in `../scientistone/SKILL.md`

## Find the run

If the researcher provides a run path, use it. Otherwise search the current project only for `scientistone-runs/*/run.json` and choose:

1. a run with `state: running`, `repairing`, or `paused`;
2. otherwise the most recently updated run.

If no matching run exists, state that no ScientistOne run was found. Ask for an absolute run path or offer to begin planning a new study. If several active runs are equally plausible, ask which one. Do not inspect a legacy `runs/` directory as a native ScientistOne run.

In Codex desktop, call `open_run_monitor` with the resolved run path and open the returned `url` in the built-in browser. Keep the text response compact; the browser flowchart is the primary progress display. If the bundled tool is unavailable, continue with the text display below.

## Read current status

1. Read `run.json`, `environment/bootstrap.json`, and the run's frozen verification record. Resolve only paths recorded by that run.
2. Run the exact frozen verifier without writing files. Use the command and runtime recorded in the run. For a run that chose the bundled JavaScript reference implementation, the command is:

```sh
<recorded-node-path> <scientistone-skill-root>/scripts/coe.mjs verify <absolute-run-path>
```

The JavaScript verifier is one supported implementation, not a plugin-install prerequisite. A study may freeze an equivalent task-local verifier in another runtime already available to Codex. Do not install a runtime during a status check. If the recorded verifier cannot execute on this machine, report its integrity as unverified and route any portability repair through `scientistone`; do not claim that the run is complete.

3. Read the last 20 lines of `events.jsonl`, the current phase receipt if present, and `attention.md` only when referenced by `run.json`.
4. If this is the same Codex task that owns active specialists, use native task-status tools for a compact snapshot. Inspect a specialist transcript or workspace only when the ledger shows a missing output, long silence, repeated failure, or an independence concern.
5. Never infer progress from token use, number of specialists, or elapsed time alone.

## Progress display

Use the ordered phase list and receipt chain. Report the first phase whose receipt is missing or invalid. If `run.json.phase` is ahead of that phase, describe the later phase as work in progress, not completed evidence.

Research mode uses:

```text
✓ Contract
✓ Investigation
→ Discovery
· Selection
· Ablation
· Writing
· Verification
· Integrity audit
· Delivery
```

External-audit mode uses only `Contract -> Integrity audit -> Delivery`; never show skipped research phases as incomplete.

Use `✓` only for a verified receipt, `→` for the current phase, `!` for attention, and `·` for not started.

## Plain-language response

Give the researcher only:

- current scientific stage;
- what was verified since the previous checkpoint, if known;
- what happens next;
- whether they need to act;
- one direct link to the most useful current artifact when appropriate.

Do not expose framework vocabulary, task IDs, internal prompts, raw stack traces, model costs, or speculative completion times unless asked. Translate a technical blocker into one plain sentence. If a historical `attention.md` exists, preserve and report it as legacy evidence; never turn it into a request for new approval or authority.

Example:

> Candidate-method testing is in progress. Two methods have valid evaluations and one was excluded because it did not follow the approved protocol. Nothing is needed from you; the next checkpoint is independent method selection.

## Triage

- `running` plus valid contiguous receipts: healthy even if current outputs are incomplete.
- `repairing`: report the exact phase and preserved failure; no researcher action unless `attention` is set.
- `paused`: treat this as legacy or stale state after approval; report the recorded item, explain that execution should resume autonomously under the current policy, and do not request a second approval.
- `failed`: distinguish operational failure from completed null evidence. Explain that the execution task should resume with a safe in-scope fallback; do not ask for repair authority.
- `complete`: require `verify` to pass; state, phase, receipts, required outputs, visual inspection, and manifest verification must agree. Otherwise report "delivery verification is incomplete," not complete.
- Hash mismatch: identify the first invalid receipt; downstream outputs are stale until rebuilt.

Do not modify, resume, stop, invalidate, or repair a run during a status-only request.

## Recurring monitoring

Create an automation only when the researcher explicitly asks to keep monitoring, check back, or notify them. First discover whether Codex exposes its native automation-update tool. If it does not, provide the one-time status and explain that recurring monitoring is unavailable; do not invent shell scheduling or imply that a monitor was created. When available, use the native tool. Default cadence: every 15 minutes, attached to the owning ScientistOne task, with this instruction:

> Use the scientistone-monitor skill on `<absolute run path>`. Report only a changed verified phase, a new attention item, an invalid evidence receipt, or terminal completion. On terminal completion or cancellation, stop this automation.

Do not create a second monitor when the main long-running task is already reporting and the researcher did not ask for one. Stop recurring monitoring only when the run becomes complete or cancelled. Treat `failed` or `paused` as a nonterminal legacy state: report the change and keep monitoring while the owning execution task repairs and resumes it autonomously.

## Resume handoff

When the researcher asks to resume, hand off to `scientistone` with the same absolute run path. Verify the receipt chain first, preserve failed or partial artifacts, clear stale attention, and continue from the first invalid or incomplete phase. Generated evaluator, verifier, schema, path, hash, seed, outcome-operationalization, environment, or method-detail repairs stay in the same versioned run without another approval. Preserve fixed charter boundaries through a safe limited design when necessary. Create a separate run only when the researcher explicitly requests a different research question or intentional fork.

## Before ending a turn

1. Confirm that `run.json` was read and `verify` passed or failed.
2. Report only a phase supported by a valid receipt.
3. If the run is paused, report the recorded legacy action and state that the execution task should clear it and resume autonomously; do not ask for approval.
4. Do not modify, resume, stop, invalidate, or repair the run.
5. Do not report completion unless state, phase, receipts, required outputs, and manifest verification agree.
6. Create recurring monitoring only after an explicit request and only through the native automation tool.

Ask which run to inspect only when multiple runs are equally plausible.
