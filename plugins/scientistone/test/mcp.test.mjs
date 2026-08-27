import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RESEARCHER_TIMEOUT_MESSAGE, RESEARCHER_WAIT_TIMEOUT_MS, callTool, handleMessage, monitorSnapshot, stop, updateDraft, waitForResearcher } from "../mcp/server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COE = path.join(ROOT, "skills", "scientistone", "scripts", "coe.mjs");
const MCP = path.join(ROOT, "mcp", "server.mjs");

function put(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function apiContext(pageUrl) {
  const url = new URL(pageUrl);
  return { origin: url.origin, token: url.hash.slice(1), project: url.searchParams.get("project"), draft: url.searchParams.get("draft") };
}

function apiUrl(context, route, extra = {}) {
  const query = new URLSearchParams({ project: context.project, draft: context.draft, ...extra });
  return `${context.origin}/api/intake${route}?${query}`;
}

function mcpClient(child) {
  let buffer = "";
  let id = 0;
  const pending = new Map();
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf("\n")) !== -1;) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  return (method, params) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function within(promise, milliseconds = 1_000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("MCP response timed out.")), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

async function request(context, route, options = {}, extra = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-ScientistOne-Token", context.token);
  const response = await fetch(apiUrl(context, route, extra), { ...options, headers });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

test("the bundled MCP exposes the intake and monitor tools", async () => {
  const initialized = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
  assert.equal(initialized.protocolVersion, "2025-11-25");
  assert.deepEqual(initialized.capabilities, { tools: { listChanged: false } });
  const listed = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(listed.tools.map((item) => item.name), ["start_study_setup", "read_study_setup", "wait_for_researcher", "publish_study_review", "prepare_role_launch", "attach_run_monitor", "open_run_monitor"]);
  assert.deepEqual(Object.fromEntries(listed.tools.map((item) => [item.name, item.annotations])), {
    start_study_setup: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    read_study_setup: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    wait_for_researcher: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    publish_study_review: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    prepare_role_launch: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    attach_run_monitor: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    open_run_monitor: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  });
  assert.equal(listed.tools.find((item) => item.name === "start_study_setup")._meta.ui, undefined);
  assert.ok(listed.tools.find((item) => item.name === "publish_study_review").inputSchema.properties.review.required.includes("file_assignments"));
});

test("the stdio server emits only newline-delimited JSON-RPC and exits with its client", async () => {
  const child = spawn(process.execPath, [MCP], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } })}\n`);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 0, stderr);
  const lines = stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const response = JSON.parse(lines[0]);
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, "scientistone-mcp");
});

test("the MCP process exits when Codex stops it", async () => {
  const child = spawn(process.execPath, [MCP], { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } })}\n`);
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", resolve);
  });
  child.kill("SIGTERM");
  const code = await new Promise((resolve) => child.once("close", resolve));
  assert.equal(code, 0);
});

test("a pending researcher wait does not block the MCP", async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-mcp-wait-"));
  const child = spawn(process.execPath, [MCP], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => {
    child.kill("SIGTERM");
    fs.rmSync(project, { recursive: true, force: true });
  });
  const send = mcpClient(child);
  assert.equal((await send("initialize", { protocolVersion: "2025-11-25" })).result.serverInfo.name, "scientistone-mcp");
  const started = await send("tools/call", { name: "start_study_setup", arguments: { project_root: project } });
  const context = apiContext(started.result.structuredContent.url);
  const waiting = send("tools/call", { name: "wait_for_researcher", arguments: { project_root: project, draft_id: context.draft } });
  assert.deepEqual((await within(send("ping"))).result, {});
  await request(context, "/answers", { method: "POST", body: JSON.stringify({ question: "Which method performs best?" }) });
  await request(context, "/submit", { method: "POST", body: "{}" });
  assert.equal((await within(waiting)).result.structuredContent.status, "submitted");
});

test("a researcher wait pauses after one hour with a saved, resumable draft", async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-mcp-timeout-"));
  t.after(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  assert.equal(RESEARCHER_WAIT_TIMEOUT_MS, 3_600_000);
  const opened = await callTool("start_study_setup", { project_root: project, mode: "research" });
  await updateDraft(project, opened.draft_id, (draft) => {
    draft.answers.question = "Which method performs best?";
    draft.answers.objective = "Choose a reliable method.";
  });

  const timedOut = await within(waitForResearcher(project, opened.draft_id, 20));
  assert.equal(timedOut.status, "draft");
  assert.equal(timedOut.wait_status, "saved_timeout");
  assert.equal(timedOut.wait_timed_out, true);
  assert.equal(timedOut.resume_available, true);
  assert.equal(timedOut.researcher_message, RESEARCHER_TIMEOUT_MESSAGE);
  assert.equal(timedOut.answers.objective, "Choose a reliable method.");
  assert.match(timedOut.timed_out_at, /^\d{4}-\d{2}-\d{2}T/);

  const resumed = await callTool("start_study_setup", { project_root: project, mode: "research", resume_latest: true });
  assert.equal(resumed.draft_id, opened.draft_id);
  const resumedWait = waitForResearcher(project, opened.draft_id, 1_000);
  await updateDraft(project, opened.draft_id, (draft) => { draft.status = "submitted"; });
  const responded = await within(resumedWait);
  assert.equal(responded.status, "submitted");
  assert.equal(responded.wait_status, "researcher_responded");
  assert.equal(responded.wait_timed_out, false);

  await updateDraft(project, opened.draft_id, (draft) => {
    draft.status = "review_ready";
    draft.review = { question: "Which method performs best?", study_plan_markdown: "# Study plan\n" };
    draft.review_draft = { question: "Which method is most dependable?", study_plan_markdown: "# Study plan\n" };
    draft.change_request_draft = "Keep the saved edit for later.";
  });
  const reviewTimedOut = await within(waitForResearcher(project, opened.draft_id, 20));
  assert.equal(reviewTimedOut.status, "review_ready");
  assert.equal(reviewTimedOut.wait_timed_out, true);
  assert.equal(reviewTimedOut.review.question, "Which method performs best?");
  assert.equal(reviewTimedOut.review_draft.question, "Which method is most dependable?");
  assert.equal(reviewTimedOut.change_request_draft, "Keep the saved edit for later.");
});

test("intake files persist, approval attaches a verified run, and discard removes only its draft", async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "scientistone-mcp-"));
  t.after(() => {
    stop();
    fs.rmSync(project, { recursive: true, force: true });
  });

  const opened = await callTool("start_study_setup", { project_root: project, mode: "research" });
  const context = apiContext(opened.url);
  const preflight = await fetch(apiUrl(context, "/submit"), {
    method: "OPTIONS",
    headers: { Origin: "https://test.web-sandbox.oaiusercontent.com", "Access-Control-Request-Headers": "x-scientistone-token, content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://test.web-sandbox.oaiusercontent.com");
  const siteLogo = await fetch(`${context.origin}/logo.svg`).then((response) => response.text());
  assert.doesNotMatch(siteLogo, /<rect[^>]+#FEFEFE/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "assets", "logo.svg"), "utf8"), /<rect\b/);
  const bundledUi = await fetch(`${context.origin}/`).then((response) => response.text());
  assert.doesNotMatch(bundledUi, /Discard intake|__SCIENTISTONE_MCP_APP__|openai:set_globals|requestHost|ui\/initialize|type="module"/);
  assert.match(bundledUi, /href="\.\/app\.css"/);
  assert.match(bundledUi, /src="\.\/app\.js"/);
  const bundledJs = await fetch(`${context.origin}/app.js`).then((response) => response.text());
  assert.equal(bundledJs.match(/<input[^>]+type="file"/g)?.length, 1);
  assert.match(bundledJs, /What should S1 investigate\?/);
  assert.match(bundledJs, /Choose files or drop them here\. S1 will sort them\./);
  assert.match(bundledJs, /Send to S1/);
  assert.match(bundledJs, /S1 is drafting your study plan/);
  assert.match(bundledJs, /This is S1's draft\./);
  assert.doesNotMatch(bundledJs, /Send to research team|The team is preparing your study|study lead/);
  assert.doesNotMatch(bundledJs, /Add research material|Add evaluation material|Add paper files/);
  assert.match(bundledJs, /data-review-field/);
  assert.doesNotMatch(bundledJs, /phase-status/);
  const bundledCss = await fetch(`${context.origin}/app.css`).then((response) => response.text());
  assert.match(bundledCss, /\.brand-bar/);
  assert.match(bundledCss, /\.phase-node-complete\s*\{[^}]*background:/s);
  assert.match(bundledCss, /\.phase-node-current::after\s*\{[^}]*current-node-pulse/s);
  assert.match(bundledCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(bundledCss, /\.phase-status/);
  let state = await request(context, "");
  assert.equal(state.status, "draft");

  let initialWaitResolved = false;
  const initialWait = callTool("wait_for_researcher", { project_root: project, draft_id: context.draft }).then((result) => {
    initialWaitResolved = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));

  state = await request(context, "/answers", { method: "POST", body: JSON.stringify({ question: "Which method performs best?", objective: "Choose a method.", wizard_step: 4 }) });
  assert.equal(state.answers.question, "Which method performs best?");
  assert.equal(state.wizard_step, 4);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(initialWaitResolved, false);

  state = await request(context, "/upload", {
    method: "POST",
    body: Buffer.from("value\n1\n"),
    headers: {
      "Content-Type": "text/csv",
      "X-ScientistOne-Filename": Buffer.from("observations.csv").toString("base64url"),
    },
  });
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0].kind, "unclassified");
  assert.equal(state.uploads[0].classification, "unclassified");
  assert.match(state.uploads[0].stored_path, /files\/unclassified\/observations\.csv$/);
  assert.equal(fs.readFileSync(path.join(project, state.uploads[0].stored_path), "utf8"), "value\n1\n");

  state = await request(context, "/submit", { method: "POST", body: "{}" });
  assert.equal(state.status, "submitted");
  assert.equal((await initialWait).status, "submitted");
  const review = {
    question: "Which method performs best?",
    objective: "Choose a method.",
    materials: "Use observations.csv.",
    prior_work: "Search and read relevant comparisons.",
    evaluation: "Compare eligible methods on the same held-out records.",
    requirements: "Keep evaluator-only files private.",
    negative_or_inconclusive: "No method has a reliable advantage.",
    deliverables: "Paper, method, audit, and evidence files.",
    study_plan_markdown: "# Study plan\n",
    request_markdown: "Which method performs best?\n",
    file_assignments: [{ upload_id: state.uploads[0].id, kind: "materials", classification: "shared", purpose: "Candidate observations." }],
  };
  await assert.rejects(
    callTool("publish_study_review", { project_root: project, draft_id: context.draft, review: { ...review, file_assignments: [] } }),
    /classify every uploaded file exactly once/,
  );
  state = await callTool("publish_study_review", { project_root: project, draft_id: context.draft, review });
  assert.equal(state.status, "review_ready");
  assert.equal(state.review_draft.question, review.question);
  assert.equal(state.uploads[0].classification, "shared");
  assert.equal(state.uploads[0].purpose, "Candidate observations.");
  state = await request(context, "/review-draft", { method: "POST", body: JSON.stringify({ review: { objective: "Choose a dependable method." }, note: "Please use the stricter comparison." }) });
  assert.equal(state.review.objective, "Choose a method.");
  assert.equal(state.review_draft.objective, "Choose a dependable method.");
  assert.equal(state.change_request_draft, "Please use the stricter comparison.");
  const reviewWait = callTool("wait_for_researcher", { project_root: project, draft_id: context.draft });
  await new Promise((resolve) => setImmediate(resolve));
  state = await request(context, "/change", { method: "POST", body: JSON.stringify({ note: "Use a stricter comparison.", review: { objective: "Choose a reliable method." } }) });
  assert.equal(state.status, "changes_requested");
  assert.equal(state.review.objective, "Choose a reliable method.");
  assert.deepEqual(state.review_edits.at(-1).fields, ["objective"]);
  assert.equal((await reviewWait).status, "changes_requested");
  state = await callTool("publish_study_review", { project_root: project, draft_id: context.draft, review: { ...review, objective: state.review.objective, evaluation: "Use a stricter held-out comparison." } });
  assert.equal(state.status, "review_ready");
  assert.deepEqual(state.review_edits, []);
  const approvalWait = callTool("wait_for_researcher", { project_root: project, draft_id: context.draft });
  await new Promise((resolve) => setImmediate(resolve));
  state = await request(context, "/approve", { method: "POST", body: JSON.stringify({ review: { question: "Which method is most reliable?", study_plan_markdown: "# Study plan\n\nUse the researcher's correction.\n" } }) });
  assert.equal(state.status, "approved");
  assert.equal(state.review.question, "Which method is most reliable?");
  assert.deepEqual(state.review_edits.at(-1).fields, ["question", "study_plan_markdown"]);
  assert.equal((await approvalWait).status, "approved");
  await assert.rejects(
    callTool("publish_study_review", { project_root: project, draft_id: context.draft, review }),
    /Study approval is final.*attach its monitor/,
  );
  assert.equal((await callTool("read_study_setup", { project_root: project, draft_id: context.draft })).status, "approved");

  const run = path.join(project, "scientistone-runs", "test-run");
  fs.mkdirSync(run, { recursive: true });
  put(run, "request.md", review.request_markdown);
  put(run, "study-plan.md", "# Study plan\n\n## Research question\n\nWhich method performs best?\n");
  let result = spawnSync(process.execPath, [COE, "configure", run, "pilot", "research"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, [COE, "init", run], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  const attached = await callTool("attach_run_monitor", { project_root: project, draft_id: context.draft, run_path: run });
  assert.equal(attached.status, "started");
  const monitor = await monitorSnapshot(run);
  assert.equal(monitor.integrity.ok, true);
  assert.equal(monitor.current_phase, "contract");
  assert.deepEqual(monitor.returns, []);

  const fresh = await callTool("start_study_setup", { project_root: project, mode: "research", resume_latest: false });
  assert.notEqual(fresh.draft_id, context.draft);
  assert.notEqual(fresh.url, opened.url);
  const resumedDraft = await callTool("start_study_setup", { project_root: project, mode: "research", resume_latest: true });
  assert.equal(resumedDraft.draft_id, fresh.draft_id);
  await request(apiContext(fresh.url), "", { method: "DELETE" });

  const second = await callTool("start_study_setup", { project_root: project, mode: "external_audit" });
  const secondContext = apiContext(second.url);
  await request(secondContext, "", { method: "DELETE" });
  assert.equal(fs.existsSync(path.join(project, ".scientistone", "intake", secondContext.draft)), false);
  assert.equal(fs.existsSync(run), true);
});
