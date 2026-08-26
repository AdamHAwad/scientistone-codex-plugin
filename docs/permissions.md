# Permissions

ScientistOne asks for the access needed to run a local research workflow.

## Plugin capabilities

- Read researcher-selected project files and saved run files.
- Write run files inside the active project.
- Start the bundled loopback MCP and open its local browser interface.
- Use research sources when the task, Codex permissions, and role contract allow them.
- Run experiments, validation, local environments, and document builds in the active project.
- Assign bounded work to native Codex subagents.

## What installation does not allow

Installation does not allow ScientistOne to publish results, use paid services, accept licenses, expose secrets, access unrelated projects, make destructive system changes, or bypass Codex approval rules.

Study approval may allow a reversible project-local dependency install when the approved method needs it. It does not allow a global install or a hidden plugin prerequisite.

## Writable paths

Intake state belongs under `.scientistone/intake/`, and run state belongs under `scientistone-runs/`, both in the active project. Temporary files and local environments should stay inside the run when possible. The publisher operates no remote data service.
