# Runtime and network dependencies

## Plugin installation

The installed bundle contains the three skills, references, schemas, validator source, local MCP, browser UI, launchers, hook, licenses, notices, and logos. Codex starts the MCP automatically through `.mcp.json`.

The launcher first uses the Node.js runtime path supplied by Codex, then a compatible `node` already available to Codex. Directory users do not separately install a package, runtime, CLI, browser extension, database, service, or companion app.

The full workflow needs a Codex surface with a writable project, terminal commands, native subagents, and the built-in browser. A surface without those capabilities must give a clear compatibility message and must not claim that a study started.

## Bundled MCP

The MCP is implemented with Node.js standard-library modules and has no npm
runtime dependencies. It communicates with Codex over stdio and binds a browser
server to a random `127.0.0.1` port. Study content is read or written only in
the active project. Before intake, its fixed-purpose capacity tools may use
Codex App Server's local configuration API and write only the documented
backup and preference files after explicit opt-in.

The browser UI bundles its HTML, CSS, JavaScript, logo, icon data, and font. It has no remote image, font, frame, media, analytics, beacon, WebSocket, or upload destination.

The optional model-routing tool may execute the Codex CLI already supplied by
Codex to read the local model catalog. The capacity preflight uses that same
bundled CLI's App Server `config/read` and versioned `config/batchWrite`
methods. Neither contacts a Scientist1 service.

## Study dependencies

A research method may need a package, compiler, dataset, or system capability named by the approved study. Scientist1 uses the smallest compatible existing or project-local dependency covered by the approved plan. If that exact path is unavailable or would require authority outside the plan, it chooses a safe in-scope alternative and carries the limitation into the paper instead of pausing for another study approval. These are study dependencies, not plugin installation dependencies.

Codex may contact OpenAI services and sources approved by the study. Those calls run through Codex or project tools under the researcher's settings.
