# OpenAI submission materials

These are the reviewed fields and files for an owner-controlled submission. Preparing them does not create a draft, submit for review, or publish the plugin.

## Package shape

- Three skills
- One MCP distributed inside the plugin through `.mcp.json`
- One Codex lifecycle hook
- No registered app connection
- Primary surface: Codex desktop

[OpenAI's packaging documentation](https://developers.openai.com/plugins/build/plugins) explicitly supports an MCP distributed with a plugin through `.mcp.json`. Its [public submission documentation](https://developers.openai.com/plugins/deploy/submission), however, currently says the form collects MCP server details and scans the submitted server. It does not document how to submit a bundled local stdio MCP. Confirm that path with OpenAI before public submission. Do not add a remote connection merely to satisfy an undocumented assumption; that would change the tested architecture and privacy model.

## Listing

- Name: **ScientistOne**
- Developer identity: **Adam H. Awad**
- Category: **Scientific Research**
- Short description: **Turn a question into a checked research study**
- Logo: `plugins/scientistone/assets/logo.png` (256 by 256 PNG)
- Website: `https://github.com/AdamHAwad/scientistone-codex-plugin`
- Support: `https://github.com/AdamHAwad/scientistone-codex-plugin/blob/main/SUPPORT.md`
- Privacy: `https://github.com/AdamHAwad/scientistone-codex-plugin/blob/main/PRIVACY.md`
- Terms: `https://github.com/AdamHAwad/scientistone-codex-plugin/blob/main/TERMS.md`

### Long description

ScientistOne helps you turn a research question into a full study in Codex. You explain what you want to find out and approve the plan. Then nine teams of AI agents read the relevant research, test competing ideas with code, compare the results, and write a paper. Before the study can finish, ScientistOne checks that the numbers in the paper match the saved test results. It also checks that each important claim points to a source or saved result that supports it. If a check fails, the study returns to the step that needs fixing. You receive the paper with its sources, code, results, and check reports, so you can see how it reached its conclusions.

## Starter prompts

1. `ScientistOne, help me plan a study.`
2. `Resume my latest ScientistOne run.`
3. `Audit this research bundle with ScientistOne.`

## Release notes

> Initial ScientistOne release for Codex. The plugin includes a seven-step intake, direct project-local uploads, editable plan review, and an interactive live study flowchart. It then guides a researcher through literature review, competing implementations, task-specific coded evaluation, paper writing, and four integrity checks. All ScientistOne workflow state remains in the researcher's local project.

## Owner-only portal steps

The owner completes identity selection, country availability, domain verification, policy attestations, submission for review, and publication. No automation in this repository performs those actions.
