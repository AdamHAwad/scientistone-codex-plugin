# Runtime and network dependencies

## Plugin installation

The installed bundle contains the three skills, references, schemas, validator source, local MCP, browser UI, launchers, hook, licenses, notices, and logos. Codex starts the MCP automatically through `.mcp.json`.

The launcher first uses the Node.js runtime path supplied by Codex, then a compatible `node` already available to Codex. Directory users do not separately install a package, runtime, CLI, browser extension, database, service, or companion app.

The full workflow needs a Codex surface with a writable project, terminal commands, native subagents, and the built-in browser. A surface without those capabilities must give a clear compatibility message and must not claim that a study started.

## Bundled MCP

The MCP is implemented with Node.js standard-library modules and has no npm runtime dependencies. It communicates with Codex over stdio, binds a browser server to a random `127.0.0.1` port, and reads or writes only the active project's intake and run files.

The browser UI bundles its HTML, CSS, JavaScript, logo, icon data, and font. It has no remote image, font, frame, media, analytics, beacon, WebSocket, or upload destination.

The optional model-routing tool may execute the Codex CLI already supplied by Codex to read the local model catalog. The update tool uses that same Codex CLI to refresh the Git marketplace that supplied the running plugin. Codex handles the marketplace source, Git access, and installed cache; ScientistOne does not download files or edit Codex configuration itself. Neither tool contacts a ScientistOne service.

## Study dependencies

A research method may need a package, compiler, dataset, or system capability named by the approved study. Codex must install the smallest compatible dependency inside the project or run through its normal permission flow, or record that the method cannot run. These are study dependencies, not plugin installation dependencies.

Codex may contact OpenAI services and sources approved by the study. Those calls run through Codex or project tools under the researcher's settings.
