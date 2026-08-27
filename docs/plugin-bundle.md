# Plugin bundle

The repository marketplace catalog points Codex to `plugins/scientistone/`.
That directory is the installable ScientistOne plugin.

Maintainers can run `npm run package:plugin` to copy the same installable files
into `dist/scientistone/` from an explicit allowlist. The generated directory is
used for release verification; users install from the repository marketplace.

## Included

```text
.codex-plugin/plugin.json
.mcp.json
ATTRIBUTIONS.md
DESIGN.md
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
scripts/launch-scientistone-mcp
scripts/launch-scientistone-mcp.cmd
skills/scientistone/SKILL.md
skills/scientistone/agents/openai.yaml
skills/scientistone/assets/logo.svg
skills/scientistone/references/artifacts.md
skills/scientistone/references/doctrine.md
skills/scientistone/references/i1-verification-policy.schema.json
skills/scientistone/references/i1-verification.md
skills/scientistone/references/intake.md
skills/scientistone/references/model-policy.json
skills/scientistone/references/protocol.md
skills/scientistone/references/roles.md
skills/scientistone/scripts/coe.mjs
skills/scientistone-monitor/SKILL.md
skills/scientistone-monitor/agents/openai.yaml
skills/scientistone-monitor/assets/logo.svg
skills/scientistone-results/SKILL.md
skills/scientistone-results/agents/openai.yaml
skills/scientistone-results/assets/logo.svg
```

The manifest points to three packaged skills, the bundled local MCP, and the
lifecycle hook. It contains no registered app mapping. The root PNG is the
marketplace icon. Each skill carries the centered blue-and-green S1 SVG named
by its metadata.

## Repository-only files

The repository also contains its marketplace catalog, README, policy and
contributor documents, explanatory images, tests, CI configuration,
package-manager metadata, and maintainer scripts. Those files support discovery,
development, and verification but are not part of the installed plugin bundle.

The packaging allowlist excludes tests, caches, secrets, local run output,
development tools, `.DS_Store`, and retired compatibility code.
