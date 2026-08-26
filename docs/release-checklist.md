# Public release checklist

## Plugin package

- [ ] Stable semantic version in every manifest
- [ ] Manifest declares exactly three skills, one bundled MCP, and one lifecycle hook
- [ ] Identity, URLs, permissions, logo, and listing copy reviewed
- [ ] Plugin archive built from the allowlist
- [ ] Archive contains the complete bundled MCP and no tests, caches, development-only files, secrets, or registered app mapping
- [ ] Archive contents match `docs/submission-bundle.md`
- [ ] Fresh-profile install and bare invocation pass

## Bundled Codex MCP

- [ ] Fresh install starts the stdio MCP without a user-installed runtime
- [ ] Local browser binds only to `127.0.0.1` with a random token
- [ ] Seven-step intake, large file upload, editable plan review, and same-tab transition to the live flowchart all pass
- [ ] Uploaded files land only under the active project's `.scientistone/intake/` tree and match recorded hashes
- [ ] Monitor reads verified local run files and supports pan, zoom, fit, team selection, specialist details, and live refresh
- [ ] CLI and IDE text-only compatibility intake works without claiming browser support
- [ ] macOS, Windows, and clean-profile launcher paths are tested or explicitly marked unverified

## OpenAI submission

- [ ] No submission, review request, or publication occurs until the owner explicitly does it in the Platform portal
- [ ] OpenAI confirms that the public submission path accepts a Codex-specific bundled `.mcp.json` server; current public docs describe bundled MCP packaging but ask for server details during public submission
- [ ] Listing copy matches the packaged manifest; upload `assets/logo.png` as the listing logo
- [ ] Publisher identity verified
- [ ] Website, support, privacy, and terms URLs are public and match the publisher
- [ ] Positive, negative, privacy, and clean-machine test cases pass
- [ ] Tool annotations and descriptions reviewed
- [ ] OpenAI review completed

## Repository

- [ ] Secret and personal-path scans pass on the full Git history
- [ ] License, notices, attribution, and citation files reviewed
- [ ] Tests pass from a clean checkout
- [ ] Branch protection, dependency updates, and private security reports enabled
- [ ] Maintainer reviewed GitHub's private-to-public history warning
