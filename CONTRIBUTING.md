# Contributing

Contributions are welcome when they make the workflow clearer, safer, easier to reproduce, or easier to audit.

## Before changing behavior

Open an issue before changing the scientific contract, role separation, privacy rules, verdicts, or permissions. Name the failure and show evidence for the proposed rule. A convenience change must not weaken frozen evaluation, evaluator isolation, or claim provenance.

## Local checks

Use Node.js 24 and npm 10 or newer.

```bash
npm ci
npm test
npm run audit:release
```

Tests must run without outside network access. Add fixtures for valid, boundary, malformed, missing, and adversarial input when they matter.

## Pull requests

Keep changes focused. Describe the user effect, privacy or permission change, tests run, and each new dependency or network call. Update the architecture, privacy, marketplace, bundle, and release-test documents when their facts change.

Do not commit datasets, restricted papers, credentials, local paths, run output, caches, generated secrets, or screenshots that show research content.

By contributing, you agree that your work uses Apache-2.0 and that you have the right to submit it.
