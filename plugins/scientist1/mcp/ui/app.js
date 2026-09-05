const app = document.querySelector("#app");
const announcer = document.querySelector("#announcer");
const params = new URLSearchParams(location.search);
const apiOrigin = location.origin;
const token = location.hash.slice(1);
let view = params.get("view");
let project = params.get("project");
let draftId = params.get("draft");
let runPath = params.get("path");

let intake;
let step = 0;
let helpOpen = false;
let busy = false;
let errorMessage = "";
let saveTimer;
let pollTimer;
let selectedPhase = null;
let selectedAgentTask = null;
let lastMonitorSignature = "";
let latestMonitorData;
let inspectorTrackingFrame;
const canvasCamera = { x: 0, y: 0, zoom: 1, initialized: false };

const steps = [
  {
    label: "Research question",
    title: "What should S1 investigate?",
    intro: "Write the research question in your own terms. You can edit S1's study plan before the work begins.",
    help: "A useful question names what you are studying and what you want to learn. Name a method only if it is part of the question.",
    key: "question",
    placeholder: "Enter one answerable research question.",
    example: "Example: Which forecasting method best predicts 30-day hospital readmission from the available patient records?",
  },
  {
    label: "Purpose",
    title: "What should the answer help you decide or understand?",
    intro: "Give S1 the practical or scientific reason for the study.",
    help: "This helps S1 choose between valid directions. You can name a decision, an open question, or who will use the result.",
    key: "objective",
    placeholder: "Describe the purpose of the study.",
    example: "Example: Decide which method should be tested in a prospective study.",
  },
  {
    label: "Files",
    title: "What files should S1 use?",
    intro: "Add any data, code, images, papers, notes, or protocols. S1 will sort them and keep private evaluation files separate.",
    help: "Upload everything together. S1 will separate papers and working material from files that could reveal the answer during evaluation.",
    key: "materials_note",
    placeholder: "Add any notes about what the files contain or how S1 should use them.",
  },
  {
    label: "Prior work",
    title: "Are there papers S1 should read?",
    intro: "Enter a DOI, URL, title, or citation. You can also upload paper files in the previous step.",
    help: "Add papers that define the question, provide a baseline, or must be included. S1 will also search current literature and record the sources it uses.",
    key: "papers",
    placeholder: "Enter one paper, DOI, URL, title, or citation per line.",
  },
  {
    label: "Evaluation",
    title: "What evidence would answer the question?",
    intro: "Name the comparison, measure, or decision rule you want to use. Leave this blank if you want S1 to propose one.",
    help: "For example, you might require a metric and baseline, a held-out test, or a qualitative standard. You can edit S1's proposal before the study begins.",
    key: "evaluation",
    placeholder: "Enter a comparison, measure, or decision rule, or leave this blank for S1.",
  },
  {
    label: "Limits",
    title: "What limits should S1 follow?",
    intro: "Add any limits on data use, safety, ethics, computing time, methods, licensing, or claims.",
    help: "State anything S1 must not do or claim. S1 will handle null findings and failed checks within the approved study without asking you to design a separate outcome path.",
    key: "constraints",
    placeholder: "Enter required methods, exclusions, safeguards, deadlines, or limits on what S1 may conclude.",
  },
  {
    label: "Send",
    title: "Review your study request",
    intro: "S1 will use this information to draft the study plan.",
    help: "Sending this form does not start the study. You can edit every part of S1's plan before you approve it.",
    key: null,
  },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function announce(message) {
  announcer.textContent = "";
  requestAnimationFrame(() => { announcer.textContent = message; });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function filenameHeader(name) {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function api(pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Scientist1-Token", token);
  if (options.body && typeof options.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiOrigin}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "S1 couldn't complete that action.");
  return body;
}

function assetUrl(pathname) {
  return `${apiOrigin}${pathname}`;
}

function intakeQuery(route) {
  const query = new URLSearchParams({ project, draft: draftId });
  return `/api/intake${route}?${query}`;
}

function brandBar() {
  return `
    <header class="brand-bar">
      <div class="brand"><img src="${assetUrl("/logo.svg")}" alt=""><span>Scientist1</span></div>
    </header>`;
}

function appShell(content) {
  return `<main class="app-shell">${brandBar()}${content}</main>`;
}

function fieldSupport(item) {
  return `<div class="field-support"><span id="field-help" class="${item.example ? "example" : "field-help"}">${escapeHtml(item.example || "Why this matters")}</span><span class="help-anchor"><button class="help-disclosure${helpOpen ? " help-disclosure-open" : ""}" id="help" type="button" aria-label="${helpOpen ? "Close explanation" : "Explain this question"}" aria-expanded="${helpOpen}"><span class="help-glyph" aria-hidden="true">?</span><span class="help-copy" aria-hidden="${!helpOpen}">${escapeHtml(item.help)}</span></button></span></div>`;
}

function textField(item) {
  const value = intake.answers[item.key] || "";
  return `
    <div class="field-stack">
      <label for="answer">Your answer</label>
      <textarea id="answer" name="${escapeHtml(item.key)}" placeholder="${escapeHtml(item.placeholder)}" aria-describedby="field-help${errorMessage ? " form-error" : ""}">${escapeHtml(value)}</textarea>
    </div>`;
}

function dropZone() {
  return `
    <section class="drop-group">
      <label class="drop-zone" id="drop-files" for="file-files">
        <span><strong>Add files</strong><small>Choose files or drop them here. S1 will sort them.</small></span>
      </label>
      <input class="sr-only" id="file-files" type="file" multiple>
    </section>`;
}

function fileList() {
  const files = intake.uploads;
  if (!files.length) return "";
  return `
    <ul class="file-list" aria-label="Uploaded files">
      ${files.map((file) => `
        <li class="file-item">
          <div><span class="file-name">${escapeHtml(file.name)}</span><span class="file-meta">${escapeHtml(formatBytes(file.size))}</span></div>
          <button class="button button-quiet remove-file" type="button" data-upload="${escapeHtml(file.id)}">Remove</button>
        </li>`).join("")}
    </ul>`;
}

function filesField(item) {
  return `
    <div class="field-stack">
      <label for="answer">About these files</label>
      <textarea id="answer" name="${item.key}" placeholder="${escapeHtml(item.placeholder)}">${escapeHtml(intake.answers[item.key])}</textarea>
    </div>
    ${dropZone()}
    ${busy ? '<p class="upload-progress" role="status">Uploading files...</p>' : ""}
    ${fileList()}`;
}

function intakeSummary() {
  const rows = [
    ["Research question", intake.answers.question],
    ["Purpose", intake.answers.objective || "Not provided. S1 will propose one."],
    ["File notes", intake.answers.materials_note || "No notes added."],
    ["Papers", intake.answers.papers || "No papers named. S1 will search the literature."],
    ["Evaluation", intake.answers.evaluation || "Not provided. S1 will propose one."],
    ["Limits", intake.answers.constraints || "No additional limits added."],
  ];
  return `
    <div class="review-sections">
      ${rows.map(([label, value]) => `<section class="review-section"><h2>${escapeHtml(label)}</h2><p>${escapeHtml(value)}</p></section>`).join("")}
      <section class="review-section"><h2>Uploaded files</h2><p>${intake.uploads.length ? `${intake.uploads.length} file${intake.uploads.length === 1 ? "" : "s"} added.` : "No files uploaded."}</p></section>
    </div>`;
}

function renderWizard() {
  const item = steps[step];
  let field = item.key ? textField(item) : intakeSummary();
  if (item.key === "materials_note") field = filesField(item);
  const nextLabel = step === steps.length - 1 ? "Send to S1" : "Continue";
  app.innerHTML = appShell(`
    <div class="intake-layout">
      <section class="question-stage" aria-labelledby="question-title">
        <p class="question-count">${step + 1} of ${steps.length}</p>
        <h1 class="question-title" id="question-title" tabindex="-1">${escapeHtml(item.title)}</h1>
        <p class="question-intro">${escapeHtml(item.intro)}</p>
        ${field}
        ${fieldSupport(item)}
        ${errorMessage ? `<div class="error-box" id="form-error" role="alert">${escapeHtml(errorMessage)}</div>` : ""}
        <div class="button-row">
          ${step > 0 ? '<button class="button button-secondary" id="back" type="button">Back</button>' : ""}
          <button class="button button-primary" id="next" type="button"${busy ? " disabled" : ""}>${nextLabel}</button>
        </div>
      </section>
    </div>`);
  app.setAttribute("aria-busy", "false");
  bindWizard();
}

function collectAnswer() {
  const item = steps[step];
  const field = document.querySelector("#answer");
  if (item.key && field) intake.answers[item.key] = field.value;
}

async function saveAnswers(silent = false, savedStep = step) {
  collectAnswer();
  const updated = await api(intakeQuery("/answers"), { method: "POST", body: JSON.stringify({ ...intake.answers, wizard_step: savedStep }) });
  intake = updated;
  step = intake.wizard_step;
  if (!silent) announce("Saved.");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  collectAnswer();
  saveTimer = setTimeout(() => saveAnswers(true).catch(showError), 600);
}

async function goNext() {
  errorMessage = "";
  collectAnswer();
  if (step === 0 && !intake.answers.question.trim()) {
    errorMessage = "Enter the question the study should answer.";
    renderWizard();
    document.querySelector("#answer")?.focus();
    return;
  }
  busy = true;
  renderWizard();
  try {
    const currentStep = step;
    await saveAnswers(true, Math.min(step + 1, steps.length - 1));
    if (currentStep < steps.length - 1) {
      helpOpen = false;
      busy = false;
      renderWizard();
      document.querySelector("#question-title")?.focus({ preventScroll: true });
      scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    intake = await api(intakeQuery("/submit"), { method: "POST", body: "{}" });
    busy = false;
    renderIntakeState();
  } catch (error) {
    busy = false;
    showError(error);
  }
}

function bindDropZone(input) {
  const zone = document.querySelector(`#drop-${input.id.replace("file-", "")}`);
  const upload = (files) => uploadFiles([...files]);
  input.addEventListener("change", () => upload(input.files));
  for (const eventName of ["dragenter", "dragover"]) zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.add("drop-zone-dragging");
  });
  for (const eventName of ["dragleave", "drop"]) zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.remove("drop-zone-dragging");
  });
  zone.addEventListener("drop", (event) => upload(event.dataTransfer.files));
}

async function uploadFiles(files) {
  if (!files.length || busy) return;
  collectAnswer();
  busy = true;
  errorMessage = "";
  renderWizard();
  try {
    await saveAnswers(true);
    for (const file of files) {
      const query = new URLSearchParams({ project, draft: draftId });
      intake = await api(`/api/intake/upload?${query}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-Scientist1-Filename": filenameHeader(file.name) },
        body: file,
      });
      announce(`${file.name} added.`);
    }
  } catch (error) {
    errorMessage = error.message;
  } finally {
    busy = false;
    renderWizard();
  }
}

async function removeFile(id) {
  busy = true;
  renderWizard();
  try {
    const query = new URLSearchParams({ project, draft: draftId, upload: id });
    intake = await api(`/api/intake/upload?${query}`, { method: "DELETE" });
    announce("File removed.");
  } catch (error) {
    errorMessage = error.message;
  } finally {
    busy = false;
    renderWizard();
  }
}

function bindWizard() {
  const helpButton = document.querySelector("#help");
  const helpCopy = document.querySelector(".help-copy");
  const setHelp = (open) => {
    if (open && helpButton) {
      const anchor = helpButton.getBoundingClientRect();
      const next = document.querySelector("#next")?.getBoundingClientRect();
      const openWidth = Math.min(340, window.innerWidth - 24);
      const leftOverflow = Math.max(0, 12 - (anchor.right - openWidth));
      const rightOverflow = Math.max(0, anchor.left + openWidth - (window.innerWidth - 12));
      const expandRight = rightOverflow <= leftOverflow;
      const rawLeft = expandRight ? anchor.left : anchor.right - openWidth;
      const openLeft = Math.max(12, Math.min(rawLeft, window.innerWidth - openWidth - 12));
      const overlapsNext = next && openLeft < next.right && openLeft + openWidth > next.left && anchor.top < next.bottom && anchor.top + 150 > next.top;
      helpButton.style.setProperty("--help-shift-x", `${openLeft - rawLeft}px`);
      helpButton.classList.toggle("help-disclosure-expand-right", expandRight);
      helpButton.classList.toggle("help-disclosure-up", Boolean(overlapsNext));
    }
    helpOpen = open;
    helpButton?.setAttribute("aria-expanded", String(open));
    helpButton?.setAttribute("aria-label", open ? "Close explanation" : "Explain this question");
    helpButton?.classList.toggle("help-disclosure-open", open);
    helpCopy?.setAttribute("aria-hidden", String(!open));
  };
  helpButton?.addEventListener("click", () => setHelp(!helpOpen));
  document.querySelector(".question-stage")?.addEventListener("click", (event) => {
    if (helpOpen && !event.target.closest(".field-support")) setHelp(false);
  });
  document.querySelector(".question-stage")?.addEventListener("keydown", (event) => {
    if (helpOpen && event.key === "Escape") {
      setHelp(false);
      helpButton?.focus();
    }
  });
  document.querySelector("#back")?.addEventListener("click", async () => {
    const previousStep = step - 1;
    try { await saveAnswers(true, previousStep); } catch { step = previousStep; }
    helpOpen = false;
    errorMessage = "";
    renderWizard();
  });
  document.querySelector("#next")?.addEventListener("click", goNext);
  document.querySelector("#answer")?.addEventListener("input", scheduleSave);
  document.querySelectorAll('input[type="file"]').forEach(bindDropZone);
  document.querySelectorAll(".remove-file").forEach((button) => button.addEventListener("click", () => removeFile(button.dataset.upload)));
}

function waitingCopy() {
  if (intake.status === "submitted") return ["S1 is drafting your study plan", "S1 is organizing your answers and files into a plan for you to review."];
  if (intake.status === "changes_requested") return ["S1 is revising your study plan", "Your changes will appear here when the new draft is ready."];
  if (intake.status === "approved") return ["The study is starting", "S1 is checking the approved plan and files. The study monitor will open next."];
  return ["Opening the study monitor", "The approved study is ready to follow."];
}

function renderWaiting() {
  const [title, copy] = waitingCopy();
  app.innerHTML = appShell(`
    <section class="waiting" aria-labelledby="waiting-title">
      <h1 id="waiting-title">${title}</h1>
      <p>${copy}</p>
      <div class="waiting-rule" aria-hidden="true"></div>
      ${errorMessage ? `<div class="error-box" role="alert">${escapeHtml(errorMessage)}</div>` : ""}
    </section>`);
  app.setAttribute("aria-busy", "true");
  clearTimeout(pollTimer);
  pollTimer = setTimeout(loadIntake, 1400);
}

const editableReviewFields = ["question", "objective", "materials", "prior_work", "evaluation", "requirements", "deliverables", "study_plan_markdown"];

function reviewSection(field, label, value) {
  return `<section class="review-section"><label for="review-${field}">${escapeHtml(label)}</label><textarea class="review-field" id="review-${field}" data-review-field="${field}" aria-label="${escapeHtml(label)}">${escapeHtml(value)}</textarea></section>`;
}

function collectReviewEdits() {
  return Object.fromEntries(editableReviewFields.map((field) => [field, document.querySelector(`[data-review-field="${field}"]`).value]));
}

function bindReviewFields() {
  document.querySelectorAll(".review-field:not(.review-plan-field)").forEach((field) => {
    const resize = () => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    };
    field.addEventListener("input", resize);
    resize();
  });
}

function renderReview() {
  const review = intake.review_draft || intake.review;
  app.innerHTML = appShell(`
    <div class="review-layout">
      <section class="review-copy" aria-labelledby="review-title">
        <h1 id="review-title">Review the study before it begins</h1>
        <p>This is S1's draft. Edit any section directly. If several sections need work, describe them in the box.</p>
        <div class="review-sections">
          ${reviewSection("question", "Question", review.question)}
          ${reviewSection("objective", "Purpose", review.objective)}
          ${reviewSection("materials", "Materials", review.materials)}
          ${reviewSection("prior_work", "Prior work", review.prior_work)}
          ${reviewSection("evaluation", "Evidence needed to answer the question", review.evaluation)}
          ${reviewSection("requirements", "Requirements and limits", review.requirements)}
          ${reviewSection("deliverables", "What the study will produce", review.deliverables)}
        </div>
        <details class="plan-disclosure"><summary>Edit the full study plan</summary><textarea class="review-field review-plan-field" data-review-field="study_plan_markdown" aria-label="Full study plan">${escapeHtml(review.study_plan_markdown)}</textarea></details>
      </section>
      <aside class="review-actions" aria-labelledby="approval-title">
        <h2 id="approval-title">Is this the study you want?</h2>
        <p>Approve once to start the study. After approval, S1 will execute the approved plan through a freshly verified paper package. Initial contract review is a short closed-checklist pass: concrete defects are corrected minimally and optional improvements do not create work. Later failures preserve their evidence, invalidate affected successors when necessary, and remain same-run repair work. Attempt counts, repair cycles, and unavailable routes cannot finish the study or release the lead. To revise several sections before it starts, describe the changes below.</p>
        <button class="button button-primary" id="approve" type="button">Approve and start study</button>
        <div class="change-form">
          <label for="change-note">Other changes</label>
          <textarea id="change-note" placeholder="Describe anything else you want changed.">${escapeHtml(intake.change_request_draft || "")}</textarea>
          <button class="button button-secondary" id="request-change" type="button">Send changes to S1</button>
        </div>
        ${errorMessage ? `<div class="error-box" role="alert">${escapeHtml(errorMessage)}</div>` : ""}
      </aside>
    </div>`);
  app.setAttribute("aria-busy", "false");
  document.querySelector("#approve").addEventListener("click", approveStudy);
  document.querySelector("#request-change").addEventListener("click", requestChange);
  bindReviewFields();
  document.querySelectorAll(".review-field, #change-note").forEach((field) => field.addEventListener("input", scheduleReviewSave));
}

async function saveReviewDraft() {
  const review = collectReviewEdits();
  const note = document.querySelector("#change-note").value;
  intake.review_draft = { ...intake.review, ...review };
  intake.change_request_draft = note;
  intake = await api(intakeQuery("/review-draft"), { method: "POST", body: JSON.stringify({ review, note }) });
}

function scheduleReviewSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveReviewDraft().catch(showError), 600);
}

async function approveStudy() {
  clearTimeout(saveTimer);
  const review = collectReviewEdits();
  intake.review = { ...intake.review, ...review };
  busy = true;
  document.querySelector("#approve").disabled = true;
  try {
    intake = await api(intakeQuery("/approve"), { method: "POST", body: JSON.stringify({ review }) });
    announce("The study is approved and starting.");
    renderIntakeState();
  } catch (error) {
    busy = false;
    showError(error);
  }
}

async function requestChange() {
  clearTimeout(saveTimer);
  const review = collectReviewEdits();
  intake.review = { ...intake.review, ...review };
  const note = document.querySelector("#change-note").value.trim();
  if (!note) {
    errorMessage = "Describe what you want S1 to change.";
    renderReview();
    document.querySelector("#change-note").focus();
    return;
  }
  try {
    intake = await api(intakeQuery("/change"), { method: "POST", body: JSON.stringify({ note, review }) });
    announce("S1 is revising the study plan.");
    renderIntakeState();
  } catch (error) {
    showError(error);
  }
}

function goToRun(pathValue) {
  const bytes = new TextEncoder().encode(pathValue);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  location.replace(`/?view=run&path=${encodeURIComponent(encoded)}#${token}`);
}

function renderIntakeState() {
  if (intake.status === "draft") return renderWizard();
  if (intake.status === "review_ready") return renderReview();
  if (intake.status === "started" && intake.run_path) return goToRun(intake.run_path);
  return renderWaiting();
}

async function loadIntake() {
  try {
    intake = await api(intakeQuery(""));
    if (intake.status === "draft" && Number.isInteger(intake.wizard_step)) step = Math.max(0, Math.min(steps.length - 1, intake.wizard_step));
    errorMessage = "";
    renderIntakeState();
  } catch (error) {
    errorMessage = error.message;
    renderWaiting();
  }
}

function persistOpenDraft() {
  if (view !== "intake" || !intake) return;
  clearTimeout(saveTimer);
  let route;
  let body;
  if (intake.status === "draft") {
    collectAnswer();
    route = "/answers";
    body = { ...intake.answers, wizard_step: step };
  } else if (intake.status === "review_ready") {
    route = "/review-draft";
    body = { review: collectReviewEdits(), note: document.querySelector("#change-note")?.value || "" };
  } else return;
  const headers = new Headers({ "Content-Type": "application/json", "X-Scientist1-Token": token });
  fetch(`${apiOrigin}${intakeQuery(route)}`, { method: "POST", headers, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

addEventListener("pagehide", persistOpenDraft);

function monitorStatusText(status) {
  return { complete: "Checked", current: "Working now", attention: "Repairing automatically", upcoming: "Not started" }[status] || status;
}

function monitorTitle(data) {
  if (data.state === "complete") return "The study is complete";
  if (data.attention) return "The study is repairing a legacy interruption";
  return {
    contract: "The study plan is being checked",
    investigation: "Prior work review is in progress",
    discovery: "Method development and testing are in progress",
    selection: "Method selection is in progress",
    ablation: "Component tests are in progress",
    writing: "The paper is being drafted",
    verification: "The paper's claims are being checked",
    audit: "The study audit is in progress",
  }[data.current_phase] || "The study is in progress";
}

const NODE_WIDTH = 224;
const NODE_HEIGHT = 88;
const phaseTeams = {
  contract: "Study team",
  investigation: "Literature team",
  discovery: "Methods team",
  selection: "Selection team",
  ablation: "Component testing team",
  writing: "Writing team",
  verification: "Claims team",
  audit: "Audit team",
  complete: "Delivery team",
};
const phaseIcons = {
  contract: "handshake",
  investigation: "magnifying-glass",
  discovery: "git-branch",
  selection: "list-checks",
  ablation: "sliders-horizontal",
  writing: "pencil-simple",
  verification: "check-square",
  audit: "file-magnifying-glass",
  complete: "check-circle",
};
const iconPaths = {
  "handshake": "M254.3,107.91,228.78,56.85a16,16,0,0,0-21.47-7.15L182.44,62.13,130.05,48.27a8.14,8.14,0,0,0-4.1,0L73.56,62.13,48.69,49.7a16,16,0,0,0-21.47,7.15L1.7,107.9a16,16,0,0,0,7.15,21.47l27,13.51,55.49,39.63a8.06,8.06,0,0,0,2.71,1.25l64,16a8,8,0,0,0,7.6-2.1l55.07-55.08,26.42-13.21a16,16,0,0,0,7.15-21.46Zm-54.89,33.37L165,113.72a8,8,0,0,0-10.68.61C136.51,132.27,116.66,130,104,122L147.24,80h31.81l27.21,54.41ZM41.53,64,62,74.22,36.43,125.27,16,115.06Zm116,119.13L99.42,168.61l-49.2-35.14,28-56L128,64.28l9.8,2.59-45,43.68-.08.09a16,16,0,0,0,2.72,24.81c20.56,13.13,45.37,11,64.91-5L188,152.66Zm62-57.87-25.52-51L214.47,64,240,115.06Zm-87.75,92.67a8,8,0,0,1-7.75,6.06,8.13,8.13,0,0,1-1.95-.24L80.41,213.33a7.89,7.89,0,0,1-2.71-1.25L51.35,193.26a8,8,0,0,1,9.3-13l25.11,17.94L126,208.24A8,8,0,0,1,131.82,217.94Z",
  "magnifying-glass": "M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z",
  "git-branch": "M232,64a32,32,0,1,0-40,31v17a8,8,0,0,1-8,8H96a23.84,23.84,0,0,0-8,1.38V95a32,32,0,1,0-16,0v66a32,32,0,1,0,16,0V144a8,8,0,0,1,8-8h88a24,24,0,0,0,24-24V95A32.06,32.06,0,0,0,232,64ZM64,64A16,16,0,1,1,80,80,16,16,0,0,1,64,64ZM96,192a16,16,0,1,1-16-16A16,16,0,0,1,96,192ZM200,80a16,16,0,1,1,16-16A16,16,0,0,1,200,80Z",
  "list-checks": "M224,128a8,8,0,0,1-8,8H128a8,8,0,0,1,0-16h88A8,8,0,0,1,224,128ZM128,72h88a8,8,0,0,0,0-16H128a8,8,0,0,0,0,16Zm88,112H128a8,8,0,0,0,0,16h88a8,8,0,0,0,0-16ZM82.34,42.34,56,68.69,45.66,58.34A8,8,0,0,0,34.34,69.66l16,16a8,8,0,0,0,11.32,0l32-32A8,8,0,0,0,82.34,42.34Zm0,64L56,132.69,45.66,122.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Zm0,64L56,196.69,45.66,186.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Z",
  "sliders-horizontal": "M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z",
  "pencil-simple": "M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z",
  "check-square": "M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM224,48V208a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM208,208V48H48V208H208Z",
  "file-magnifying-glass": "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-45.54-48.85a36.05,36.05,0,1,0-11.31,11.31l11.19,11.2a8,8,0,0,0,11.32-11.32ZM104,148a20,20,0,1,1,20,20A20,20,0,0,1,104,148Z",
  "check-circle": "M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z",
  "book-open": "M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z",
  "lightbulb": "M176,232a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,232Zm40-128a87.55,87.55,0,0,1-33.64,69.21A16.24,16.24,0,0,0,176,186v6a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16v-6a16,16,0,0,0-6.23-12.66A87.59,87.59,0,0,1,40,104.49C39.74,56.83,78.26,17.14,125.88,16A88,88,0,0,1,216,104Zm-16,0a72,72,0,0,0-73.74-72c-39,.92-70.47,33.39-70.26,72.39a71.65,71.65,0,0,0,27.64,56.3A32,32,0,0,1,96,186v6h64v-6a32.15,32.15,0,0,1,12.47-25.35A71.65,71.65,0,0,0,200,104Z",
  "chart-bar": "M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z",
  "code": "M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z",
  "shield-check": "M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z",
  "arrows-clockwise": "M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z",
  "x": "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z",
};

function iconSvg(name, className = "node-icon") {
  return `<svg class="${className}" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${iconPaths[name] || iconPaths.handshake}"></path></svg>`;
}

function roleIcon(role, phase) {
  if (/writer|reporter/.test(role)) return "pencil-simple";
  if (/reader/.test(role)) return "book-open";
  if (/mapper/.test(role)) return "magnifying-glass";
  if (/ideator/.test(role)) return "lightbulb";
  if (/developer|implementer/.test(role)) return "code";
  if (/synthesizer|analyst|evaluator|score/.test(role)) return "chart-bar";
  if (/reproduction/.test(role)) return "arrows-clockwise";
  if (/critic|auditor|judge|verifier/.test(role)) return "shield-check";
  return phaseIcons[phase] || "handshake";
}

function phaseLayout(progress) {
  if (progress.length <= 3) return progress.map((item, index) => ({ ...item, x: 240 + index * 340, y: 430 }));
  return progress.map((item, index) => {
    const row = Math.floor(index / 3);
    const offset = index % 3;
    const column = row % 2 ? 2 - offset : offset;
    return { ...item, x: 240 + column * 340, y: 220 + row * 250 };
  });
}

function connectorPath(from, to) {
  if (from.y === to.y) {
    const direction = Math.sign(to.x - from.x);
    return `M ${from.x + direction * (NODE_WIDTH / 2 + 8)} ${from.y} L ${to.x - direction * (NODE_WIDTH / 2 + 14)} ${to.y}`;
  }
  if (from.x === to.x) {
    const direction = Math.sign(to.y - from.y);
    return `M ${from.x} ${from.y + direction * (NODE_HEIGHT / 2 + 8)} L ${to.x} ${to.y - direction * (NODE_HEIGHT / 2 + 14)}`;
  }
  const vertical = Math.sign(to.y - from.y);
  const startY = from.y + vertical * (NODE_HEIGHT / 2 + 8);
  const endY = to.y - vertical * (NODE_HEIGHT / 2 + 14);
  const middleY = (startY + endY) / 2;
  return `M ${from.x} ${startY} V ${middleY} H ${to.x} V ${endY}`;
}

function returnPath(from, to, index, phases) {
  const rightSide = from.x + to.x >= 1160;
  const side = rightSide ? 1 : -1;
  const edgeX = side > 0 ? Math.max(...phases.map((item) => item.x)) + NODE_WIDTH / 2 + 92 + index * 34 : Math.min(...phases.map((item) => item.x)) - NODE_WIDTH / 2 - 92 - index * 34;
  const startX = from.x + side * (NODE_WIDTH / 2 + 8);
  const endX = to.x + side * (NODE_WIDTH / 2 + 14);
  return { path: `M ${startX} ${from.y} H ${edgeX} V ${to.y} H ${endX}`, x: edgeX, y: (from.y + to.y) / 2, side };
}

function agentLayout(phase) {
  const total = phase.agents.length;
  return phase.agents.map((agent, index) => {
    const ring = Math.floor(index / 5);
    const ringStart = ring * 5;
    const ringCount = Math.min(5, total - ringStart);
    const start = window.innerWidth < 640 ? Math.PI : Math.PI / 2;
    const angle = ringCount === 1 ? start + Math.PI / 2 : start + ((index - ringStart) * Math.PI) / (ringCount - 1);
    return { ...agent, x: phase.x + Math.cos(angle) * (230 + ring * 110), y: phase.y + Math.sin(angle) * (170 + ring * 85), orbitIndex: index };
  });
}

function agentConnector(phase, agent) {
  const dx = agent.x - phase.x;
  const dy = agent.y - phase.y;
  const startScale = Math.min((NODE_WIDTH / 2 + 8) / Math.max(1, Math.abs(dx)), (NODE_HEIGHT / 2 + 8) / Math.max(1, Math.abs(dy)));
  const distance = Math.max(1, Math.hypot(dx, dy));
  return `M ${phase.x + dx * startScale} ${phase.y + dy * startScale} L ${agent.x - dx / distance * 38} ${agent.y - dy / distance * 38}`;
}

function renderCanvasGraph(data) {
  const world = document.querySelector("#canvas-world");
  if (!world) return;
  const phases = phaseLayout(data.progress);
  const selected = phases.find((item) => item.phase === selectedPhase);
  const agents = selected ? agentLayout(selected) : [];
  const width = Math.max(1160, ...phases.map((item) => item.x)) + 240;
  const height = phases.length <= 3 ? 780 : 980;
  const phaseLines = phases.slice(1).map((item, index) => {
    const previous = phases[index];
    const active = previous.status === "complete" && item.status !== "upcoming";
    return `<path class="map-line${active ? " map-line-active" : ""}" d="${connectorPath(previous, item)}" marker-end="url(#flow-arrow)" />`;
  }).join("");
  const returnLines = (data.returns || []).map((item, index) => {
    const from = phases.find((phase) => phase.phase === item.from);
    const to = phases.find((phase) => phase.phase === item.to);
    if (!from || !to) return "";
    const edge = returnPath(from, to, index, phases);
    return `<path class="return-line" d="${edge.path}" marker-end="url(#return-arrow)" /><text class="return-label" x="${edge.x + edge.side * 10}" y="${edge.y - 8}" text-anchor="${edge.side > 0 ? "start" : "end"}">${escapeHtml(item.label)}</text>`;
  }).join("");
  const agentLines = selected ? agents.map((agent) => `<path class="agent-line" d="${agentConnector(selected, agent)}" />`).join("") : "";
  world.classList.toggle("canvas-world-exploring", Boolean(selected));
  world.style.width = `${width}px`;
  world.style.height = `${height}px`;
  world.innerHTML = `
    <svg class="map-lines" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker>
        <marker id="return-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker>
      </defs>
      ${phaseLines}${returnLines}${agentLines}
    </svg>
    <div class="map-node-layer${canvasCamera.zoom < 0.55 ? " canvas-zoomed-out" : ""}" id="map-node-layer">
    ${phases.map((item, index) => `
      <button class="phase-node phase-node-${item.status}${item.phase === selectedPhase ? " phase-node-selected" : ""}" type="button" data-phase="${escapeHtml(item.phase)}" data-index="${index}" data-x="${item.x}" data-y="${item.y}" aria-label="${escapeHtml(`${phaseTeams[item.phase]}. ${item.label}. ${monitorStatusText(item.status)}.`)}"${item.phase === data.current_phase ? ' aria-current="step"' : ""}>
        <span class="phase-icon">${iconSvg(phaseIcons[item.phase])}</span>
        <span class="phase-copy"><strong>${escapeHtml(phaseTeams[item.phase])}</strong><small>${escapeHtml(item.label)}</small></span>
      </button>`).join("")}
    ${agents.map((agent) => `
      <button class="agent-node${String(agent.task) === selectedAgentTask ? " agent-node-selected" : ""}" type="button" data-task="${escapeHtml(agent.task)}" data-x="${agent.x}" data-y="${agent.y}" aria-label="${escapeHtml(`${agent.name}. ${agent.status === "complete" ? "Work saved" : "Working now"}.`)}">
        <span class="agent-orb" style="--orbit-delay:${agent.orbitIndex * -0.63}s">
          <span class="agent-mark">${iconSvg(roleIcon(agent.role, agent.phase), "agent-icon")}</span>
          <span>${escapeHtml(agent.name)}</span>
        </span>
      </button>`).join("")}
    </div>`;
  world.querySelectorAll("#map-node-layer [data-x]").forEach((node) => {
    node.style.transform = `translate(${node.dataset.x}px, ${node.dataset.y}px) translate(-50%, -50%)`;
  });
  bindGraph(data);
  applyCamera();
}

function clearCanvasSelection(data, fit = true) {
  selectedPhase = null;
  selectedAgentTask = null;
  renderCanvasGraph(data);
  renderInspector(data);
  if (fit) fitCanvas();
}

function positionInspector() {
  const inspector = document.querySelector("#canvas-inspector");
  const viewport = document.querySelector("#canvas-viewport");
  const anchor = selectedAgentTask ? [...document.querySelectorAll(".agent-node")].find((item) => item.dataset.task === selectedAgentTask) : document.querySelector(".phase-node-selected");
  if (!inspector || inspector.hidden || !viewport || !anchor) return;
  const viewportRect = viewport.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const gap = 18;
  let side = "right";
  let left = anchorRect.right - viewportRect.left + gap;
  let top = anchorRect.top - viewportRect.top + anchorRect.height / 2 - inspector.offsetHeight / 2;
  if (left + inspector.offsetWidth > viewportRect.width - 16) {
    side = "left";
    left = anchorRect.left - viewportRect.left - inspector.offsetWidth - gap;
  }
  if (viewportRect.width < 640) {
    side = "bottom";
    left = Math.max(12, Math.min(viewportRect.width - inspector.offsetWidth - 12, anchorRect.left - viewportRect.left + anchorRect.width / 2 - inspector.offsetWidth / 2));
    top = anchorRect.bottom - viewportRect.top + 14;
    if (top + inspector.offsetHeight > viewportRect.height - 12) {
      side = "top";
      top = anchorRect.top - viewportRect.top - inspector.offsetHeight - 14;
    }
  }
  inspector.dataset.side = side;
  inspector.style.left = `${Math.max(12, left)}px`;
  inspector.style.top = `${Math.max(12, Math.min(viewportRect.height - inspector.offsetHeight - 12, top))}px`;
}

function trackInspector(duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360) {
  cancelAnimationFrame(inspectorTrackingFrame);
  const inspector = document.querySelector("#canvas-inspector");
  inspector?.classList.add("canvas-inspector-positioning");
  const started = performance.now();
  let revealed = false;
  const follow = (now) => {
    positionInspector();
    if (!revealed) {
      inspector?.classList.remove("canvas-inspector-positioning");
      revealed = true;
    }
    if (now - started < duration) {
      inspectorTrackingFrame = requestAnimationFrame(follow);
      return;
    }
    inspectorTrackingFrame = undefined;
  };
  inspectorTrackingFrame = requestAnimationFrame(follow);
}

function renderInspector(data) {
  const inspector = document.querySelector("#canvas-inspector");
  if (!inspector) return;
  const phase = data.progress.find((item) => item.phase === selectedPhase);
  const agent = phase?.agents.find((item) => String(item.task) === selectedAgentTask);
  inspector.hidden = !phase;
  if (agent) {
    inspector.innerHTML = `
      <button class="popover-close" type="button" aria-label="Close details">${iconSvg("x", "close-icon")}</button>
      <p class="inspector-label">${escapeHtml(phaseTeams[phase.phase])} · ${agent.status === "complete" ? "Work saved" : "Working now"}</p>
      <h2>${escapeHtml(agent.name)}</h2>
      <p>${escapeHtml(agent.description)} ${agent.status === "complete" ? "Its assigned work is saved in the study record." : "Its current assignment is still in progress."}</p>`;
  } else if (phase) {
    inspector.innerHTML = `
      <button class="popover-close" type="button" aria-label="Close details">${iconSvg("x", "close-icon")}</button>
      <p class="inspector-label">${escapeHtml(monitorStatusText(phase.status))}</p>
      <h2>${escapeHtml(phaseTeams[phase.phase])}</h2>
      <p>${escapeHtml(phase.description)}${phase.agents.length ? " Select a specialist around the team to see its assignment." : " No specialist has started in this stage yet."}</p>`;
  } else inspector.innerHTML = "";
  if (phase && data.state === "complete" && data.files.length) inspector.insertAdjacentHTML("beforeend", `
    <div class="monitor-files" aria-label="Study files">
      ${data.files.map((file) => `<button type="button" data-path="${escapeHtml(file.path)}">Copy ${escapeHtml(file.label)} path</button>`).join("")}
    </div>`);
  inspector.querySelectorAll("[data-path]").forEach((button) => button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.path);
    announce("The file path was copied.");
  }));
  inspector.querySelector(".popover-close")?.addEventListener("click", () => clearCanvasSelection(data));
  requestAnimationFrame(positionInspector);
}

function clampZoom(value) {
  return Math.min(1.6, Math.max(0.28, value));
}

function applyCamera(animate = false) {
  const world = document.querySelector("#canvas-world");
  const viewport = document.querySelector("#canvas-viewport");
  const nodeLayer = document.querySelector("#map-node-layer");
  if (!world || !viewport) return;
  world.classList.toggle("canvas-world-moving", animate);
  nodeLayer?.classList.toggle("canvas-zoomed-out", canvasCamera.zoom < 0.55);
  world.style.transform = `translate(${canvasCamera.x}px, ${canvasCamera.y}px) scale(${canvasCamera.zoom})`;
  viewport.style.setProperty("--canvas-grid", `${24 * canvasCamera.zoom}px`);
  viewport.style.setProperty("--canvas-grid-x", `${canvasCamera.x % (24 * canvasCamera.zoom)}px`);
  viewport.style.setProperty("--canvas-grid-y", `${canvasCamera.y % (24 * canvasCamera.zoom)}px`);
  const percent = document.querySelector("#zoom-level");
  if (percent) percent.textContent = `${Math.round(canvasCamera.zoom * 100)}%`;
  if (animate) trackInspector();
  else positionInspector();
  if (animate) setTimeout(() => {
    world.classList.remove("canvas-world-moving");
    positionInspector();
  }, 360);
}

function fitCanvas(animate = true) {
  const viewport = document.querySelector("#canvas-viewport");
  if (!viewport || !latestMonitorData) return;
  const phases = phaseLayout(latestMonitorData.progress);
  const minX = Math.min(...phases.map((item) => item.x)) - NODE_WIDTH / 2 - 90;
  const maxX = Math.max(...phases.map((item) => item.x)) + NODE_WIDTH / 2 + 90;
  const minY = Math.min(...phases.map((item) => item.y)) - NODE_HEIGHT / 2 - 90;
  const maxY = Math.max(...phases.map((item) => item.y)) + NODE_HEIGHT / 2 + 90;
  const zoom = clampZoom(Math.min((viewport.clientWidth - 48) / (maxX - minX), (viewport.clientHeight - 80) / (maxY - minY)));
  canvasCamera.zoom = zoom;
  canvasCamera.x = viewport.clientWidth / 2 - ((minX + maxX) / 2) * zoom;
  canvasCamera.y = viewport.clientHeight / 2 - ((minY + maxY) / 2) * zoom;
  canvasCamera.initialized = true;
  applyCamera(animate);
}

function focusPhase(phaseName) {
  const viewport = document.querySelector("#canvas-viewport");
  if (!viewport || !latestMonitorData) return;
  const phase = phaseLayout(latestMonitorData.progress).find((item) => item.phase === phaseName);
  if (!phase) return;
  canvasCamera.zoom = viewport.clientWidth < 640 ? 0.88 : 1;
  canvasCamera.x = viewport.clientWidth / 2 - phase.x * canvasCamera.zoom;
  canvasCamera.y = viewport.clientHeight / 2 - phase.y * canvasCamera.zoom;
  canvasCamera.initialized = true;
  applyCamera(true);
}

function zoomCanvas(factor, clientX, clientY) {
  const viewport = document.querySelector("#canvas-viewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
  const y = (clientY ?? rect.top + rect.height / 2) - rect.top;
  const pageX = (x - canvasCamera.x) / canvasCamera.zoom;
  const pageY = (y - canvasCamera.y) / canvasCamera.zoom;
  canvasCamera.zoom = clampZoom(canvasCamera.zoom * factor);
  canvasCamera.x = x - pageX * canvasCamera.zoom;
  canvasCamera.y = y - pageY * canvasCamera.zoom;
  canvasCamera.initialized = true;
  applyCamera();
}

function bindGraph(data) {
  const phaseButtons = [...document.querySelectorAll(".phase-node")];
  phaseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (selectedPhase === button.dataset.phase && !selectedAgentTask) {
        clearCanvasSelection(data);
        return;
      }
      selectedPhase = button.dataset.phase;
      selectedAgentTask = null;
      renderCanvasGraph(data);
      renderInspector(data);
      focusPhase(selectedPhase);
      document.querySelector(".phase-node-selected")?.focus({ preventScroll: true });
      announce(`${data.progress.find((item) => item.phase === selectedPhase)?.label} selected.`);
    });
    button.addEventListener("keydown", (event) => {
      const current = Number(button.dataset.index);
      const destination = event.key === "Home" ? 0 : event.key === "End" ? phaseButtons.length - 1 : ["ArrowRight", "ArrowDown"].includes(event.key) ? current + 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? current - 1 : current;
      if (destination !== current && phaseButtons[destination]) {
        event.preventDefault();
        phaseButtons[destination].focus();
      }
    });
  });
  document.querySelectorAll(".agent-node").forEach((button) => {
    const select = () => {
      selectedAgentTask = button.dataset.task;
      document.querySelectorAll(".agent-node").forEach((item) => item.classList.toggle("agent-node-selected", item === button));
      renderInspector(data);
    };
    button.addEventListener("click", select);
    button.addEventListener("focus", select);
  });
}

function bindCanvas(data) {
  const viewport = document.querySelector("#canvas-viewport");
  const pointers = new Map();
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let cameraX = 0;
  let cameraY = 0;
  let moved = false;
  let pinch;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.classList.add("canvas-viewport-dragging");
    document.querySelector("#canvas-world")?.classList.remove("canvas-world-moving");
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      cameraX = canvasCamera.x;
      cameraY = canvasCamera.y;
    } else if (pointers.size === 2) {
      dragging = false;
      const [a, b] = [...pointers.values()];
      const rect = viewport.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        pageX: (midX - canvasCamera.x) / canvasCamera.zoom,
        pageY: (midY - canvasCamera.y) / canvasCamera.zoom,
        zoom: canvasCamera.zoom,
      };
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) moved = true;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const rect = viewport.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      canvasCamera.zoom = clampZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance));
      canvasCamera.x = midX - pinch.pageX * canvasCamera.zoom;
      canvasCamera.y = midY - pinch.pageY * canvasCamera.zoom;
    } else if (dragging) {
      canvasCamera.x = cameraX + event.clientX - startX;
      canvasCamera.y = cameraY + event.clientY - startY;
    }
    applyCamera();
  });
  const finishDrag = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    pinch = null;
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      dragging = true;
      startX = remaining.x;
      startY = remaining.y;
      cameraX = canvasCamera.x;
      cameraY = canvasCamera.y;
    } else {
      dragging = false;
      viewport.classList.remove("canvas-viewport-dragging");
      if (!moved && selectedPhase) clearCanvasSelection(data);
    }
  };
  viewport.addEventListener("pointerup", finishDrag);
  viewport.addEventListener("pointercancel", finishDrag);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) zoomCanvas(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    else {
      canvasCamera.x -= event.deltaX;
      canvasCamera.y -= event.deltaY;
      applyCamera();
    }
  }, { passive: false });
  viewport.addEventListener("keydown", (event) => {
    if ((event.key === "1" && event.shiftKey) || event.key === "Home") {
      event.preventDefault();
      fitCanvas();
    } else if (["+", "="].includes(event.key)) {
      event.preventDefault();
      zoomCanvas(1.18);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomCanvas(1 / 1.18);
    } else if (event.key === "Escape" && selectedPhase) {
      clearCanvasSelection(data);
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && event.target === viewport) {
      event.preventDefault();
      canvasCamera.x += event.key === "ArrowLeft" ? 48 : event.key === "ArrowRight" ? -48 : 0;
      canvasCamera.y += event.key === "ArrowUp" ? 48 : event.key === "ArrowDown" ? -48 : 0;
      applyCamera();
    }
  });
  document.querySelector("#zoom-in").addEventListener("click", () => zoomCanvas(1.18));
  document.querySelector("#zoom-out").addEventListener("click", () => zoomCanvas(1 / 1.18));
  document.querySelector("#zoom-fit").addEventListener("click", () => clearCanvasSelection(data));
}

function renderMonitor(data) {
  latestMonitorData = data;
  if (selectedPhase && !data.progress.some((item) => item.phase === selectedPhase)) {
    selectedPhase = null;
    selectedAgentTask = null;
  }
  const signature = JSON.stringify([data.state, data.current_phase, data.updated_at, data.integrity.ok, data.returns, data.progress.map((item) => [item.phase, item.status, item.agents.map((agent) => [agent.task, agent.status])])]);
  if (signature === lastMonitorSignature && document.querySelector("#canvas-viewport")) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(loadMonitor, 4000);
    return;
  }
  const hadMonitor = Boolean(lastMonitorSignature);
  const focusedPhase = document.activeElement?.dataset?.phase;
  const focusedTask = document.activeElement?.dataset?.task;
  if (hadMonitor) announce(`${data.current_label}. The study monitor has new saved progress.`);
  lastMonitorSignature = signature;
  const integrityLabel = data.integrity.ok ? "Latest checkpoint verified" : "Study record needs repair";
  app.innerHTML = `
    <main class="monitor-shell">
      <header class="monitor-bar">
        <div class="brand"><img src="${assetUrl("/logo.svg")}" alt=""><span>Scientist1</span></div>
        <div class="monitor-context">
          <p>${escapeHtml(monitorTitle(data))}</p>
          <h1 title="${escapeHtml(data.question)}">${escapeHtml(data.question)}</h1>
        </div>
        <div class="monitor-integrity${data.integrity.ok ? "" : " monitor-integrity-error"}" role="status" title="${escapeHtml(data.integrity.message)}"><span aria-hidden="true"></span>${integrityLabel}</div>
      </header>
      <section class="canvas-shell" aria-label="Interactive research map">
        <p class="canvas-help">Drag to move · Scroll to pan · Pinch to zoom</p>
        <div class="canvas-viewport" id="canvas-viewport" tabindex="0" aria-label="Research path. Use the arrow keys to pan, plus and minus to zoom, and Shift 1 to fit the study.">
          <div class="canvas-world" id="canvas-world"></div>
        </div>
        <div class="canvas-controls" aria-label="Canvas view controls">
          <button id="zoom-out" type="button" aria-label="Zoom out">−</button>
          <output id="zoom-level" aria-label="Current zoom">100%</output>
          <button id="zoom-in" type="button" aria-label="Zoom in">+</button>
          <button id="zoom-fit" type="button">Fit study</button>
        </div>
        <aside class="canvas-inspector" id="canvas-inspector" aria-live="polite"></aside>
      </section>
    </main>`;
  app.setAttribute("aria-busy", "false");
  renderCanvasGraph(data);
  renderInspector(data);
  bindCanvas(data);
  requestAnimationFrame(() => {
    if (canvasCamera.initialized) applyCamera();
    else if (document.querySelector("#canvas-viewport").clientWidth < 640) focusPhase(data.current_phase);
    else fitCanvas(false);
    const focusTarget = focusedTask ? [...document.querySelectorAll(".agent-node")].find((node) => node.dataset.task === focusedTask) : focusedPhase ? [...document.querySelectorAll(".phase-node")].find((node) => node.dataset.phase === focusedPhase) : null;
    focusTarget?.focus({ preventScroll: true });
  });
  clearTimeout(pollTimer);
  pollTimer = setTimeout(loadMonitor, 4000);
}

async function loadMonitor() {
  try {
    const data = await api(`/api/run?path=${encodeURIComponent(runPath)}`);
    renderMonitor(data);
  } catch (error) {
    renderFatal(error, loadMonitor);
  }
}

function showError(error) {
  errorMessage = error.message || "S1 couldn't complete that action.";
  if (view === "intake" && intake) renderIntakeState();
  else renderFatal(error, view === "run" ? loadMonitor : loadIntake);
}

function renderFatal(error, retry) {
  clearTimeout(pollTimer);
  app.innerHTML = appShell(`
    <section class="waiting">
      <h1>Scientist1 could not load this view</h1>
      <p>${escapeHtml(error.message || "The local interface stopped responding.")}</p>
      <div class="button-row"><button class="button button-primary" id="retry" type="button">Try again</button></div>
    </section>`);
  app.setAttribute("aria-busy", "false");
  document.querySelector("#retry").addEventListener("click", retry);
}

if (!token) {
  renderFatal(new Error("The local Scientist1 session has expired. Reopen it from Codex."), () => location.reload());
} else if (view === "intake" && project && draftId) {
  loadIntake();
} else if (view === "run" && runPath) {
  loadMonitor();
} else {
  renderFatal(new Error("This Scientist1 link is malformed. Reopen the study from Codex."), () => location.reload());
}
