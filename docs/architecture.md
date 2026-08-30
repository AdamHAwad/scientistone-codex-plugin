# Architecture

ScientistOne has three parts with different jobs.

## Installed plugin

The repository marketplace installs the plugin bundle from `plugins/scientistone/`. The bundle contains the manifest, skills, references, validation scripts, brand assets, and a loopback-only MCP with the complete browser intake and monitor. It gives Codex the workflow and routing rules. It does not contain a database, persistent daemon, model provider, or second agent runtime.

The plugin uses tools that Codex supplies, including the project filesystem, terminal, web tools when allowed, native subagents, and the bundled MCP. Research dependencies belong in the approved project or run. They are not hidden installation requirements.

Before intake, a one-time local preflight reads Codex's public parallel-agent
capacity. With explicit permission it can raise that limit to 16, using an
exact private backup, atomic replacement, Codex validation, and rollback. It
does not rewrite internal V2 overrides or symlink-managed configuration. The
remembered choice contains no study content, and a successful change remains
restart-required until a new Codex desktop instance is detected.

After **Approve and start study**, the lead creates an outcome goal when Codex exposes goal tools. A plugin-bundled Stop hook also records the active run when its monitor attaches or its first specialist is prepared. If the lead attempts to end a turn while that run is incomplete, paused, failed, or not finally verified, the hook creates an automatic continuation prompt. The marker is scoped to the Codex session and project and is cleared only after explicit cancellation or a complete run whose final CoE verification passes. This is a persistence guardrail, not a bypass of Codex permissions.

## Bundled Codex MCP and browser

Codex starts the bundled MCP automatically from `.mcp.json` with the Node.js runtime included with Codex. The launcher checks Codex-provided runtime paths before falling back to a compatible `node` already on `PATH`; the user does not install Node or another package. The server speaks MCP over stdio and opens an HTTP server on a random `127.0.0.1` port.

The browser provides the complete seven-step intake, direct project-local file upload, editable study-plan review, and interactive study flowchart. Drafts live under `.scientistone/intake/` in the active project. The monitor reads `run.json`, receipts, role launches, and delivery files from the selected run. A random token protects its local API, and paths are canonicalized and constrained to the active project or selected run.

The publisher operates no remote ScientistOne service. Any Codex surface that cannot start the bundled MCP or show the built-in browser uses the text intake. There is no application database, object store, queue, telemetry service, update service, or plugin-owned model API.

The live monitor may reuse a recent integrity result only to render an
unchanged in-progress checkpoint. Final delivery and task stopping always run
a fresh verifier; cached UI state is never completion authority.

## Local study runtime

Codex creates `scientistone-runs/<timestamp>-<slug>/` in the researcher's project. Files carry authority between roles. A run can contain:

- `contract/` for the approved plan, input hashes, evaluator, and frozen I1 verifier;
- `investigation/` and `discovery/` for literature and candidate directions;
- `candidates/` and `evaluation/` for implementation and canonical measurement;
- `private/` for evaluator-only inputs and raw audit output;
- `evidence/`, `audit/`, and `delivery/` for provenance and review files.

## Agent-written, frozen verification

The I1 score check changes with the task.

1. A fresh verifier-builder reads the approved evaluation contract before candidate work.
2. It writes a task-specific policy, code, fixtures, and self-test.
3. A contract auditor checks and hashes that bundle.
4. Candidate roles build methods without access to evaluator-only inputs.
5. A fresh score auditor runs the frozen verifier against the selected result and paper.

The builder may choose a suitable exact or statistical check. It must declare the quantity being estimated, comparison design, uncertainty method, bounds, hardware conditions, and failure rules before results. Audit variance cannot widen the tolerance. A verifier repair creates a new contract revision in the same run. If results already exist, ScientistOne archives and reruns every later stage under the repaired contract.

## Role separation

Native Codex subagents receive one role card, declared inputs, declared outputs, and allowed source classes. They save receipts. This makes access and decisions reviewable. It does not create a process sandbox. Projects with stronger secrecy needs must provide outside isolation.

The lead schedules those roles from a dependency-ready queue. Independent
evidence readers, candidate branches, ablation variants, and final auditors
can run concurrently, while evaluator resources and causal dependencies remain
barriers. Every reusable role result is bound to the exact contract revision,
predecessor, role contract, routing record, and input/output hashes. This lets
an interrupted study reuse valid independent work without treating an old
sample as a new repetition or weakening any scientific gate.

The run persists this graph in `environment/task-ledger.json`; the bundled
deterministic scheduler selects each ready wave and rejects cycles, overlapping
live outputs, capacity above 16, and shared-resource overcommit. A read-only
phase preflight runs the same scientific and provenance gates as promotion
before any downstream wave starts.

Codex model catalogs can change between sessions. If a frozen semantic route
disappears, this adaptation archives the affected work and performs an audited
contract revision before choosing a currently available route; it never
silently downgrades. This is a deliberate host-durability extension beyond the
paper's pause behavior. The existing result-aware invalidation rule still
reruns every successor when candidate or downstream evidence already exists.
