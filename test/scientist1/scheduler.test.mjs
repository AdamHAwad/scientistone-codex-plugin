import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectReadyTasks, simulateSchedule, validateLedger } from "../../plugins/scientist1/skills/scientist1/scripts/scheduler.mjs";

const SCHEDULER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientist1/skills/scientist1/scripts/scheduler.mjs");

function task(id, predecessors, outputs, resourceIds = []) {
  return { id, status: "pending", predecessors, outputs, resource_ids: resourceIds };
}

function studyLedger() {
  return {
    schema_version: 1,
    capacity: 16,
    resources: [{ id: "evaluator", parallel_safe: true, max_concurrency: 2 }],
    tasks: [
      task("candidate.a.develop", [], ["search/candidates/a/method"]),
      task("candidate.a.evaluate", ["candidate.a.develop"], ["search/candidates/a/evaluation"], ["evaluator"]),
      task("candidate.a.legitimacy", ["candidate.a.evaluate"], ["search/candidates/a/legitimacy"]),
      task("candidate.b.develop", [], ["search/candidates/b/method"]),
      task("candidate.b.evaluate", ["candidate.b.develop"], ["search/candidates/b/evaluation"], ["evaluator"]),
      task("candidate.b.legitimacy", ["candidate.b.evaluate"], ["search/candidates/b/legitimacy"]),
      task("ablation.design", ["candidate.a.legitimacy", "candidate.b.legitimacy"], ["ablation/plan.json"]),
      task("ablation.a.implement", ["ablation.design"], ["ablation/variants/a"]),
      task("ablation.a.evaluate", ["ablation.a.implement"], ["ablation/evaluations/a"], ["evaluator"]),
      task("ablation.b.implement", ["ablation.design"], ["ablation/variants/b"]),
      task("ablation.b.evaluate", ["ablation.b.implement"], ["ablation/evaluations/b"], ["evaluator"]),
      task("ablation.analyze", ["ablation.a.evaluate", "ablation.b.evaluate"], ["ablation/results.json"]),
      ...["i1", "i2", "i3", "i4.a", "i4.b", "provenance"].map((id) => task(`audit.${id}`, ["ablation.analyze"], [`audit/${id}.json`])),
      task("report", ["audit.i1", "audit.i2", "audit.i3", "audit.i4.a", "audit.i4.b", "audit.provenance"], ["deliverables"]),
    ],
  };
}

test("scheduler runs independent branches together while preserving every causal barrier", () => {
  const ledger = studyLedger();
  const durations = Object.fromEntries(ledger.tasks.map((item, index) => [item.id, 10 + (index % 3)]));
  const result = simulateSchedule(ledger, durations);
  assert.equal(result.timeline.length, ledger.tasks.length);
  assert.equal(new Set(result.timeline.map((item) => item.task_id)).size, ledger.tasks.length);
  assert.ok(result.elapsed_ms < result.serial_ms * 0.6, `${result.elapsed_ms} should be materially below ${result.serial_ms}`);
  assert.ok(result.speedup > 1.6);
  const timing = Object.fromEntries(result.timeline.map((item) => [item.task_id, item]));
  for (const item of ledger.tasks) for (const predecessor of item.predecessors) {
    assert.ok(timing[item.id].start_ms >= timing[predecessor].end_ms, `${item.id} started before ${predecessor} completed`);
  }
  assert.equal(timing["candidate.a.develop"].start_ms, timing["candidate.b.develop"].start_ms);
  assert.equal(timing["audit.i1"].start_ms, timing["audit.provenance"].start_ms);
});

test("scheduler enforces exclusive output ownership and frozen resource limits", () => {
  const ledger = {
    schema_version: 1,
    capacity: 4,
    resources: [{ id: "serial-evaluator", parallel_safe: false, max_concurrency: 9 }],
    tasks: [
      { ...task("a", [], ["results/a"], ["serial-evaluator"]), status: "running" },
      task("b", [], ["results/b"], ["serial-evaluator"]),
      task("c", [], ["results/c"]),
      task("d", [], ["results/d"]),
    ],
  };
  assert.deepEqual(selectReadyTasks(ledger).ready_task_ids, ["c", "d"]);
  ledger.tasks[0].status = "complete";
  assert.deepEqual(selectReadyTasks(ledger).ready_task_ids, ["b", "c", "d"]);
});

test("scheduler rejects cycles, escaping outputs, and unsafe active state", () => {
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [task("a", ["b"], ["a"]), task("b", ["a"], ["b"])] }), /cycle/);
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [task("a", [], ["../outside"])] }), /escapes/);
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [task("é", [], ["inside"])] }), /portable/);
  const overlap = { schema_version: 1, tasks: [{ ...task("a", [], ["same"]), status: "running" }, { ...task("b", [], ["same/child"]), status: "running" }] };
  assert.throws(() => selectReadyTasks(overlap), /overlapping lifetime outputs/);
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [{ ...task("parent", [], ["contract/generated"]), status: "complete" }, task("child", ["parent"], ["contract/generated/audit.md"])] }), /overlapping lifetime outputs/);
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [{ ...task("a", [], ["a"]), attempt: 1 }] }), /duplicates attempt accounting/);
  assert.throws(() => selectReadyTasks({ schema_version: 1, tasks: [task("a", [], ["a"]), { ...task("b", ["a"], ["b"]), status: "complete" }, task("c", ["b"], ["c"])] }), /before every predecessor is complete/);
});

test("scheduler uses bounded least-constraining selection instead of exponential packing", () => {
  const ledger = {
    schema_version: 1,
    capacity: 2,
    resources: [
      { id: "r1", parallel_safe: false, max_concurrency: 1 },
      { id: "r2", parallel_safe: false, max_concurrency: 1 },
    ],
    tasks: [
      task("a", [], ["a"], ["r1", "r2"]),
      task("b", [], ["b"], ["r1"]),
      task("c", [], ["c"], ["r2"]),
    ],
  };
  assert.deepEqual(selectReadyTasks(ledger).ready_task_ids, ["b", "c"]);

  const starResources = ["r0", "r1", "r2", "u00", "u01", "u10", "u11", "u20", "u21"].map((id) => ({ id, parallel_safe: false, max_concurrency: 1 }));
  const star = {
    schema_version: 1,
    capacity: 3,
    resources: starResources,
    tasks: [
      task("a_decoy", [], ["star/decoy"], ["r0", "r1", "r2"]),
      task("b0", [], ["star/b0"], ["r0", "u00", "u01"]),
      task("b1", [], ["star/b1"], ["r1", "u10", "u11"]),
      task("b2", [], ["star/b2"], ["r2", "u20", "u21"]),
    ],
  };
  assert.deepEqual(selectReadyTasks(star).ready_task_ids, ["b0", "b1", "b2"]);

  const activeResources = ["z", "r0", "r1", "s0", "t0", "s1", "t1"].map((id) => ({ id, parallel_safe: false, max_concurrency: 1 }));
  const activeBlocked = {
    schema_version: 1,
    capacity: 3,
    resources: activeResources,
    tasks: [
      { ...task("active", [], ["active"], ["z"]), status: "running" },
      task("a_center", [], ["center"], ["r0", "r1"]),
      task("b0", [], ["b0"], ["r0", "s0", "t0"]),
      task("b1", [], ["b1"], ["r1", "s1", "t1"]),
      task("blocked_s0", [], ["blocked/s0"], ["z", "s0"]),
      task("blocked_t0", [], ["blocked/t0"], ["z", "t0"]),
      task("blocked_s1", [], ["blocked/s1"], ["z", "s1"]),
      task("blocked_t1", [], ["blocked/t1"], ["z", "t1"]),
    ],
  };
  assert.deepEqual(selectReadyTasks(activeBlocked).ready_task_ids, ["b0", "b1"]);

  const resources = Array.from({ length: 13 }, (_, index) => ({ id: `r${String(index).padStart(2, "0")}`, parallel_safe: false, max_concurrency: 1 }));
  const tasks = [];
  for (let left = 0; left < resources.length; left += 1) for (let right = left + 1; right < resources.length; right += 1) {
    const id = `edge-${String(left).padStart(2, "0")}-${String(right).padStart(2, "0")}`;
    tasks.push(task(id, [], [id], [resources[left].id, resources[right].id]));
  }
  const started = performance.now();
  const dense = selectReadyTasks({ schema_version: 1, capacity: 16, resources, tasks });
  assert.equal(dense.ready_task_ids.length, 6);
  assert.ok(performance.now() - started < 1000, "dense valid ledgers must remain bounded in practice");
});

test("scheduler exposes repair-required work and its dependent queue without treating it as terminal", () => {
  const ledger = {
    schema_version: 1,
    tasks: [
      { ...task("source", [], ["source"]), status: "repair_required" },
      task("dependent", ["source"], ["dependent"]),
      task("downstream", ["dependent"], ["downstream"]),
    ],
  };
  const result = selectReadyTasks(ledger);
  assert.deepEqual(result.ready_task_ids, []);
  assert.deepEqual(result.repair_required_task_ids, ["source"]);
  assert.equal(result.repair_required, true);
  assert.deepEqual(result.blocked_task_ids, ["dependent", "downstream"]);
  assert.equal(result.drained, true);
});

test("ready CLI emits the same deterministic launch set", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scientist1-scheduler-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "task-ledger.json");
  fs.writeFileSync(file, `${JSON.stringify(studyLedger())}\n`);
  const result = spawnSync(process.execPath, [SCHEDULER, "ready", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).ready_task_ids, ["candidate.a.develop", "candidate.b.develop"]);
});
