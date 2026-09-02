#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_COE = path.resolve(HERE, "../skills/scientist1/scripts/coe.mjs");
const ACTIVATION_TOOL = /(?:^|__)scientist1_mcp__(?:wait_for_researcher|attach_run_monitor|prepare_role_launch)$/;
const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeProject(value) {
  if (!nonempty(value) || !path.isAbsolute(value)) return null;
  const root = fs.realpathSync(value);
  return fs.statSync(root).isDirectory() ? root : null;
}

export function markerPath(sessionId, projectRoot) {
  if (!nonempty(sessionId) || !nonempty(projectRoot)) return null;
  const id = createHash("sha256").update(sessionId).digest("hex");
  return path.join(projectRoot, ".scientist1", "control", "active-sessions", `${id}.json`);
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, file);
}

function resolveRun(runPath, projectRoot) {
  if (!nonempty(runPath) || !path.isAbsolute(runPath)) return null;
  const run = fs.realpathSync(runPath);
  if (!fs.statSync(run).isDirectory() || path.dirname(run) !== path.join(projectRoot, "scientist1-runs") || !fs.statSync(path.join(run, "run.json")).isFile()) return null;
  return run;
}

export function registerActiveStudy(event) {
  if (!event || event.hook_event_name !== "PreToolUse" || !ACTIVATION_TOOL.test(String(event.tool_name || "")) || !nonempty(event.session_id)) return false;
  const input = event.tool_input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  let projectRoot;
  let marker;
  try {
    if (nonempty(input.project_root)) projectRoot = safeProject(input.project_root);
    else if (nonempty(input.run_path)) {
      const run = fs.realpathSync(input.run_path);
      projectRoot = safeProject(path.dirname(path.dirname(run)));
    }
    marker = markerPath(event.session_id, projectRoot);
    if (!marker) return false;
    if (/wait_for_researcher$/.test(String(event.tool_name))) {
      if (!DRAFT_ID.test(String(input.draft_id || ""))) return false;
      atomicJson(marker, { schema_version: 1, session_id: event.session_id, project_root: projectRoot, draft_id: input.draft_id, run_path: null, registered_at: new Date().toISOString() });
      return true;
    }
    const run = resolveRun(input.run_path, projectRoot);
    if (!run) return false;
    atomicJson(marker, { schema_version: 1, session_id: event.session_id, project_root: projectRoot, draft_id: input.draft_id ?? null, run_path: run, registered_at: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export function activationDecision(event) {
  if (!event || event.hook_event_name !== "PreToolUse" || !ACTIVATION_TOOL.test(String(event.tool_name || ""))) return null;
  if (registerActiveStudy(event)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "[S1_COMPLETION_GUARD_REQUIRED] Scientist1 could not create the project-local completion guard. Repair the project, draft, session, or run path and retry this same tool before continuing the approved study.",
    },
  };
}

function continuation(target, detail) {
  return {
    decision: "block",
    reason: `Continue the approved Scientist1 work at ${target}. ${detail} The researcher already gave the study's one approval. Do not ask for another approval or end the turn. Keep orchestrating specialists, preserve every failed artifact, make the smallest evidence-backed repair, independently recheck it, and continue the same run. Operational failures and repeated gate rejections are repair work, never a terminal study result. Research mode releases this guard only after a fresh CoE verification proves the canonical paper and complete delivery manifest; external-audit mode releases it only after its complete verified audit package.`,
  };
}

function markerForStop(event) {
  if (!nonempty(event?.session_id)) return null;
  let current = safeProject(event?.cwd);
  while (current) {
    const marker = markerPath(event.session_id, current);
    if (marker && fs.existsSync(marker)) {
      const value = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (value.schema_version !== 1 || value.session_id !== event.session_id || value.project_root !== current) throw new Error("Active-study marker is malformed");
      return { marker, value, projectRoot: current };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function finalVerification(runPath, coePath = DEFAULT_COE) {
  return spawnSync(process.execPath, [coePath, "verify", runPath], { cwd: runPath, encoding: "utf8", timeout: 120_000, windowsHide: true });
}

export function stopDecision(event, options = {}) {
  if (!event || event.hook_event_name !== "Stop") return null;
  let active;
  try {
    active = markerForStop(event);
  } catch {
    return continuation("the project-local Scientist1 record", "Repair the active-study marker from the saved intake and run ledgers.");
  }
  if (!active) return null;
  let runPath = active.value.run_path;
  if (!runPath && active.value.draft_id) {
    try {
      const draft = JSON.parse(fs.readFileSync(path.join(active.projectRoot, ".scientist1", "intake", active.value.draft_id, "state.json"), "utf8"));
      if (!["approved", "started"].includes(draft.status)) {
        fs.rmSync(active.marker, { force: true });
        return null;
      }
      runPath = draft.run_path;
      if (!runPath) return continuation("the approved intake", "Initialize the run, bind the durable approval record, attach its monitor, and begin the contract phase now.");
    } catch {
      return continuation("the approved intake", "Restore its saved approval state and initialize the run from the approved request.");
    }
  }
  let run;
  try {
    run = resolveRun(runPath, active.projectRoot);
  } catch {
    return continuation(runPath || "the approved run", "Restore the run ledger from project-local evidence and continue.");
  }
  if (!run) return continuation(runPath || "the approved run", "Restore the run ledger from project-local evidence and continue.");
  let record;
  try {
    record = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  } catch {
    return continuation(run, "Repair the malformed run ledger from its receipts and immutable evidence.");
  }
  if (record.state === "complete" && record.phase === "complete") {
    const verified = (options.verifyRun || finalVerification)(run, options.coePath);
    if (verified?.status === 0) {
      fs.rmSync(active.marker, { force: true });
      return null;
    }
    const detail = String(verified?.stderr || verified?.error?.message || "final verification failed").trim().split("\n")[0].slice(0, 600);
    return continuation(run, `The nominal completion is not valid yet: ${detail}`);
  }
  let runConfig = null;
  try { runConfig = JSON.parse(fs.readFileSync(path.join(run, "contract", "run-config.json"), "utf8")); } catch {}
  if ([2, 3].includes(runConfig?.schema_version) && !record.convergence_control) {
    return continuation(run, "The next executable transition is mandatory Scientist1 1.5 convergence migration: run `coe.mjs migrate-convergence` now, then adjudicate each controller-ordered frozen frontier once before resuming scientific work.");
  }
  if (record.pending_adjudication && !record.active_repair) {
    return continuation(run, `The next causal transition is independent adjudication of ${record.pending_adjudication.path}: launch one Repair Adjudicator, classify the complete source review against the frozen 1.5 checklist, then either dismiss false positives or open one finite repair docket. Do not rerun the same reviewer first.`);
  }
  if (record.active_repair) {
    const docket = record.active_repair;
    const rollback = record.checkpoints?.[docket.target_phase]
      ? docket.target_phase === "contract"
        ? `First run docket-bound revise-contract with ${docket.incident.path}.`
        : `First run docket-bound invalidate for ${docket.target_phase} with ${docket.incident.path}.`
      : "The target phase is not checkpointed, so repair it in place without rollback.";
    return continuation(run, `The next causal transition is repair docket ${docket.docket_id}: ${rollback} Change only ${JSON.stringify(docket.repair_scope)}, regenerate each controller-derived stale dependent exactly once ${JSON.stringify((docket.dependent_regeneration ?? []).map((item) => item.logical_task_name))}, run only ${JSON.stringify(docket.required_review_roles)} against frozen fingerprints ${JSON.stringify(docket.finding_fingerprints)}, and reuse one PASS receipt when a dependent is also the same role/output closure reviewer. Close the exact delta, then checkpoint ${docket.target_phase}. Do not add pre-existing concerns, duplicate an overlapping reviewer, or repeat a whole-phase review.`);
  }
  const legacyTerminal = record.state === ["blocked", "exhausted"].join("_");
  return continuation(run, legacyTerminal ? "Convert the preserved legacy terminal diagnosis with `coe.mjs resume-repair`, then continue from the repaired gate." : `The saved run is ${JSON.stringify(record.state)} at phase ${JSON.stringify(record.phase)}.`);
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let event;
  try {
    event = JSON.parse(input || "{}");
  } catch {
    process.stdout.write(`${JSON.stringify(continuation("the project-local Scientist1 record", "The completion hook received malformed event data; restore the hook event and verify the saved approval before stopping."))}\n`);
    return;
  }
  if (event.hook_event_name === "PreToolUse") {
    const decision = activationDecision(event);
    if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`);
    return;
  }
  const decision = stopDecision(event);
  if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  process.stdout.write(`${JSON.stringify(continuation("the project-local Scientist1 record", `The completion hook failed closed: ${String(error?.message || error).slice(0, 400)}`))}\n`);
});
