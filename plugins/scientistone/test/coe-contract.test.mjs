import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installTestRouting, seedI1Audit, seedI1Contract, testRuntime } from "./i1-contract-fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COE = path.join(ROOT, "skills", "scientistone", "scripts", "coe.mjs");
const BUDGETS = { idea_ceiling: 2, minimum_eligible_ideas: 1, candidate_node_ceiling: 1, minimum_evaluated_candidates: 1, evaluation_ceiling_per_node: 1, ablation_ceiling: 1, minimum_valid_ablations: 1, canonical_repetitions: 2, audit_panel_size: 3 };

const run = (...args) => spawnSync(process.execPath, [COE, ...args], { encoding: "utf8" });
function put(root, relative, content = `${relative}\n`) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function json(root, relative, value) { put(root, relative, `${JSON.stringify(value, null, 2)}\n`); }
function read(root, relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function copy(root, source, destination) { const target = path.join(root, destination); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, source), target); }
function hash(root, relative) { const result = run("hash", root, relative); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
function fileHash(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function bootstrap(root, mode, source = "existing") {
  let tools;
  if (source === "portable_official") {
    put(root, "environment/tools/node", "#!/bin/sh\n"); put(root, "environment/tools/latex", "#!/bin/sh\n");
    fs.chmodSync(path.join(root, "environment/tools/node"), 0o755); fs.chmodSync(path.join(root, "environment/tools/latex"), 0o755);
    tools = [
      { name: "node", requirement: ">=20", path: "environment/tools/node", version: "22.0.0", source, source_url: "https://nodejs.org/", sha256: fileHash(path.join(root, "environment/tools/node")), purpose: "scientific_method", verified_at: "2026-08-22T12:00:00Z" },
      { name: "latex", implementation: "tectonic", path: "environment/tools/latex", version: "0.15.0", source, source_url: "https://github.com/tectonic-typesetting/tectonic/", sha256: fileHash(path.join(root, "environment/tools/latex")), purpose: "scientific_method", verified_at: "2026-08-22T12:00:00Z" },
    ];
  } else {
    tools = [{ name: "node", requirement: ">=20", path: process.execPath, version: process.version, source, source_url: null, sha256: null, verified_at: "2026-08-22T12:00:00Z" }];
    if (mode === "research") tools.push({ name: "latex", implementation: "test-latex", path: process.execPath, version: "1.0.0", source, source_url: null, sha256: null, verified_at: "2026-08-22T12:00:00Z" });
    else tools.push({ name: "latex", status: "not_required", reason: "No compilation is planned" });
  }
  json(root, "environment/bootstrap.json", { schema_version: 1, platform: { os: process.platform, architecture: process.arch }, tools });
}
function addField(digest, tag, value) { const data = Buffer.from(String(value)); const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(data.length)); digest.update(tag); digest.update(length); digest.update(data); }
function treeHash(root, files) { const digest = createHash("sha256"); for (const relative of [...files].sort()) { const file = path.join(root, relative); addField(digest, "F", relative); addField(digest, "S", fs.statSync(file).size); digest.update(fs.readFileSync(file)); } return digest.digest("hex"); }
function minimalPdf() {
  const objects = ["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>\nendobj\n", "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n"];
  let pdf = "%PDF-1.4\n"; const offsets = []; for (const object of objects) { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += object; } const xref = Buffer.byteLength(pdf, "latin1"); return `${pdf}xref\n0 5\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

function role(root, { role: name, task = name, inputs = ["study-plan.md"], outputs, allowed_external_sources = [], receipt_allowed_external_sources = allowed_external_sources, external_results_used = [], environment_changes = [], omit_environment_changes = false, execution_status = "COMPLETE", gate_verdict = "PASS", model: modelOverride, reasoning_effort: effortOverride }) {
  const started_at = "2026-08-22T12:00:00Z";
  const runtime = testRuntime(root, name);
  const model = modelOverride ?? runtime.model;
  const reasoning_effort = effortOverride ?? runtime.reasoning_effort;
  json(root, `role-launches/${task}.json`, { schema_version: 1, task_id: `native-${task}`, role: name, fork_turns: "none", model_tier: runtime.tier, model, reasoning_effort, model_routing_sha256: runtime.routing_sha256, declared_inputs: inputs, allowed_external_sources, declared_outputs: outputs, started_at });
  const receipt = { schema_version: 1, role: name, agent_task: task, model, reasoning_effort, fork_turns: "none", started_at, completed_at: "2026-08-22T12:00:01Z", declared_inputs: inputs, allowed_external_sources: receipt_allowed_external_sources, external_results_used, environment_changes, outputs, undeclared_inputs_accessed: [], limitations: [], execution_status, gate_verdict, launch_record_sha256: hash(root, `role-launches/${task}.json`) };
  if (omit_environment_changes) delete receipt.environment_changes;
  json(root, `role-receipts/${task}.json`, receipt);
  return `role-receipts/${task}.json`;
}
function checkpointResult(root, phase, outputs, roles = []) {
  const args = ["checkpoint", root, phase, "--input", "study-plan.md"];
  if (phase === "contract") { for (const item of ["request.md", "environment/bootstrap.json", "contract/run-config.json", "contract/model-routing.json", "contract/input-manifest.json"]) args.push("--input", item); if (fs.existsSync(path.join(root, "contract/source-bundle-manifest.json"))) args.push("--input", "contract/source-bundle-manifest.json"); else for (const item of ["contract/evaluator-contract.md", "contract/evaluator-manifest.json"]) args.push("--input", item); for (const item of ["contract/i1-verification-policy.json", "private/evaluator/i1-verifier"]) if (fs.existsSync(path.join(root, item))) args.push("--input", item); }
  for (const output of [...outputs, ...roles.map((item) => role(root, item))]) args.push("--output", output);
  return run(...args);
}
function checkpoint(root, phase, outputs, roles = []) { const result = checkpointResult(root, phase, outputs, roles); assert.equal(result.status, 0, result.stderr); }
function newRun(t, mode = "research", environmentSource = "existing") { const root = fs.mkdtempSync(path.join(os.tmpdir(), `scientistone-${mode}-`)); t.after(() => fs.rmSync(root, { recursive: true, force: true })); put(root, "request.md", "Approved request.\n"); put(root, "study-plan.md", "# Approved plan\n"); bootstrap(root, mode, environmentSource); json(root, "contract/custom-profile.json", BUDGETS); assert.equal(run("configure", root, "custom", mode, "contract/custom-profile.json").status, 0); assert.equal(run("init", root).status, 0); installTestRouting(root); return root; }

function writeContractArtifacts(root, evaluatorText = "Metric score; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n") {
  put(root, "contract/evaluator-contract.md", evaluatorText);
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  const i1Contract = seedI1Contract({ root, mode: "research", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put });
  checkpoint(root, "contract", ["contract", "private/evaluator/i1-verifier"], [
    { role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs },
    { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"] },
  ]);
}

function contract(t, environmentSource = "existing") {
  const root = newRun(t, "research", environmentSource); put(root, "inputs/shared/data.csv", "x\n1\n"); put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [{ source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" }, { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" }] });
  writeContractArtifacts(root);
  return root;
}
const evaluatorInputs = () => ["contract/evaluator-contract.md", "contract/evaluator-manifest.json", "private/evaluator/evaluate.mjs"];
function evaluation(root, snapshot, destination, id, canonical = false, values = [1]) { const raw = `private/evaluator/raw/${id}.txt`; put(root, raw, `raw ${id}\n`); const record = { schema_version: 1, snapshot_sha256: hash(root, snapshot), metric: { name: "score", value: values.reduce((a, b) => a + b, 0) / values.length, unit: "points", direction: "maximize" }, protocol: "approved", repetitions: values.map((value, seed) => ({ seed, value })), command_or_procedure: "node evaluate.mjs", environment: { software: ["node"], hardware: "test" }, raw_output_ref: raw, raw_output_sha256: hash(root, raw), evaluated_at: "2026-08-22T12:00:00Z", status: "valid" }; record[canonical ? "snapshot_path" : "snapshot"] = snapshot; json(root, destination, record); return raw; }
function investigate(root) {
  put(root, "evidence/search-log.jsonl", '{"query":"q"}\n'); put(root, "evidence/sources.jsonl", '{"id":"s","bibkey":"smith2025"}\n'); put(root, "investigation/notes/s.md"); put(root, "investigation/directions/d.md"); put(root, "investigation/protocol-audit.md", "Overall verdict: PASS\n"); put(root, "investigation/brief.md"); put(root, "investigation/references.bib"); put(root, "investigation/critic.md", "Overall verdict: PASS\n");
  checkpoint(root, "investigation", ["evidence", "investigation"], [{ role: "literature_mapper", inputs: ["study-plan.md"], outputs: ["evidence/search-log.jsonl", "evidence/sources.jsonl"] }, { role: "evidence_reader", inputs: ["study-plan.md", "evidence/sources.jsonl"], outputs: ["investigation/notes/s.md"] }, { role: "evidence_synthesizer", inputs: ["study-plan.md", "investigation/notes"], outputs: ["investigation/directions/d.md"] }, { role: "protocol_auditor", inputs: ["study-plan.md", "investigation/directions"], outputs: ["investigation/protocol-audit.md"] }, { role: "brief_writer", inputs: ["study-plan.md", "investigation/directions", "investigation/protocol-audit.md", "evidence/sources.jsonl"], outputs: ["investigation/brief.md", "investigation/references.bib"] }, { role: "brief_critic", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["investigation/critic.md"] }]);
}
function discover(root, change = null, receipt = {}) {
  put(root, "discovery/ideas.jsonl", '{"id":"i1","kind":"conservative"}\n{"id":"i2","kind":"unconventional"}\n'); put(root, "discovery/idea-critique.jsonl", '{"idea_id":"i1","status":"eligible"}\n{"idea_id":"i2","status":"rejected"}\n'); const base = "discovery/nodes/n1"; put(root, `${base}/idea.md`); json(root, `${base}/shared-input-manifest.json`, { schema_version: 1, files: [read(root, "contract/input-manifest.json").files[0]] }); put(root, `${base}/experimental-log.md`); put(root, `${base}/method-report.md`); put(root, `${base}/legitimacy-audit.md`, "Overall verdict: PASS\n"); put(root, `${base}/snapshots/v1/method.txt`, "method\n"); const raw = evaluation(root, `${base}/snapshots/v1`, `${base}/evaluations/v1.json`, "node"); if (change === "expose") { const value = read(root, `${base}/evaluations/v1.json`); value.heldout_rows = []; json(root, `${base}/evaluations/v1.json`, value); } json(root, "discovery/index.json", { nodes: [{ id: "n1", path: base, status: "eligible", evaluation_path: `${base}/evaluations/v1.json`, legitimacy_verdict_path: `${base}/legitimacy-audit.md` }], retained: ["n1"] });
  const candidateInputs = ["study-plan.md", "investigation/brief.md", `${base}/idea.md`, `${base}/shared-input-manifest.json`]; if (change === "leak") candidateInputs.push("private/evaluator/evaluate.mjs");
  const roles = [{ role: "ideator", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["discovery/ideas.jsonl"] }, { role: "idea_critic", inputs: ["study-plan.md", "discovery/ideas.jsonl"], outputs: ["discovery/idea-critique.jsonl"] }, { role: "candidate_developer", task: "candidate", inputs: candidateInputs, outputs: [`${base}/experimental-log.md`, `${base}/method-report.md`, `${base}/snapshots/v1`], ...receipt }, { role: "evaluator", task: "node_evaluator", inputs: ["study-plan.md", `${base}/snapshots`, ...evaluatorInputs()], outputs: [`${base}/evaluations/v1.json`, raw] }, { role: "legitimacy_auditor", inputs: ["study-plan.md", `${base}/idea.md`, `${base}/method-report.md`, `${base}/evaluations`], outputs: [`${base}/legitimacy-audit.md`] }];
  if (change === "duplicate") roles.push({ role: "ideator", task: "second_ideator", inputs: ["study-plan.md", "investigation/brief.md"], outputs: ["discovery/ideas.jsonl"] });
  return checkpointResult(root, "discovery", ["discovery"], roles);
}

function select(root, changed = false) {
  const source = "discovery/nodes/n1/snapshots/v1"; put(root, "selection/selection.md"); put(root, "selection/selection-audit.md", "Overall verdict: PASS\n"); copy(root, `${source}/method.txt`, "selection/selected/method.txt"); json(root, "selection/selected/manifest.json", { files: ["method.txt"] }); const sourceHash = treeHash(path.join(root, source), ["method.txt"]); const selectedHash = treeHash(path.join(root, "selection/selected"), ["method.txt"]); json(root, "selection/lineage.json", { source_node_id: "n1", source_snapshot_path: source, source_snapshot_sha256: sourceHash, selected_snapshot_sha256: selectedHash, legitimacy_verdict_path: "discovery/nodes/n1/legitimacy-audit.md", evaluation_path: "discovery/nodes/n1/evaluations/v1.json", metric_name: "score", metric_direction: "maximize", rank: 1, tie_break_evidence: [] }); if (changed) put(root, "selection/selected/method.txt", "different\n"); const raw = evaluation(root, "selection/selected", "selection/canonical-evaluation.json", "canonical", true, [1, 1]);
  return checkpointResult(root, "selection", ["selection"], [{ role: "selection_analyst", inputs: ["study-plan.md", "discovery/index.json"], outputs: ["selection/selection.md", "selection/lineage.json", "selection/selected"] }, { role: "selection_auditor", inputs: ["study-plan.md", "discovery/index.json", "selection/selection.md", "selection/lineage.json"], outputs: ["selection/selection-audit.md"] }, { role: "evaluator", task: "canonical_evaluator", inputs: ["study-plan.md", "selection/selected", ...evaluatorInputs()], outputs: ["selection/canonical-evaluation.json", raw] }]);
}
function ablate(root) { json(root, "ablation/plan.json", { ablations: [{ id: "a1" }] }); put(root, "ablation/variants/a1/method.txt"); const raw = evaluation(root, "ablation/variants/a1", "ablation/evaluations/a1.json", "ablation"); json(root, "ablation/results.json", { ablations: [{ id: "a1", status: "valid" }] }); put(root, "ablation/report.md"); checkpoint(root, "ablation", ["ablation"], [{ role: "ablation_designer", inputs: ["study-plan.md", "selection/selected"], outputs: ["ablation/plan.json"] }, { role: "ablation_implementer", inputs: ["study-plan.md", "selection/selected", "ablation/plan.json"], outputs: ["ablation/variants/a1"] }, { role: "evaluator", task: "ablation_evaluator", inputs: ["study-plan.md", "ablation/variants", ...evaluatorInputs()], outputs: ["ablation/evaluations/a1.json", raw] }, { role: "ablation_analyst", inputs: ["study-plan.md", "ablation/plan.json", "ablation/evaluations", "ablation/results.json"], outputs: ["ablation/results.json", "ablation/report.md"] }]); }
const tagged = () => ["\\documentclass{article}", "\\newcommand{\\coe}[1]{}", "\\begin{document}", "Study score 1 \\coe{C1}; prior score 2 with \\& escape \\coe{C2}.", "\\caption{Method. \\coe{C3}}", "\\begin{tabular}{c}Conclusion \\coe{C4} \\\\ \\end{tabular}", "\\end{document}", ""].join("\n");
function write(root, wrong = false) { put(root, "paper/representation.md"); json(root, "paper/grounding-report.json", { status: "PASS", factual_sentence_count: 4, resolvable_tag_count: 4, grounding_ratio: wrong ? 0.8 : 1, unresolved_claim_ids: [] }); put(root, "paper/critic.md", "Overall verdict: PASS\n"); put(root, "paper/paper-tagged.tex", tagged()); put(root, "paper/references.bib", "@article{smith2025,title={Prior},author={Smith},year={2025}}\n"); return checkpointResult(root, "writing", ["paper/representation.md", "paper/grounding-report.json", "paper/critic.md", "paper/paper-tagged.tex", "paper/references.bib"], [{ role: "writer", inputs: ["study-plan.md", "investigation/brief.md", "selection/canonical-evaluation.json", "ablation/results.json"], outputs: ["paper/representation.md", "paper/paper-tagged.tex", "paper/references.bib"] }, { role: "paper_critic", inputs: ["study-plan.md", "paper/representation.md", "paper/paper-tagged.tex"], outputs: ["paper/grounding-report.json", "paper/critic.md"] }]); }
function line(id) { return tagged().split(/\r?\n/).findIndex((value) => value.includes(`\\coe{${id}}`)) + 1; }
function verifyPhase(root, change = null) {
  put(root, "paper/paper-verified-tagged.tex", tagged()); put(root, "paper/paper.tex", tagged().replaceAll(/\\coe\{[^{}]+\}/g, ""));
  const claims = [{ claim_id: "C1", paper_location: `paper/paper-verified-tagged.tex:${line("C1")}`, sentence: "Study score 1", claim_type: "numerical", origin: "study", status: "SUPPORTED" }, { claim_id: "C2", paper_location: `paper/paper-verified-tagged.tex:${line("C2")}`, sentence: "prior score 2 with \\& escape", claim_type: "numerical", origin: "prior_work", status: "SUPPORTED" }, { claim_id: "C3", paper_location: `paper/paper-verified-tagged.tex:${line("C3")}`, sentence: "Method.", claim_type: "methodological", status: "SUPPORTED" }, { claim_id: "C4", paper_location: `paper/paper-verified-tagged.tex:${line("C4")}`, sentence: "Conclusion", claim_type: "conclusion", status: "SUPPORTED" }];
  const provenance = claims.map((claim) => ({ claim_id: claim.claim_id, paper_location: claim.paper_location, sentence: claim.sentence, claim_type: claim.claim_type, status: "SUPPORTED", evidence: claim.claim_id === "C1" ? [{ kind: "metric", target: "selection/canonical-evaluation.json", locator: "/metric/value", sha256: hash(root, "selection/canonical-evaluation.json") }] : claim.claim_id === "C2" ? [{ kind: "source", target: "bib:smith2025", locator: null, sha256: hash(root, "paper/references.bib") }] : claim.claim_id === "C3" ? [{ kind: "artifact", target: "selection/selected/method.txt", locator: "L1", sha256: hash(root, "selection/selected/method.txt") }] : [{ kind: "inference", target: "C1,C2", locator: null, sha256: null }] }));
  if (change === "missing") claims.pop(); if (change === "extra") claims.push({ claim_id: "CX", paper_location: "paper/paper-verified-tagged.tex:1", sentence: "extra", claim_type: "citation", status: "SUPPORTED" }); if (change === "sentence") claims[0].sentence = "Sentence absent from paper"; if (change === "mapping") provenance[0].sentence = "Different sentence"; if (change === "target") provenance[0].evidence[0] = { kind: "metric", target: "selection/missing.json", locator: "/metric/value", sha256: "0".repeat(64) }; if (change === "cycle") provenance[0].evidence.push({ kind: "inference", target: "C4", locator: null, sha256: null }); if (change === "study_source") provenance[0].evidence = [{ kind: "source", target: "bib:smith2025", locator: null, sha256: hash(root, "paper/references.bib") }];
  put(root, "paper/claims.jsonl", `${claims.map(JSON.stringify).join("\n")}\n`); put(root, "paper/provenance.jsonl", `${provenance.map(JSON.stringify).join("\n")}\n`); put(root, "paper/verification.md", "Overall verdict: PASS\n"); put(root, "paper/paper.pdf", minimalPdf()); json(root, "delivery/visual-inspection.json", { pdf_path: "paper/paper.pdf", pdf_sha256: hash(root, "paper/paper.pdf"), page_count: 1, renderer: "test", timestamp: "2026-08-22T12:00:00Z", checked_pages: change === "visual" ? [] : [1], detected_defects: [], verdict: "PASS" });
  return checkpointResult(root, "verification", ["paper/claims.jsonl", "paper/verification.md", "paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf", "delivery/visual-inspection.json"], [{ role: "claim_verifier", inputs: ["study-plan.md", "paper/paper-tagged.tex", "paper/claims.jsonl"], outputs: ["paper/claims.jsonl", "paper/verification.md"] }, { role: "writer", task: "final_writer", inputs: ["paper/claims.jsonl", "paper/verification.md"], outputs: ["paper/paper-verified-tagged.tex", "paper/provenance.jsonl", "paper/paper.tex", "paper/paper.pdf"] }]);
}
function i3(evidence = "paper/references.bib") { const fields = { title: "Prior", author: "Smith", year: 2025 }; return { verdict: "PASS", entries: [{ bibkey: "smith2025", populated_fields: fields, resolved_primary_record: fields, retrieved_at: "2026-08-22T12:00:00Z", field_comparisons: Object.entries(fields).map(([field, value]) => ({ field, expected: value, actual: value, matches: true })), status: "verified", evidence_path: evidence }], totals: { entries: 1, verified: 1, unresolved: 0, mismatch: 0 } }; }
const report = (verdict = "PASS") => `Overall verdict: ${verdict}\nI1 verdict: ${verdict}\nI2 verdict: ${verdict}\nI3 verdict: ${verdict}\nI4 verdict: ${verdict}\nclaim_provenance verdict: ${verdict}\n${verdict === "FAIL" ? "Rollback phase: verification\n" : ""}`;
const reproduction = () => "## Selected snapshot\nselection/selected and hash.\n## Environment\nenvironment/bootstrap.json.\n## Inputs and access limits\nShared input; private evaluator.\n## Procedure\nRun evaluator.\n## Expected canonical output\nselection/canonical-evaluation.json.\n## Verification\nRun `<resolved-node-path> <scientistone-skill-root>/scripts/coe.mjs verify <run>` and inspect manifest.\n";
function audit(root, change = null) {
  const selectedSnapshotSha256 = read(root, "selection/canonical-evaluation.json").snapshot_sha256;
  const i1Audit = seedI1Audit({ root, mode: "research", selectedSnapshotSha256, evidencePath: "selection/canonical-evaluation.json", hash, json, put });
  json(root, "audit/i3.json", i3()); json(root, "audit/claim-provenance.json", { verdict: "PASS", total_numerical_claims: 2, assessed_count: 2, supported_count: 2, coverage_ratio: 1, mismatches: [], unavailable_items: [], evidence_paths: ["paper/provenance.jsonl"] }); const roles = [{ role: "i1_score_auditor", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "private/evaluator/i1-verifier", "paper/paper.tex", "paper/paper.pdf", "selection/selected", "selection/canonical-evaluation.json", ...evaluatorInputs()], outputs: i1Audit.outputs }, { role: "i3_reference_auditor", inputs: ["study-plan.md", "paper/references.bib"], outputs: ["audit/i3.json"] }, { role: "claim_provenance_auditor", inputs: ["study-plan.md", "paper/claims.jsonl", "paper/provenance.jsonl", "selection/canonical-evaluation.json"], outputs: ["audit/claim-provenance.json"] }]; const votes = [];
  for (const panel of ["i2", "i4"]) { for (let n = 1; n <= 3; n++) { const file = `audit/${panel}/judge-${n}.json`; votes.push(file); if (panel === "i2") json(root, file, { judge_id: `${panel}-${n}`, selected_snapshot_sha256: hash(root, "selection/selected"), evaluator_contract_sha256: hash(root, "contract/evaluator-contract.md"), checked_categories: ["evaluator_import"], flagged: false, category: null, evidence_paths: ["selection/canonical-evaluation.json"], rationale: "No violation.", verdict: "PASS" }); else json(root, file, { judge_id: `${panel}-${n}`, paper_method_locations: ["paper.tex:5"], selected_artifacts: [{ path: "selection/selected/method.txt", sha256: hash(root, "selection/selected/method.txt") }], checked_categories: ["method_class_mismatch"], checked_core_mechanisms: ["method"], flagged: false, category: null, evidence_paths: ["selection/selected/method.txt"], rationale: "Aligned.", verdict: "PASS" }); roles.push({ role: `${panel}_judge`, task: `${panel}_${n}`, inputs: panel === "i2" ? ["study-plan.md", "contract/input-manifest.json", "selection/selected", "selection/canonical-evaluation.json", ...evaluatorInputs()] : ["study-plan.md", "paper/paper.tex", "selection/selected"], outputs: [file] }); } json(root, `audit/${panel}/aggregate.json`, { status: "ASSESSED", judge_count: 3, threshold: 2, flag_votes: 0, flagged: false }); }
  put(root, "audit/report.md", report()); put(root, "delivery/reproduction.md", reproduction()); roles.push({ role: "audit_reporter", inputs: ["study-plan.md", "audit/i1.json", "audit/i3.json", "audit/claim-provenance.json", ...votes], outputs: ["audit/i2/aggregate.json", "audit/i4/aggregate.json", "audit/report.md"] }, { role: "reproduction_writer", inputs: ["study-plan.md", "environment/bootstrap.json", "selection/selected/manifest.json", "selection/canonical-evaluation.json", "audit/report.md"], outputs: ["delivery/reproduction.md"] });
  if (change === "reporter-extra") { json(root, "audit/reporter-extra.json", { verdict: "PASS" }); roles.find((role) => role.role === "audit_reporter").outputs.push("audit/reporter-extra.json"); }
  if (change === "i1") json(root, "audit/i1.json", { verdict: "PASS" }); if (change === "i3") json(root, "audit/i3.json", { verdict: "PASS" }); if (change === "claim") json(root, "audit/claim-provenance.json", { verdict: "PASS" }); if (change === "vote") json(root, "audit/i2/judge-1.json", { flagged: false }); if (change === "report") put(root, "audit/report.md", ""); if (change === "reproduction") put(root, "delivery/reproduction.md", "");
  return checkpointResult(root, "audit", ["audit", "delivery/reproduction.md"], roles);
}

function deliver(root) { for (const [source, destination] of [["study-plan.md", "study-plan.md"], ["investigation/brief.md", "investigation-brief.md"], ["paper/paper.tex", "paper.tex"], ["paper/paper.pdf", "paper.pdf"], ["paper/references.bib", "references.bib"], ["paper/provenance.jsonl", "provenance.jsonl"], ["selection/selected/manifest.json", "selected-method/manifest.json"], ["selection/selected/method.txt", "selected-method/method.txt"], ["selection/canonical-evaluation.json", "canonical-evaluation.json"], ["ablation/report.md", "ablation-report.md"], ["paper/verification.md", "verification.md"], ["audit/report.md", "audit-report.md"], ["delivery/reproduction.md", "reproduction.md"], ["delivery/visual-inspection.json", "visual-inspection.json"]]) copy(root, source, `deliverables/${destination}`); assert.equal(run("manifest", root).status, 0); assert.equal(run("set-outcome", root, "positive").status, 0); checkpoint(root, "complete", ["deliverables"]); }
function through(t, phase = "complete", environmentSource = "existing") { const root = contract(t, environmentSource); if (phase === "contract") return root; investigate(root); if (phase === "investigation") return root; let result = discover(root); assert.equal(result.status, 0, result.stderr); if (phase === "discovery") return root; result = select(root); assert.equal(result.status, 0, result.stderr); if (phase === "selection") return root; ablate(root); if (phase === "ablation") return root; result = write(root); assert.equal(result.status, 0, result.stderr); if (phase === "writing") return root; result = verifyPhase(root); assert.equal(result.status, 0, result.stderr); if (phase === "verification") return root; result = audit(root); assert.equal(result.status, 0, result.stderr); if (phase === "audit") return root; deliver(root); return root; }

function bundle(root, unavailable = null) { const values = [["paper.any", "paper", ["I1", "I3", "I4", "claim_provenance"], "shared"], ["method.any", "method", ["I2", "I4"], "shared"], ["evaluation.any", "evaluation", ["I1", "I2", "claim_provenance"], "shared"], ["evaluator.any", "evaluator", ["I2"], "evaluator_only"], ["references.any", "reference", ["I3", "claim_provenance"], "shared"]]; const items = values.map(([name, artifact_type, intended_checks, access_class]) => { const frozen_path = `source-bundle/${name}`; put(root, frozen_path, `${name}\n`); return { supplied_path: `/arbitrary/${name}`, frozen_path, artifact_type, sha256: hash(root, frozen_path), intended_checks, access_class, available: true, missing_reason: null }; }); if (unavailable) items.push({ supplied_path: `/arbitrary/missing-${unavailable}`, frozen_path: `source-bundle/missing-${unavailable}`, artifact_type: "other", sha256: null, intended_checks: [unavailable], access_class: "shared", available: false, missing_reason: `${unavailable} input missing` }); return items; }
function externalContract(t, unavailable = null) { const root = newRun(t, "external_audit"); json(root, "contract/input-manifest.json", { schema_version: 1, files: [] }); json(root, "contract/source-bundle-manifest.json", { schema_version: 1, items: bundle(root, unavailable) }); put(root, "contract/audit.md", "Overall verdict: PASS\n"); const i1Contract = seedI1Contract({ root, mode: "external_audit", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put }); checkpoint(root, "contract", ["contract", "private/evaluator/i1-verifier"], [{ role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs }, { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"] }]); return root; }
function externalContractResult(root) { const i1Contract = seedI1Contract({ root, mode: "external_audit", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put }); return checkpointResult(root, "contract", ["contract", "private/evaluator/i1-verifier"], [{ role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs }, { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"] }]); }
function externalAudit(root, falselyPassI1 = false) {
  const items = read(root, "contract/source-bundle-manifest.json").items; const paths = (check) => items.filter((item) => item.available && item.intended_checks.includes(check)).map((item) => item.frozen_path); const unavailable = (check) => items.filter((item) => !item.available && item.intended_checks.includes(check)).map((item) => item.frozen_path); const e = paths("I1")[0];
  const missingI1 = unavailable("I1");
  const i1Audit = seedI1Audit({ root, mode: "external_audit", selectedSnapshotSha256: null, evidencePath: missingI1.length && !falselyPassI1 ? "contract/source-bundle-manifest.json" : e, unavailableItem: missingI1[0], hash, json, put, notAssessed: missingI1.length > 0 && !falselyPassI1 });
  const fields = { title: "External" }; json(root, "audit/i3.json", { verdict: "PASS", entries: [{ bibkey: "external", populated_fields: fields, resolved_primary_record: fields, retrieved_at: "2026-08-22T12:00:00Z", field_comparisons: [{ field: "title", expected: "External", actual: "External", matches: true }], status: "verified", evidence_path: paths("I3")[0] }], totals: { entries: 1, verified: 1, unresolved: 0, mismatch: 0 } }); json(root, "audit/claim-provenance.json", { verdict: "PASS", total_numerical_claims: 0, assessed_count: 0, supported_count: 0, coverage_ratio: 1, mismatches: [], unavailable_items: [], evidence_paths: [paths("claim_provenance")[0]] });
  const roles = [{ role: "i1_score_auditor", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/i1-verification-policy.json", "private/evaluator/i1-verifier", ...paths("I1")], outputs: i1Audit.outputs }, { role: "i3_reference_auditor", inputs: ["study-plan.md", ...paths("I3")], outputs: ["audit/i3.json"] }, { role: "claim_provenance_auditor", inputs: ["study-plan.md", ...paths("claim_provenance")], outputs: ["audit/claim-provenance.json"] }]; const votes = [];
  for (const panel of ["i2", "i4"]) { for (let n = 1; n <= 3; n++) { const file = `audit/${panel}/judge-${n}.json`; votes.push(file); if (panel === "i2") json(root, file, { judge_id: `${panel}-${n}`, selected_snapshot_sha256: "a".repeat(64), evaluator_contract_sha256: "b".repeat(64), checked_categories: ["evaluator_import"], flagged: false, category: null, evidence_paths: [paths("I2")[0]], rationale: "Checked.", verdict: "PASS" }); else json(root, file, { judge_id: `${panel}-${n}`, paper_method_locations: ["source"], selected_artifacts: [{ path: paths("I4")[0], sha256: hash(root, paths("I4")[0]) }], checked_categories: ["method_class_mismatch"], checked_core_mechanisms: ["method"], flagged: false, category: null, evidence_paths: [paths("I4")[0]], rationale: "Checked.", verdict: "PASS" }); roles.push({ role: `${panel}_judge`, task: `${panel}_${n}`, inputs: ["study-plan.md", ...paths(panel.toUpperCase())], outputs: [file] }); } json(root, `audit/${panel}/aggregate.json`, { status: "ASSESSED", judge_count: 3, threshold: 2, flag_votes: 0, flagged: false }); }
  put(root, "audit/report.md", report()); put(root, "delivery/reproduction.md", "## Source bundle\ncontract/source-bundle-manifest.json.\n## Inputs and access limits\nFrozen inputs.\n## Audit procedure\nRun audits.\n## Expected audit output\naudit/report.md.\n## Verification\nRun `<resolved-node-path> <scientistone-skill-root>/scripts/coe.mjs verify <run>` and inspect manifest.\n"); roles.push({ role: "audit_reporter", inputs: ["study-plan.md", "audit/i1.json", "audit/i3.json", "audit/claim-provenance.json", ...votes], outputs: ["audit/i2/aggregate.json", "audit/i4/aggregate.json", "audit/report.md"] }, { role: "reproduction_writer", inputs: ["study-plan.md", "environment/bootstrap.json", "contract/source-bundle-manifest.json", "audit/report.md"], outputs: ["delivery/reproduction.md"] }); return checkpointResult(root, "audit", ["audit", "delivery/reproduction.md"], roles);
}

test("existing compatible shared tools are recorded without installation", (t) => {
  const root = contract(t);
  assert.ok(read(root, "environment/bootstrap.json").tools.every((tool) => tool.status === "not_required" || tool.source === "existing"));
  assert.equal(run("verify", root).status, 0);
});

test("the CoE rejects a launch whose model or effort differs from the frozen role policy", (t) => {
  const root = newRun(t);
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [] });
  put(root, "contract/evaluator-contract.md", "Metric and protocol.\n");
  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(root, "contract/audit.md", "Overall verdict: PASS\n");
  const i1Contract = seedI1Contract({ root, mode: "research", runtime: testRuntime(root, "i1_verifier_builder"), hash, fileHash, json, put });
  const result = checkpointResult(root, "contract", ["contract", "private/evaluator/i1-verifier"], [{ role: "i1_verifier_builder", inputs: i1Contract.builderInputs, outputs: i1Contract.builderOutputs }, { role: "contract_auditor", inputs: i1Contract.contractAuditorInputs, outputs: ["contract/audit.md"], model: "wrong-model", reasoning_effort: "low" }]);
  assert.match(result.stderr, /does not match the frozen ScientistOne model policy/);
});

test("portable run-local tools support a complete verified chain", (t) => {
  const root = through(t, "complete", "portable_official");
  assert.equal(run("verify", root).status, 0);
  assert.ok(read(root, "environment/bootstrap.json").tools.every((tool) => tool.path.startsWith("environment/tools/")));
});

test("a pinned specialist dependency with a declared lockfile is promotable", (t) => {
  const root = through(t, "investigation");
  const lock = "discovery/nodes/n1/requirements.lock";
  put(root, lock, "numpy==2.3.2\n");
  const outputs = ["discovery/nodes/n1/experimental-log.md", "discovery/nodes/n1/method-report.md", "discovery/nodes/n1/snapshots/v1", lock];
  const environment_changes = [{ name: "numpy", version: "2.3.2", scope: "run_local", source: "pypi", lock_or_manifest: lock, reason: "Required by the candidate implementation" }];
  assert.equal(discover(root, null, { outputs, environment_changes }).status, 0);
});

test("incomplete bootstrap and unrecorded or unsafe dependency changes block promotion", (t) => {
  const missing = newRun(t);
  fs.unlinkSync(path.join(missing, "environment/bootstrap.json"));
  json(missing, "contract/input-manifest.json", { schema_version: 1, files: [] });
  put(missing, "contract/evaluator-contract.md", "Metric and protocol.\n");
  put(missing, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(missing, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(missing, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(missing, "contract/audit.md", "Overall verdict: PASS\n");
  const contractInputs = ["request.md", "study-plan.md", "environment/bootstrap.json", "contract/run-config.json", "contract/input-manifest.json", "contract/evaluator-contract.md", "contract/evaluator-manifest.json"];
  assert.match(checkpointResult(missing, "contract", ["contract"], [{ role: "contract_auditor", inputs: contractInputs, outputs: ["contract/audit.md"] }]).stderr, /Missing artifact|Cannot read valid JSON/);

  for (const change of [
    { name: "numpy", version: "latest", scope: "run_local", source: "pypi", reason: "test" },
    { name: "numpy", version: "2.3.2", scope: "global", source: "pypi", reason: "test" },
  ]) {
    const root = through(t, "investigation");
    const lock = "discovery/nodes/n1/requirements.lock";
    put(root, lock, "numpy==2.3.2\n");
    change.lock_or_manifest = lock;
    const outputs = ["discovery/nodes/n1/experimental-log.md", "discovery/nodes/n1/method-report.md", "discovery/nodes/n1/snapshots/v1", lock];
    assert.match(discover(root, null, { outputs, environment_changes: [change] }).stderr, /Invalid environment change/);
  }
  const omitted = through(t, "investigation");
  assert.match(discover(omitted, null, { omit_environment_changes: true }).stderr, /Malformed role receipt/);
});

test("complete research chain verifies and retains hash-ledger drift detection", (t) => { const root = through(t); const before = fs.readFileSync(path.join(root, "run.json"), "utf8"); assert.equal(run("verify", root).status, 0); assert.equal(fs.readFileSync(path.join(root, "run.json"), "utf8"), before); fs.appendFileSync(path.join(root, "paper/paper.pdf"), "drift"); assert.match(run("verify", root).stderr, /Evidence changed after verification checkpoint/); });
test("only COMPLETE plus PASS launches promote, and output ownership is exclusive", (t) => { for (const [execution_status, gate_verdict] of [["BLOCKED", "PASS"], ["FAILED", "PASS"], ["COMPLETE", "REVISE"], ["COMPLETE", "FAIL"], ["COMPLETE", "NOT_ASSESSED"]]) { const root = through(t, "investigation"); const result = discover(root, null, { execution_status, gate_verdict }); assert.match(result.stderr, /expected execution_status COMPLETE and gate_verdict PASS/); } const root = through(t, "investigation"); assert.match(discover(root, "duplicate").stderr, /multiple owners/); });
test("external-source permissions are bound to the supervisor launch", (t) => { const root = through(t, "investigation"); assert.match(discover(root, null, { allowed_external_sources: [], receipt_allowed_external_sources: ["web search"] }).stderr, /Allowed external sources.*differ from supervisor launch record/); });
test("evaluator access, outputs, and feedback are sanitized", (t) => { const leak = through(t, "investigation"); assert.match(discover(leak, "leak").stderr, /evaluator-only input/); const exposed = through(t, "investigation"); assert.match(discover(exposed, "expose").stderr, /Unknown candidate-visible field.*heldout_rows/); const root = contract(t); put(root, "private/evaluator/feedback.json", JSON.stringify({ schema_version: 1, execution_status: "COMPLETE", public_metric: { name: "score", value: 1, unit: "points", direction: "maximize" }, safe_failure_category: null, candidate_visible_note: "Done." })); assert.equal(run("sanitize-feedback", root, "private/evaluator/feedback.json", "discovery/nodes/n1/feedback/v1.json").status, 0); put(root, "private/evaluator/bad.json", JSON.stringify({ schema_version: 1, execution_status: "COMPLETE", public_metric: null, safe_failure_category: null, candidate_visible_note: "Done.", heldout_rows: [] })); assert.match(run("sanitize-feedback", root, "private/evaluator/bad.json", "discovery/nodes/n1/feedback/bad.json").stderr, /heldout_rows/); });
test("selection lineage is byte-bound to an eligible sealed snapshot", (t) => { const root = through(t, "discovery"); assert.match(select(root, true).stderr, /differs from lineage source/); });
test("grounding, claim inventory, exact sentences, evidence resolution, cycles, and study/prior-work sources are enforced", (t) => { const wrong = through(t, "ablation"); assert.match(write(wrong, true).stderr, /grounding ratio is inconsistent/); const base = through(t, "writing"); for (const [change, expected] of [["missing", /claim inventory differs/], ["extra", /claim inventory differs/], ["sentence", /does not occur/], ["mapping", /differs from its claim record/], ["target", /Missing artifact/], ["cycle", /Circular inference/], ["study_source", /canonical or ablation metric/]]) { const clone = fs.mkdtempSync(path.join(os.tmpdir(), "coe-claims-")); t.after(() => fs.rmSync(clone, { recursive: true, force: true })); fs.cpSync(base, clone, { recursive: true }); assert.match(verifyPhase(clone, change).stderr, expected); } assert.equal(verifyPhase(base).status, 0); });
test("substantive audits, visual inspection, reproduction, and reporter ownership reject bare or overbroad records", (t) => { const base = through(t, "verification"); for (const [change, expected] of [["i1", /Malformed task-adaptive I1 aggregate/], ["i3", /I3.*non-empty entries/], ["claim", /total_numerical_claims/], ["vote", /Malformed substantive I2 vote/], ["report", /Audit report is empty/], ["reproduction", /Reproduction guide/], ["reporter-extra", /Audit reporter owns an invalid report set/]]) { const clone = fs.mkdtempSync(path.join(os.tmpdir(), "coe-audit-")); t.after(() => fs.rmSync(clone, { recursive: true, force: true })); fs.cpSync(base, clone, { recursive: true }); assert.match(audit(clone, change).stderr, expected); } const visual = through(t, "writing"); assert.match(verifyPhase(visual, "visual").stderr, /must record every checked page/); });
test("external bundles use arbitrary names and reject empty, unassessable, or falsely PASS inputs", (t) => { const root = externalContract(t); assert.equal(externalAudit(root).status, 0); copy(root, "contract/source-bundle-manifest.json", "deliverables/source-bundle-manifest.json"); copy(root, "audit/report.md", "deliverables/audit-report.md"); copy(root, "delivery/reproduction.md", "deliverables/reproduction.md"); assert.equal(run("manifest", root).status, 0); assert.equal(run("set-outcome", root, "audit_passed").status, 0); checkpoint(root, "complete", ["deliverables"]); assert.equal(run("verify", root).status, 0); const empty = newRun(t, "external_audit"); json(empty, "contract/input-manifest.json", { schema_version: 1, files: [] }); json(empty, "contract/source-bundle-manifest.json", { schema_version: 1, items: [] }); put(empty, "contract/audit.md", "Overall verdict: PASS\n"); assert.match(externalContractResult(empty).stderr, /non-empty items/); const none = newRun(t, "external_audit"); json(none, "contract/input-manifest.json", { schema_version: 1, files: [] }); json(none, "contract/source-bundle-manifest.json", { schema_version: 1, items: bundle(none).map((item) => ({ ...item, available: false, sha256: null, missing_reason: "missing" })) }); put(none, "contract/audit.md", "Overall verdict: PASS\n"); assert.match(externalContractResult(none).stderr, /no assessable integrity check/); const falsePass = externalContract(t, "I1"); assert.match(externalAudit(falsePass, true).stderr, /reports PASS even though required source-bundle inputs are unavailable/); });
test("validated state and attention commands keep phase aligned to receipts", (t) => { const root = contract(t); assert.equal(read(root, "run.json").phase, "investigation"); assert.match(run("set-state", root, "paused").stderr, /validated attention/); put(root, "attention.md", "Required action: Supply the missing file.\n"); assert.equal(run("set-attention", root, "attention.md").status, 0); assert.equal(run("set-state", root, "paused").status, 0); assert.match(run("set-state", root, "running").stderr, /clear-attention/); assert.equal(run("clear-attention", root).status, 0); assert.equal(run("set-state", root, "running").status, 0); const record = read(root, "run.json"); record.phase = "selection"; json(root, "run.json", record); assert.match(run("verify", root).stderr, /expected investigation, received selection/); });
test("invalidation preserves evidence and resumes at the first invalid phase", (t) => { const root = through(t, "investigation"); put(root, "reason.md", "repair\n"); fs.appendFileSync(path.join(root, "investigation/brief.md"), "drift\n"); assert.equal(run("invalidate", root, "investigation", "reason.md").status, 0); assert.equal(read(root, "run.json").phase, "investigation"); assert.equal(JSON.parse(run("verify", root).stdout).last_checkpoint, "contract"); const [archive] = fs.readdirSync(path.join(root, "receipts/superseded")); fs.appendFileSync(path.join(root, "receipts/superseded", archive, "artifacts/investigation/brief.md"), "tamper"); assert.match(run("verify", root).stderr, /Invalid invalidation root|Superseded artifact changed/); });

test("a result-blind contract defect repairs and re-audits inside the same run", (t) => {
  const root = contract(t);
  const requestBefore = read(root, "run.json").request_sha256;
  const planBefore = read(root, "run.json").study_plan_sha256;
  json(root, "repairs/contract-r1.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: false, post_result_guard: null, finding: "The generated evaluator added an unapproved readiness score.", repair: "Remove the invented score and retain the approved primary outcome.", researcher_approval: null });
  const revised = run("revise-contract", root, "repairs/contract-r1.json");
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.phase, "contract");
  assert.equal(record.state, "repairing");
  assert.equal(record.request_sha256, requestBefore);
  assert.equal(record.study_plan_sha256, planBefore);
  assert.equal(fs.existsSync(path.join(root, "contract/run-config.json")), true);
  assert.equal(fs.existsSync(path.join(root, "contract/input-manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "contract/evaluator-contract.md")), false);
  assert.equal(fs.existsSync(path.join(root, "private/evaluator/evaluate.mjs")), true);
  assert.equal(run("verify", root).status, 0);

  writeContractArtifacts(root, "Corrected approved primary metric; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n");
  const resumed = read(root, "run.json");
  assert.equal(resumed.phase, "investigation");
  assert.equal(resumed.contract_revision, 2);
  assert.equal(run("verify", root).status, 0);
});

test("a rejected pre-checkpoint contract is repaired without restarting the study", (t) => {
  const root = newRun(t);
  put(root, "inputs/shared/data.csv", "x\n1\n");
  put(root, "private/evaluator/evaluate.mjs", "export default true;\n");
  json(root, "contract/input-manifest.json", { schema_version: 1, files: [
    { source_path: "data.csv", frozen_path: "inputs/shared/data.csv", sha256: hash(root, "inputs/shared/data.csv"), classification: "shared" },
    { source_path: "evaluate.mjs", frozen_path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), classification: "evaluator_only" },
  ] });
  put(root, "contract/evaluator-contract.md", "Invented readiness score.\n");
  json(root, "contract/evaluator-manifest.json", { schema_version: 1, files: [{ path: "private/evaluator/evaluate.mjs", sha256: hash(root, "private/evaluator/evaluate.mjs"), access_class: "evaluator_only" }] });
  put(root, "contract/audit.md", "Overall verdict: REVISE\nFinding classification: AUTOMATIC_REPAIR\nRemove the invented score.\n");
  role(root, { role: "contract_auditor", inputs: ["request.md", "study-plan.md", "contract/evaluator-contract.md", "contract/evaluator-manifest.json"], outputs: ["contract/audit.md"], gate_verdict: "REVISE" });
  json(root, "repairs/pre-checkpoint.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: false, post_result_guard: null, finding: "The generated evaluator added an unapproved readiness score.", repair: "Remove the invented score and keep the approved evaluation intent.", researcher_approval: null });

  const revised = run("revise-contract", root, "repairs/pre-checkpoint.json");
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.phase, "contract");
  assert.equal(record.last_checkpoint, null);
  assert.equal(fs.existsSync(path.join(root, "contract/audit.md")), false);
  assert.equal(fs.existsSync(path.join(root, "role-receipts/contract_auditor.json")), false);
  assert.equal(fs.existsSync(path.join(root, "role-launches/contract_auditor.json")), false);
  assert.equal(fs.existsSync(path.join(root, "private/evaluator/evaluate.mjs")), true, "frozen evaluator-only input must survive generated-contract repair");
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/contract/audit.md")), true);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/role-receipts/contract_auditor.json")), true);
  assert.equal(run("verify", root).status, 0);

  writeContractArtifacts(root, "Approved primary metric; unit points; maximize; held-out split; two repetitions; failures invalid; public metric feedback.\n");
  assert.equal(read(root, "run.json").contract_revision, 2);
  assert.equal(run("verify", root).status, 0);
});

test("a result-blind repair after investigation archives prior work without asking for approval", (t) => {
  const root = through(t, "investigation");
  json(root, "repairs/pre-candidate.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: false, post_result_guard: null, finding: "The verifier fixture omitted a valid input shape before candidate work began.", repair: "Add the missing result-blind fixture and rerun contract review.", researcher_approval: null });
  const revised = run("revise-contract", root, "repairs/pre-candidate.json");
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(fs.existsSync(path.join(root, "investigation")), false);
  assert.equal(fs.existsSync(path.join(root, "evidence")), false);
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.existsSync(path.join(archive, "artifacts/investigation/brief.md")), true);
  assert.equal(run("verify", root).status, 0);
});

test("a result-aware evaluator repair archives every successor and reruns from contract", (t) => {
  const root = through(t, "selection");
  const selectedBefore = fileHash(path.join(root, "selection/canonical-evaluation.json"));
  json(root, "repairs/contract-r1.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: true, post_result_guard: "invalidate_and_rerun", finding: "The frozen verifier mishandles a valid result shape.", repair: "Correct the implementation without changing the approved metric or decision rule, then rerun all affected work.", researcher_approval: null });
  const revised = run("revise-contract", root, "repairs/contract-r1.json");
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.contract_revision, 2);
  assert.equal(record.last_checkpoint, null);
  assert.deepEqual(record.checkpoints, {});
  assert.equal(fs.existsSync(path.join(root, "selection/canonical-evaluation.json")), false);
  assert.equal(fs.existsSync(path.join(root, "role-launches/canonical_evaluator.json")), false);
  const archiveRoot = path.join(root, record.invalidation_roots.at(-1).path);
  const metadata = JSON.parse(fs.readFileSync(path.join(archiveRoot, "invalidation.json"), "utf8"));
  const archivedSelection = metadata.archived_artifacts.find((item) => item.path === "selection");
  assert.ok(archivedSelection);
  assert.equal(fileHash(path.join(root, archivedSelection.archived_path, "canonical-evaluation.json")), selectedBefore);
  assert.equal(run("verify", root).status, 0);
});

test("automatic repair cannot relax the researcher charter or skip result-aware rollback", (t) => {
  const charter = contract(t);
  json(charter, "repairs/bad-charter.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: true, result_aware: false, post_result_guard: null, finding: "Constraint conflict.", repair: "Relax the constraint.", researcher_approval: null });
  assert.match(run("revise-contract", charter, "repairs/bad-charter.json").stderr, /cannot change the researcher charter/);
  const resultAware = through(t, "selection");
  json(resultAware, "repairs/bad-rollback.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: true, post_result_guard: null, finding: "Verifier defect.", repair: "Patch in place.", researcher_approval: null });
  assert.match(run("revise-contract", resultAware, "repairs/bad-rollback.json").stderr, /must invalidate and rerun every successor/);
});

test("partial uncheckpointed candidate work cannot survive a contract revision", (t) => {
  const root = contract(t);
  put(root, "discovery/nodes/partial/snapshots/v1/method.txt", "partial candidate\n");
  put(root, "private/evaluator/raw/partial.txt", "observed result\n");
  json(root, "repairs/incorrectly-blind.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: false, post_result_guard: null, finding: "Verifier defect discovered during partial evaluation.", repair: "Correct the verifier and rerun the partial candidate.", researcher_approval: null });
  assert.match(run("revise-contract", root, "repairs/incorrectly-blind.json").stderr, /must declare result_aware true/);

  json(root, "repairs/result-aware.json", { schema_version: 1, classification: "AUTOMATIC_REPAIR", charter_changed: false, result_aware: true, post_result_guard: "invalidate_and_rerun", finding: "Verifier defect discovered during partial evaluation.", repair: "Correct the verifier and rerun the partial candidate without using the observed value to set the rule.", researcher_approval: null });
  const revised = run("revise-contract", root, "repairs/result-aware.json");
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(fs.existsSync(path.join(root, "discovery")), false);
  assert.equal(fs.existsSync(path.join(root, "private/evaluator/raw/partial.txt")), false);
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.readFileSync(path.join(archive, "artifacts/discovery/nodes/partial/snapshots/v1/method.txt"), "utf8"), "partial candidate\n");
  assert.equal(fs.readFileSync(path.join(archive, "artifacts/private/evaluator/raw/partial.txt"), "utf8"), "observed result\n");
  assert.equal(run("verify", root).status, 0);
});

test("an explicit researcher approval can amend the charter without losing the original", (t) => {
  const root = contract(t);
  put(root, "repairs/researcher-approval.md", "Approved in the ScientistOne study review.\n");
  put(root, "repairs/amended-study-plan.md", "# Approved amended plan\n\nThe same question uses a researcher-approved primary outcome.\n");
  json(root, "repairs/approved-amendment.json", { schema_version: 1, classification: "RESEARCHER_APPROVED_AMENDMENT", charter_changed: true, result_aware: false, post_result_guard: null, finding: "The researcher approved a clearer primary outcome before results.", repair: "Replace the active plan and rebuild the generated contract.", researcher_approval: { path: "repairs/researcher-approval.md", sha256: hash(root, "repairs/researcher-approval.md") } });
  const revised = run("revise-contract", root, "repairs/approved-amendment.json", "repairs/amended-study-plan.md");
  assert.equal(revised.status, 0, revised.stderr);
  const record = read(root, "run.json");
  assert.equal(record.charter_revision, 2);
  assert.equal(record.contract_revision, 2);
  assert.match(fs.readFileSync(path.join(root, "study-plan.md"), "utf8"), /Approved amended plan/);
  const archive = path.join(root, record.invalidation_roots.at(-1).path);
  assert.equal(fs.readFileSync(path.join(archive, "artifacts/study-plan.md"), "utf8"), "# Approved plan\n");
  assert.equal(run("verify", root).status, 0);
});

export { checkpoint as contractCheckpoint, copy as contractCopy, externalAudit, externalContract, json as contractJson, newRun as contractNewRun, put as contractPut, read as contractRead, run as contractRun, through as contractThrough };
