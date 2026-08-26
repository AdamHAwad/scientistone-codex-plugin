import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import readline from "node:readline";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadModelPolicy, prepareRoleLaunch } from "./model-routing.mjs";

const execFileAsync = promisify(execFile);
const MCP_VERSION = "2025-11-25";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, "..");
const UI_ROOT = path.join(HERE, "ui");
const COE = path.join(PLUGIN_ROOT, "skills", "scientistone", "scripts", "coe.mjs");
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const ACTIVE_DRAFT_STATES = new Set(["draft", "submitted", "review_ready", "changes_requested", "approved"]);
const EDITABLE_REVIEW_FIELDS = ["question", "objective", "materials", "prior_work", "evaluation", "requirements", "negative_or_inconclusive", "deliverables", "study_plan_markdown"];
const REQUIRED_REVIEW_FIELDS = new Set(["question", "objective", "evaluation", "negative_or_inconclusive", "deliverables", "study_plan_markdown"]);
const draftLocks = new Map();
const draftEvents = new EventEmitter();
let webServer;
let webPort;
const webToken = randomBytes(24).toString("base64url");

const phaseLabels = {
  contract: "Agree on the study",
  investigation: "Read prior work",
  discovery: "Develop and test methods",
  selection: "Choose and recheck the method",
  ablation: "Find what drives the result",
  writing: "Draft the paper",
  verification: "Check every claim",
  audit: "Audit the study",
  complete: "Prepare the final files",
};

const phaseDescriptions = {
  contract: "The team is checking that the question, inputs, evaluation, and limits match what you approved.",
  investigation: "The team is reading relevant prior work and recording the sources that may shape the study.",
  discovery: "The team is developing candidate methods and testing them against the approved evaluation.",
  selection: "An independent evaluation is comparing eligible methods and rechecking the selected one.",
  ablation: "The team is testing which parts of the selected method account for the result.",
  writing: "The team is drafting the paper from saved sources, code, and results.",
  verification: "Reviewers are tracing each claim to the source or result that supports it.",
  audit: "Independent reviewers are checking the reported score, method, references, paper, and claim evidence.",
  complete: "The verified paper, method, audit, and evidence files are ready.",
};

const roleLabels = {
  contract_auditor: "Study plan reviewer",
  literature_mapper: "Literature searcher",
  evidence_reader: "Paper reader",
  evidence_synthesizer: "Evidence reviewer",
  protocol_auditor: "Evaluation reviewer",
  brief_writer: "Study brief writer",
  brief_critic: "Study brief reviewer",
  ideator: "Method researcher",
  idea_critic: "Method reviewer",
  candidate_developer: "Method developer",
  evaluator: "Independent evaluator",
  legitimacy_auditor: "Method integrity reviewer",
  selection_analyst: "Method comparison analyst",
  selection_auditor: "Selection reviewer",
  ablation_designer: "Component test designer",
  ablation_implementer: "Component test researcher",
  ablation_analyst: "Component test analyst",
  writer: "Paper writer",
  paper_critic: "Paper reviewer",
  claim_verifier: "Claim reviewer",
  i1_score_auditor: "Result checker",
  i1_verifier_builder: "Result-check builder",
  i2_judge: "Method specification reviewer",
  i3_reference_auditor: "Reference checker",
  i4_judge: "Paper and method reviewer",
  claim_provenance_auditor: "Evidence trail reviewer",
  audit_reporter: "Audit reporter",
  reproduction_writer: "Reproduction guide writer",
};

const roleDescriptions = {
  contract_auditor: "Checks whether the saved study plan matches the request and can be evaluated as written.",
  literature_mapper: "Searches for prior work that bears directly on the research question.",
  evidence_reader: "Reads selected papers and records the evidence that may affect the study.",
  evidence_synthesizer: "Compares the saved literature notes and identifies testable directions.",
  protocol_auditor: "Checks whether the proposed comparison can answer the approved question.",
  brief_writer: "Turns the literature record and evaluation into a working study brief.",
  brief_critic: "Checks the study brief before method development begins.",
  ideator: "Proposes methods that fit the question, evidence, and approved limits.",
  idea_critic: "Rejects ideas that are unsupported, redundant, or outside the study contract.",
  candidate_developer: "Builds and records one candidate method without seeing evaluator-only material.",
  evaluator: "Measures a saved method with the approved evaluation and records the raw result.",
  legitimacy_auditor: "Checks that a method followed the study rules and did not exploit the evaluation.",
  selection_analyst: "Compares eligible methods using the approved decision rule.",
  selection_auditor: "Checks that the selected method follows from the recorded evaluations.",
  ablation_designer: "Plans controlled tests of the selected method's parts.",
  ablation_implementer: "Runs one approved component test and saves the changed method.",
  ablation_analyst: "Explains which parts of the method affected the measured result.",
  writer: "Drafts the paper from the verified study record.",
  paper_critic: "Checks the draft for unsupported or overstated claims.",
  claim_verifier: "Links each paper claim to its exact saved source or result.",
  i1_score_auditor: "Checks that the paper reports the same result as the canonical evaluation.",
  i1_verifier_builder: "Builds the task-specific deterministic checks that compare reported results with the canonical evaluation.",
  i2_judge: "Checks that the selected method solves the approved task without exploiting the test.",
  i3_reference_auditor: "Checks that cited sources exist and support the claims attached to them.",
  i4_judge: "Checks that the paper describes the selected method faithfully.",
  claim_provenance_auditor: "Checks that the final claims have complete evidence links.",
  audit_reporter: "Combines the independent audit findings without changing them.",
  reproduction_writer: "Records how to reproduce the selected method and evaluation.",
};

const policyRoles = Object.keys(loadModelPolicy().roles).sort();
const labeledRoles = Object.keys(roleLabels).sort();
if (JSON.stringify(policyRoles) !== JSON.stringify(labeledRoles)) throw new Error("ScientistOne role labels and model policy must cover the same specialist roles.");

function now() {
  return new Date().toISOString();
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonIfPresent(file) {
  try {
    return readJson(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function safeProjectRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("project_root must be an absolute directory path.");
  const root = fs.realpathSync(value);
  if (!fs.statSync(root).isDirectory()) throw new Error("project_root must be a directory.");
  return root;
}

function assertDraftId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new Error("draft_id is invalid.");
  return value;
}

function intakeRoot(projectRoot) {
  const hidden = path.join(projectRoot, ".scientistone");
  const root = path.join(hidden, "intake");
  for (const candidate of [hidden, root]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error("The ScientistOne intake directory cannot be a symbolic link.");
  }
  return root;
}

function draftRoot(projectRoot, draftId) {
  return path.join(intakeRoot(projectRoot), assertDraftId(draftId));
}

function stateFile(projectRoot, draftId) {
  return path.join(draftRoot(projectRoot, draftId), "state.json");
}

function publicDraft(state) {
  return {
    schema_version: state.schema_version,
    id: state.id,
    project_root: state.project_root,
    mode: state.mode,
    status: state.status,
    revision: state.revision,
    created_at: state.created_at,
    updated_at: state.updated_at,
    answers: state.answers,
    uploads: state.uploads,
    review: state.review,
    change_request: state.change_request,
    review_edits: state.review_edits ?? [],
    run_path: state.run_path,
  };
}

function createDraft(projectRootArg, modeArg = "research") {
  const projectRoot = safeProjectRoot(projectRootArg);
  if (!new Set(["research", "external_audit"]).has(modeArg)) throw new Error("mode must be research or external_audit.");
  const mode = modeArg;
  const id = randomUUID();
  const root = draftRoot(projectRoot, id);
  fs.mkdirSync(path.join(root, "files", "shared"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, "files", "evaluator-only"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, "files", "unclassified"), { recursive: true, mode: 0o700 });
  const state = {
    schema_version: 1,
    id,
    project_root: projectRoot,
    mode,
    status: "draft",
    revision: 0,
    created_at: now(),
    updated_at: now(),
    answers: {
      question: "",
      objective: "",
      materials_note: "",
      papers: "",
      evaluation: "",
      constraints: "",
    },
    uploads: [],
    review: null,
    change_request: "",
    review_edits: [],
    run_path: null,
  };
  atomicJson(stateFile(projectRoot, id), state);
  return state;
}

function readDraft(projectRootArg, draftId) {
  const projectRoot = safeProjectRoot(projectRootArg);
  const file = stateFile(projectRoot, draftId);
  if (!fs.existsSync(file)) throw new Error("The intake draft was not found.");
  const root = draftRoot(projectRoot, draftId);
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error("The intake draft cannot be a symbolic link.");
  const state = readJson(file);
  if (state.project_root !== projectRoot || state.id !== draftId) throw new Error("The intake draft does not match this project.");
  return state;
}

function findLatestDraft(projectRootArg, mode) {
  const projectRoot = safeProjectRoot(projectRootArg);
  const root = intakeRoot(projectRoot);
  if (!fs.existsSync(root)) return null;
  const candidates = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const state = readDraft(projectRoot, entry.name);
      if (state.mode === mode && ACTIVE_DRAFT_STATES.has(state.status)) candidates.push(state);
    } catch {
      // Ignore incomplete directories. The UI never trusts them as drafts.
    }
  }
  return candidates.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

async function withDraftLock(projectRoot, draftId, task) {
  const key = stateFile(projectRoot, draftId);
  const previous = draftLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  draftLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (draftLocks.get(key) === current) draftLocks.delete(key);
  }
}

async function updateDraft(projectRootArg, draftId, mutate) {
  const projectRoot = safeProjectRoot(projectRootArg);
  const key = stateFile(projectRoot, draftId);
  const state = await withDraftLock(projectRoot, draftId, async () => {
    const state = readDraft(projectRoot, draftId);
    await mutate(state);
    state.revision += 1;
    state.updated_at = now();
    atomicJson(key, state);
    return state;
  });
  draftEvents.emit(key, state);
  return state;
}

async function waitForResearcher(projectRootArg, draftId) {
  const projectRoot = safeProjectRoot(projectRootArg);
  const key = stateFile(projectRoot, draftId);
  const current = readDraft(projectRoot, draftId);
  if (!new Set(["draft", "review_ready"]).has(current.status)) return current;
  const waitingStatus = current.status;
  return new Promise((resolve) => {
    const onChange = (state) => {
      if (state.status === waitingStatus) return;
      draftEvents.off(key, onChange);
      resolve(state);
    };
    draftEvents.on(key, onChange);
    onChange(readDraft(projectRoot, draftId));
  });
}

function cleanFilename(value) {
  const base = path.basename(String(value || "file")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (base || "file").slice(0, 180);
}

function uniqueDestination(directory, original) {
  const extension = path.extname(original);
  const stem = path.basename(original, extension);
  let candidate = path.join(directory, original);
  for (let index = 2; fs.existsSync(candidate); index += 1) candidate = path.join(directory, `${stem} (${index})${extension}`);
  return candidate;
}

function decodeFilename(header) {
  try {
    return cleanFilename(Buffer.from(String(header || ""), "base64url").toString("utf8"));
  } catch {
    throw new Error("The uploaded file name is invalid.");
  }
}

async function saveUpload(req, projectRoot, draftId) {
  const existing = readDraft(projectRoot, draftId);
  if (!ACTIVE_DRAFT_STATES.has(existing.status)) throw new Error("This intake no longer accepts files.");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_UPLOAD_BYTES) throw new Error("The file is larger than the 2 GB intake limit.");
  const name = decodeFilename(req.headers["x-scientistone-filename"]);
  const directory = path.join(draftRoot(projectRoot, draftId), "files", "unclassified");
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("The upload directory cannot be a symbolic link.");
  const destination = uniqueDestination(directory, name);
  const temporary = `${destination}.${randomBytes(5).toString("hex")}.part`;
  let size = 0;
  const digest = createHash("sha256");
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      digest.update(chunk);
      callback(size > MAX_UPLOAD_BYTES ? new Error("The file is larger than the 2 GB intake limit.") : null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  const sha256 = digest.digest("hex");
  try {
    return await updateDraft(projectRoot, draftId, (state) => {
      if (!ACTIVE_DRAFT_STATES.has(state.status)) throw new Error("This intake no longer accepts files.");
      const relative = path.relative(projectRoot, destination).split(path.sep).join("/");
      state.uploads.push({
        id: randomUUID(),
        name: path.basename(destination),
        size,
        media_type: String(req.headers["content-type"] || "application/octet-stream"),
        kind: "unclassified",
        classification: "unclassified",
        purpose: "",
        stored_path: relative,
        sha256,
        uploaded_at: now(),
      });
    });
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  }
}

function classifyUploads(draft, assignments) {
  if (!Array.isArray(assignments)) throw new Error("review.file_assignments must classify every uploaded file.");
  const byId = new Map();
  for (const value of assignments) {
    const assignment = assertObject(value, "file assignment");
    if (typeof assignment.upload_id !== "string" || byId.has(assignment.upload_id)) throw new Error("Every file assignment needs one unique upload_id.");
    if (!new Set(["materials", "papers"]).has(assignment.kind)) throw new Error("Each file must be sorted as study material or prior work.");
    if (!new Set(["shared", "evaluator_only"]).has(assignment.classification)) throw new Error("Each file must be shared or evaluator-only.");
    if (typeof assignment.purpose !== "string" || !assignment.purpose.trim()) throw new Error("Each file assignment needs a plain-language purpose.");
    byId.set(assignment.upload_id, assignment);
  }
  if (byId.size !== draft.uploads.length || draft.uploads.some((upload) => !byId.has(upload.id))) throw new Error("review.file_assignments must classify every uploaded file exactly once.");
  for (const upload of draft.uploads) {
    const assignment = byId.get(upload.id);
    upload.kind = assignment.kind;
    upload.classification = assignment.classification;
    upload.purpose = assignment.purpose.trim().slice(0, 4000);
  }
}

function applyReviewEdits(draft, value) {
  if (value === undefined) return;
  if (!draft.review) throw new Error("The study summary is not ready to edit.");
  const edits = assertObject(value, "review edits");
  const unknown = Object.keys(edits).filter((field) => !EDITABLE_REVIEW_FIELDS.includes(field));
  if (unknown.length) throw new Error(`Unknown review field: ${unknown[0]}.`);
  const changed = [];
  for (const field of EDITABLE_REVIEW_FIELDS) {
    if (!(field in edits)) continue;
    if (typeof edits[field] !== "string") throw new Error(`${field} must be text.`);
    const next = edits[field].trim().slice(0, 200000);
    if (REQUIRED_REVIEW_FIELDS.has(field) && !next) throw new Error(`${field} cannot be empty.`);
    if (draft.review[field] !== next) {
      draft.review[field] = next;
      changed.push(field);
    }
  }
  if (changed.length) {
    draft.review_edits ??= [];
    draft.review_edits.push({ edited_at: now(), fields: changed });
  }
}

async function parseJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error("The request is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function isMcpAppOrigin(value) {
  try {
    const origin = new URL(value);
    return origin.protocol === "https:"
      && !origin.username
      && !origin.password
      && !origin.port
      && (origin.hostname === "web-sandbox.oaiusercontent.com" || origin.hostname.endsWith(".web-sandbox.oaiusercontent.com"));
  } catch {
    return false;
  }
}

function allowMcpAppRequest(req, res) {
  const origin = req.headers.origin;
  if (!isMcpAppOrigin(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-ScientistOne-Token, X-ScientistOne-Filename");
  res.setHeader("Vary", "Origin");
  return true;
}

function sendFile(res, file, contentType, transparentLogo = false) {
  let body = fs.readFileSync(file);
  if (transparentLogo) body = Buffer.from(body.toString("utf8")
    .replace("A blue capital S beside a green numeral one on an off-white square background.", "A blue capital S beside a green numeral one.")
    .replace('  <rect width="1254" height="1254" fill="#FEFEFE"/>\n\n', ""));
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(body);
}

function verifyWebRequest(req) {
  const expected = `http://127.0.0.1:${webPort}`;
  if (req.headers.origin && req.headers.origin !== expected && !isMcpAppOrigin(req.headers.origin)) throw Object.assign(new Error("This request did not come from the ScientistOne interface."), { statusCode: 403 });
  if (req.headers["x-scientistone-token"] !== webToken) throw Object.assign(new Error("The local ScientistOne session has expired. Reopen it from Codex."), { statusCode: 401 });
}

function decodeRunPath(encoded) {
  if (typeof encoded !== "string" || encoded.length > 8192) throw new Error("The run path is invalid.");
  const run = Buffer.from(encoded, "base64url").toString("utf8");
  if (!path.isAbsolute(run)) throw new Error("The run path must be absolute.");
  const resolved = fs.realpathSync(run);
  if (!fs.statSync(resolved).isDirectory() || !fs.existsSync(path.join(resolved, "run.json"))) throw new Error("A ScientistOne run was not found at that path.");
  return resolved;
}

function readJsonDirectory(directory) {
  if (!fs.existsSync(directory)) return [];
  const values = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      values.push(readJson(path.join(directory, entry.name)));
    } catch {
      // A partial record is reported by the verifier instead of exposed to the browser.
    }
  }
  return values;
}

function inferRolePhase(record) {
  const outputs = Array.isArray(record.declared_outputs) ? record.declared_outputs : Array.isArray(record.outputs) ? record.outputs : [];
  const has = (prefix) => outputs.some((item) => typeof item === "string" && item.startsWith(prefix));
  if (has("deliverables/")) return "complete";
  if (has("audit/") || has("delivery/")) return "audit";
  if (has("paper/")) return record.role === "claim_verifier" ? "verification" : "writing";
  if (has("ablation/")) return "ablation";
  if (has("selection/")) return "selection";
  if (has("discovery/")) return "discovery";
  if (has("evidence/") || has("investigation/")) return "investigation";
  if (has("contract/")) return "contract";
  return "contract";
}

function planQuestion(run) {
  const file = path.join(run, "study-plan.md");
  if (!fs.existsSync(file)) return "ScientistOne study";
  const text = fs.readFileSync(file, "utf8");
  for (const heading of ["Research question", "What I will test"]) {
    const match = text.match(new RegExp(`^## ${heading}\\s*\\n+([^#]+)`, "mi"));
    if (match) return match[1].trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ").slice(0, 320);
  }
  return "ScientistOne study";
}

async function verifyRun(run) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [COE, "verify", run], { encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 });
    return { ok: true, record: JSON.parse(stdout) };
  } catch {
    return { ok: false, record: null };
  }
}

function invalidationReturns(run, phases) {
  const root = path.join(run, "receipts", "superseded");
  if (!fs.existsSync(root)) return [];
  const labels = {
    investigation: "Recheck evidence",
    discovery: "Retest methods",
    selection: "Recheck choice",
    ablation: "Retest components",
    writing: "Revise paper",
    verification: "Recheck claims",
    audit: "Reaudit study",
    complete: "Rebuild files",
  };
  const returns = [];
  for (const name of fs.readdirSync(root).sort()) {
    try {
      const metadata = readJson(path.join(root, name, "invalidation.json"));
      const targetIndex = phases.indexOf(metadata.from_phase);
      const movedIndices = Array.isArray(metadata.receipt_hashes) ? metadata.receipt_hashes.map((item) => phases.indexOf(item.phase)).filter((index) => index >= 0) : [];
      if (targetIndex < 0 || !movedIndices.length) continue;
      const source = phases[Math.min(phases.length - 1, Math.max(...movedIndices) + 1)];
      returns.push({ from: source, to: metadata.from_phase, label: labels[metadata.from_phase] ?? "Recheck work", at: metadata.at ?? null });
    } catch {
      // The run verifier reports malformed invalidation records; the browser omits them.
    }
  }
  return returns.slice(-3);
}

async function monitorSnapshot(run) {
  const record = readJson(path.join(run, "run.json"));
  const phases = record.mode === "external_audit" ? ["contract", "audit", "complete"] : ["contract", "investigation", "discovery", "selection", "ablation", "writing", "verification", "audit", "complete"];
  const integrity = await verifyRun(run);
  const launches = readJsonDirectory(path.join(run, "role-launches"));
  const receipts = readJsonDirectory(path.join(run, "role-receipts"));
  const completedTasks = new Set(receipts.map((item) => item.agent_task));
  const agents = launches.map((item) => ({
    task: item.task_id ?? item.agent_task ?? item.started_at,
    role: item.role,
    name: roleLabels[item.role] ?? "Research specialist",
    description: roleDescriptions[item.role] ?? "Completes one bounded part of the approved study and saves the result.",
    phase: inferRolePhase(item),
    status: completedTasks.has(item.task_id) || completedTasks.has(item.agent_task) || receipts.some((receipt) => receipt.launch_record_sha256 && receipt.role === item.role && receipt.started_at === item.started_at) ? "complete" : "working",
    started_at: item.started_at ?? null,
  }));
  const progress = phases.map((phase) => {
    const receiptExists = fs.existsSync(path.join(run, "receipts", `${phase}.json`));
    let status = receiptExists ? "complete" : phase === record.phase ? "current" : "upcoming";
    if (phase === record.phase && record.attention) status = "attention";
    return { phase, label: phaseLabels[phase], description: phaseDescriptions[phase], status, agents: agents.filter((agent) => agent.phase === phase) };
  });
  const files = [];
  for (const [label, relative] of [["Paper", "deliverables/paper.pdf"], ["Study plan", "study-plan.md"], ["Audit report", "deliverables/audit-report.md"], ["Evidence manifest", "deliverables/manifest.json"]]) {
    if (fs.existsSync(path.join(run, relative))) files.push({ label, path: path.join(run, relative) });
  }
  return {
    id: record.id,
    mode: record.mode,
    state: record.state,
    outcome: record.outcome,
    question: planQuestion(run),
    current_phase: record.phase,
    current_label: phaseLabels[record.phase] ?? "Study in progress",
    updated_at: record.updated_at,
    attention: Boolean(record.attention),
    integrity: { ok: integrity.ok, message: integrity.ok ? "Saved evidence is consistent through the latest checkpoint." : "The saved evidence chain needs repair before this status can be treated as verified." },
    progress,
    returns: invalidationReturns(run, phases),
    files,
  };
}

async function handleWeb(req, res) {
  const requestUrl = new URL(req.url, `http://127.0.0.1:${webPort}`);
  try {
    const mcpAppRequest = allowMcpAppRequest(req, res);
    if (req.method === "OPTIONS") {
      if (!mcpAppRequest) return sendJson(res, 403, { error: "This request did not come from the ScientistOne interface." });
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html")) return sendFile(res, path.join(UI_ROOT, "index.html"), "text/html; charset=utf-8");
    if (req.method === "GET" && requestUrl.pathname === "/app.css") return sendFile(res, path.join(UI_ROOT, "app.css"), "text/css; charset=utf-8");
    if (req.method === "GET" && requestUrl.pathname === "/app.js") return sendFile(res, path.join(UI_ROOT, "app.js"), "text/javascript; charset=utf-8");
    if (req.method === "GET" && requestUrl.pathname === "/newsreader-latin-600-normal.woff2") return sendFile(res, path.join(UI_ROOT, "newsreader-latin-600-normal.woff2"), "font/woff2");
    if (req.method === "GET" && requestUrl.pathname === "/logo.svg") return sendFile(res, path.join(PLUGIN_ROOT, "assets", "logo.svg"), "image/svg+xml", true);
    if (!requestUrl.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Not found." });
    verifyWebRequest(req);

    if (requestUrl.pathname === "/api/intake" && req.method === "GET") {
      const state = readDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"));
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/answers" && req.method === "POST") {
      const body = assertObject(await parseJsonBody(req), "answers");
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (!["draft", "changes_requested"].includes(draft.status)) throw new Error("This intake has already been submitted.");
        for (const key of Object.keys(draft.answers)) if (typeof body[key] === "string") draft.answers[key] = body[key].slice(0, 20000);
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/upload" && req.method === "POST") {
      const state = await saveUpload(req, safeProjectRoot(requestUrl.searchParams.get("project")), requestUrl.searchParams.get("draft"));
      return sendJson(res, 201, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/upload" && req.method === "DELETE") {
      const uploadId = requestUrl.searchParams.get("upload");
      const projectRoot = safeProjectRoot(requestUrl.searchParams.get("project"));
      const draftId = requestUrl.searchParams.get("draft");
      const state = await updateDraft(projectRoot, draftId, (draft) => {
        const item = draft.uploads.find((upload) => upload.id === uploadId);
        if (!item) throw new Error("The uploaded file was not found.");
        const target = path.resolve(projectRoot, item.stored_path);
        const relative = path.relative(draftRoot(projectRoot, draftId), target);
        if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("The uploaded file path is invalid.");
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error("A symbolic link cannot be removed as an uploaded file.");
        fs.rmSync(target, { force: true });
        draft.uploads = draft.uploads.filter((upload) => upload.id !== uploadId);
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/submit" && req.method === "POST") {
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (!draft.answers.question.trim()) throw new Error("Enter the question the study should answer.");
        draft.status = "submitted";
        draft.change_request = "";
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/change" && req.method === "POST") {
      const body = assertObject(await parseJsonBody(req), "change request");
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (draft.status !== "review_ready") throw new Error("The study summary is not ready for revision.");
        applyReviewEdits(draft, body.review);
        const note = String(body.note || "").trim();
        if (!note) throw new Error("Describe what you want S1 to change.");
        draft.status = "changes_requested";
        draft.change_request = note.slice(0, 12000);
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/approve" && req.method === "POST") {
      const body = assertObject(await parseJsonBody(req), "approval");
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (draft.status !== "review_ready") throw new Error("The study summary is not ready for approval.");
        applyReviewEdits(draft, body.review);
        draft.status = "approved";
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake" && req.method === "DELETE") {
      const projectRoot = safeProjectRoot(requestUrl.searchParams.get("project"));
      const draftId = assertDraftId(requestUrl.searchParams.get("draft"));
      readDraft(projectRoot, draftId);
      const target = draftRoot(projectRoot, draftId);
      const relative = path.relative(intakeRoot(projectRoot), target);
      if (relative !== draftId) throw new Error("The intake draft path is invalid.");
      fs.rmSync(target, { recursive: true });
      return sendJson(res, 200, { discarded: true });
    }
    if (requestUrl.pathname === "/api/run" && req.method === "GET") {
      return sendJson(res, 200, await monitorSnapshot(decodeRunPath(requestUrl.searchParams.get("path"))));
    }
    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    return sendJson(res, error.statusCode ?? 400, { error: error.message || "The request failed." });
  }
}

async function ensureWebServer() {
  if (webServer) return webPort;
  webServer = createServer((req, res) => void handleWeb(req, res));
  webServer.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  try {
    await new Promise((resolve, reject) => {
      webServer.once("error", reject);
      webServer.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    webServer.close();
    webServer = undefined;
    throw error;
  }
  webPort = webServer.address().port;
  return webPort;
}

function pageUrl(view, params) {
  const query = new URLSearchParams({ view, ...params });
  return `http://127.0.0.1:${webPort}/?${query}#${webToken}`;
}

function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

const tools = [
  {
    name: "start_study_setup",
    description: "Start ScientistOne's guided browser setup. Call this first for a new study or explicit setup resume; never launch the bundled server through a shell command.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_root"],
      properties: {
        project_root: { type: "string", description: "Absolute path to the research project." },
        mode: { type: "string", enum: ["research", "external_audit"] },
        resume_latest: { type: "boolean", description: "Set true only when the researcher explicitly asks to resume an unfinished setup. False creates a separate study." },
      },
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: {
      "openai/toolInvocation/invoking": "Opening ScientistOne…",
      "openai/toolInvocation/invoked": "ScientistOne is ready.",
    },
  },
  {
    name: "read_study_setup",
    description: "Read the researcher's saved setup answers, uploaded files, requested changes, and approval state after wait_for_researcher returns.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_root", "draft_id"],
      properties: { project_root: { type: "string" }, draft_id: { type: "string" } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "wait_for_researcher",
    description: "Pause this task until the researcher submits the setup or responds to the study review. Call once after start_study_setup or publish_study_review; it stays pending without polling.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_root", "draft_id"],
      properties: {
        project_root: { type: "string" },
        draft_id: { type: "string" },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "publish_study_review",
    description: "Before approval, classify every uploaded file and show the question, evaluation, limits, files, and full study plan for the researcher to review. Never call this after approval.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_root", "draft_id", "review"],
      properties: {
        project_root: { type: "string" },
        draft_id: { type: "string" },
        review: {
          type: "object",
          additionalProperties: false,
          required: ["question", "objective", "materials", "prior_work", "evaluation", "requirements", "negative_or_inconclusive", "deliverables", "study_plan_markdown", "request_markdown", "file_assignments"],
          properties: {
            question: { type: "string" },
            objective: { type: "string" },
            materials: { type: "string" },
            prior_work: { type: "string" },
            evaluation: { type: "string" },
            requirements: { type: "string" },
            negative_or_inconclusive: { type: "string" },
            deliverables: { type: "string" },
            study_plan_markdown: { type: "string" },
            request_markdown: { type: "string" },
            file_assignments: {
              type: "array",
              description: "One assignment for every upload returned by read_study_setup. Use evaluator_only for answer keys, held-out outcomes, and private checks.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["upload_id", "kind", "classification", "purpose"],
                properties: {
                  upload_id: { type: "string" },
                  kind: { type: "string", enum: ["materials", "papers"] },
                  classification: { type: "string", enum: ["shared", "evaluator_only"] },
                  purpose: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "prepare_role_launch",
    description: "Resolve and freeze ScientistOne's semantic model policy, then authorize one native Codex specialist launch. Call immediately before every specialist spawn and use the returned task_name, fork_turns, model, and reasoning_effort exactly.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["run_path", "task_name", "role", "declared_inputs", "declared_outputs"],
      properties: {
        run_path: { type: "string" },
        task_name: { type: "string", pattern: "^[a-z0-9_]{1,120}$" },
        role: { type: "string", enum: Object.keys(roleLabels) },
        declared_inputs: { type: "array", items: { type: "string" } },
        declared_outputs: { type: "array", minItems: 1, items: { type: "string" } },
        allowed_external_sources: { type: "array", items: { type: "string" } },
      },
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "attach_run_monitor",
    description: "Connect an approved setup to its initialized ScientistOne run so the open browser changes from setup to the live study monitor.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_root", "draft_id", "run_path"],
      properties: { project_root: { type: "string" }, draft_id: { type: "string" }, run_path: { type: "string" } },
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "open_run_monitor",
    description: "Open or reconnect the plain-language monitor for an existing ScientistOne run using its saved files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["run_path"],
      properties: { run_path: { type: "string" } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: {
      "openai/toolInvocation/invoking": "Opening the study…",
      "openai/toolInvocation/invoked": "The study monitor is ready.",
    },
  },
];

async function callTool(name, args = {}) {
  await ensureWebServer();
  if (name === "start_study_setup") {
    const projectRoot = safeProjectRoot(args.project_root);
    const mode = args.mode ?? "research";
    if (!new Set(["research", "external_audit"]).has(mode)) throw new Error("mode must be research or external_audit.");
    const state = args.resume_latest ? findLatestDraft(projectRoot, mode) ?? createDraft(projectRoot, mode) : createDraft(projectRoot, mode);
    return { draft_id: state.id, revision: state.revision, status: state.status, project_root: projectRoot, url: pageUrl("intake", { project: projectRoot, draft: state.id }) };
  }
  if (name === "read_study_setup") return publicDraft(readDraft(args.project_root, args.draft_id));
  if (name === "wait_for_researcher") {
    return publicDraft(await waitForResearcher(args.project_root, args.draft_id));
  }
  if (name === "publish_study_review") {
    const review = assertObject(args.review, "review");
    for (const field of [...EDITABLE_REVIEW_FIELDS, "request_markdown"]) {
      if (typeof review[field] !== "string" || !review[field].trim()) throw new Error(`review.${field} is required.`);
    }
    const state = await updateDraft(args.project_root, args.draft_id, (draft) => {
      if (new Set(["approved", "started"]).has(draft.status)) throw new Error("Study approval is final. Continue the approved run and attach its monitor; do not publish another review.");
      if (!new Set(["submitted", "changes_requested", "review_ready"]).has(draft.status)) throw new Error("The intake is not ready for a study summary.");
      classifyUploads(draft, review.file_assignments);
      draft.review = { ...review };
      draft.review_edits = [];
      draft.status = "review_ready";
      draft.change_request = "";
    });
    return publicDraft(state);
  }
  if (name === "prepare_role_launch") return prepareRoleLaunch(args);
  if (name === "attach_run_monitor") {
    const runPath = fs.realpathSync(args.run_path);
    if (!fs.statSync(runPath).isDirectory() || !fs.existsSync(path.join(runPath, "run.json"))) throw new Error("run_path must contain a ScientistOne run.json file.");
    const state = await updateDraft(args.project_root, args.draft_id, (draft) => {
      if (draft.status !== "approved") throw new Error("The researcher has not approved this intake.");
      draft.status = "started";
      draft.run_path = runPath;
    });
    return { ...publicDraft(state), url: pageUrl("run", { path: Buffer.from(runPath).toString("base64url") }) };
  }
  if (name === "open_run_monitor") {
    const runPath = decodeRunPath(Buffer.from(fs.realpathSync(args.run_path)).toString("base64url"));
    return { run_path: runPath, url: pageUrl("run", { path: Buffer.from(runPath).toString("base64url") }) };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0") throw Object.assign(new Error("Invalid JSON-RPC message."), { code: -32600 });
  if (message.method === "initialize") {
    return { protocolVersion: MCP_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "scientistone-mcp", version: "1.0.0" } };
  }
  if (message.method === "ping") return {};
  if (message.method === "tools/list") return { tools };
  if (message.method === "tools/call") {
    try {
      return toolResult(await callTool(message.params?.name, message.params?.arguments));
    } catch (error) {
      return { content: [{ type: "text", text: error.message || "The ScientistOne tool failed." }], isError: true };
    }
  }
  if (message.method?.startsWith("notifications/")) return null;
  throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 });
}

async function runMcp() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of input) {
      if (!line.trim()) continue;
      void respondToMessage(line);
    }
  } finally {
    stop();
  }
}

async function respondToMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
    const result = await handleMessage(message);
    if (message.id === undefined || result === null) return;
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
  } catch (error) {
    if (message?.id === undefined) return;
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: error.code ?? -32603, message: error.message || "Internal error" } })}\n`);
  }
}

function stop() {
  if (webServer) webServer.close();
}

function shutdown() {
  stop();
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void runMcp();

export { callTool, createDraft, handleMessage, monitorSnapshot, readDraft, stop, updateDraft };
