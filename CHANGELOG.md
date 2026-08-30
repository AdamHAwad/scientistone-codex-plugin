# Changelog

This project follows Semantic Versioning.

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
- Returned update ownership to Codex's configured Git marketplace startup lifecycle so a running ScientistOne task never replaces its own plugin bundle.

## 1.1.1 - 2026-08-27

- Added a first-step update check that refreshes the configured Git marketplace through Codex and installs a newer ScientistOne bundle when available.
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
