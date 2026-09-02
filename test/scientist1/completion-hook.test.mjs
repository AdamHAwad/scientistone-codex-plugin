import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { activationDecision, markerPath, registerActiveStudy, stopDecision } from "../../plugins/scientist1/hooks/enforce-study-completion.mjs";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientist1/hooks/enforce-study-completion.mjs");

function fixture(t, state = "running", phase = "contract") {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-completion-project-"));
  const run = path.join(project, "scientist1-runs", "approved-run");
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify({ state, phase })}\n`);
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  return { project, run, session_id: `session-${state}-${phase}` };
}

function registerRun(value) {
  return registerActiveStudy({
    hook_event_name: "PreToolUse",
    tool_name: "mcp__scientist1_mcp__attach_run_monitor",
    tool_input: { project_root: value.project, draft_id: "12345678-1234-1234-1234-123456789abc", run_path: value.run },
    session_id: value.session_id,
    cwd: value.project,
  });
}

function stop(value, extra = {}, options = {}) {
  return stopDecision({ hook_event_name: "Stop", session_id: value.session_id, cwd: value.project, ...extra }, options);
}

test("an active approved run is scoped to its session and project", (t) => {
  const value = fixture(t);
  assert.equal(registerRun(value), true);
  assert.equal(fs.existsSync(markerPath(value.session_id, value.project)), true);
  assert.equal(stopDecision({ hook_event_name: "Stop", session_id: "another-session", cwd: value.project }), null);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-completion-other-"));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  assert.equal(stopDecision({ hook_event_name: "Stop", session_id: value.session_id, cwd: other }), null);
  const child = path.join(value.project, "nested", "working-directory");
  fs.mkdirSync(child, { recursive: true });
  assert.equal(stopDecision({ hook_event_name: "Stop", session_id: value.session_id, cwd: child }).decision, "block");
});

test("relevant activation tools fail closed until the project-local guard is durable", () => {
  const decision = activationDecision({ hook_event_name: "PreToolUse", tool_name: "mcp__scientist1_mcp__attach_run_monitor", tool_input: {}, session_id: "session", cwd: "/missing" });
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /COMPLETION_GUARD_REQUIRED/);
  assert.equal(activationDecision({ hook_event_name: "PreToolUse", tool_name: "unrelated_tool", tool_input: {}, session_id: "session" }), null);
});

test("malformed hook input blocks instead of silently releasing the study", () => {
  const result = spawnSync(process.execPath, [HOOK], { input: "not-json\n", encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /malformed event data/i);
});

test("Stop continues every noncomplete approved run even after a prior continuation", (t) => {
  for (const [state, phase] of [["running", "investigation"], ["repairing", "audit"], [["blocked", "exhausted"].join("_"), "selection"]]) {
    const value = fixture(t, state, phase);
    registerRun(value);
    for (const stop_hook_active of [false, true]) {
      const decision = stop(value, { stop_hook_active });
      assert.equal(decision.decision, "block");
      assert.match(decision.reason, /one approval/i);
      assert.match(decision.reason, /Do not ask for another approval or end the turn/i);
      assert.match(decision.reason, /paper and complete delivery manifest/i);
    }
  }
});

test("Stop names the stable convergence transition instead of repeating a generic retry", (t) => {
  const value = fixture(t, "repairing", "investigation");
  const recordPath = path.join(value.run, "run.json");
  fs.writeFileSync(recordPath, `${JSON.stringify({ state: "repairing", phase: "investigation", convergence_control: { release: "1.5.0" }, pending_adjudication: { path: "repairs/incidents/review.json", sha256: "a".repeat(64) }, active_repair: null })}\n`);
  registerRun(value);
  const adjudication = stop(value);
  assert.match(adjudication.reason, /next causal transition is independent adjudication/i);
  assert.match(adjudication.reason, /Do not rerun the same reviewer first/i);

  fs.writeFileSync(recordPath, `${JSON.stringify({ state: "repairing", phase: "investigation", convergence_control: { release: "1.5.0" }, pending_adjudication: null, active_repair: { docket_id: "b".repeat(64), incident: { path: "repairs/incidents/review.json", sha256: "a".repeat(64) }, repair_scope: ["investigation/brief.md"], required_review_roles: ["brief_critic"], finding_fingerprints: ["c".repeat(64)], target_phase: "investigation" } })}\n`);
  const docket = stop(value);
  assert.match(docket.reason, /next causal transition is repair docket/i);
  assert.match(docket.reason, /Do not add pre-existing concerns, duplicate an overlapping reviewer, or repeat a whole-phase review/i);
});

test("the approval wait closes the gap before run initialization", (t) => {
  const value = fixture(t);
  const draft = "12345678-1234-1234-1234-123456789abc";
  const draftRoot = path.join(value.project, ".scientist1", "intake", draft);
  fs.mkdirSync(draftRoot, { recursive: true });
  fs.writeFileSync(path.join(draftRoot, "state.json"), `${JSON.stringify({ status: "approved", run_path: null })}\n`);
  assert.equal(registerActiveStudy({ hook_event_name: "PreToolUse", tool_name: "mcp__scientist1_mcp__wait_for_researcher", tool_input: { project_root: value.project, draft_id: draft }, session_id: value.session_id, cwd: value.project }), true);
  const decision = stop(value);
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /Initialize the run, bind the durable approval record/i);
});

test("preapproval waits may end, while malformed approved state remains guarded", (t) => {
  const value = fixture(t);
  const draft = "12345678-1234-1234-1234-123456789abc";
  const draftRoot = path.join(value.project, ".scientist1", "intake", draft);
  fs.mkdirSync(draftRoot, { recursive: true });
  fs.writeFileSync(path.join(draftRoot, "state.json"), `${JSON.stringify({ status: "review_ready", run_path: null })}\n`);
  registerActiveStudy({ hook_event_name: "PreToolUse", tool_name: "mcp__scientist1_mcp__wait_for_researcher", tool_input: { project_root: value.project, draft_id: draft }, session_id: value.session_id, cwd: value.project });
  assert.equal(stop(value), null);

  fs.writeFileSync(path.join(draftRoot, "state.json"), "not-json\n");
  registerActiveStudy({ hook_event_name: "PreToolUse", tool_name: "mcp__scientist1_mcp__wait_for_researcher", tool_input: { project_root: value.project, draft_id: draft }, session_id: value.session_id, cwd: value.project });
  assert.equal(stop(value).decision, "block");
});

test("only fresh verified completion releases the guard", (t) => {
  const complete = fixture(t, "complete", "complete");
  registerRun(complete);
  assert.equal(stop(complete, {}, { verifyRun: () => ({ status: 1, stderr: "delivery manifest drifted\n" }) }).decision, "block");
  assert.equal(stop(complete, {}, { verifyRun: () => ({ status: 0 }) }), null);
  assert.equal(fs.existsSync(markerPath(complete.session_id, complete.project)), false);
});
