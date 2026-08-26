import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRoutingRecord, ensureRunRouting, loadModelPolicy, prepareRoleLaunch, resolveModelCatalog } from "../mcp/model-routing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8"));
const HOOK_COMMAND = HOOK_CONFIG.hooks.PreToolUse[0].hooks[0].command;
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
const model = (slug, description, priority, extra = {}) => ({ slug, description, priority, visibility: "list", supported_in_api: true, supported_reasoning_levels: efforts, ...extra });

function catalog(strong = "gpt-6-astra", efficient = "gpt-6-luna", offset = 0) {
  return { models: [model(strong, "Latest frontier agentic model", 1 + offset), model(efficient, "Fast and affordable agentic model", 2 + offset), model("balanced", "Balanced everyday agentic model", 3 + offset)] };
}

function runRoot(t, name = "routing") {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), `scientistone-${name}-`));
  t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  fs.writeFileSync(path.join(run, "run.json"), "{}\n");
  return run;
}

function runHook(input) {
  return spawnSync(HOOK_COMMAND, { shell: true, env: { ...process.env, PLUGIN_ROOT: ROOT }, input: `${JSON.stringify(input)}\n`, encoding: "utf8" });
}

test("semantic routing follows future catalog meaning instead of model names", () => {
  const resolved = resolveModelCatalog(catalog());
  assert.equal(resolved.tiers.strong.model, "gpt-6-astra");
  assert.equal(resolved.tiers.efficient.model, "gpt-6-luna");

  const arbitrary = resolveModelCatalog({ models: [
    model("model-alpha", "General fast model", 1, { model_tier: "strong" }),
    model("model-beta", "General strong model", 2, { model_tier: "efficient" }),
  ] });
  assert.equal(arbitrary.tiers.strong.model, "model-alpha");
  assert.equal(arbitrary.tiers.efficient.model, "model-beta");
});

test("the bundled policy fixes every efficient role at xhigh", () => {
  const policy = loadModelPolicy();
  assert.deepEqual(policy.roles.i1_verifier_builder, { tier: "strong", reasoning_effort: "xhigh" });
  const efficientRoles = Object.entries(policy.roles).filter(([, setting]) => setting.tier === "efficient");
  assert.ok(efficientRoles.length > 0);
  for (const [role, setting] of efficientRoles) assert.equal(setting.reasoning_effort, "xhigh", role);

  const invalid = structuredClone(policy);
  invalid.roles.evaluator.reasoning_effort = "high";
  assert.throws(() => createRoutingRecord(catalog(), invalid), /requires reasoning effort xhigh for efficient role evaluator/);
});

test("semantic routing fails closed on ambiguity or unsupported effort", () => {
  assert.throws(() => resolveModelCatalog({ models: [
    model("strong-a", "Frontier model", 1),
    model("strong-b", "Flagship model", 1),
    model("efficient", "Fast and affordable model", 2),
  ] }), /ambiguous strong model priority tie/);
  assert.throws(() => resolveModelCatalog({ models: [
    model("strong", "Frontier model", 1),
    model("efficient", "Fast and affordable model", 2, { supported_reasoning_levels: ["low", "medium", "high"] }),
  ] }), /does not support required reasoning effort xhigh/);
});

test("an efficient launch resolves to xhigh", async (t) => {
  const run = runRoot(t, "efficient");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "evaluation",
    role: "evaluator",
    declared_inputs: ["selection/selected"],
    declared_outputs: ["private/evaluator/evaluation.json"],
    allowed_external_sources: [],
  }, { catalog: catalog() });
  assert.equal(prepared.model, "gpt-6-luna");
  assert.equal(prepared.reasoning_effort, "xhigh");
  const launch = JSON.parse(fs.readFileSync(path.join(run, prepared.launch_record), "utf8"));
  assert.equal(launch.reasoning_effort, "xhigh");
});

test("a run freezes its resolution while a new run resolves a newer catalog", async (t) => {
  const first = runRoot(t, "frozen");
  const initial = await ensureRunRouting(first, { catalog: catalog("generation-a-strong", "generation-a-efficient") });
  const newerCatalog = { models: [
    model("generation-b-strong", "Latest frontier agentic model", 1),
    model("generation-b-efficient", "Fast and affordable agentic model", 2),
    model("generation-a-strong", "Prior frontier agentic model", 10),
    model("generation-a-efficient", "Prior fast and affordable agentic model", 11),
  ] };
  const resumed = await ensureRunRouting(first, { catalog: newerCatalog });
  assert.equal(resumed.routing_sha256, initial.routing_sha256);
  assert.equal(resumed.tiers.strong.model, "generation-a-strong");

  const second = runRoot(t, "new");
  const fresh = await ensureRunRouting(second, { catalog: newerCatalog });
  assert.equal(fresh.tiers.strong.model, "generation-b-strong");
  assert.equal(fresh.tiers.efficient.model, "generation-b-efficient");
});

test("the bundled hook rewrites an authorized spawn exactly once and leaves unrelated spawns alone", async (t) => {
  const run = runRoot(t, "hook");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_check",
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
  }, { catalog: catalog() });
  assert.match(prepared.task_name, /^s1_contract_auditor__[0-9a-f]{32}$/);
  const message = "UNCHANGED ROLE ENVELOPE";
  const first = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message, fork_turns: "all", model: "wrong", reasoning_effort: "low", agent_type: "explorer" } });
  assert.equal(first.status, 0, first.stderr);
  const output = JSON.parse(first.stdout);
  const updated = output.hookSpecificOutput.updatedInput;
  assert.deepEqual(updated, { task_name: "contract_check", message, fork_turns: "none", model: "gpt-6-astra", reasoning_effort: "high" });

  const reused = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message } });
  assert.equal(JSON.parse(reused.stdout).hookSpecificOutput.permissionDecision, "deny");

  const unrelated = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "ordinary_task", message } });
  assert.equal(unrelated.status, 0);
  assert.equal(unrelated.stdout, "");

  const bypass = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "contract_check", message: "This is one ScientistOne assignment. You are a fresh specialist" } });
  assert.equal(JSON.parse(bypass.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("the bundled hook denies malformed ScientistOne launch markers", () => {
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "s1_not_a_token__task", message: "role" } });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});
