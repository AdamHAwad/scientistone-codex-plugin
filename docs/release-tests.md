# Release tests

Run these cases from the repository marketplace in a disposable project and a
fresh Codex profile. Record the Codex version, operating system, prompt, tool
trace, and result. Save a screen recording when visual behavior matters.

## Marketplace installation

1. Add the repository with `codex plugin marketplace add AdamHAwad/scientistone-codex-plugin --ref main`.
2. Confirm that Codex discovers `scientist1@scientist1` at the expected version.
3. Install it with `codex plugin add scientist1@scientist1`.
4. Confirm Codex reports the plugin hooks as untrusted, open `/hooks`, review
   the exact Scientist1 launch-authorization and completion-enforcement hooks,
   and trust them.
5. Confirm an authorized smoke-test specialist launch runs the hook and creates
   its immutable accepted-attempt record. Installation alone is not hook trust.
6. Confirm that the installed copy comes from `plugins/scientist1/` and starts without a global Node.js installation or another Scientist1 service.

## Positive cases

1. With a fresh writable Codex profile below 16, invoke Scientist1 and verify
   the exact one-time capacity prompt appears before intake. Decline and verify
   later invocations continue silently without losing any study requirement.
2. In another fresh profile, accept the capacity change. Verify an exact
   private backup, canonical `[agents]` value 16, successful Codex validation,
   and restart-required state until Codex restarts. Verify an existing value
   above 16 is never lowered.
3. In Codex desktop, `Scientist1` starts the bundled MCP and opens the full-page setup guide in the built-in browser, with no inline form or remote page.
4. Upload a file with the large drop field. Verify its bytes and SHA-256 under the active project's `.scientist1/intake/` tree.
5. Submit the seven-step intake. Verify that the same tab shows the editable study plan and that no run exists before approval.
6. Approve a smoke-test plan, initialize its run, and attach it. Verify that `contract/approval.json` is hash-bound before any specialist launch and that the same tab becomes the interactive flowchart and reads status from local `run.json` and receipts.
7. Select a stage and specialist, pan, zoom, fit, reload, and change the run checkpoint. Verify the inspector, camera controls, latest-checkpoint integrity state, and live refresh.
8. `Show the status of my latest Scientist1 study` reopens the local interactive monitor.
9. `Audit this paper and evidence bundle with Scientist1` creates an external-audit plan and does not start candidate research.
10. Approve a research study, force a result-blind evaluator or I1-policy defect, and verify that the lead makes the smallest repair and re-audits the same run without asking for approval, permission, authority, a restart, or a reply.
11. Force at least three accepted attempts for one logical specialist task and at least two result-aware repair cycles at one gate. Verify that task aliases or deleted receipts cannot erase history, every affected chain is archived, the next sequential attempt remains launchable, no terminal study record is created, and the same run can proceed through a verified paper package.
12. Remove an optional dependency, credential, hardware capability, or paid service from the approved environment. Verify that the run selects the strongest safe in-scope design, writes the limitation, and continues through the paper and delivery audit without `attention.md`.
13. Create independent literature, candidate, ablation, and final-audit tasks with explicit causal barriers. Verify that every ready task launches up to the available capacity, resource-conflicting tasks remain serial, and completion order does not alter seeds, ranks, or tie-breaks.
14. Attempt to stop immediately after approval, during `running`, during `repairing`, after a legacy terminal diagnosis, and after a nominal but unverifiable `complete`. Verify the completion hook blocks every stop and only a fresh successful final verifier releases it.

## Negative cases

1. Reject a forged draft ID, a run path outside the selected run, a symbolic-link intake directory, a bad token, or a non-loopback browser request.
2. Prevent file uploads from writing outside the active project through traversal segments, absolute paths, or symbolic links.
3. Confirm that the browser UI makes no request to a Scientist1-owned domain and exposes no remote upload path.
4. On any surface that cannot start the bundled MCP or show the built-in browser, use the text setup without claiming that the browser opened.
5. On a surface without project files, a terminal, or native subagents, report the missing capability and do not claim that a study started.
6. Make Codex config read-only, symlink-managed, malformed, or explicitly
   V2-overridden. Verify the preflight does not rewrite it, records a durable
   limited decision when possible, and proceeds without reducing study depth.
7. Force validation failure, state-write failure, timeout, and a concurrent
   external config edit. Verify safe rollback where ownership is unchanged and
   verify the external edit is never overwritten.

## Privacy checks

For every case, inspect the loopback listener, local project writes, browser
network requests, cookies, MCP messages, and process tree. Study content should
travel only between Codex, the loopback page, and the active project. There
must be no remote Scientist1 request, cookie, session, database write,
analytics call, or telemetry call.

## Clean-machine matrix

Test the exact marketplace version on:

- a fresh macOS profile with only Codex installed;
- a fresh Windows profile with only Codex installed;
- a Codex surface without the built-in browser, to verify the text fallback.

A developer checkout, an existing local marketplace, or a global Node.js
installation is not evidence that the published marketplace version is
self-contained.
