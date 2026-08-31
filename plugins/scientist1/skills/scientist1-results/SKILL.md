---
name: scientist1-results
description: Interpret a Scientist1 run only after its final state and delivery artifacts verify as complete. Use for findings, evidence, limitations, and audit results.
---

# Scientist1 results

This skill interprets an existing evidence chain. It does not improve the result, rerun analysis, fill missing evidence, or strengthen conclusions. Resolve and verify the completed local run, then explain it in chat and link its saved files.

This file contains the complete interpretation algorithm. Do not preload the
full doctrine, artifact catalog, or protocol. After verification, read only the
approved plan and the audit/delivery evidence listed below.

## Find and verify the run

Resolve the run exactly as in `scientist1-monitor`. If no matching run exists, state that no Scientist1 run was found and ask for an absolute run path or offer to begin planning a new study. Ask which run only when several active runs are equally plausible. Do not inspect a legacy `runs/` directory as a native Scientist1 run.

1. Read `run.json` and require `state: complete` and `phase: complete`. Read `environment/bootstrap.json`. Resolve only paths recorded by that run.
2. Run the bundled CoE chain verifier with the recorded Node runtime:

```sh
<recorded-node-path> <scientist1-skill-root>/scripts/coe.mjs verify <absolute-run-path>
```

A nonzero result blocks completed interpretation.

Do not install a runtime while interpreting results. The run's task-specific I1
policy and common interpreter are verified evidence inside this chain; there is
no task-local replacement verifier to discover or rebuild.

3. For `mode: research`, require valid contract-through-complete receipts and these manifest-verified outputs:
   - the final paper source and every rendered format required by the approved plan;
   - provenance and claim-verification artifacts;
   - selected method/code or protocol and canonical evaluation;
   - ablation report;
   - I1-I4 and claim-provenance audit;
   - reproduction instructions and delivered manifest, plus a visual-inspection record when the approved deliverables include a rendered document.
4. For `mode: external_audit`, require the contract/audit/complete chain, source-bundle manifest, supported individual and aggregate audit reports, reproduction instructions, and delivered manifest. Treat missing checks as `NOT_ASSESSED`; do not require a PDF or LaTeX unless the frozen audit contract required it.
5. If any required item is missing or invalid, state "the run produced partial artifacts but has not passed delivery verification," identify the first failed gate, and do not present it as a completed Scientist1 result.

## Evidence hierarchy

For research mode, use only:

1. the approved `study-plan.md` for the question and interpretation rule;
2. canonical evaluation and declared ablations for measured findings;
3. final provenance and verification artifacts for claim support;
4. `audit/report.md` and individual audit reports for integrity;
5. the manifest for exact deliverable identity.

The paper summarizes the evidence. When it conflicts with an underlying artifact, use the underlying artifact. Do not use producer transcripts or superseded artifacts.

For external-audit mode, use only the approved audit contract, source-bundle manifest, supported audit reports, and final delivered manifest.

## Researcher-facing handoff

For research mode, lead with the direct answer to the approved question. Then cover:

- the primary measured result and comparison;
- whether the result is positive, scientific null, or completed with limitations;
- uncertainty, negative findings, failed approaches, and the most consequential limitation;
- I1 score, I2 specification, I3 reference, I4 alignment, and claim-provenance verdicts in plain language;
- which conclusions are supported and which are not;
- links to the available final paper formats, selected method or protocol, audit report, and evidence manifest.

For external-audit mode, lead with whether the supplied bundle passed each assessable integrity check, what could not be assessed, and which exact source artifacts were audited. Do not present it as a new Scientist1 research finding.

Use the researcher's domain language. Define the primary metric and its direction. Separate statistical or measurement uncertainty from limitations of the system and study design. Never imply causality, generality, safety, or external validity beyond the study plan and evidence.

Use this structure:

```text
Answer
<one paragraph>

Evidence
<primary result, comparison, uncertainty, ablations>

Integrity and limits
<audit verdicts, negative evidence, boundary>

Files
<available paper formats, method/protocol, audit, manifest>
```

## Audit interpretation

- I1 FAIL: the reported score, fresh reproduction, or claim meaning does not match the frozen evidence. Do not trust the affected claim until the responsible phase is repaired.
- I1 FAIL: the frozen check could not establish reproducibility within its declared bounds. Report the uncertainty and do not treat the score as verified.
- I2 flagged: the selected method may violate the task or exploit evaluation; do not endorse performance.
- I3 mismatch: identify affected claims; verified references elsewhere do not excuse it.
- I4 mismatch: the paper does not faithfully describe the selected artifact; distinguish a writing defect from a broken method.
- Low claim provenance: name unsupported claim IDs and do not repeat their values as findings.
- Missing audit input: report `NOT_ASSESSED`, never PASS.

If a blocking audit exists but `run.json` says complete, treat the status as inconsistent and return to the earliest responsible phase through `scientist1`.

## Follow-up studies

A request that requires new calculations, a different outcome, another dataset, changed constraints, or a new evaluator is a follow-up study. Preserve the completed run and hand off to `scientist1` to create a new contract.

## Before ending a turn

1. Confirm that `run.json` has `state: complete` and `phase: complete`.
2. Confirm that `verify` passed.
3. Trace every reported study number to the canonical evaluation or an approved ablation.
4. Do not report unsupported, missing, or `NOT_ASSESSED` checks as passed.
5. In external-audit mode, describe the supplied bundle and audit status, not a new research finding.
6. Link the available paper formats, method or protocol, audit report, and manifest.
7. If the researcher asks a new scientific question, hand off to `scientist1` for a new contract.

Ask for clarification only when the run is ambiguous or the requested interpretation would change the study.
