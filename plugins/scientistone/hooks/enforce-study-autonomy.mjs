#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_COE = path.resolve(HERE, "../skills/scientistone/scripts/coe.mjs");
const ACTIVE_TOOL = /(?:^|__)scientistone_mcp__(?:attach_run_monitor|prepare_role_launch)$/;

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stateRoot(env = process.env) {
  const root = env.PLUGIN_DATA || env.SCIENTISTONE_STATE_HOME;
  return nonempty(root) ? path.resolve(root) : null;
}

export function markerPath(sessionId, env = process.env) {
  const root = stateRoot(env);
  if (!root || !nonempty(sessionId)) return null;
  const id = createHash("sha256").update(sessionId).digest("hex");
  return path.join(root, "active-runs", `${id}.json`);
}

function resolveRun(runPath, cwd) {
  if (!nonempty(runPath) || !nonempty(cwd) || !path.isAbsolute(runPath) || !path.isAbsolute(cwd)) return null;
  const realCwd = fs.realpathSync(cwd);
  const realRun = fs.realpathSync(runPath);
  if (!fs.statSync(realRun).isDirectory()) return null;
  const expectedParent = path.join(realCwd, "scientistone-runs");
  if (path.dirname(realRun) !== expectedParent || !fs.statSync(path.join(realRun, "run.json")).isFile()) return null;
  return { cwd: realCwd, run_path: realRun };
}

export function registerActiveRun(event, env = process.env) {
  if (!event || event.hook_event_name !== "PreToolUse" || !ACTIVE_TOOL.test(String(event.tool_name || ""))) return false;
  const marker = markerPath(event.session_id, env);
  if (!marker) return false;
  const resolved = resolveRun(event.tool_input?.run_path, event.cwd);
  if (!resolved) return false;
  fs.mkdirSync(path.dirname(marker), { recursive: true, mode: 0o700 });
  const temporary = `${marker}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ schema_version: 1, session_id: event.session_id, ...resolved, registered_at: new Date().toISOString() }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, marker);
  return true;
}

function continuation(runPath, detail = "") {
  const suffix = detail ? ` ${detail}` : "";
  return {
    decision: "block",
    reason: `Continue the active ScientistOne study at ${runPath}.${suffix} The researcher already gave the study's one approval. Do not ask for approval, permission, authority, confirmation, a reply, a restart, or a resume message. Clear any attention item, keep the run running or repairing, and autonomously repair the same run. Retry recoverable operations, replace unavailable capabilities with safe in-scope alternatives, preserve every failure, and progress through every remaining phase. In research mode, stop only after the final paper and delivery package exist and the final verifier passes; in external-audit mode, stop only after the verified audit package exists. An explicit researcher cancellation is the only earlier terminal state.`,
  };
}

function readMarker(marker) {
  const value = JSON.parse(fs.readFileSync(marker, "utf8"));
  if (value?.schema_version !== 1 || !nonempty(value.session_id) || !nonempty(value.cwd) || !nonempty(value.run_path)) throw new Error("invalid active-run marker");
  return value;
}

function finalVerification(runPath, coePath = DEFAULT_COE) {
  return spawnSync(process.execPath, [coePath, "verify", runPath], {
    cwd: runPath,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
}

export function stopDecision(event, options = {}) {
  if (!event || event.hook_event_name !== "Stop") return null;
  const marker = markerPath(event.session_id, options.env);
  if (!marker || !fs.existsSync(marker)) return null;
  let active;
  try {
    active = readMarker(marker);
    if (active.session_id !== event.session_id || fs.realpathSync(event.cwd) !== active.cwd) return null;
  } catch {
    return continuation("the recorded project run", "Restore the saved run ledger from project-local evidence and continue.");
  }
  let run;
  try {
    run = resolveRun(active.run_path, active.cwd);
  } catch {
    return continuation(active.run_path, "Restore or reconstruct run.json from the saved receipts and continue.");
  }
  if (!run) return continuation(active.run_path, "Restore or reconstruct the run ledger from the saved receipts and continue.");
  let record;
  try {
    record = JSON.parse(fs.readFileSync(path.join(run.run_path, "run.json"), "utf8"));
  } catch {
    return continuation(run.run_path, "Repair the malformed run ledger from the saved receipts and continue.");
  }
  if (record.state === "cancelled") {
    fs.rmSync(marker, { force: true });
    return null;
  }
  if (record.state === "complete" && record.phase === "complete") {
    const verify = (options.verifyRun || finalVerification)(run.run_path, options.coePath);
    if (verify?.status === 0) {
      fs.rmSync(marker, { force: true });
      return null;
    }
    const detail = String(verify?.stderr || verify?.error?.message || "final verification failed").trim().split("\n")[0].slice(0, 600);
    return continuation(run.run_path, `Final verification is not valid yet: ${detail}`);
  }
  return continuation(run.run_path, `Current saved state is ${JSON.stringify(record.state)} at phase ${JSON.stringify(record.phase)}.`);
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const event = JSON.parse(input || "{}");
  if (event.hook_event_name === "PreToolUse") {
    registerActiveRun(event);
    return;
  }
  const decision = stopDecision(event);
  if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(0));
}
