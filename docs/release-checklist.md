# Public repository checklist

Use this checklist before making the repository public or publishing a new
marketplace version.

## Marketplace and plugin

- [ ] `.agents/plugins/marketplace.json` parses and exposes `scientist1@scientist1`
- [ ] The catalog source resolves to `plugins/scientist1/`
- [ ] The plugin manifest has one semantic version shared by the MCP server and package metadata
- [ ] The manifest declares exactly three skills and one bundled MCP; Codex
      discovers the lifecycle hook from the default `hooks/hooks.json` path
- [ ] A fresh install reviews and trusts the Scientist1 hook through `/hooks`,
      then proves an accepted launch creates its immutable attempt record
- [ ] Identity, URLs, permissions, descriptions, and logos are current
- [ ] `npm run package:plugin` succeeds and the result matches `docs/plugin-bundle.md`
- [ ] The generated bundle contains no tests, caches, development files, secrets, run output, or registered app mapping
- [ ] A fresh Codex profile can add the repository marketplace and install `scientist1@scientist1`
- [ ] The opt-in capacity preflight preserves unrelated config, backs up and
      validates atomically, enforces one restart, and never reprompts after a
      decline or managed result

## Bundled Codex MCP

- [ ] Fresh install starts the stdio MCP without a user-installed runtime
- [ ] Local browser binds only to `127.0.0.1` with a random token
- [ ] Seven-step intake, large file upload, editable plan review, and same-tab transition to the live flowchart all pass
- [ ] Uploaded files land only under the active project's `.scientist1/intake/` tree and match recorded hashes
- [ ] Monitor reads verified local run files and supports pan, zoom, fit, stage selection, specialist details, and live refresh
- [ ] A surface that cannot start the MCP or show the built-in browser uses the text setup without claiming browser support
- [ ] macOS, Windows, and clean-profile launcher paths are tested or explicitly marked unverified

## Repository

- [ ] `npm test` and `npm run audit:release` pass from a clean checkout
- [ ] Secret, personal-path, private-URL, and stale-language scans pass
- [ ] License, notices, attribution, citation, privacy, terms, security, and support files are reviewed
- [ ] Every README link and image resolves
- [ ] Branch protection, dependency updates, and private security reports are configured
- [ ] The owner has reviewed GitHub's private-to-public warning and the complete tracked file list
- [ ] The marketplace install is repeated from the public GitHub source after visibility changes
