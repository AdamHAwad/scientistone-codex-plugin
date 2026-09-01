---
name: scientist1-monitor
description: Read the status and integrity of an existing Scientist1 run without changing it. Use for status checks, paused or failed runs, and deciding whether to resume.
---

# Scientist1 monitor

A Scientist1 status comes from its saved run record and verified checkpoints, not an agent's claim that work is done. This skill is read-only. Read the local run files directly, and use the bundled local MCP to present them in the original interactive browser monitor.

This file contains the complete status algorithm. Do not preload the full
doctrine, artifact catalog, protocol, or execution skill for a read-only check.
The CoE verifier below is the integrity authority.

## Find the run

If the researcher provides a run path, use it. Otherwise search the current project only for `scientist1-runs/*/run.json` and choose:

1. a run with `state: running`, `repairing`, or `paused`;
2. otherwise the most recently updated run.

If no matching run exists, state that no Scientist1 run was found. Ask for an absolute run path or offer to begin planning a new study. If several active runs are equally plausible, ask which one. Do not inspect a legacy `runs/` directory as a native Scientist1 run.

In Codex desktop, call `open_run_monitor` with the resolved run path and open the returned `url` in the built-in browser. Its returned `verified_status` is the verified snapshot for this check, and the browser reuses that verification. Do not run a second CLI verification. Keep the text response compact; the browser flowchart is the primary progress display. If the bundled tool is unavailable, continue with the fallback below.

## Read current status

1. Read `run.json` and `environment/bootstrap.json`. Resolve only paths recorded by that run.
2. When `open_run_monitor` did not return `verified_status`, run the bundled read-only CoE chain verifier once with the recorded Node runtime:

```sh
<recorded-node-path> <scientist1-skill-root>/scripts/coe.mjs verify <absolute-run-path>
```

Do not install a runtime during a status check. The run's task-specific I1 policy
and common interpreter are evidence inside this chain; there is no task-local
replacement verifier to discover or rebuild.

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

External-audit mode uses only `Contract -> Integrity audit -> Delivery`; never show research phases that do not apply as unfinished work.

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

- `running` plus valid contiguous receipts: healthy while current outputs are still being produced.
- `repairing`: report the exact phase and preserved failure; no researcher action unless `attention` is set.
- `paused`: treat this as legacy or stale state after approval; report the recorded item, explain that execution should resume autonomously under the current policy, and do not request a second approval.
- `failed`: distinguish operational failure from completed null evidence. Explain that the execution task must resume with the smallest safe in-scope repair; do not ask for repair authority.
- A legacy 1.3 terminal state: report the preserved diagnosis and that the execution task must convert it with `coe.mjs resume-repair`, then continue the same run. Never present it as a final study result.
- `complete`: require `verify` to pass; state, phase, receipts, required outputs, visual inspection, and manifest verification must agree. Otherwise report "delivery verification has not passed," not complete.
- Hash mismatch: identify the first invalid receipt; downstream outputs are stale until rebuilt.

Do not modify, resume, stop, invalidate, or repair a run during a status-only request.

## Recurring monitoring

Create an automation only when the researcher explicitly asks to keep monitoring, check back, or notify them. First discover whether Codex exposes its native automation-update tool. If it does not, provide the one-time status and explain that recurring monitoring is unavailable; do not invent shell scheduling or imply that a monitor was created. When available, use the native tool. Default cadence: every 15 minutes, attached to the owning Scientist1 task, with this instruction:

> Use the scientist1-monitor skill on `<absolute run path>`. Report only a changed verified phase, a new repair incident, an invalid evidence receipt, or verified completion. Stop this automation only after fresh final verification succeeds.

Do not create a second monitor when the main long-running task is already reporting and the researcher did not ask for one. Stop recurring monitoring only when the run becomes freshly verified complete. Treat `failed`, `paused`, or a legacy terminal value as nonterminal repair signals.

## Resume handoff

When the researcher asks to resume an interrupted run, hand off to `scientist1` with the same absolute run path. Verify the receipt chain first, preserve failed or partial artifacts, clear stale attention, convert a preserved 1.3 terminal diagnosis with `resume-repair`, and continue from the first invalid phase. Evaluator, policy, schema, path, hash, seed, outcome-operationalization, environment, and method-detail repairs stay in the same versioned run until verified delivery.

## Before ending a turn

1. Confirm that `run.json` was read and `verify` passed or failed.
2. Report only a phase supported by a valid receipt.
3. If the run is paused, report the recorded legacy action and state that the execution task should clear it and resume autonomously; do not ask for approval.
4. Do not modify, resume, stop, invalidate, or repair the run.
5. Do not report completion unless state, phase, receipts, required outputs, and manifest verification agree.
6. Create recurring monitoring only after an explicit request and only through the native automation tool.

Ask which run to inspect only when multiple runs are equally plausible.
