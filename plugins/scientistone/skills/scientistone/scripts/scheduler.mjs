#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_CAPACITY = 16;
const STATUSES = new Set(["pending", "running", "complete", "failed", "blocked"]);
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message) {
  const error = new Error(message);
  error.code = "S1_INVALID_TASK_LEDGER";
  throw error;
}

function relativeOutput(value, taskId) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) fail(`Task ${taskId} has an invalid output path`);
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) fail(`Task ${taskId} output escapes the run`);
  return normalized.replace(/\/$/, "");
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function validateLedger(input) {
  if (!input || input.schema_version !== 1 || !Array.isArray(input.tasks)) fail("Task ledger must use schema_version 1 and contain tasks");
  const capacity = input.capacity ?? MAX_CAPACITY;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) fail(`capacity must be an integer from 1 through ${MAX_CAPACITY}`);
  const resources = new Map();
  for (const resource of input.resources ?? []) {
    if (!resource || typeof resource.id !== "string" || !STABLE_ID.test(resource.id) || resources.has(resource.id)) fail("Resource ids must be unique portable strings");
    if (typeof resource.parallel_safe !== "boolean") fail(`Resource ${resource.id} must freeze parallel_safe`);
    if (!Number.isInteger(resource.max_concurrency) || resource.max_concurrency < 1) fail(`Resource ${resource.id} must freeze a positive max_concurrency`);
    resources.set(resource.id, { ...resource, limit: resource.parallel_safe ? resource.max_concurrency : 1 });
  }
  const tasks = new Map();
  for (const raw of input.tasks) {
    if (!raw || typeof raw.id !== "string" || !STABLE_ID.test(raw.id) || tasks.has(raw.id)) fail("Task ids must be unique portable strings");
    if (!STATUSES.has(raw.status)) fail(`Task ${raw.id} has an invalid status`);
    const predecessors = raw.predecessors ?? [];
    const outputs = raw.outputs ?? [];
    const resourceIds = raw.resource_ids ?? [];
    if (!Array.isArray(predecessors) || new Set(predecessors).size !== predecessors.length || predecessors.some((id) => typeof id !== "string")) fail(`Task ${raw.id} has invalid predecessors`);
    if (!Array.isArray(outputs) || outputs.length === 0 || new Set(outputs).size !== outputs.length) fail(`Task ${raw.id} must declare unique exclusive outputs`);
    if (!Array.isArray(resourceIds) || new Set(resourceIds).size !== resourceIds.length || resourceIds.some((id) => typeof id !== "string")) fail(`Task ${raw.id} has invalid resource ids`);
    tasks.set(raw.id, { ...raw, predecessors, outputs: outputs.map((output) => relativeOutput(output, raw.id)), resource_ids: resourceIds });
  }
  for (const task of tasks.values()) {
    for (const predecessor of task.predecessors) if (!tasks.has(predecessor) || predecessor === task.id) fail(`Task ${task.id} has an invalid predecessor ${predecessor}`);
    for (const resourceId of task.resource_ids) if (!resources.has(resourceId)) fail(`Task ${task.id} references unknown resource ${resourceId}`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail("Task dependency graph contains a cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const predecessor of tasks.get(id).predecessors) visit(predecessor);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  return { capacity, resources, tasks };
}

function selectReadyTasks(input) {
  const ledger = validateLedger(input);
  const active = [...ledger.tasks.values()].filter((task) => task.status === "running").sort((a, b) => stableCompare(a.id, b.id));
  if (active.length > ledger.capacity) fail("Running tasks exceed the frozen scheduler capacity");
  const occupiedOutputs = [];
  const resourceUse = new Map([...ledger.resources.keys()].map((id) => [id, 0]));
  for (const task of active) {
    for (const output of task.outputs) {
      if (occupiedOutputs.some((item) => overlaps(item.output, output))) fail(`Running tasks have overlapping outputs at ${output}`);
      occupiedOutputs.push({ task: task.id, output });
    }
    for (const resourceId of task.resource_ids) resourceUse.set(resourceId, resourceUse.get(resourceId) + 1);
  }
  for (const [id, used] of resourceUse) if (used > ledger.resources.get(id).limit) fail(`Running tasks exceed resource ${id}`);

  const complete = new Set([...ledger.tasks.values()].filter((task) => task.status === "complete").map((task) => task.id));
  const ready = [];
  const availableSlots = ledger.capacity - active.length;
  const pending = [...ledger.tasks.values()].filter((task) => task.status === "pending").sort((a, b) => stableCompare(a.id, b.id));
  for (const task of pending) {
    if (ready.length >= availableSlots || task.predecessors.some((id) => !complete.has(id))) continue;
    if (task.outputs.some((output) => occupiedOutputs.some((item) => overlaps(item.output, output)))) continue;
    if (task.resource_ids.some((id) => resourceUse.get(id) >= ledger.resources.get(id).limit)) continue;
    ready.push(task.id);
    for (const output of task.outputs) occupiedOutputs.push({ task: task.id, output });
    for (const resourceId of task.resource_ids) resourceUse.set(resourceId, resourceUse.get(resourceId) + 1);
  }
  return {
    schema_version: 1,
    capacity: ledger.capacity,
    active_task_ids: active.map((task) => task.id),
    ready_task_ids: ready,
    remaining_slots: availableSlots - ready.length,
  };
}

function simulateSchedule(input, durations) {
  const validated = validateLedger(input);
  const ledger = {
    ...input,
    tasks: [...validated.tasks.values()].map((task) => ({ ...task, status: task.status === "complete" ? "complete" : "pending" })),
  };
  const timeline = [];
  const running = new Map();
  let now = 0;
  while (ledger.tasks.some((task) => task.status === "pending" || task.status === "running")) {
    const selection = selectReadyTasks(ledger);
    for (const id of selection.ready_task_ids) {
      const duration = durations[id];
      if (!Number.isFinite(duration) || duration <= 0) fail(`Task ${id} needs a positive simulated duration`);
      ledger.tasks.find((task) => task.id === id).status = "running";
      running.set(id, { start_ms: now, end_ms: now + duration });
    }
    if (running.size === 0) fail("No runnable task remains; failed or blocked work must be resolved before scheduling can continue");
    const next = Math.min(...[...running.values()].map((item) => item.end_ms));
    now = next;
    for (const [id, item] of [...running]) {
      if (item.end_ms !== now) continue;
      ledger.tasks.find((task) => task.id === id).status = "complete";
      timeline.push({ task_id: id, ...item });
      running.delete(id);
    }
  }
  timeline.sort((a, b) => a.start_ms - b.start_ms || stableCompare(a.task_id, b.task_id));
  const work = [...validated.tasks.keys()].reduce((sum, id) => sum + (durations[id] ?? 0), 0);
  return { elapsed_ms: now, serial_ms: work, speedup: work / now, timeline };
}

function cli() {
  if (process.argv[2] !== "ready" || !process.argv[3]) fail("Usage: scheduler.mjs ready <task-ledger.json>");
  const ledger = JSON.parse(fs.readFileSync(path.resolve(process.argv[3]), "utf8"));
  process.stdout.write(`${JSON.stringify(selectReadyTasks(ledger))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { cli(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

export { MAX_CAPACITY, selectReadyTasks, simulateSchedule, validateLedger };
