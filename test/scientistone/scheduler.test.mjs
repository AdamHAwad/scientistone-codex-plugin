import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectReadyTasks, simulateSchedule, validateLedger } from "../../plugins/scientistone/skills/scientistone/scripts/scheduler.mjs";

const SCHEDULER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientistone/skills/scientistone/scripts/scheduler.mjs");

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
      task("c", [], ["results/a/child"]),
      task("d", [], ["results/d"]),
    ],
  };
  assert.deepEqual(selectReadyTasks(ledger).ready_task_ids, ["d"]);
  ledger.tasks[0].status = "complete";
  assert.deepEqual(selectReadyTasks(ledger).ready_task_ids, ["b", "c", "d"]);
});

test("scheduler rejects cycles, escaping outputs, and unsafe active state", () => {
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [task("a", ["b"], ["a"]), task("b", ["a"], ["b"])] }), /cycle/);
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [task("a", [], ["../outside"])] }), /escapes/);
  assert.throws(() => validateLedger({ schema_version: 1, tasks: [task("é", [], ["inside"])] }), /portable/);
  const overlap = { schema_version: 1, tasks: [{ ...task("a", [], ["same"]), status: "running" }, { ...task("b", [], ["same/child"]), status: "running" }] };
  assert.throws(() => selectReadyTasks(overlap), /overlapping outputs/);
});

test("ready CLI emits the same deterministic launch set", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-scheduler-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "task-ledger.json");
  fs.writeFileSync(file, `${JSON.stringify(studyLedger())}\n`);
  const result = spawnSync(process.execPath, [SCHEDULER, "ready", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).ready_task_ids, ["candidate.a.develop", "candidate.b.develop"]);
});
