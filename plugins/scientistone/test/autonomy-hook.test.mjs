import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { markerPath, registerActiveRun, stopDecision } from "../hooks/enforce-study-autonomy.mjs";

function fixture(t, state = "running", phase = "contract") {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-autonomy-project-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-autonomy-data-"));
  const run = path.join(cwd, "scientistone-runs", "approved-run");
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify({ state, phase })}\n`);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  t.after(() => fs.rmSync(data, { recursive: true, force: true }));
  return { cwd, data, run, env: { PLUGIN_DATA: data }, session_id: "session-approved-study" };
}

function register(value) {
  return registerActiveRun({
    hook_event_name: "PreToolUse",
    tool_name: "mcp__scientistone_mcp__attach_run_monitor",
    tool_input: { run_path: value.run },
    session_id: value.session_id,
    cwd: value.cwd,
  }, value.env);
}

function stop(value, extra = {}, options = {}) {
  return stopDecision({ hook_event_name: "Stop", session_id: value.session_id, cwd: value.cwd, ...extra }, { env: value.env, ...options });
}

test("an attached approved run is scoped to its session and project", (t) => {
  const value = fixture(t);
  assert.equal(register(value), true);
  const marker = markerPath(value.session_id, value.env);
  assert.equal(fs.existsSync(marker), true);
  assert.equal(stopDecision({ hook_event_name: "Stop", session_id: "another-session", cwd: value.cwd }, { env: value.env }), null);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-autonomy-other-"));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  assert.equal(stopDecision({ hook_event_name: "Stop", session_id: value.session_id, cwd: other }, { env: value.env }), null);
});

test("Stop keeps an approved study going even after a prior continuation", (t) => {
  const value = fixture(t, "repairing", "contract");
  register(value);
  for (const stop_hook_active of [false, true]) {
    const decision = stop(value, { stop_hook_active });
    assert.equal(decision.decision, "block");
    assert.match(decision.reason, /already gave the study's one approval/i);
    assert.match(decision.reason, /Do not ask for approval, permission, authority, confirmation/i);
    assert.match(decision.reason, /final paper and delivery package exist and the final verifier passes/i);
  }
});

test("paused, failed, and invalid complete states automatically continue", (t) => {
  for (const [state, phase] of [["paused", "contract"], ["failed", "investigation"], ["complete", "complete"]]) {
    const value = fixture(t, state, phase);
    value.session_id = `session-${state}`;
    register(value);
    const decision = stop(value, {}, { verifyRun: () => ({ status: 1, stderr: "final manifest mismatch\n" }) });
    assert.equal(decision.decision, "block");
    if (state === "complete") assert.match(decision.reason, /final manifest mismatch/);
  }
});

test("verified completion and explicit cancellation release the guard", (t) => {
  const complete = fixture(t, "complete", "complete");
  complete.session_id = "session-complete";
  register(complete);
  assert.equal(stop(complete, {}, { verifyRun: () => ({ status: 0 }) }), null);
  assert.equal(fs.existsSync(markerPath(complete.session_id, complete.env)), false);

  const cancelled = fixture(t, "cancelled", "contract");
  cancelled.session_id = "session-cancelled";
  register(cancelled);
  assert.equal(stop(cancelled), null);
  assert.equal(fs.existsSync(markerPath(cancelled.session_id, cancelled.env)), false);
});

test("unrelated turns and malformed activation paths are not captured", (t) => {
  const value = fixture(t);
  assert.equal(registerActiveRun({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { run_path: value.run }, session_id: value.session_id, cwd: value.cwd }, value.env), false);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-outside-run-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "run.json"), "{}\n");
  assert.equal(registerActiveRun({ hook_event_name: "PreToolUse", tool_name: "mcp__scientistone_mcp__prepare_role_launch", tool_input: { run_path: outside }, session_id: value.session_id, cwd: value.cwd }, value.env), false);
  assert.equal(stop(value), null);
});
