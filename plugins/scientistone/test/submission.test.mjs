import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { handleMessage } from "../mcp/server.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const submission = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, "chatgpt-app-submission.json"), "utf8"));

test("the ChatGPT app submission import matches the live MCP tool contract", async () => {
  assert.equal(submission.$schema, "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json");
  assert.equal(submission.schema_version, 1);
  assert.ok(submission.app_info.subtitle.length <= 30);
  assert.equal(submission.test_cases.length, 5);
  assert.equal(submission.negative_test_cases.length, 3);

  const listed = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const toolNames = new Set(listed.tools.map((tool) => tool.name));
  assert.deepEqual(new Set(Object.keys(submission.tools)), toolNames);
  for (const tool of listed.tools) assert.deepEqual(submission.tools[tool.name].annotations, tool.annotations);
  for (const testCase of submission.test_cases) {
    const triggered = testCase.tools_triggered.split(",").map((name) => name.trim());
    assert.ok(triggered.length > 0);
    for (const name of triggered) assert.ok(toolNames.has(name), `Unknown positive-test tool: ${name}`);
  }
  for (const testCase of submission.negative_test_cases) assert.equal(testCase.tools_triggered, null);
});
