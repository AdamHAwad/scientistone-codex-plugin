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
import { applyParallelCapacityWithCodex, capacityStatusWithCodex, declineParallelCapacity } from "../skills/scientist1/scripts/capacity-preflight.mjs";
import { loadModelPolicy, prepareRoleLaunch } from "./model-routing.mjs";

const execFileAsync = promisify(execFile);
const MCP_VERSION = "2025-11-25";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, "..");
const PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".codex-plugin", "plugin.json"), "utf8")).version;
const UI_ROOT = path.join(HERE, "ui");
const COE = path.join(PLUGIN_ROOT, "skills", "scientist1", "scripts", "coe.mjs");
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const MONITOR_VERIFY_TTL_MS = 5 * 60 * 1000;
const RESEARCHER_WAIT_TIMEOUT_MS = 60 * 60 * 1000;
const RESEARCHER_TIMEOUT_MESSAGE = "I see it's been an hour. I've saved everything—don't worry. When you're ready to get back into things, send me a message and I'll open it again.";
const APPROVAL_AUTHORITY = "The researcher approved this study once and authorized autonomous safe, reversible, in-scope execution through a freshly verified final paper and delivery package. Operational failures, rejected gates, unavailable routes, and repeated repairs remain active same-run work. The lead must keep orchestrating repairs and independent rechecks. Do not request another approval. The lead cannot stop before final verification succeeds.";
const ACTIVE_DRAFT_STATES = new Set(["draft", "submitted", "review_ready", "changes_requested", "approved"]);
const UPLOAD_DRAFT_STATES = new Set(["draft", "submitted", "review_ready", "changes_requested"]);
const EDITABLE_REVIEW_FIELDS = ["question", "objective", "materials", "prior_work", "paper_style", "evaluation", "requirements", "deliverables", "study_plan_markdown"];
const REQUIRED_REVIEW_FIELDS = new Set(["question", "objective", "evaluation", "deliverables", "study_plan_markdown"]);
const draftLocks = new Map();
const draftEvents = new EventEmitter();
const monitorIntegrityCache = new Map();
const monitorIntegrityInflight = new Map();
let capacityApproval;
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
  repair_adjudicator: "Repair adjudicator",
  checkpoint_reviewer: "Checkpoint repair reviewer",
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
  paper_style_auditor: "Paper style auditor",
  paper_critic: "Paper reviewer",
  claim_verifier: "Claim reviewer",
  i1_score_auditor: "Result checker",
  i1_verifier_builder: "Result policy author",
  i2_judge: "Method specification reviewer",
  i3_reference_auditor: "Reference checker",
  i4_judge: "Paper and method reviewer",
  claim_provenance_auditor: "Evidence trail reviewer",
  audit_reporter: "Audit reporter",
  reproduction_writer: "Reproduction guide writer",
};

const roleDescriptions = {
  repair_adjudicator: "Independently determines whether a review finding is a real closed-checklist defect, a repair regression, a machine failure, or a reviewer false positive, then freezes its exact repair scope.",
  checkpoint_reviewer: "Rechecks only the deterministic machine failure cited by a controller-issued repair docket.",
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
  paper_style_auditor: "Compares the paper's prose, structure, and formatting with the researcher's approved notes and examples.",
  paper_critic: "Checks the draft for unsupported or overstated claims.",
  claim_verifier: "Links each paper claim to its exact saved source or result.",
  i1_score_auditor: "Checks that the paper reports the same result as the canonical evaluation.",
  i1_verifier_builder: "Writes the declarative result policy that the bundled, tested interpreter applies to the frozen evaluation.",
  i2_judge: "Checks that the selected method solves the approved task without exploiting the test.",
  i3_reference_auditor: "Checks that cited sources exist and support the claims attached to them.",
  i4_judge: "Checks that the paper describes the selected method faithfully.",
  claim_provenance_auditor: "Checks that the final claims have complete evidence links.",
  audit_reporter: "Combines the independent audit findings without changing them.",
  reproduction_writer: "Records how to reproduce the selected method and evaluation.",
};

const policyRoles = Object.keys(loadModelPolicy().roles).sort();
const labeledRoles = Object.keys(roleLabels).sort();
if (JSON.stringify(policyRoles) !== JSON.stringify(labeledRoles)) throw new Error("Scientist1 role labels and model policy must cover the same specialist roles.");

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
  const hidden = path.join(projectRoot, ".scientist1");
  const root = path.join(hidden, "intake");
  for (const candidate of [hidden, root]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error("The Scientist1 intake directory cannot be a symbolic link.");
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
    wizard_step: state.wizard_step ?? 0,
    answers: state.answers,
    uploads: state.uploads,
    review: state.review,
    review_draft: state.review_draft ?? null,
    change_request: state.change_request,
    change_request_draft: state.change_request_draft ?? "",
    review_edits: state.review_edits ?? [],
    approved_at: state.approved_at ?? null,
    execution_authority: state.execution_authority ?? null,
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
  fs.mkdirSync(path.join(root, "files", "paper-style"), { recursive: true, mode: 0o700 });
  const state = {
    schema_version: 2,
    id,
    project_root: projectRoot,
    mode,
    status: "draft",
    revision: 0,
    created_at: now(),
    updated_at: now(),
    wizard_step: 0,
    answers: {
      question: "",
      objective: "",
      materials_note: "",
      papers: "",
      paper_style: "",
      evaluation: "",
      constraints: "",
    },
    uploads: [],
    review: null,
    review_draft: null,
    change_request: "",
    change_request_draft: "",
    review_edits: [],
    approved_at: null,
    execution_authority: null,
    run_path: null,
  };
  atomicJson(stateFile(projectRoot, id), state);
  return state;
}

function normalizeDraft(state) {
  if (state.schema_version === 1) {
    state.schema_version = 2;
    state.answers ??= {};
    state.answers.paper_style ??= "";
    if (state.mode === "research" && Number.isInteger(state.wizard_step) && state.wizard_step >= 4) state.wizard_step += 1;
    for (const upload of state.uploads ?? []) upload.context ??= "study";
    if (state.review) state.review.paper_style ??= "";
    if (state.review_draft) state.review_draft.paper_style ??= "";
  }
  if (state.schema_version !== 2) throw new Error(`Unsupported intake schema version: ${state.schema_version}.`);
  state.answers ??= {};
  state.answers.paper_style ??= "";
  for (const upload of state.uploads ?? []) upload.context ??= "study";
  return state;
}

function readDraft(projectRootArg, draftId) {
  const projectRoot = safeProjectRoot(projectRootArg);
  const file = stateFile(projectRoot, draftId);
  if (!fs.existsSync(file)) throw new Error("The intake draft was not found.");
  const root = draftRoot(projectRoot, draftId);
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error("The intake draft cannot be a symbolic link.");
  const state = normalizeDraft(readJson(file));
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
      // Ignore malformed directories. The UI never trusts them as drafts.
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

function researcherWaitResult(state, timedOut = false) {
  return {
    ...publicDraft(state),
    wait_status: timedOut ? "saved_timeout" : "researcher_responded",
    wait_timed_out: timedOut,
    ...(timedOut ? { timed_out_at: now(), resume_available: true, researcher_message: RESEARCHER_TIMEOUT_MESSAGE } : {}),
  };
}

async function waitForResearcher(projectRootArg, draftId, timeoutMs = RESEARCHER_WAIT_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("The researcher wait timeout must be a positive number of milliseconds.");
  const projectRoot = safeProjectRoot(projectRootArg);
  const key = stateFile(projectRoot, draftId);
  const current = readDraft(projectRoot, draftId);
  if (!new Set(["draft", "review_ready"]).has(current.status)) return researcherWaitResult(current);
  const waitingStatus = current.status;
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (state, timedOut = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      draftEvents.off(key, onChange);
      resolve(researcherWaitResult(state, timedOut));
    };
    const onChange = (state) => {
      if (state.status === waitingStatus) return;
      finish(state);
    };
    draftEvents.on(key, onChange);
    onChange(readDraft(projectRoot, draftId));
    if (!settled) timer = setTimeout(() => finish(readDraft(projectRoot, draftId), true), timeoutMs);
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

async function saveUpload(req, projectRoot, draftId, contextArg) {
  const existing = readDraft(projectRoot, draftId);
  if (!UPLOAD_DRAFT_STATES.has(existing.status)) throw new Error("This intake no longer accepts files.");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_UPLOAD_BYTES) throw new Error("The file is larger than the 2 GB intake limit.");
  const context = contextArg || "study";
  if (!new Set(["study", "paper_style"]).has(context)) throw new Error("Upload context must be study or paper_style.");
  if (context === "paper_style" && existing.mode !== "research") throw new Error("Paper-writing examples are available only for research studies.");
  const name = decodeFilename(req.headers["x-scientist1-filename"]);
  const directory = path.join(draftRoot(projectRoot, draftId), "files", context === "paper_style" ? "paper-style" : "unclassified");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
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
      if (!UPLOAD_DRAFT_STATES.has(state.status)) throw new Error("This intake no longer accepts files.");
      const relative = path.relative(projectRoot, destination).split(path.sep).join("/");
      state.uploads.push({
        id: randomUUID(),
        name: path.basename(destination),
        size,
        media_type: String(req.headers["content-type"] || "application/octet-stream"),
        context,
        kind: context === "paper_style" ? "style_example" : "unclassified",
        classification: context === "paper_style" ? "writing_only" : "unclassified",
        purpose: context === "paper_style" ? "Writing, structure, and formatting reference only. Not scientific evidence." : "",
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
  const studyUploads = draft.uploads.filter((upload) => upload.context === "study");
  const styleUploadIds = new Set(draft.uploads.filter((upload) => upload.context === "paper_style").map((upload) => upload.id));
  if ([...byId.keys()].some((id) => styleUploadIds.has(id))) throw new Error("Writing examples are style-only and must not appear in review.file_assignments.");
  if (byId.size !== studyUploads.length || studyUploads.some((upload) => !byId.has(upload.id))) throw new Error("review.file_assignments must classify every study upload exactly once.");
  for (const upload of studyUploads) {
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
    if (String(draft.review[field] ?? "").trim() !== next) {
      draft.review[field] = next;
      changed.push(field);
    }
  }
  if (changed.length) {
    draft.review_edits ??= [];
    draft.review_edits.push({ edited_at: now(), fields: changed });
  }
}

function editableReviewDraft(value) {
  return Object.fromEntries(EDITABLE_REVIEW_FIELDS.map((field) => [field, String(value?.[field] ?? "").slice(0, 200000)]));
}

function rawFileSha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function checkedStyleUpload(projectRoot, draftId, upload) {
  const intakeDirectory = fs.realpathSync(draftRoot(projectRoot, draftId));
  const target = path.resolve(projectRoot, upload.stored_path);
  const relative = path.relative(intakeDirectory, target);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(target)) throw new Error(`Writing example path is invalid: ${upload.name}.`);
  const info = fs.lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(target) !== target) throw new Error(`Writing example must be a regular project-local file: ${upload.name}.`);
  if (info.size !== upload.size || rawFileSha256(target) !== upload.sha256) throw new Error(`Writing example bytes changed after upload: ${upload.name}.`);
  return target;
}

function ensureSafeRunDirectory(runPath, relative) {
  let current = runPath;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
    const info = fs.lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(current) !== current) throw new Error(`Run directory cannot be a symbolic link: ${relative}.`);
  }
  return current;
}

function copyStyleInput(source, destination, expectedSha256) {
  const parent = path.dirname(destination);
  const parentInfo = fs.lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error(`Run writing-example directory is unsafe: ${parent}.`);
  if (fs.existsSync(destination)) {
    const info = fs.lstatSync(destination);
    if (!info.isFile() || info.isSymbolicLink() || rawFileSha256(destination) !== expectedSha256) throw new Error(`Existing run writing example differs from the approved upload: ${path.basename(destination)}.`);
    return;
  }
  const temporary = `${destination}.${randomBytes(5).toString("hex")}.part`;
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temporary, 0o600);
    if (rawFileSha256(temporary) !== expectedSha256) throw new Error(`Writing example copy failed verification: ${path.basename(destination)}.`);
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function materializePaperStyle(approved, projectRoot, runPath) {
  const notes = String(approved.review?.paper_style ?? "").trim();
  const uploads = (approved.uploads ?? []).filter((upload) => upload.context === "paper_style");
  const policyPath = path.join(runPath, "contract", "paper-style-policy.json");
  const styleDirectory = path.join(runPath, "inputs", "style");
  if (!notes && !uploads.length) {
    if (fs.existsSync(policyPath) || fs.existsSync(styleDirectory)) throw new Error("This approved intake has no paper-style request, but the run already contains paper-style inputs.");
    return null;
  }
  if (approved.mode !== "research") throw new Error("Paper-writing preferences cannot be attached to an external-audit run.");
  ensureSafeRunDirectory(runPath, "contract");
  ensureSafeRunDirectory(runPath, "inputs/style");
  if (fs.existsSync(policyPath)) {
    const info = fs.lstatSync(policyPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Existing paper-style policy must be a regular run-local file.");
  }
  const examples = uploads.map((upload, index) => {
    const source = checkedStyleUpload(projectRoot, approved.id, upload);
    const stableName = `${String(index + 1).padStart(2, "0")}-${cleanFilename(upload.name)}`;
    const frozenPath = `inputs/style/${stableName}`;
    copyStyleInput(source, path.join(runPath, frozenPath), upload.sha256);
    return {
      upload_id: upload.id,
      original_name: upload.name,
      media_type: upload.media_type,
      frozen_path: frozenPath,
      source_sha256: upload.sha256,
      frozen_sha256: rawFileSha256(path.join(runPath, frozenPath)),
    };
  });
  const policy = {
    schema_version: 1,
    source_draft_id: approved.id,
    max_reviews: 3,
    writing_review_limit: 2,
    notes,
    examples,
    criteria: ["ai_tells", "prose", "structure", "formatting", "visual_fidelity"],
    evidence_rule: "Use examples only for prose, structure, and formatting. Never copy their text or treat them as scientific evidence.",
  };
  if (fs.existsSync(policyPath)) {
    if (JSON.stringify(readJson(policyPath)) !== JSON.stringify(policy)) throw new Error("Existing paper-style policy differs from the approved intake.");
  } else {
    atomicJson(policyPath, policy);
  }
  return rawFileSha256(policyPath);
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Scientist1-Token, X-Scientist1-Filename");
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
  if (req.headers.origin && req.headers.origin !== expected && !isMcpAppOrigin(req.headers.origin)) throw Object.assign(new Error("This request did not come from the Scientist1 interface."), { statusCode: 403 });
  if (req.headers["x-scientist1-token"] !== webToken) throw Object.assign(new Error("The local Scientist1 session has expired. Reopen it from Codex."), { statusCode: 401 });
}

function decodeRunPath(encoded) {
  if (typeof encoded !== "string" || encoded.length > 8192) throw new Error("The run path is invalid.");
  const run = Buffer.from(encoded, "base64url").toString("utf8");
  if (!path.isAbsolute(run)) throw new Error("The run path must be absolute.");
  const resolved = fs.realpathSync(run);
  if (!fs.statSync(resolved).isDirectory() || !fs.existsSync(path.join(resolved, "run.json"))) throw new Error("A Scientist1 run was not found at that path.");
  return resolved;
}

function readJsonDirectory(directory) {
  if (!fs.existsSync(directory)) return [];
  const values = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      values.push({ name: entry.name, value: readJson(path.join(directory, entry.name)) });
    } catch {
      // A partial record is reported by the verifier instead of exposed to the browser.
    }
  }
  return values;
}

function inferRolePhase(record) {
  const outputs = Array.isArray(record.declared_outputs) ? record.declared_outputs : Array.isArray(record.outputs) ? record.outputs : [];
  const inputs = Array.isArray(record.declared_inputs) ? record.declared_inputs : [];
  const has = (prefix) => outputs.some((item) => typeof item === "string" && item.startsWith(prefix));
  if (has("deliverables/")) return "complete";
  if (has("audit/") || has("delivery/")) return "audit";
  if (has("paper/")) return record.role === "claim_verifier" || (record.role === "paper_style_auditor" && inputs.includes("paper/paper.tex")) ? "verification" : "writing";
  if (has("ablation/")) return "ablation";
  if (has("selection/")) return "selection";
  if (has("discovery/")) return "discovery";
  if (has("evidence/") || has("investigation/")) return "investigation";
  if (has("contract/")) return "contract";
  return "contract";
}

function planQuestion(run) {
  const file = path.join(run, "study-plan.md");
  if (!fs.existsSync(file)) return "Scientist1 study";
  const text = fs.readFileSync(file, "utf8");
  for (const heading of ["Research question", "What I will test"]) {
    const match = text.match(new RegExp(`^## ${heading}\\s*\\n+([^#]+)`, "mi"));
    if (match) return match[1].trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ").slice(0, 320);
  }
  return "Scientist1 study";
}

async function verifyRun(run, options = {}) {
  try {
    if (options.verifyRunner) return await options.verifyRunner(run);
    const { stdout } = await execFileAsync(process.execPath, [COE, "verify", run], { encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024 });
    return { ok: true, record: JSON.parse(stdout) };
  } catch (error) {
    return { ok: false, record: null, error: error.message };
  }
}

function monitorIntegritySignature(record) {
  const last = record.last_checkpoint;
  return JSON.stringify([record.updated_at, record.state, record.phase, last, last === null ? null : record.checkpoints?.[last]?.receipt_sha256]);
}

async function monitorIntegrity(run, record, options = {}) {
  const signature = monitorIntegritySignature(record);
  const key = `${run}\0${signature}`;
  const now = options.now ?? Date.now();
  const cached = monitorIntegrityCache.get(run);
  const ttl = cached?.ok ? (options.verifyTtlMs ?? MONITOR_VERIFY_TTL_MS) : Math.min(options.verifyTtlMs ?? MONITOR_VERIFY_TTL_MS, 30_000);
  if (cached?.signature === signature && now - cached.checked_ms < ttl) return { ...cached, cached: true, authoritative: false };
  if (monitorIntegrityInflight.has(key)) return monitorIntegrityInflight.get(key);
  const promise = (async () => {
    let candidate = record;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidateSignature = monitorIntegritySignature(candidate);
      const result = await verifyRun(run, options);
      const latest = readJson(path.join(run, "run.json"));
      const latestSignature = monitorIntegritySignature(latest);
      if (latestSignature !== candidateSignature) {
        candidate = latest;
        continue;
      }
      const value = { ok: result.ok, record: latest, signature: latestSignature, checked_ms: now, checked_at: new Date(now).toISOString(), cached: false, authoritative: false };
      monitorIntegrityCache.set(run, value);
      return value;
    }
    const value = { ok: false, record: candidate, signature: monitorIntegritySignature(candidate), checked_ms: now, checked_at: new Date(now).toISOString(), cached: false, authoritative: false };
    monitorIntegrityCache.set(run, value);
    return value;
  })().finally(() => monitorIntegrityInflight.delete(key));
  monitorIntegrityInflight.set(key, promise);
  return promise;
}

function clearMonitorIntegrityCache() {
  monitorIntegrityCache.clear();
  monitorIntegrityInflight.clear();
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

async function monitorSnapshot(run, options = {}) {
  const record = readJson(path.join(run, "run.json"));
  const integrity = await monitorIntegrity(run, record, options);
  const displayRecord = integrity.record ?? record;
  const phases = displayRecord.mode === "external_audit" ? ["contract", "audit", "complete"] : ["contract", "investigation", "discovery", "selection", "ablation", "writing", "verification", "audit", "complete"];
  const launches = readJsonDirectory(path.join(run, "role-launches"));
  const receipts = readJsonDirectory(path.join(run, "role-receipts"));
  const verifiedRecord = integrity.ok ? displayRecord : null;
  const promotedReceipts = new Set(Object.values(verifiedRecord?.checkpoints ?? {}).flatMap((checkpoint) => checkpoint.outputs ?? []).map((item) => item.path).filter((item) => /^role-receipts\/[^/]+\.json$/.test(item)).map((item) => path.basename(item)));
  const receiptsByName = new Map(receipts.map((item) => [item.name, item.value]));
  const agents = launches.map(({ name, value: item }) => ({
    task: item.task_id ?? item.agent_task ?? item.started_at,
    role: item.role,
    name: roleLabels[item.role] ?? "Research specialist",
    description: roleDescriptions[item.role] ?? "Completes one bounded part of the approved study and saves the result.",
    phase: inferRolePhase(item),
    status: promotedReceipts.has(name) && receiptsByName.get(name)?.agent_task === path.basename(name, ".json") && receiptsByName.get(name)?.launch_record === `role-launches/${name}` ? "complete" : "working",
    started_at: item.started_at ?? null,
  }));
  const progress = phases.map((phase) => {
    const receiptVerified = Boolean(verifiedRecord?.checkpoints?.[phase]);
    let status = receiptVerified ? "complete" : phase === displayRecord.phase ? "current" : "upcoming";
    if (phase === displayRecord.phase && displayRecord.attention) status = "attention";
    return { phase, label: phaseLabels[phase], description: phaseDescriptions[phase], status, agents: agents.filter((agent) => agent.phase === phase) };
  });
  const files = [];
  for (const [label, relative] of [["Paper", "deliverables/paper.pdf"], ["Study plan", "study-plan.md"], ["Audit report", "deliverables/audit-report.md"], ["Evidence manifest", "deliverables/manifest.json"]]) {
    if (fs.existsSync(path.join(run, relative))) files.push({ label, path: path.join(run, relative) });
  }
  return {
    id: displayRecord.id,
    mode: displayRecord.mode,
    state: displayRecord.state,
    outcome: displayRecord.outcome,
    question: planQuestion(run),
    current_phase: displayRecord.phase,
    current_label: phaseLabels[displayRecord.phase] ?? "Study in progress",
    updated_at: displayRecord.updated_at,
    attention: Boolean(displayRecord.attention),
    integrity: {
      ok: integrity.ok,
      authoritative: false,
      cached: integrity.cached,
      checked_at: integrity.checked_at,
      message: integrity.ok
        ? `The latest checkpoint passed its monitor verification at ${integrity.checked_at}. Final delivery and task stop always run a fresh verifier.`
        : `The latest monitor verification at ${integrity.checked_at} found that the saved evidence chain needs repair.`,
    },
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
      if (!mcpAppRequest) return sendJson(res, 403, { error: "This request did not come from the Scientist1 interface." });
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
        const lastStep = draft.mode === "research" ? 7 : 6;
        if (Number.isInteger(body.wizard_step)) draft.wizard_step = Math.max(0, Math.min(lastStep, body.wizard_step));
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/upload" && req.method === "POST") {
      const state = await saveUpload(req, safeProjectRoot(requestUrl.searchParams.get("project")), requestUrl.searchParams.get("draft"), requestUrl.searchParams.get("context"));
      return sendJson(res, 201, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/upload" && req.method === "DELETE") {
      const uploadId = requestUrl.searchParams.get("upload");
      const projectRoot = safeProjectRoot(requestUrl.searchParams.get("project"));
      const draftId = requestUrl.searchParams.get("draft");
      const state = await updateDraft(projectRoot, draftId, (draft) => {
        if (!UPLOAD_DRAFT_STATES.has(draft.status)) throw new Error("This intake no longer accepts file changes.");
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
    if (requestUrl.pathname === "/api/intake/review-draft" && req.method === "POST") {
      const body = assertObject(await parseJsonBody(req), "review draft");
      const review = assertObject(body.review, "review draft fields");
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (draft.status !== "review_ready" || !draft.review) throw new Error("The study summary is not ready to edit.");
        draft.review_draft = { ...editableReviewDraft(draft.review), ...(draft.review_draft ?? {}) };
        for (const field of EDITABLE_REVIEW_FIELDS) {
          if (typeof review[field] === "string") draft.review_draft[field] = review[field].slice(0, 200000);
        }
        if (typeof body.note === "string") draft.change_request_draft = body.note.slice(0, 12000);
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/change" && req.method === "POST") {
      const body = assertObject(await parseJsonBody(req), "change request");
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (draft.status !== "review_ready") throw new Error("The study summary is not ready for revision.");
        applyReviewEdits(draft, { ...(draft.review_draft ?? {}), ...(body.review ?? {}) });
        const note = String(body.note || draft.change_request_draft || "").trim();
        if (!note) throw new Error("Describe what you want S1 to change.");
        draft.status = "changes_requested";
        draft.change_request = note.slice(0, 12000);
        draft.review_draft = null;
        draft.change_request_draft = "";
      });
      return sendJson(res, 200, publicDraft(state));
    }
    if (requestUrl.pathname === "/api/intake/approve" && req.method === "POST") {
      const body = assertObject(await parseJsonBody(req), "approval");
      const state = await updateDraft(requestUrl.searchParams.get("project"), requestUrl.searchParams.get("draft"), (draft) => {
        if (draft.status !== "review_ready") throw new Error("The study summary is not ready for approval.");
        applyReviewEdits(draft, { ...(draft.review_draft ?? {}), ...(body.review ?? {}) });
        draft.status = "approved";
        draft.approved_at = now();
        draft.execution_authority = APPROVAL_AUTHORITY;
        draft.review_draft = null;
        draft.change_request_draft = "";
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
    name: "check_parallel_capacity",
    description: "Run Scientist1's one-time local Codex parallel-capacity preflight before intake. This fixed-purpose check reads no project or study content and returns whether to continue, ask the researcher once, or require a restart.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "decline_parallel_capacity",
    description: "Record the researcher's explicit decision not to change the local Codex parallel-agent limit, so Scientist1 continues at available capacity without asking again.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "approve_parallel_capacity",
    description: "After the researcher explicitly approves the capacity prompt, consume its one-use token and atomically set the local Codex parallel-agent limit to 16 through Codex's configuration service. This global config mutation is backed up, validated, conflict-safe, and restart-tracked.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["confirmation_token"],
      properties: { confirmation_token: { type: "string", pattern: "^[0-9a-f-]{36}$" } },
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
  },
  {
    name: "start_study_setup",
    description: "Start Scientist1's guided browser setup. Call this first for a new study or explicit setup resume; never launch the bundled server through a shell command.",
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
      "openai/toolInvocation/invoking": "Opening Scientist1…",
      "openai/toolInvocation/invoked": "Scientist1 is ready.",
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
    description: "Pause this task until the researcher submits the setup or responds to the study review. Call once after start_study_setup or publish_study_review; it waits without polling and returns a saved, resumable timeout result after one hour.",
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
          required: ["question", "objective", "materials", "prior_work", "paper_style", "evaluation", "requirements", "deliverables", "study_plan_markdown", "request_markdown", "file_assignments"],
          properties: {
            question: { type: "string" },
            objective: { type: "string" },
            materials: { type: "string" },
            prior_work: { type: "string" },
            paper_style: { type: "string", description: "Optional approved prose, structure, and formatting preferences. Keep blank when none were supplied." },
            evaluation: { type: "string" },
            requirements: { type: "string" },
            deliverables: { type: "string" },
            study_plan_markdown: { type: "string" },
            request_markdown: { type: "string" },
            file_assignments: {
              type: "array",
              description: "One assignment for every study-context upload returned by read_study_setup. Do not include paper_style uploads. Use evaluator_only for answer keys, held-out outcomes, and private checks.",
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
    description: "Resolve Scientist1's semantic model policy, then authorize one native Codex specialist launch. Call immediately before every specialist spawn and use the returned task_name, fork_turns, model, reasoning_effort, and assignment exactly. Keep logical_task_name stable. A grant or dispatch failure before authorization may reuse the same attempt with a fresh task_name; after a specialist launch is accepted, use the next attempt.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["run_path", "task_name", "role", "declared_inputs", "declared_outputs", "task_brief"],
      properties: {
        run_path: { type: "string" },
        task_name: { type: "string", pattern: "^[a-z0-9_]{1,120}$" },
        logical_task_name: { type: "string", pattern: "^[a-z0-9_]{1,120}$" },
        attempt: { type: "integer", minimum: 1 },
        role: { type: "string", enum: Object.keys(roleLabels) },
        declared_inputs: { type: "array", items: { type: "string" } },
        declared_outputs: { type: "array", minItems: 1, items: { type: "string" } },
        allowed_external_sources: { type: "array", items: { type: "string" } },
        task_brief: {
          type: "object",
          additionalProperties: false,
          required: ["objective", "context", "acceptance_gate", "constraints", "upstream_summary"],
          properties: {
            objective: { type: "string" },
            context: { type: "string" },
            acceptance_gate: { type: "string" },
            constraints: { type: "string" },
            upstream_summary: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["input_path", "summary"],
                properties: { input_path: { type: "string" }, summary: { type: "string" } },
              },
            },
          },
        },
      },
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "attach_run_monitor",
    description: "Connect an approved setup to its initialized Scientist1 run so the open browser changes from setup to the live study monitor.",
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
    description: "Open or reconnect the plain-language monitor for an existing Scientist1 run using its saved files.",
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

async function callTool(name, args = {}, options = {}) {
  if (name === "check_parallel_capacity") {
    const result = await capacityStatusWithCodex(options);
    capacityApproval = result.action === "prompt" ? { token: randomUUID(), expires_at: Date.now() + 10 * 60 * 1000 } : undefined;
    return capacityApproval ? { ...result, confirmation_token: capacityApproval.token } : result;
  }
  if (name === "decline_parallel_capacity") {
    capacityApproval = undefined;
    return declineParallelCapacity(options);
  }
  if (name === "approve_parallel_capacity") {
    if (!capacityApproval || capacityApproval.expires_at < Date.now() || args.confirmation_token !== capacityApproval.token) throw new Error("A fresh one-use capacity confirmation token is required. Run check_parallel_capacity before asking the researcher.");
    capacityApproval = undefined;
    return applyParallelCapacityWithCodex({ ...options, confirmed: true });
  }
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
    return waitForResearcher(args.project_root, args.draft_id);
  }
  if (name === "publish_study_review") {
    const review = assertObject(args.review, "review");
    for (const field of [...REQUIRED_REVIEW_FIELDS, "request_markdown"]) {
      if (typeof review[field] !== "string" || !review[field].trim()) throw new Error(`review.${field} is required.`);
    }
    for (const field of EDITABLE_REVIEW_FIELDS) if (typeof review[field] !== "string") throw new Error(`review.${field} must be text.`);
    const state = await updateDraft(args.project_root, args.draft_id, (draft) => {
      if (new Set(["approved", "started"]).has(draft.status)) throw new Error("Study approval is final. Continue the approved run and attach its monitor; do not publish another review.");
      if (!new Set(["submitted", "changes_requested", "review_ready"]).has(draft.status)) throw new Error("The intake is not ready for a study summary.");
      if (draft.mode === "external_audit" && review.paper_style.trim()) throw new Error("External-audit reviews cannot contain paper-writing preferences.");
      classifyUploads(draft, review.file_assignments);
      draft.review = { ...review };
      draft.review_draft = editableReviewDraft(review);
      draft.review_edits = [];
      draft.status = "review_ready";
      draft.change_request = "";
      draft.change_request_draft = "";
    });
    return publicDraft(state);
  }
  if (name === "prepare_role_launch") return prepareRoleLaunch(args);
  if (name === "attach_run_monitor") {
    const projectRoot = safeProjectRoot(args.project_root);
    const runPath = fs.realpathSync(args.run_path);
    if (!fs.statSync(runPath).isDirectory() || !fs.existsSync(path.join(runPath, "run.json"))) throw new Error("run_path must contain a Scientist1 run.json file.");
    if (path.dirname(runPath) !== path.join(projectRoot, "scientist1-runs")) throw new Error("run_path must be a direct child of this project's scientist1-runs directory.");
    const approved = readDraft(projectRoot, args.draft_id);
    if (!new Set(["approved", "started"]).has(approved.status) || !approved.approved_at || approved.execution_authority !== APPROVAL_AUTHORITY) throw new Error("The researcher has not approved this intake with the current Scientist1 execution authority.");
    if (approved.status === "started" && fs.realpathSync(approved.run_path) !== runPath) throw new Error("This approved intake is already bound to a different Scientist1 run.");
    const paperStylePolicySha256 = materializePaperStyle(approved, projectRoot, runPath);
    try {
      await execFileAsync(process.execPath, [COE, "bind-approval", runPath, approved.id, approved.approved_at, approved.execution_authority, paperStylePolicySha256 ?? "-"], { timeout: 120_000, windowsHide: true });
    } catch (error) {
      throw new Error(`Scientist1 could not bind durable approval to the run: ${String(error.stderr || error.message).trim()}`);
    }
    const state = await updateDraft(projectRoot, args.draft_id, (draft) => {
      if (!new Set(["approved", "started"]).has(draft.status)) throw new Error("The researcher has not approved this intake.");
      if (draft.status === "started" && fs.realpathSync(draft.run_path) !== runPath) throw new Error("This approved intake is already bound to a different Scientist1 run.");
      draft.status = "started";
      draft.run_path = runPath;
    });
    return { ...publicDraft(state), url: pageUrl("run", { path: Buffer.from(runPath).toString("base64url") }) };
  }
  if (name === "open_run_monitor") {
    const runPath = decodeRunPath(Buffer.from(fs.realpathSync(args.run_path)).toString("base64url"));
    const snapshot = await monitorSnapshot(runPath);
    return {
      run_path: runPath,
      url: pageUrl("run", { path: Buffer.from(runPath).toString("base64url") }),
      verified_status: {
        state: snapshot.state,
        outcome: snapshot.outcome,
        current_phase: snapshot.current_phase,
        updated_at: snapshot.updated_at,
        attention: snapshot.attention,
        integrity: snapshot.integrity,
      },
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0") throw Object.assign(new Error("Invalid JSON-RPC message."), { code: -32600 });
  if (message.method === "initialize") {
    return { protocolVersion: MCP_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "scientist1-mcp", version: PLUGIN_VERSION } };
  }
  if (message.method === "ping") return {};
  if (message.method === "tools/list") return { tools };
  if (message.method === "tools/call") {
    try {
      return toolResult(await callTool(message.params?.name, message.params?.arguments));
    } catch (error) {
      return { content: [{ type: "text", text: error.message || "The Scientist1 tool failed." }], isError: true };
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

export { RESEARCHER_TIMEOUT_MESSAGE, RESEARCHER_WAIT_TIMEOUT_MS, callTool, clearMonitorIntegrityCache, createDraft, handleMessage, monitorSnapshot, readDraft, stop, updateDraft, waitForResearcher };
