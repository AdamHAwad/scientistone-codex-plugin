# Data flow and privacy

## Local processing

The bundled MCP receives setup answers, selected file bytes, approval edits, and the path of a selected ScientistOne run. It binds to `127.0.0.1`, writes intake state under `.scientistone/intake/`, and reads saved run artifacts for the interactive flowchart. Durable study files remain in the researcher's active project.

ScientistOne-owned infrastructure receives none of the following:

- research questions or setup answers;
- local paths, filenames, or selected files;
- papers, source notes, datasets, code, or environment files;
- candidate results, private evaluator material, or audit output;
- run state or final deliverables.

## Service boundaries

OpenAI processes the Codex conversation, tool calls, and files that the researcher gives to Codex. The researcher's OpenAI plan, settings, and terms apply. This is an OpenAI service boundary, not a ScientistOne service.

Codex may use literature, dataset, package, or model sources approved for a study. Those calls are made through Codex or project tools under the researcher's permissions. ScientistOne does not proxy them.

## Network inventory

| Connection | Purpose | Study content | Required |
| --- | --- | --- | --- |
| Codex to the bundled ScientistOne MCP over stdio | Start setup, publish review, attach or reopen the monitor | Project root, intake state, and selected run path stay on the machine | Required for the complete Codex desktop experience |
| Codex built-in browser to `127.0.0.1` | Intake, local upload, plan approval, and live flowchart | Researcher-authored setup, selected files, and saved run state stay on the machine | Required for the complete Codex desktop experience; loopback only |
| Codex and OpenAI services | Run the user's Codex task | Chosen by the researcher under OpenAI settings | Required by Codex, not plugin-owned |
| Literature, dataset, or package sources | Approved research and project-local setup | Depends on the task | Only when the approved study needs them |
| ScientistOne database, API, object store, analytics, telemetry, or update service | None | None | Does not exist |

Adding accounts, analytics, storage, remote processing, or richer network integrations changes this privacy model and requires a new review before release.
