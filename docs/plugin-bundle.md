# Plugin bundle

The repository marketplace catalog points Codex to `plugins/scientist1/`.
That directory is the installable Scientist1 plugin.

Maintainers can run `npm run package:plugin` to copy the same installable files
into `dist/scientist1/` from an explicit allowlist. The generated directory is
used for release verification; users install from the repository marketplace.

## Included

```text
.codex-plugin/plugin.json
.mcp.json
ATTRIBUTIONS.md
LICENSE
NOTICE
THIRD_PARTY_NOTICES.md
assets/logo.svg
assets/logo.png
hooks/enforce-role-launch.mjs
hooks/hooks.json
licenses/NEWSREADER-LICENSE
licenses/PHOSPHOR-LICENSE
mcp/model-routing.mjs
mcp/server.mjs
mcp/ui/app.css
mcp/ui/app.js
mcp/ui/index.html
mcp/ui/newsreader-latin-600-normal.woff2
scripts/launch-scientist1-mcp
scripts/launch-scientist1-mcp.cmd
skills/scientist1/SKILL.md
skills/scientist1/agents/openai.yaml
skills/scientist1/assets/logo.svg
skills/scientist1/references/artifacts.md
skills/scientist1/references/doctrine.md
skills/scientist1/references/i1-verification-policy.schema.json
skills/scientist1/references/i1-verification.md
skills/scientist1/references/intake.md
skills/scientist1/references/legacy-model-policy-1.2.0.json
skills/scientist1/references/legacy-roles-1.2.0.md
skills/scientist1/references/model-policy.json
skills/scientist1/references/protocol.md
skills/scientist1/references/roles.md
skills/scientist1/scripts/capacity-preflight.mjs
skills/scientist1/scripts/coe.mjs
skills/scientist1/scripts/i1-interpreter.mjs
skills/scientist1/scripts/legacy-coe-1.2.0.mjs
skills/scientist1/scripts/scheduler.mjs
skills/scientist1-monitor/SKILL.md
skills/scientist1-monitor/agents/openai.yaml
skills/scientist1-monitor/assets/logo.svg
skills/scientist1-results/SKILL.md
skills/scientist1-results/agents/openai.yaml
skills/scientist1-results/assets/logo.svg
```

The manifest points to three packaged skills and the bundled local MCP. Codex
discovers the launch-authorization hook from the default `hooks/hooks.json`
path; the manifest does not override it. It contains no registered app mapping. The root PNG is the
marketplace icon. Each skill carries the centered blue-and-green S1 SVG named
by its metadata.

## Repository-only files

The repository also contains its marketplace catalog, README, policy and
contributor documents, explanatory images, tests, CI configuration,
package-manager metadata, and maintainer scripts. Those files support discovery,
development, and verification but are not part of the installed plugin bundle.

Repository-only tests live under `test/scientist1/`, outside the marketplace
source. The packaging script compares every source file to the exact allowlist
before copying, so an ignored or newly added file cannot enter an install by
accident. It excludes tests, caches, secrets, local run output, development
tools, and `.DS_Store`. A narrow compatibility controller derived from the
released 1.2 verifier is bundled only so in-progress 1.2 runs remain verifiable
without rewriting their frozen scientific contract. The exact released role
contract and model policy are also bundled so genuine in-progress 1.2 runs can
launch remaining specialists without being reinterpreted by 1.3; every new run
uses the 1.3 control plane.
