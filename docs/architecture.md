# Architecture

Scientist1 has three parts with different jobs.

## Installed plugin

The repository marketplace installs the plugin bundle from `plugins/scientist1/`. The bundle contains the manifest, skills, references, validation scripts, brand assets, and a loopback-only MCP with the complete browser intake and monitor. It gives Codex the workflow and routing rules. It does not contain a database, persistent daemon, model provider, or second agent runtime.

The plugin uses tools that Codex supplies, including the project filesystem, terminal, web tools when allowed, native subagents, and the bundled MCP. Research dependencies belong in the approved project or run. They are not hidden installation requirements.

Before intake, a one-time local preflight reads Codex's public parallel-agent
capacity. With explicit permission it can raise that limit to 16, using an
exact private backup, atomic replacement, Codex validation, and rollback. It
does not rewrite internal V2 overrides or symlink-managed configuration. The
remembered choice contains no study content, and a successful change remains
restart-required until a new Codex desktop instance is detected.

After **Approve and start study**, the lead advances the saved run through
dependency-ready work. When native goal tooling is both available and
authorized for the request, one bounded goal may track progress only until
freshly verified completion or terminal `blocked_exhausted`; the run ledger
remains the authority.
Each logical specialist task has at most two accepted launch attempts.
Downstream gates and result-aware contract changes have at most one automatic
repair wave. Pre-result contract stabilization instead uses a closed checklist,
all-findings-at-once review, and minimal repair deltas without an arbitrary wave
count. A drained run with no accepted path closes
with a terminal `INCOMPLETE` record instead of spawning continuation work
indefinitely. Completion still requires fresh final CoE verification.

Accepted-attempt identity is derived from the frozen contract and charter
revisions, role, and exclusive output set. Changing a caller-selected task name
or deleting a receipt therefore cannot replenish the budget. A genuine
contract revision creates a new work identity. Launch authorization checks the
run state both before and when consuming its one-use grant, so terminal runs
cannot start more specialists.

## Bundled Codex MCP and browser

Codex starts the bundled MCP automatically from `.mcp.json` with the Node.js runtime included with Codex. The launcher checks Codex-provided runtime paths before falling back to a compatible `node` already on `PATH`; the user does not install Node or another package. The server speaks MCP over stdio and opens an HTTP server on a random `127.0.0.1` port.

The browser provides the complete seven-step intake, direct project-local file upload, editable study-plan review, and interactive study flowchart. Drafts live under `.scientist1/intake/` in the active project. The monitor reads `run.json`, receipts, role launches, and delivery files from the selected run. A random token protects its local API, and paths are canonicalized and constrained to the active project or selected run.

The publisher operates no remote Scientist1 service. Any Codex surface that cannot start the bundled MCP or show the built-in browser uses the text intake. There is no application database, object store, queue, telemetry service, update service, or plugin-owned model API.

The live monitor may reuse a recent integrity result only to render an
unchanged in-progress checkpoint. Final delivery and task stopping always run
a fresh verifier; cached UI state is never completion authority.

## Local study runtime

Codex creates `scientist1-runs/<timestamp>-<slug>/` in the researcher's project. Files carry authority between roles. A run can contain:

- `contract/` for the approved plan, input hashes, evaluator, declarative I1 policy, and frozen common interpreter;
- `investigation/` and `discovery/` for literature and candidate directions;
- `candidates/` and `evaluation/` for implementation and canonical measurement;
- `private/` for evaluator-only inputs and raw audit output;
- `evidence/`, `audit/`, and `delivery/` for provenance and review files.

## Declarative, frozen I1 verification

The I1 score check changes with the task.

1. A fresh result-blind I1 policy author reads the approved evaluation contract before candidate work.
2. It writes a task-specific declarative policy that binds the release-tested run-local interpreter and exact evaluator interface.
3. A contract auditor checks the policy, supported semantics, and hashes against a closed essential checklist.
4. Candidate roles build methods without access to evaluator-only inputs.
5. A fresh score auditor independently reruns the evaluator, then applies the frozen policy and interpreter to the selected result and paper.

The policy author may choose a supported exact or statistical check. It must
declare the quantity being estimated, comparison design, uncertainty method,
bounds, hardware conditions, and failure rules before results. Audit variance
cannot widen the tolerance. A policy repair creates a new contract revision in
the same run. Before results, the auditor must enumerate all blockers in one
pass and a re-audit may only check those findings plus defects introduced by
the repair itself; optional hardening cannot create work and no downstream
repair wave is consumed. If results already exist, Scientist1 archives and
reruns every affected successor under the repaired contract and consumes the
frozen result-aware repair wave. Unsupported semantics close `INCOMPLETE` only
when no faithful executable contract exists or the post-result repair path is
exhausted; they are never approximated with an easier generic rule.

## Role separation

Native Codex subagents receive one role card plus a hash-bound task brief with
the objective, relevant upstream summary, acceptance gate, constraints,
declared inputs/outputs, and allowed source classes. They save compact handoffs
and receipts. This makes access and decisions reviewable. It does not create a
process sandbox. Projects with stronger secrecy needs must provide outside
isolation.

The lead schedules those roles from a dependency-ready queue. Independent
evidence readers, candidate branches, ablation variants, and final auditors
can run concurrently, while evaluator resources and causal dependencies remain
barriers. Every reusable role result is bound to the exact contract revision,
predecessor, role contract, assignment, task brief, routing record, and
input/output hashes. This lets
an interrupted study reuse valid independent work without treating an old
sample as a new repetition or weakening any scientific gate.

The run persists this graph in `environment/task-ledger.json`; the bundled
deterministic scheduler uses a bounded least-constraining scan for each ready
wave and rejects cycles, overlapping lifetime outputs, capacity above 16, and
shared-resource overcommit. Optional
read-only preflight can diagnose a phase; the failure-atomic checkpoint command
is the sole authority that promotes it.

Checkpoint revalidates the candidate receipt and every bound input/output
immediately before atomically advancing `run.json`. Invalidation first archives
the entire affected chain. If a downstream or result-aware gate has exhausted
the frozen repair budget,
the same transaction records the exact gate and a verifiable terminal
`INCOMPLETE` state rather than attempting another repair.

An existing run created by 1.2 remains bound to its saved 1.2 contracts and is
verified by one narrow compatibility controller derived from the released 1.2
verifier, alongside the exact released role and model-policy assets. It is not
migrated or silently reinterpreted. New runs never enter that path and use only
1.3.

Codex model catalogs can change between sessions. If the active semantic route
disappears, Scientist1 preserves the original record and activates a currently
available content-addressed route for future launches. This execution-routing change
does not revise the scientific contract or invalidate a valid completed role
receipt. Result-aware scientific-contract changes still archive and rerun every
affected successor.
