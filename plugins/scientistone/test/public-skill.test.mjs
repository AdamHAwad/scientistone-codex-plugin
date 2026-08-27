import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(relative) {
  return readFile(new URL(relative, root), "utf8");
}

test("public manifest ships one complete local Codex experience", async () => {
  const manifest = JSON.parse(await text(".codex-plugin/plugin.json"));
  assert.equal(manifest.version, "1.1.1");
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
  assert.match(skill, /check_for_updates/);
  assert.match(skill, /wait_for_researcher/);
  assert.match(skill, /publish_study_review/);
  assert.match(skill, /attach_run_monitor/);
  assert.match(monitor, /open_run_monitor/);
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
  assert.match(skill, /retry count alone is not a reason to pause/i);
  assert.match(protocol, /RESEARCHER_APPROVED_AMENDMENT/);
  assert.match(roles, /Do not treat a repairable\s+contract defect as BLOCKED/i);
});
