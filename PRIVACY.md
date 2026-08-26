# Privacy

Effective August 25, 2026

ScientistOne for Codex is designed so its publisher does not receive or store research content.

## What the bundled local MCP processes

In Codex desktop, the installed plugin starts a loopback-only MCP and browser server. It receives the researcher's setup answers and selected files so it can copy them directly into the active project. It also reads the project's saved ScientistOne run records to render the live study flowchart. This processing stays on the researcher's machine. The local server binds only to `127.0.0.1`, uses a random per-process token for browser API requests, and stores draft files under the active project's `.scientistone/` directory.

## No ScientistOne backend

The Codex plugin does not use a ScientistOne database, API, storage service, analytics endpoint, telemetry endpoint, or update server. The publisher does not receive setup answers, files, paths, citations, results, or run state.

OpenAI separately processes Codex conversations, tool calls, and files under the user's OpenAI plan, settings, and terms. The ScientistOne publisher does not control OpenAI's retention.

## Local study data

ScientistOne creates intake and run files in the researcher's active project. The researcher controls that project, its backups, its Git history, and deletion.

## Changes and contact

A future feature that receives research content, creates accounts, stores state, or adds telemetry needs a new privacy review and policy before release. Use the channel in [SUPPORT.md](SUPPORT.md) for questions.
