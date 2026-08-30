# Permissions

ScientistOne asks for the access needed to run a local research workflow.

## Plugin capabilities

- Read researcher-selected project files and saved run files.
- Write run files inside the active project.
- Start the bundled loopback MCP and open its local browser interface.
- Use research sources when the task, Codex permissions, and role contract allow them.
- Run experiments, validation, local environments, and document builds in the active project.
- Assign bounded work to native Codex subagents.
- Before intake, read Codex's parallel-agent capacity and, only after explicit
  opt-in, back up and update that one local setting to 16.

## What installation does not allow

Installation does not allow ScientistOne to publish results, use paid services, accept licenses, expose secrets, access unrelated projects, make destructive system changes, or bypass Codex approval rules.

Selecting **Approve and start study** grants durable authority for safe, reversible, project-local execution and contract repair through the verified deliverables, including a project-local dependency when the approved method needs it. ScientistOne does not ask for another study approval. This authority does not allow a global install, hidden prerequisite, publication, paid service, license acceptance, private-data export, destructive change, or bypass of Codex-enforced safety rules. When one of those boundaries prevents the direct path, the run uses a safe in-scope fallback and documents the limitation.

## Writable paths

Intake state belongs under `.scientistone/intake/`, and run state belongs under
`scientistone-runs/`, both in the active project. The optional one-time
capacity preflight writes only `CODEX_HOME/config.toml`, an exact private backup
beside it, and `CODEX_HOME/scientistone/capacity-preflight.json`. It preserves
unrelated settings, validates before success, rolls back safely, and does not
follow symlink-managed paths. Temporary study files and local environments
should stay inside the run when possible. The publisher operates no remote
data service.
