# Release tests

Run these cases against the exact packaged bundle in a disposable project and fresh Codex profile. Save the prompt, tool trace, screen capture when useful, and result.

## Positive cases

1. In Codex desktop, `ScientistOne` starts the bundled MCP and opens the original full-page setup wizard in the built-in browser, with no inline form component or remote page.
2. Upload a file with the large drop field. Verify its bytes and SHA-256 under the active project's `.scientistone/intake/` tree.
3. Submit the seven-step intake. Verify the same tab shows the editable study plan and no run exists before browser approval.
4. Approve a smoke-test plan, initialize its run, and attach it. Verify the same tab becomes the interactive flowchart and its status comes from local `run.json` and receipts.
5. Select a team and specialist, pan, zoom, fit, reload, and change the run checkpoint. Verify the inspector, camera controls, integrity state, and live refresh.
6. `Show the status of my latest ScientistOne study` reopens the local interactive monitor.
7. `Audit this paper and evidence bundle with ScientistOne` creates an external-audit plan and does not start candidate research.

## Negative cases

1. A forged draft ID, run path outside the selected run, symbolic-link intake directory, bad token, or non-loopback browser request is rejected.
2. A file upload cannot write outside the active project, even with traversal segments, absolute paths, or symbolic links.
3. The browser UI makes no request to a ScientistOne-owned domain and exposes no remote upload path.
4. In Codex CLI or the IDE extension, the skill uses text-only intake without claiming that the built-in browser opened.
5. On a surface without project files, a terminal, or native subagents, the skill reports the missing capability and does not claim that a study started.

## Privacy checks

For every case, inspect the loopback listener, local project writes, browser network requests, cookies, MCP messages, and process tree. Expected result: study content travels only between Codex, the loopback page, and the active project. There is no remote ScientistOne request, cookie, session, database write, analytics call, or telemetry call.

## Clean-machine matrix

Test the exact package on:

- a fresh macOS profile with only Codex installed;
- a fresh Windows profile with only Codex installed;
- Codex CLI for the documented text-only fallback;
- the IDE extension for the documented text-only fallback.

Record the Codex version, operating system, launcher selected, MCP startup result, first invocation result, and any permission prompt. A local developer checkout or global Node installation must not be used as evidence that the package is self-contained.
