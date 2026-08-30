import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../plugins/scientistone/", import.meta.url);

async function text(relative) {
  return readFile(new URL(relative, root), "utf8");
}

test("public manifest ships one complete local Codex experience", async () => {
  const manifest = JSON.parse(await text(".codex-plugin/plugin.json"));
  assert.equal(manifest.version, "1.2.0");
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal("apps" in manifest, false);
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  assert.match(manifest.repository, /^https:\/\/github\.com\//);
  assert.match(manifest.interface.privacyPolicyURL, /^https:\/\//);
  assert.match(manifest.interface.termsOfServiceURL, /^https:\/\//);
  assert.equal(manifest.interface.displayName, "ScientistOne");
  assert.equal(manifest.interface.category, "Scientific Research");
  assert.equal(manifest.interface.shortDescription, "Turn a question into a checked research study");
  assert.match(manifest.interface.longDescription, /nine stages/i);
  assert.match(manifest.interface.longDescription, /number of agents adapts/i);
  assert.match(manifest.interface.longDescription, /paper with its sources, code, results, and check reports/i);
  assert.equal(manifest.interface.brandColor, "#347DF5");
  assert.equal(manifest.interface.composerIcon, "./assets/logo.png");
  assert.equal(manifest.interface.logo, "./assets/logo.png");
  assert.equal(manifest.interface.defaultPrompt.length, 3);

  for (const relative of [manifest.interface.composerIcon, manifest.interface.logo]) {
    const info = await stat(new URL(relative, root));
    assert.equal(info.isFile(), true);
    assert.equal(info.size > 0, true);
  }

  const logoSource = await text("assets/logo.svg");
  const logoPng = await readFile(new URL("assets/logo.png", root));
  assert.match(logoSource, /centered blue capital S beside a green numeral one on a transparent square/i);
  assert.match(logoSource, /id="letter-s"[^>]+fill="#347DF5"/s);
  assert.match(logoSource, /id="number-1"[^>]+fill="#33A651"/s);
  assert.match(logoSource, /id="s1-mark"[^>]+transform="translate\(9 6\)"/s);
  assert.doesNotMatch(logoSource, /<rect\b/);
  assert.doesNotMatch(logoSource, /#111111|evidence nodes|checkmark/i);
  assert.equal(logoPng.readUInt32BE(16), 256, "plugin PNG must be 256 pixels wide");
  assert.equal(logoPng.readUInt32BE(20), 256, "plugin PNG must be 256 pixels high");
  assert.equal(logoPng[24], 8, "plugin PNG must use 8-bit color");
  assert.equal(logoPng[25], 3, "plugin PNG must use opaque indexed color");
  assert.equal(logoPng.indexOf(Buffer.from("tRNS")), -1, "plugin PNG must not contain transparency");
  const paletteOffset = logoPng.indexOf(Buffer.from("PLTE"));
  assert.notEqual(paletteOffset, -1, "plugin PNG must include a color palette");
  assert.deepEqual([...logoPng.subarray(paletteOffset + 4, paletteOffset + 7)], [254, 254, 254], "plugin PNG background must be white");
});

test("all three public skills are present and have frontmatter", async () => {
  for (const name of ["scientistone", "scientistone-monitor", "scientistone-results"]) {
    const skill = await text(`skills/${name}/SKILL.md`);
    assert.match(skill, /^---\nname: /);
    assert.match(skill, /\ndescription: /);

    const metadata = await text(`skills/${name}/agents/openai.yaml`);
    assert.match(metadata, /icon_small: "\.\/assets\/logo\.svg"/);
    assert.match(metadata, /icon_large: "\.\/assets\/logo\.svg"/);
    assert.match(metadata, /brand_color: "#347DF5"/);

    const skillLogo = await text(`skills/${name}/assets/logo.svg`);
    assert.equal(skillLogo, await text("assets/logo.svg"));
  }
});

test("Codex skills route setup, review, and monitoring through the bundled MCP", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const monitor = await text("skills/scientistone-monitor/SKILL.md");
  assert.match(skill, /start_study_setup/);
  assert.match(skill, /wait_for_researcher/);
  assert.match(skill, /publish_study_review/);
  assert.match(skill, /attach_run_monitor/);
  assert.match(monitor, /open_run_monitor/);
  assert.match(skill, /wait_timed_out: true/);
  assert.match(skill, /close the same built-in browser tab/i);
  assert.match(skill, /resume_latest: true/);
  const mcp = JSON.parse(await text(".mcp.json"));
  assert.equal(mcp.mcpServers.scientistone_mcp.tool_timeout_sec, 3700);
});

test("ScientistOne offers one opt-in parallel-capacity preflight before intake", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const helper = await text("skills/scientistone/scripts/capacity-preflight.mjs");
  assert.match(skill, /check_parallel_capacity/);
  assert.match(skill, /up to 16 independent research specialists in\s+parallel/);
  assert.match(skill, /may use your Codex allowance faster/i);
  assert.match(skill, /approve_parallel_capacity[\s\S]+one-use `confirmation_token`/);
  assert.match(skill, /decline_parallel_capacity/);
  assert.match(skill, /before creating an intake draft or run/i);
  assert.match(skill, /declined, managed,[\s\S]+never triggers another prompt/i);
  assert.match(skill, /absolute ScientistOne ceiling of 16 live specialists/i);
  assert.match(skill, /never run\s+it through the agent terminal/i);
  assert.match(helper, /Refusing to change Codex configuration without explicit researcher confirmation/);
  assert.match(helper, /"config\/read"/);
  assert.match(helper, /"config\/batchWrite"/);
  assert.match(helper, /expectedVersion/);
  assert.doesNotMatch(helper, /patchParallelCapacity|parseParallelCapacity/);
});

test("setup doctrine requires the bundled local server", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const intake = await text("skills/scientistone/references/intake.md");
  assert.match(skill, /bundled local browser is the only full browser experience/i);
  assert.match(skill, /Do not render or substitute an inline MCP form/i);
  assert.match(skill, /read_study_setup/);
  assert.match(skill, /wait_for_researcher/);
  assert.match(skill, /seven-step full-page wizard/i);
  assert.match(skill, /copied directly by the bundled local MCP/i);
  assert.match(skill, /Do not upload them to any remote service/i);
  assert.match(intake, /bind only to loopback/i);
  assert.match(intake, /never sent to a remote ScientistOne service/i);
});

test("sparse intake and generated-contract defects remain recoverable", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const intake = await text("skills/scientistone/references/intake.md");
  const protocol = await text("skills/scientistone/references/protocol.md");
  const roles = await text("skills/scientistone/references/roles.md");
  assert.match(intake, /Only the research question is required/i);
  assert.match(intake, /Blank purpose, prior-work, evaluation, limit, or deliverable fields are valid intake/i);
  assert.match(skill, /result-blind defect[\s\S]+same run/i);
  assert.match(skill, /result-aware defect[\s\S]+invalidate_and_rerun/i);
  assert.match(skill, /approved run stays `running` or `repairing` until verified completion/i);
  assert.match(protocol, /RESEARCHER_APPROVED_AMENDMENT/);
  assert.match(roles, /Do not treat a repairable\s+contract defect as BLOCKED/i);
});

test("public protocol retains the paper-compatible pilot default", async () => {
  const protocol = await text("skills/scientistone/references/protocol.md");
  const artifacts = await text("skills/scientistone/references/artifacts.md");
  assert.match(protocol, /pilot profile as the default/i);
  assert.match(protocol, /standard profile only when the\s+researcher explicitly approves those larger budgets/i);
  assert.match(artifacts, /Pilot remains the paper-compatible default/i);
  assert.match(artifacts, /Standard is available only when the researcher explicitly approves/i);
});

test("the optimized scheduler preserves causal barriers while filling independent slots", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const scheduler = await text("skills/scientistone/scripts/scheduler.mjs");
  assert.match(skill, /dependency-ready queue, not a serial checklist/i);
  assert.match(skill, /Prepare each one-use launch grant only when a slot is ready/i);
  assert.match(skill, /refill immediately when the first task finishes/i);
  assert.match(skill, /completion order change seeds, ranking, tie-breaking, or collation/i);
  assert.match(skill, /candidate version -> evaluator -> sanitize-feedback -> optional fresh next\s+version[\s\S]+Legitimacy Auditor\s+only after that branch is complete/i);
  assert.match(skill, /Ablation Designer is a barrier[\s\S]+Implementer -> Evaluator[\s\S]+Ablation Analyst waits for all variants/i);
  assert.match(skill, /launch I1, every\s+I2 vote, I3, every I4 vote, and claim provenance together/i);
  assert.match(skill, /Audit Reporter\s+waits for all independent reports and votes/i);
  assert.match(skill, /verify-role[\s\S]+Never reuse a prior\s+sample as a new repetition or vote/i);
  assert.match(skill, /environment\/task-ledger\.json/);
  assert.match(skill, /scheduler\.mjs\s+ready/);
  assert.match(scheduler, /overlapping outputs/);
  assert.match(scheduler, /Task dependency graph contains a cycle/);
  assert.match(scheduler, /MAX_CAPACITY = 16/);
});

test("phase preflight is read-only and mandatory before downstream work", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const artifacts = await text("skills/scientistone/references/artifacts.md");
  const coe = await text("skills/scientistone/scripts/coe.mjs");
  assert.match(skill, /read-only `coe\.mjs preflight`[\s\S]+before any downstream specialist launches/i);
  assert.match(artifacts, /same artifact,[\s\S]+lineage, metric, and manifest gates without writing a\s+receipt/i);
  assert.match(coe, /function preflight/);
  assert.match(coe, /validatePhasePromotion/);
});

test("the compressed common role prefix retains every safety and evidence obligation", async () => {
  const roles = await text("skills/scientistone/references/roles.md");
  const envelope = roles.match(/## Common role envelope\s+```text\n([\s\S]+?)\n```/)?.[1];
  assert.ok(envelope);
  assert.ok(envelope.trim().split(/\s+/).length < 650, "common prefix should remain compact enough for repeated launches");
  for (const pattern of [
    /Saved files.not chat.carry authority/is,
    /Read only declared inputs[\s\S]+write only\s+declared outputs/i,
    /Candidate-facing roles must not inspect private/i,
    /auditable separation, not a security sandbox/i,
    /Never invent a source, result, measurement, locator, path, or completed check/i,
    /Preserve negative, failed, ambiguous, and contradictory evidence/i,
    /Use BLOCKED only for an unavailable required input\/authority/i,
    /never install\s+globally/i,
    /Record every environment change/i,
    /exact input\/output hash bindings/i,
    /Checkpoint only COMPLETE\/PASS/i,
  ]) assert.match(envelope, pattern);
});

test("one approval drives an approved run through verified delivery", async () => {
  const skill = await text("skills/scientistone/SKILL.md");
  const intake = await text("skills/scientistone/references/intake.md");
  const protocol = await text("skills/scientistone/references/protocol.md");
  const roles = await text("skills/scientistone/references/roles.md");
  const hooks = JSON.parse(await text("hooks/hooks.json"));
  assert.match(skill, /Approve and start study.*durable authority/i);
  assert.match(skill, /Immediately after approval, use native goal tools/i);
  assert.match(skill, /never ask the researcher for approval, permission, authority, confirmation/i);
  assert.match(skill, /Do not create `attention\.md` after approval/i);
  assert.match(skill, /Do not report completion or end an approved run until[\s\S]+final verifier passes/i);
  assert.match(intake, /only approval checkpoint/i);
  assert.match(protocol, /Never reopen approval or ask the researcher/i);
  assert.match(roles, /Classify every REVISE finding as `AUTOMATIC_REPAIR`/i);
  assert.doesNotMatch(roles, /Classify every REVISE finding[^\n]+REAPPROVAL_REQUIRED/i);
  assert.ok(Array.isArray(hooks.hooks.Stop) && hooks.hooks.Stop.length === 1);
  assert.match(hooks.hooks.Stop[0].hooks[0].command, /enforce-study-autonomy\.mjs/);
});
