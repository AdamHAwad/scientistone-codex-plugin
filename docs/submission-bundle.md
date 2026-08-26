# Submission bundle

`npm run package:plugin` builds `dist/scientistone/` from an allowlist. This is the exact plugin package used for clean-install testing and repository distribution.

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

The manifest points to the three packaged skills, the bundled MCP, and the lifecycle hook. It contains no registered app mapping. Codex desktop uses the MCP for the complete local browser and monitor.

The root PNG is the directory-listing icon. Each skill carries the same blue-and-green S1 SVG in its own `assets/` directory, as required by the skill metadata paths.

## Excluded

The bundle excludes repository README and policy pages, contributor files, CI, tests, review screenshots, explanatory README images, package-manager metadata, packaging scripts, caches, local run output, development tools, `.DS_Store`, and all retired compatibility code.

Do not use GitHub's automatic source ZIP as the install bundle. It contains repository-only files that are not part of the plugin. Use the allowlisted package generated under `dist/scientistone/`.
