# ScientistOne for Codex

![A researcher directs several AI research roles toward a checked evidence bundle](docs/images/scientistone-for-codex-hero.png)

ScientistOne helps you turn a research question into a full study in Codex. You explain what you want to find out and approve the plan. Then nine teams of AI agents read the relevant research, test competing ideas with code, compare the results, and write a paper. Before the study can finish, ScientistOne checks that the numbers in the paper match the saved test results. It also checks that each important claim points to a source or saved result that supports it. If a check fails, the study returns to the step that needs fixing. You receive the paper with its sources, code, results, and check reports, so you can see how it reached its conclusions.

The design comes from the [ScientistOne research paper](https://arxiv.org/abs/2605.26340) and its Chain-of-Evidence method. This repository is an independent Codex adaptation. Google and the paper's authors do not make or endorse this plugin. The paper's benchmark results do not describe this implementation.

> This repository is a release candidate. No public submission or publication has occurred.

## Why this exists

AI can search papers, write code, compare methods, and explain results. It can also use the wrong data, change a test after seeing the answer, cite a paper it did not read, or write a claim that the saved results do not support.

ScientistOne treats those risks as problems in the research process. The researcher approves the question and evaluation before work starts. Fresh agents get separate jobs. The protocol forbids candidate builders from using hidden answers and records declared access for review. Important claims point back to source records, code, measurements, and receipts.

The result is still AI-assisted research. It still needs human judgment. What changes is that a reviewer has files to inspect instead of a polished answer with no trail behind it.

Regular Codex is a capable general agent. ScientistOne adds a research protocol.

| Regular Codex task | ScientistOne study |
| --- | --- |
| The task may change in conversation. | The researcher approves a written study contract. |
| One context may plan, build, and judge. | Fresh roles split discovery, implementation, evaluation, and audit. |
| Evidence may stay in chat. | Claims point to saved sources, measurements, code, and receipts. |
| Checks may be chosen as work unfolds. | Evaluation and score checks are frozen before candidate results exist. |
| The final answer is the main artifact. | The project keeps code or a protocol, a paper, evidence, and an integrity audit. |

## What Codex adds

Codex gives the workflow a local project, a terminal, file tools, web research, and native subagents. ScientistOne uses those tools. It does not ship a second agent runtime.

The lead agent coordinates the study. Each specialist gets declared inputs, outputs, and source permissions. Specialists write files for the next role to inspect. Chat is not the source of truth.

This matters most for score verification. No single formula can cover a near-zero metric, a paired trial, a hardware benchmark, and a study with several outcomes. A fresh verifier-builder agent writes code and fixtures for the approved task. Then ScientistOne hashes and freezes the policy, code, runtime, inputs, and tolerances before any candidate result exists. A separate auditor later runs that exact verifier.

The agents can adapt the code to the science. They cannot adapt the test to a result they have already seen. If the frozen verifier did not plan for a result type, the contract must restart.

![Nine research teams move an approved question toward a checked study](docs/images/from-question-to-completed-study.png)

## How a study moves

1. The researcher states the question, inputs, main outcome, limits, and what a negative result would mean.
2. A contract auditor checks that the written plan matches the request and can answer the question.
3. Literature roles search, read, and save source records before proposing directions.
4. Independent roles test several directions and keep failed work as evidence.
5. A separate evaluator applies the frozen protocol. Candidate role instructions forbid access to held-out answers and private checks, and receipts record declared access.
6. Four integrity audits check reported scores, method and result claims, references, and evidence coverage.
7. The study ends only after its declared files and final verifier pass.

![A reported result is checked against the selected code, evaluator, paper, and saved evidence](docs/images/how-a-result-is-checked.png)

## Chain of Evidence

A Chain of Evidence links a statement to what supports it. A number in the paper may point to an evaluator record and the selected code snapshot. A method claim may point to source code and an experiment receipt. A literature claim may point to an exact passage in a saved source record.

That chain does not make a claim true. It makes the support visible. A reviewer can see where the claim came from, which step is missing, and what must be rerun.

## Privacy model

In Codex desktop, ScientistOne uses one MCP bundled with the plugin. It binds to `127.0.0.1`, opens the full browser workflow, and writes intake files only inside the active project. The same local page becomes the interactive study flowchart after approval. It reads progress from saved run files; it does not send questions, files, paths, citations, results, or study state to a ScientistOne server.

The publisher operates no ScientistOne backend. Read [Data flow and privacy](docs/data-flow-and-privacy.md) and [Privacy](PRIVACY.md) for the full record.

## Install and start

OpenAI uses one public Plugin Directory for ChatGPT and Codex, but individual capabilities can be surface-specific. The full ScientistOne workflow needs Codex project files, a terminal, native subagents, and the bundled local MCP. On a host that does not provide those tools, the skill can explain the workflow but must not claim that it started a study.

After directory approval:

1. Open the Plugin Directory in Codex.
2. Select **ScientistOne** and click **Install**.
3. Open a fresh Codex task in the project where the study should live.
4. Say `ScientistOne, help me plan a study.`

ScientistOne opens its full-page setup wizard in Codex's built-in browser. Complete the wizard there. The page then shows the editable study plan and, after approval, changes into the live interactive flowchart. Codex CLI and the IDE extension do not have the built-in browser, so those surfaces use a text-only compatibility intake.

Directory users do not need to install a package, runtime, CLI, database, browser extension, or companion app. A study may later need its own tool, such as a Python library named by the approved method. Codex may install the smallest compatible project-local dependency through its normal permission flow. That dependency belongs to the study, not to plugin installation.

## What a study saves

A completed study may include the exact request, approved plan, source records, search logs, candidate code, experiment records, the selected method, a canonical evaluation, a paper, claim provenance, an I1 to I4 integrity audit, and a reproduction guide.

The exact files depend on the approved task and available tools. A PDF needs a compatible TeX compiler. A hardware claim needs the declared hardware. ScientistOne does not promise a positive result, a complete literature record, or the performance reported in the original paper. It records null results and limits instead of hiding them.

## Security boundary

Fresh subagent contexts reduce carryover from earlier conversation. They are not operating-system sandboxes. Roles may share the same project filesystem. Path rules, hashes, and receipts make that access easier to audit, but they cannot protect a secret from a malicious process with the same filesystem rights.

Do not use this workflow as the only control for regulated data, credentials, dangerous wet-lab work, clinical decisions, or untrusted code. Use an isolated environment and qualified human review when the field requires them.

Read [Architecture](docs/architecture.md), [Permissions](docs/permissions.md), and [Security](SECURITY.md) before using ScientistOne with sensitive work.

## Repository map

```text
plugins/scientistone/   Installable plugin bundle
docs/                   Architecture, privacy, permissions, and release notes
scripts/                Packaging and hygiene checks
```

The release script builds the plugin from an allowlist. It includes the complete bundled local MCP, browser interface, skills, hooks, launchers, licenses, and brand assets. It leaves out development tests, caches, secrets, and run output. [Submission bundle](docs/submission-bundle.md) lists every included path and the main exclusions.

The release archive is built from an allowlist and tested through a clean local marketplace install. Maintainers should use the reviewed [submission materials](docs/submission-materials.md), not GitHub's automatic source ZIP.

## Development

Contributors need Node.js 24 and npm 10 or newer.

```bash
npm ci
npm test
npm run audit:release
```

Tests use local fixtures and do not need network access. Read [Contributing](CONTRIBUTING.md) before changing the research contract or privacy model.

## Research origin and citation

ScientistOne and Chain of Evidence were proposed in:

> Meng et al. *ScientistOne: Towards Human-Level Autonomous Research via Chain-of-Evidence.* arXiv:2605.26340, 2026.

Use [CITATION.cff](CITATION.cff) for machine-readable citation details. [ATTRIBUTIONS.md](ATTRIBUTIONS.md) identifies paper-derived text and figures. This Codex version is an adaptation and needs its own evaluation.

## License and policies

Code uses the [Apache License 2.0](LICENSE). Some documents and images have separate terms in [ATTRIBUTIONS.md](ATTRIBUTIONS.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- [Privacy](PRIVACY.md)
- [Terms](TERMS.md)
- [Security](SECURITY.md)
- [Support](SUPPORT.md)
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
