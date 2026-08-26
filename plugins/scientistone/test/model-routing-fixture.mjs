import fs from "node:fs";
import path from "node:path";
import { createRoutingRecord, expectedRoleRuntime, loadModelPolicy } from "../mcp/model-routing.mjs";

const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
const TEST_CATALOG = {
  models: [
    { slug: "test-strong", description: "Frontier agentic test model", priority: 1, visibility: "list", supported_in_api: true, supported_reasoning_levels: efforts },
    { slug: "test-efficient", description: "Fast and affordable agentic test model", priority: 2, visibility: "list", supported_in_api: true, supported_reasoning_levels: efforts },
  ],
};

function installTestRouting(run) {
  const file = path.join(run, "environment", "model-routing.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(createRoutingRecord(TEST_CATALOG, loadModelPolicy(), "2026-08-17T00:00:00Z"), null, 2)}\n`);
}

function testRuntime(run, role) {
  return expectedRoleRuntime(run, role);
}

export { installTestRouting, TEST_CATALOG, testRuntime };
