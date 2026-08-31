# Changelog

This project follows Semantic Versioning.

## 1.3.2 - 2026-08-31

- Separated pre-result contract stabilization from costly downstream and
  result-aware repair waves. Initial contract corrections can now repeat in the
  same run without an arbitrary count terminalizing the study.
- Made result-awareness a control-plane fact derived from saved candidate and
  downstream evidence, preventing an agent from misclassifying a pre-candidate
  correction and consuming the frozen result-aware repair budget.
- Restricted contract review to a closed set of concrete blockers, required all
  observable findings in the first pass, and limited re-audit to prior findings
  plus defects introduced by the exact repair delta. Optional hardening,
  alternative designs, and hypothetical edge cases no longer create work.
- Preserved the one-wave ceiling for post-result contract changes and downstream
  scientific gates, where repeated repair could invalidate evidence or tune a
  contract after observing results.

## 1.3.1 - 2026-08-31

- Applied the Scientist1 identity across marketplace metadata, bundled skills
  and MCP wiring, runtime state and run paths, UI copy, documentation, tests,
  packaging, and release tooling.
- Reserved the name ScientistOne for citations to the Google research paper
  and its published artifacts.
- Removed the non-binary fallback verdict and the researcher-facing
  negative-outcome design field. Scientist1 now handles null findings and failed integrity checks
  autonomously within the approved end-to-end study: null findings remain valid
  scientific outcomes, while failed checks trigger bounded repair and fail closed.

## 1.3.0 - 2026-08-30

- Replaced generated per-study I1 verifier projects with one release-tested,
  run-snapshotted interpreter plus a declarative task-specific policy, while
  retaining score lineage, fresh reproduction, and claim-semantics checks.
- Added canonical task briefs and exact assignments with compact saved handoffs
  so every specialist receives the relevant upstream evidence and acceptance
  gate without inheriting chat history or rediscovering prior work.
- Bounded accepted specialist launches at two and each gate to one automatic repair wave;
  exhausted work now closes truthfully as terminal `INCOMPLETE` instead of
  triggering an unbounded self-repair loop or manufacturing a scientific null.
- Made checkpoint the sole failure-atomic promotion gate, kept preflight as an
  optional diagnostic, preserved valid receipts across model-route changes, and
  added drained-queue/exhaustion visibility plus bounded least-constraining
  ready selection to the scheduler.
- Bound retry identity to the frozen contract/charter revision, role, and
  exclusive outputs, so aliases or deleted receipts cannot reset an attempt;
  launches are rejected after a run becomes terminal.
- Made I1 results enumerate every frozen canonical and audit run under closed,
  executable estimand semantics, preventing dropped reruns or free-text
  estimand substitution from passing verification.
- Made invalidation, checkpointing, and terminalization failure-atomic, with an
  exact repair-gate record and an archived affected chain before exhaustion.
- Kept genuine in-progress 1.2 runs resumable through a narrow compatibility
  controller plus the exact released 1.2 role and model-policy assets; new
  studies use only the leaner 1.3 control plane.
- Removed the Stop-hook continuation loop, lowered reasoning effort for
  mechanical roles, retained deep reasoning for scientific judgment, and added
  YAGNI constraints against speculative frameworks and duplicate test systems.

## 1.2.0 - 2026-08-30

- Added dependency-ready scheduling for independent literature, candidate,
  ablation, and final-audit work while retaining every causal barrier,
  repetition, evidence requirement, and evaluator resource limit.
- Added exact hash-bound role launches and read-only resume validation so an
  interrupted run can reuse valid work without duplicating a sample or trusting
  stale prompt, routing, predecessor, input, or output state.
- Added a one-time opt-in Codex capacity preflight for up to 16 parallel
  specialists, with a private exact backup, atomic validation and rollback,
  durable restart detection, managed-config fallback, and no repeated prompt.
- Cached the live model catalog and unchanged in-progress monitor verification
  with single-flight loading; final delivery and task stopping still verify
  freshly, and frozen route changes still require an audited contract revision.
- Compacted the repeated role envelope, kept xhigh reasoning and the paper's
  pilot profile as the default, left larger standard budgets opt-in, and added
  adversarial scheduler, routing, resume, mutation, cache, and capacity tests.

## 1.1.4 - 2026-08-29

- Made **Approve and start study** the single durable approval for safe in-scope execution and same-run contract repair through verified delivery.
- Added an outcome goal after approval and a session-scoped Stop hook that automatically continues incomplete, paused, failed, or not-finally-verified runs.
- Removed post-approval reapproval and attention branches from the lead, contract-auditor, intake, protocol, verifier, and monitor instructions; unavailable paths now become safe fallbacks and documented limitations.
- Added approval-authority metadata, explicit browser copy, regression tests for the observed evaluator-repair failure, and lifecycle-hook tests through verified completion or explicit cancellation.

## 1.1.3 - 2026-08-27

- Made each researcher intake and plan-review wait last up to one hour without polling.
- Added a normal saved-pause result that closes the setup tab, tells the researcher how to resume, and preserves the unfinished local draft.
- Kept the MCP host timeout slightly longer than the internal wait so the researcher receives the saved-pause message instead of a generic tool timeout.

## 1.1.2 - 2026-08-27

- Removed the redundant in-task updater and its network, Codex CLI, cache, documentation, and test surface.
- Returned update ownership to Codex's configured Git marketplace startup lifecycle so a running Scientist1 task never replaces its own plugin bundle.

## 1.1.1 - 2026-08-27

- Added a first-step update check that refreshes the configured Git marketplace through Codex and installs a newer Scientist1 bundle when available.
- Kept update failures non-blocking, while requiring a fresh Codex session after an installed update so skills, tools, and hooks come from one version.
- Added isolated updater tests for current, updated, local-development, ambiguous-install, and offline states.

## 1.1.0 - 2026-08-27

- Restored the complete local Codex browser workflow: seven-step intake, direct project-local uploads, editable plan review, and interactive live study flowchart.
- Consolidated the plugin around one bundled local MCP, three skills, and one lifecycle hook.
- Added task-specific I1 verification that agents write and freeze before candidate results.
- Added marketplace release docs, privacy rules, package checks, and clean-room tests.
- Restored the original blue-and-green S1 mark and aligned the plugin description with the public README.
- Added the repository marketplace catalog and documented its clean-install commands.
- Bundled the loopback MCP, launchers, UI assets, hooks, and licenses so marketplace installation needs no separate runtime or companion service.
- Reframed the public workflow as nine research stages carried out by a task-dependent number of specialist agents.
- Added same-run, versioned contract repair with charter approval boundaries, complete successor rollback, stable one-use launch grants, and auditable automatic retries.
