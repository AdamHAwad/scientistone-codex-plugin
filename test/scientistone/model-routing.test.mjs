import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { clearLiveCatalogCache, consumeLaunchToken, createRoutingRecord, ensureRunRouting, launchGrantDirectory, loadModelPolicy, prepareRoleLaunch, resolveModelCatalog, validateRoutingRecord } from "../../plugins/scientistone/mcp/model-routing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/scientistone");
const HOOK_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8"));
const HOOK_COMMAND = HOOK_CONFIG.hooks.PreToolUse[0].hooks[0].command;
const STATE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-launch-state-"));
after(() => fs.rmSync(STATE_HOME, { recursive: true, force: true }));
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
const model = (slug, description, priority, extra = {}) => ({ slug, description, priority, visibility: "list", supported_in_api: true, supported_reasoning_levels: efforts, ...extra });

function catalog(strong = "gpt-6-astra", efficient = "gpt-6-luna", offset = 0) {
  return { models: [model(strong, "Latest frontier agentic model", 1 + offset), model(efficient, "Fast and affordable agentic model", 2 + offset), model("balanced", "Balanced everyday agentic model", 3 + offset)] };
}

function runRoot(t, name = "routing") {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), `scientistone-${name}-`));
  t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify({ state: "running", contract_revision: 1, charter_revision: 1, last_checkpoint: null, checkpoints: {} })}\n`);
  fs.mkdirSync(path.join(run, "contract"), { recursive: true });
  fs.writeFileSync(path.join(run, "contract", "run-config.json"), `${JSON.stringify({ schema_version: 2, orchestration: { max_task_attempts: 2, max_repair_waves_per_gate: 1 } })}\n`);
  fs.writeFileSync(path.join(run, "study-plan.md"), "# Test plan\n");
  fs.mkdirSync(path.join(run, "selection", "selected"), { recursive: true });
  fs.writeFileSync(path.join(run, "selection", "selected", "method.txt"), "test\n");
  return run;
}

function brief(input = "study-plan.md") {
  return { objective: "Complete the assigned gate.", context: "This task advances the current ScientistOne phase.", acceptance_gate: "Return only validated declared outputs.", constraints: "Preserve the frozen study plan and CoE requirements; do not add speculative work.", upstream_summary: [{ input_path: input, summary: "Binding approved study context." }] };
}

function runHook(input, env = {}) {
  return spawnSync(HOOK_COMMAND, { shell: true, env: { ...process.env, SCIENTISTONE_STATE_HOME: STATE_HOME, PLUGIN_ROOT: ROOT, ...env }, input: `${JSON.stringify(input)}\n`, encoding: "utf8" });
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

test("the bundled policy reserves deep reasoning for judgment and lowers mechanical roles", () => {
  const policy = loadModelPolicy();
  assert.deepEqual(policy.roles.i1_verifier_builder, { tier: "strong", reasoning_effort: "high" });
  assert.equal(policy.roles.evaluator.reasoning_effort, "low");
  assert.equal(policy.roles.audit_reporter.reasoning_effort, "low");
  assert.equal(policy.roles.i3_reference_auditor.reasoning_effort, "high");
  assert.doesNotThrow(() => createRoutingRecord(catalog(), policy));
});

test("every frozen policy role resolves through the real launch prompt path", async (t) => {
  const run = runRoot(t, "all-role-prompts");
  for (const role of Object.keys(loadModelPolicy().roles).sort()) {
    const prepared = await prepareRoleLaunch({
      run_path: run,
      task_name: `prompt_${role}`,
      role,
      declared_inputs: ["study-plan.md"],
      declared_outputs: [`role-output/${role}.json`],
      allowed_external_sources: [],
      task_brief: brief(),
    }, { catalog: catalog(), stateHome: STATE_HOME });
    assert.match(prepared.assignment, /Role card\n/);
  }
});

test("every frozen 1.2 policy role resolves without changing the released role asset", async (t) => {
  const run = runRoot(t, "all-legacy-role-prompts");
  fs.writeFileSync(path.join(run, "contract", "run-config.json"), `${JSON.stringify({ schema_version: 1, mode: "research" })}\n`);
  const legacyPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, "skills", "scientistone", "references", "legacy-model-policy-1.2.0.json"), "utf8"));
  for (const role of Object.keys(legacyPolicy.roles).sort()) {
    const prepared = await prepareRoleLaunch({
      run_path: run,
      task_name: `legacy_prompt_${role}`,
      role,
      declared_inputs: ["study-plan.md"],
      declared_outputs: [`legacy-role-output/${role}.json`],
      allowed_external_sources: [],
      task_brief: brief(),
    }, { catalog: catalog(), stateHome: STATE_HOME });
    assert.match(prepared.assignment, /Role card\n/);
  }
});

test("semantic routing fails closed on ambiguity or unsupported effort", () => {
  assert.throws(() => resolveModelCatalog({ models: [
    model("strong-a", "Frontier model", 1),
    model("strong-b", "Flagship model", 1),
    model("efficient", "Fast and affordable model", 2),
  ] }), /ambiguous strong model priority tie/);
  assert.throws(() => resolveModelCatalog({ models: [
    model("strong", "Frontier model", 1),
    model("efficient", "Fast and affordable model", 2, { supported_reasoning_levels: ["low", "medium"] }),
  ] }), /does not support required reasoning effort high/);
});

test("saved routing records reject unknown fields before launch matching", () => {
  const record = { ...createRoutingRecord(catalog()), unexpected: true };
  assert.throws(() => validateRoutingRecord(record), /unknown or missing fields/);
});

test("a mechanical efficient launch resolves to low effort", async (t) => {
  const run = runRoot(t, "efficient");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "evaluation",
    role: "evaluator",
    declared_inputs: ["selection/selected"],
    declared_outputs: ["private/evaluator/evaluation.json"],
    allowed_external_sources: [],
    task_brief: brief("selection/selected"),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(prepared.model, "gpt-6-luna");
  assert.equal(prepared.reasoning_effort, "low");
  const launch = JSON.parse(fs.readFileSync(path.join(run, prepared.launch_record), "utf8"));
  assert.equal(launch.reasoning_effort, "low");
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

test("an unavailable frozen route is archived and replaced for future launches", async (t) => {
  const run = runRoot(t, "unavailable");
  const first = await ensureRunRouting(run, { catalog: catalog("generation-a-strong", "generation-a-efficient") });
  const original = fs.readFileSync(path.join(run, "environment", "model-routing.json"));
  const next = await ensureRunRouting(run, { catalog: catalog("generation-b-strong", "generation-b-efficient") });
  assert.notEqual(next.routing_sha256, first.routing_sha256);
  assert.equal(next.tiers.strong.model, "generation-b-strong");
  assert.deepEqual(fs.readFileSync(path.join(run, "environment", "model-routing.json")), original);
  assert.ok(fs.existsSync(path.join(run, "environment", "routing-history", `${next.routing_sha256}.json`)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run, "environment", "model-routing-active.json"), "utf8")), { schema_version: 1, routing_sha256: next.routing_sha256, path: `environment/routing-history/${next.routing_sha256}.json` });
});

test("live catalog probes are single-flight, bounded, bypassable, and recover after failure", async (t) => {
  clearLiveCatalogCache();
  const run = runRoot(t, "catalog-cache");
  let calls = 0;
  const loader = async () => { calls += 1; await new Promise((resolve) => setImmediate(resolve)); return catalog(); };
  await Promise.all([
    ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 1_000 }),
    ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 1_000 }),
  ]);
  assert.equal(calls, 1);
  await ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 1_001 });
  assert.equal(calls, 1);
  await ensureRunRouting(run, { catalogLoader: loader, catalogContext: "account-a", now: 2_000, catalogTtlMs: 10 });
  assert.equal(calls, 2);
  await ensureRunRouting(run, { catalog: catalog(), catalogLoader: async () => { throw new Error("must not run"); }, catalogContext: "explicit" });
  assert.equal(calls, 2);

  clearLiveCatalogCache();
  const retry = runRoot(t, "catalog-retry");
  let attempts = 0;
  const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error("temporary catalog failure"); return catalog(); };
  await assert.rejects(ensureRunRouting(retry, { catalogLoader: flaky, catalogContext: "account-b" }), /temporary catalog failure/);
  await ensureRunRouting(retry, { catalogLoader: flaky, catalogContext: "account-b" });
  assert.equal(attempts, 2);
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
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.match(prepared.task_name, /^s1_contract_auditor__[0-9a-f]{32}$/);
  const message = prepared.assignment;
  const first = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message, fork_turns: "all", model: "wrong", reasoning_effort: "low", agent_type: "explorer" } });
  assert.equal(first.status, 0, first.stderr);
  const output = JSON.parse(first.stdout);
  const updated = output.hookSpecificOutput.updatedInput;
  assert.deepEqual(updated, { task_name: "contract_check", message, fork_turns: "none", model: "gpt-6-astra", reasoning_effort: "high" });

  const reused = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message } });
  assert.equal(JSON.parse(reused.stdout).hookSpecificOutput.permissionDecision, "deny");

  const unrelated = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "ordinary_task", message: "ordinary assignment" } });
  assert.equal(unrelated.status, 0);
  assert.equal(unrelated.stdout, "");

  const bypass = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "contract_check", message: "This is one ScientistOne assignment. You are a fresh specialist" } });
  assert.equal(JSON.parse(bypass.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("the bundled hook denies malformed ScientistOne launch markers", () => {
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: "s1_not_a_token__task", message: "role" } });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("launch grants survive different MCP and hook temporary directories", async (t) => {
  const stableHome = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-stable-home-"));
  t.after(() => fs.rmSync(stableHome, { recursive: true, force: true }));
  assert.equal(
    launchGrantDirectory({ home: stableHome, platform: "darwin", env: { TMPDIR: "/tmp/mcp-a", TMP: "/tmp/mcp-a", TEMP: "/tmp/mcp-a" } }),
    launchGrantDirectory({ home: stableHome, platform: "darwin", env: { TMPDIR: "/tmp/hook-b", TMP: "/tmp/hook-b", TEMP: "/tmp/hook-b" } }),
  );
  const run = runRoot(t, "cross-temp");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "cross_temp_contract_check",
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const hookTemp = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-hook-temp-"));
  t.after(() => fs.rmSync(hookTemp, { recursive: true, force: true }));
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message: prepared.assignment } }, { TMPDIR: hookTemp, TMP: hookTemp, TEMP: hookTemp });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "allow");
});

test("expired grants have a stable recovery code and a fresh grant can reuse the attempt", async (t) => {
  const run = runRoot(t, "retry");
  const first = await prepareRoleLaunch({
    run_path: run,
    task_name: "literature_map_a1",
    logical_task_name: "literature_map",
    attempt: 1,
    role: "literature_mapper",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["evidence/search-log.jsonl"],
    allowed_external_sources: ["scholarly_web"],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME, now: 1_000, grantTtlMs: 10 });
  assert.throws(() => consumeLaunchToken(first.task_name, { stateHome: STATE_HOME, now: 1_011 }), (error) => error.code === "S1_LAUNCH_GRANT_EXPIRED");

  const second = await prepareRoleLaunch({
    run_path: run,
    task_name: "literature_map_a2",
    logical_task_name: "literature_map",
    attempt: 1,
    role: "literature_mapper",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["evidence/search-log.jsonl"],
    allowed_external_sources: ["scholarly_web"],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const result = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: second.task_name, message: second.assignment } });
  const updated = JSON.parse(result.stdout).hookSpecificOutput.updatedInput;
  assert.equal(updated.task_name, "literature_map_a2");
  const launch = JSON.parse(fs.readFileSync(path.join(run, second.launch_record), "utf8"));
  assert.equal(launch.logical_task_name, "literature_map");
  assert.equal(launch.attempt, 1);
  assert.throws(() => consumeLaunchToken(second.task_name, { stateHome: STATE_HOME }), (error) => error.code === "S1_LAUNCH_GRANT_NOT_FOUND");
});

test("invalid spawn text does not burn a valid grant and accepted launch attempts are capped", async (t) => {
  const run = runRoot(t, "bounded-attempts");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_a1",
    logical_task_name: "contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const rejected = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message: `${prepared.assignment}\nextra` } });
  assert.equal(JSON.parse(rejected.stdout).hookSpecificOutput.permissionDecision, "deny");
  const accepted = runHook({ hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_input: { task_name: prepared.task_name, message: prepared.assignment } });
  assert.equal(JSON.parse(accepted.stdout).hookSpecificOutput.permissionDecision, "allow");

  fs.mkdirSync(path.join(run, "role-receipts"), { recursive: true });
  fs.writeFileSync(path.join(run, "role-receipts", "contract_a1.json"), `${JSON.stringify({ execution_status: "FAILED", gate_verdict: "FAIL" })}\n`);
  fs.unlinkSync(path.join(run, "role-receipts", "contract_a1.json"));
  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "renamed_contract_a1",
    logical_task_name: "contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_TASK_ATTEMPT_SEQUENCE");

  const retry = await prepareRoleLaunch({
    run_path: run,
    task_name: "contract_a2",
    logical_task_name: "contract",
    attempt: 2,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(retry.attempt, 2);

  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "contract_alias_a1",
    logical_task_name: "contract_alias",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_LOGICAL_TASK_ALIAS");

  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "contract_a3",
    logical_task_name: "contract",
    attempt: 3,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_TASK_ATTEMPTS_EXHAUSTED");

  assert.equal(consumeLaunchToken(retry.task_name, { stateHome: STATE_HOME }).attempt, 2);
  const originalRecord = JSON.parse(fs.readFileSync(path.join(run, "run.json"), "utf8"));
  const forgedRevision = structuredClone(originalRecord);
  forgedRevision.contract_revision = 2;
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(forgedRevision)}\n`);
  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "contract_r2_a1",
    logical_task_name: "contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/audit.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), /not backed by immutable invalidation history/);
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(originalRecord)}\n`);

  const pending = await prepareRoleLaunch({
    run_path: run,
    task_name: "late_contract_a1",
    logical_task_name: "late_contract",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/late.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  const terminalRecord = structuredClone(originalRecord);
  terminalRecord.state = "blocked_exhausted";
  fs.writeFileSync(path.join(run, "run.json"), `${JSON.stringify(terminalRecord)}\n`);
  assert.throws(() => consumeLaunchToken(pending.task_name, { stateHome: STATE_HOME }), (error) => error.code === "S1_RUN_TERMINAL_OR_INACTIVE");
  await assert.rejects(prepareRoleLaunch({
    run_path: run,
    task_name: "after_terminal",
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/late.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_RUN_TERMINAL_OR_INACTIVE");
});

test("exclusive work identity rejects self-overlap, cross-task prefixes, and late-conflict poisoning", async (t) => {
  const run = runRoot(t, "output-overlap");
  const args = {
    run_path: run,
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  };

  await assert.rejects(prepareRoleLaunch({
    ...args,
    task_name: "self_overlap_a1",
    logical_task_name: "self_overlap",
    declared_outputs: ["contract", "contract/audit.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND");

  const parent = await prepareRoleLaunch({
    ...args,
    task_name: "parent_a1",
    logical_task_name: "parent",
    declared_outputs: ["contract/generated"],
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(consumeLaunchToken(parent.task_name, { stateHome: STATE_HOME }).attempt, 1);

  await assert.rejects(prepareRoleLaunch({
    ...args,
    task_name: "child_a1",
    logical_task_name: "child",
    declared_outputs: ["contract/generated/audit.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND");

  await assert.rejects(prepareRoleLaunch({
    ...args,
    task_name: "late_conflict_a1",
    logical_task_name: "late_conflict",
    declared_outputs: ["contract/independent.md", "contract/generated/audit.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME }), (error) => error.code === "S1_OUTPUT_WORK_REBOUND");

  const clean = await prepareRoleLaunch({
    ...args,
    task_name: "clean_a1",
    logical_task_name: "clean",
    declared_outputs: ["contract/independent.md"],
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(consumeLaunchToken(clean.task_name, { stateHome: STATE_HOME }).attempt, 1, "the rejected multi-output bind must not poison an unrelated output");
});

test("work identity recovers a lock left by a dead launch process", async (t) => {
  const run = runRoot(t, "stale-identity-lock");
  const revisionRoot = path.join(run, "role-attempts", "_revision-1-1");
  fs.mkdirSync(revisionRoot, { recursive: true });
  fs.writeFileSync(path.join(revisionRoot, ".identity.lock"), "99999999\n");
  const prepared = await prepareRoleLaunch({
    run_path: run,
    task_name: "recovered_a1",
    logical_task_name: "recovered",
    attempt: 1,
    role: "contract_auditor",
    declared_inputs: ["study-plan.md"],
    declared_outputs: ["contract/recovered.md"],
    allowed_external_sources: [],
    task_brief: brief(),
  }, { catalog: catalog(), stateHome: STATE_HOME });
  assert.equal(prepared.attempt, 1);
  assert.equal(fs.existsSync(path.join(revisionRoot, ".identity.lock")), false);
});
