#!/usr/bin/env node

import { consumeLaunchToken, TOKEN_PATTERN } from "../mcp/model-routing.mjs";

function response(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function deny(reason, code = "S1_LAUNCH_REJECTED") {
  const message = /^\[S1_[A-Z_]+\]/.test(reason) ? reason : `[${code}] ${reason}`;
  response({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message,
    },
  });
}

let text = "";
for await (const chunk of process.stdin) text += chunk;

try {
  const event = JSON.parse(text);
  const input = event?.tool_input;
  if (!input || typeof input !== "object" || Array.isArray(input)) process.exit(0);
  const scientistOneMessage = typeof input.message === "string" && input.message.includes("This is one ScientistOne assignment. You are a fresh specialist");
  if (typeof input.task_name !== "string" || !input.task_name.startsWith("s1_")) {
    if (scientistOneMessage) throw new Error("ScientistOne specialist launches must be authorized by prepare_role_launch.");
    process.exit(0);
  }
  if (!TOKEN_PATTERN.test(input.task_name)) throw new Error("Malformed ScientistOne launch authorization.");
  if (typeof input.message !== "string" || !input.message) throw new Error("ScientistOne specialist launches require the unchanged role-envelope message.");
  const runtime = consumeLaunchToken(input.task_name);
  if (!runtime) throw new Error("ScientistOne launch authorization is missing.");
  const updatedInput = { ...input, task_name: runtime.task_name, fork_turns: "none", model: runtime.model, reasoning_effort: runtime.reasoning_effort };
  delete updatedInput.agent_type;
  response({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput,
    },
  });
} catch (error) {
  deny(error.message || "ScientistOne rejected an invalid specialist launch.", error.code);
}
