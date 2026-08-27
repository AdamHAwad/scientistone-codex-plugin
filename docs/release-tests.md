# Release tests

Run these cases from the repository marketplace in a disposable project and a
fresh Codex profile. Record the Codex version, operating system, prompt, tool
trace, and result. Save a screen recording when visual behavior matters.

## Marketplace installation

1. Add the repository with `codex plugin marketplace add AdamHAwad/scientistone-codex-plugin --ref main`.
2. Confirm that Codex discovers `scientistone@scientistone` at the expected version.
3. Install it with `codex plugin add scientistone@scientistone`.
4. Confirm that the installed copy comes from `plugins/scientistone/` and starts without a global Node.js installation or another ScientistOne service.

## Positive cases

1. In Codex desktop, `ScientistOne` starts the bundled MCP and opens the full-page setup guide in the built-in browser, with no inline form or remote page.
2. Upload a file with the large drop field. Verify its bytes and SHA-256 under the active project's `.scientistone/intake/` tree.
3. Submit the seven-step intake. Verify that the same tab shows the editable study plan and that no run exists before approval.
4. Approve a smoke-test plan, initialize its run, and attach it. Verify that the same tab becomes the interactive flowchart and reads status from local `run.json` and receipts.
5. Select a stage and specialist, pan, zoom, fit, reload, and change the run checkpoint. Verify the inspector, camera controls, integrity state, and live refresh.
6. `Show the status of my latest ScientistOne study` reopens the local interactive monitor.
7. `Audit this paper and evidence bundle with ScientistOne` creates an external-audit plan and does not start candidate research.

## Negative cases

1. Reject a forged draft ID, a run path outside the selected run, a symbolic-link intake directory, a bad token, or a non-loopback browser request.
2. Prevent file uploads from writing outside the active project through traversal segments, absolute paths, or symbolic links.
3. Confirm that the browser UI makes no request to a ScientistOne-owned domain and exposes no remote upload path.
4. On any surface that cannot start the bundled MCP or show the built-in browser, use the text setup without claiming that the browser opened.
5. On a surface without project files, a terminal, or native subagents, report the missing capability and do not claim that a study started.

## Privacy checks

For every case, inspect the loopback listener, local project writes, browser
network requests, cookies, MCP messages, and process tree. Study content should
travel only between Codex, the loopback page, and the active project. There
must be no remote ScientistOne request, cookie, session, database write,
analytics call, or telemetry call.

## Clean-machine matrix

Test the exact marketplace version on:

- a fresh macOS profile with only Codex installed;
- a fresh Windows profile with only Codex installed;
- a Codex surface without the built-in browser, to verify the text fallback.

A developer checkout, an existing local marketplace, or a global Node.js
installation is not evidence that the published marketplace version is
self-contained.
