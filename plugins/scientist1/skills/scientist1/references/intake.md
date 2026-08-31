# Researcher-facing intake

## Aim

Turn the researcher's setup into a study plan that states the question, inputs, evaluation, limits, stopping rules, and limits on interpretation. Do not choose a method that the researcher required or banned.

## Privacy and setup rules

- In Codex desktop, call the bundled `start_study_setup` tool with the active project root and open its returned URL in the built-in browser. Do not use an inline MCP form or a remote setup page.
- The local browser and MCP keep draft text, uploaded files, approvals, and monitor state inside the active project. They bind only to loopback, and this content is never sent to a remote Scientist1 service.
- After `wait_for_researcher` returns, read the saved draft with `read_study_setup`. For every upload, resolve `stored_path` beneath `.scientist1/intake/<draft-id>/`, reject symbolic links or escapes, verify byte size and SHA-256, and treat that project-local copy as intake material. This staging step is not approval to start the study or create a run.
- `wait_for_researcher` waits for up to one hour. The browser saves the current wizard step, answers, plan edits, and pending change note locally while the researcher works. If the tool returns a saved timeout, close the same built-in browser tab, relay its researcher-facing message, and end the turn without polling or advancing the study. Resume the latest draft through `start_study_setup` only after the researcher asks to continue.
- Only when the current surface lacks the built-in browser or site tools, ask the same setup question in chat. Do not make the researcher fix the MCP.
- Ask for project-relative paths. Do not ask for secrets, credentials, absolute paths, provider tokens, or model choices.
- A file uploaded in the Scientist1 browser is copied over loopback into the active project. No remote Scientist1 service receives it.
- Do not copy a selected file into a run until the researcher approves the plan.
- Never infer consent to publish, use paid services, accept a license, export data, make a destructive change, or access unrelated files.

## Request fidelity

Keep the researcher's exact request beside the normalized plan. Only the research question is required in the browser. Blank purpose, prior-work, evaluation, limit, or deliverable fields are valid intake, not an error. Infer useful defaults from the question, approved files, and allowed project context, show those defaults in the editable plan, and let the researcher approve or change them before work begins.

The approved question, named inputs, constraints, exclusions, data boundaries, and limits on interpretation form the researcher charter. The outcome operationalization, evaluator, declarative I1 policy, schemas, hashes, paths, seeds, method details, and other scientific implementation choices form a versioned execution contract. Selecting `Approve and start study` grants durable authorization for safe, reversible, in-scope execution, but not unbounded retries or speculative engineering. Each logical specialist task has at most two accepted launch attempts. Downstream gates and result-aware contract changes have at most one automatic repair wave. Before candidate evidence exists, contract stabilization may apply as many minimal result-blind corrections as the closed checklist actually requires; it does not consume that downstream repair budget. Exhaustion of a post-result or downstream path becomes a truthful, terminal `INCOMPLETE` record. Corrected work after exhaustion starts in a new run that references that record. If a direct repair would exceed a fixed charter boundary, preserve the boundary, choose the strongest safe in-scope fallback, and disclose the limitation in the paper. Record an amendment only when the researcher independently supplies one.

## Minimum study contract

Resolve these items from the intake and named project files:

1. The question the study must answer.
2. The decision or scientific reason that makes the answer useful.
3. The main measurement or evidence test.
4. The comparison, unit of analysis, data split, repetitions, uncertainty method, decision rule, and treatment of failed or missing observations.
5. The datasets, images, papers, code, notes, instruments, and allowed outside sources.
6. Which inputs are shared and which are evaluator-only.
7. Required and forbidden methods.
8. Compute, time, ethics, safety, license, privacy, and domain limits.
9. The search profile and hard ceilings.
10. Any required interpretation limits; Scientist1 handles null findings and failed checks autonomously within the approved study.

If the main outcome is missing, propose one measurable outcome, comparison, and decision rule. Explain why it answers the question. Include it in the ordinary plan review; do not treat the missing intake field as a blocker.

## Search and stopping rules

The plan needs observable limits:

- a search saturation rule and maximum records screened;
- a reading saturation rule and maximum full texts;
- a target range for research directions, or a field-specific reason for another value;
- a target range for the bibliography, or a documented access limit;
- a maximum number of brief repairs;
- compute and candidate ceilings from the selected profile.

`Until enough evidence exists` is not a stopping rule. Name an event that can be counted, such as no new eligible direction after a fixed number of screened records, and a hard ceiling.

## Project inspection

After intake arrives, inspect only named relative paths and the smallest project files needed to understand them. A README, task description, manifest, or data dictionary may be relevant.

Exclude these unless the researcher names a specific safe file and the study needs it:

- `.env*`, keychains, credential stores, tokens, private keys, and browser profiles;
- `.git`, dependency caches, build caches, old `scientist1-runs`, and system folders;
- symlinks or paths outside the active project;
- unrelated projects or another user's files.

For each chosen input record its relative path, type, purpose, access class, whether it may leave the machine, and SHA-256 after approval. Put held-out answers, answer keys, evaluator code, and private checks in the evaluator-only class.

## Study plan

Publish this full plan to the browser review before creating the run. Use chat only on a surface without the bundled browser MCP:

```markdown
# Study plan

## What I will test
<one plain paragraph>

## Research question
<one answerable question>

## Objective
<decision or scientific reason>

## Evidence and inputs
- <shared input or approved outside source>
- <evaluator-only input, marked PRIVATE>

## Binding requirements
- <required method, population, interface, or exclusion>

## Evaluation plan
- Main outcome:
- Direction or decision rule:
- Comparison or baseline:
- Validation unit and split:
- Repetitions, seeds, and uncertainty:
- Failed or missing observation rule:
- Canonical evaluation command or procedure, if known:

## Investigation limits
- Search stop:
- Reading stop:
- Direction target:
- Bibliography target:
- Brief repair limit:

## Search profile
pilot | standard | custom: <ceilings, minimum valid work, and reason>

## Constraints and safeguards
- <compute, privacy, ethics, license, and safety limits>

## Limits on interpretation
- <scope and generalization limits>

## Deliverables
- paper source and PDF when a compatible compiler is available and requested
- selected method, code, or protocol
- evidence and integrity audit

## Out of scope
- <items>
```

Also preserve the exact request in `request.md`.

## Approval and local freeze

The browser asks: `Is this the study you want?`

Treat the browser's approved state as the study's only approval checkpoint. It authorizes bounded execution and evidence-backed repairs to evaluators, policies, methods, environments, and schemas within the approved boundaries. Treat edits and a submitted change note before approval as a request for one revised full plan. Do not create the run until the researcher approves the complete version. After approval, do not return to plan review for an implementation detail; if a required path is exhausted, record `INCOMPLETE` with the exact restart condition instead of looping or inventing authority.

After approval:

1. Create the run directory.
2. Copy each approved local input once when the plan permits it. Otherwise bind the project-relative path and explain why.
3. Verify copied bytes against SHA-256.
4. Put shared files under `inputs/shared/` and evaluator-only files under `private/`.
5. Record original path, frozen path, hash, access class, purpose, and data-export rule in `contract/input-manifest.json`.
6. Send the contract to a fresh Contract Auditor.

A Contract Auditor PASS confirms request fidelity and a usable evaluation. It does not prove the science. The auditor applies the closed essential checklist once and reports every observable blocker in that pass. Only an invented or contradictory commitment, a missing executable definition required by the approved evaluation, or a deterministic schema/interpreter failure is blocking. Optional hardening, alternative designs, additional precision, and possible future edge cases are nonblocking and create no work. If the contract fails before candidate evidence, preserve it, make the smallest faithful repair, and send only the repair delta plus the same closed checklist to one fresh auditor. A re-audit may add a blocker only when the repair itself introduced a directly evidenced contradiction or invalid machine contract. Repeat this minimal result-blind stabilization only as needed to pass; do not consume a downstream repair wave and do not expand the review toward perfection. Once results exist, the frozen result-aware repair limit applies and exhaustion records `INCOMPLETE`.
