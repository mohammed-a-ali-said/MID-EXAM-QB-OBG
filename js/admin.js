(function () {
  const DATA_URL = "./data/questions.json";
  const GITHUB_SETTINGS_KEY = "obg_admin_github_settings";
  const DEFAULT_GITHUB = {
    owner: "mohammed-a-ali-said",
    repo: "MID-EXAM-QB-OBG",
    branch: "main",
  };
  const TYPE_OPTIONS = ["MCQ", "FLASHCARD", "SAQ", "OSCE"];
  const COMMIT_MESSAGE = "Update question bank from admin dashboard";

  const state = {
    original: [],
    working: [],
    selectedId: null,
    dirty: false,
  };

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function makeOscePart() {
    return { q: "", choices: ["", ""], ans: "A" };
  }

  function normalizeOscePart(part) {
    const next = deepClone(part || {});
    next.q = String(next.q || "").trim();
    next.choices = Array.isArray(next.choices) ? next.choices.slice() : ["", ""];
    next.ans = String(next.ans || "").trim();
    return next;
  }

  function normalizeQuestion(raw) {
    const question = deepClone(raw || {});
    question.active = question.active !== false;
    question.tags = Array.isArray(question.tags) ? question.tags : [];
    question.alsoInLectures = uniqueStrings(question.alsoInLectures || []);
    question.note = String(question.note || "").trim();
    question.q = String(question.q || question.stem || "").trim();
    question.source = String(question.source || "");
    question.lecture = String(question.lecture || "");
    question.exam = String(question.exam || "mid");
    question.doctor = String(question.doctor || "");

    if (question.cardType === "MCQ") {
      question.choices = Array.isArray(question.choices) ? question.choices.slice() : ["", ""];
      question.ans = String(question.ans || "").trim();
      delete question.a;
      delete question.subParts;
    } else if (question.cardType === "FLASHCARD" || question.cardType === "SAQ") {
      question.a = String(question.a || "").trim();
      delete question.choices;
      delete question.ans;
      delete question.subParts;
    } else if (question.cardType === "OSCE") {
      question.subParts = Array.isArray(question.subParts) ? question.subParts.map(normalizeOscePart) : [makeOscePart()];
      delete question.choices;
      delete question.ans;
      delete question.a;
    }
    return question;
  }

  function getLectureOptions() {
    return uniqueStrings(
      state.working.flatMap((question) => [question.lecture].concat(question.alsoInLectures || []))
    ).sort((a, b) => a.localeCompare(b));
  }

  function getSelectedQuestion() {
    return state.working.find((question) => question.id === state.selectedId) || null;
  }

  function setDirty(nextDirty) {
    state.dirty = !!nextDirty;
    if (els.dirtyBadge) {
      els.dirtyBadge.textContent = state.dirty ? "Unsaved changes" : "Saved";
      els.dirtyBadge.classList.toggle("dirty", state.dirty);
    }
  }

  function setStatus(message, tone) {
    els.saveStatus.textContent = message;
    els.saveStatus.className = `save-status${tone ? ` ${tone}` : ""}`;
  }

  function saveGithubSettings() {
    const payload = {
      owner: els.githubOwner.value.trim(),
      repo: els.githubRepo.value.trim(),
      branch: els.githubBranch.value.trim() || "main",
    };
    localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(payload));
  }

  function loadGithubSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(GITHUB_SETTINGS_KEY) || "null");
      const settings = raw && typeof raw === "object" ? raw : {};
      els.githubOwner.value = settings.owner || DEFAULT_GITHUB.owner;
      els.githubRepo.value = settings.repo || DEFAULT_GITHUB.repo;
      els.githubBranch.value = settings.branch || DEFAULT_GITHUB.branch;
    } catch (error) {
      els.githubOwner.value = DEFAULT_GITHUB.owner;
      els.githubRepo.value = DEFAULT_GITHUB.repo;
      els.githubBranch.value = DEFAULT_GITHUB.branch;
    }
  }

  async function loadQuestions() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load questions (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Question bank payload is invalid.");
    state.original = payload.map((question) => normalizeQuestion(question));
    state.working = deepClone(state.original);
    state.selectedId = state.working[0]?.id || null;
    setDirty(false);
  }

  function summaryCard(label, value, sub) {
    return `<div class="summary-card">
      <div class="summary-label">${escapeHtml(label)}</div>
      <div class="summary-value">${escapeHtml(value)}</div>
      <div class="summary-sub">${escapeHtml(sub)}</div>
    </div>`;
  }

  function questionTitle(question) {
    return String(question.q || "").trim() || "Untitled question";
  }

  function filteredQuestions() {
    const query = String(els.searchInput.value || "").trim().toLowerCase();
    const lecture = els.searchLecture.value || "all";
    const type = els.searchType.value || "all";
    const status = els.searchStatus.value || "all";

    return state.working.filter((question) => {
      if (lecture !== "all") {
        const lectures = [question.lecture].concat(question.alsoInLectures || []);
        if (!lectures.includes(lecture)) return false;
      }
      if (type !== "all" && question.cardType !== type) return false;
      if (status === "active" && question.active === false) return false;
      if (status === "inactive" && question.active !== false) return false;
      if (!query) return true;
      const haystack = [
        question.id,
        question.num,
        question.lecture,
        question.source,
        question.note,
        question.q,
        question.a,
        ...(question.choices || []),
        ...(question.subParts || []).flatMap((part) => [part.q].concat(part.choices || [])),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderSummary() {
    const total = state.working.length;
    const active = state.working.filter((question) => question.active !== false).length;
    const inactive = total - active;
    const repeated = state.working.filter((question) => Array.isArray(question.alsoInLectures) && question.alsoInLectures.length > 0).length;
    const validation = validateAll();
    els.summaryGrid.innerHTML = [
      summaryCard("Questions", total, `${active} active, ${inactive} inactive`),
      summaryCard("Repeated", repeated, "Cross-lecture links"),
      summaryCard("Lectures", getLectureOptions().length, "Available lecture buckets"),
      summaryCard("Validation", `${validation.errorCount} errors`, `${validation.warningCount} warnings`),
    ].join("");
  }

  function renderSearchFilters() {
    const currentLecture = els.searchLecture.value || "all";
    els.searchLecture.innerHTML = ['<option value="all">All Lectures</option>']
      .concat(getLectureOptions().map((lecture) => `<option value="${escapeHtml(lecture)}">${escapeHtml(lecture)}</option>`))
      .join("");
    if ([...els.searchLecture.options].some((option) => option.value === currentLecture)) {
      els.searchLecture.value = currentLecture;
    }
  }

  function renderQuestionList() {
    const items = filteredQuestions();
    if (!items.length) {
      els.listMeta.textContent = "No questions match the current filters.";
      els.questionList.innerHTML = '<div class="empty-state">No matching questions.</div>';
      return;
    }
    if (!items.some((question) => question.id === state.selectedId)) {
      state.selectedId = items[0].id;
    }
    els.listMeta.textContent = `${items.length} matching questions`;
    els.questionList.innerHTML = items
      .map((question) => {
        const repeated = Array.isArray(question.alsoInLectures) && question.alsoInLectures.length > 0;
        const classes = ["question-item"];
        if (question.id === state.selectedId) classes.push("active");
        return `<button type="button" class="${classes.join(" ")}" data-question-id="${escapeHtml(question.id)}">
          <div class="question-line">
            <div class="question-title">${escapeHtml(questionTitle(question))}</div>
            <div class="question-id">${escapeHtml(question.id)}</div>
          </div>
          <div class="question-meta">${escapeHtml(question.lecture || "No lecture")} | ${escapeHtml(question.cardType)}${question.source ? ` | ${escapeHtml(question.source)}` : ""}</div>
          <div class="chip-row">
            <span class="chip chip-type">${escapeHtml(question.cardType)}</span>
            <span class="chip ${question.active === false ? "chip-inactive" : "chip-active"}">${question.active === false ? "Inactive" : "Active"}</span>
            ${repeated ? '<span class="chip chip-repeat">Repeated</span>' : ""}
            ${question.note ? '<span class="chip chip-note">Note</span>' : ""}
          </div>
        </button>`;
      })
      .join("");
  }

  function renderLectureSelect(question) {
    return uniqueStrings(getLectureOptions().concat(question.lecture || []))
      .sort((a, b) => a.localeCompare(b))
      .map((lecture) => `<option value="${escapeHtml(lecture)}">${escapeHtml(lecture)}</option>`)
      .join("");
  }

  function renderRepeatGrid(question) {
    const lectures = getLectureOptions().filter((lecture) => lecture && lecture !== question.lecture);
    if (!lectures.length) {
      return '<div class="subtle">No other lectures available yet.</div>';
    }
    return lectures
      .map((lecture) => `
        <label class="repeat-option">
          <input type="checkbox" value="${escapeHtml(lecture)}" ${question.alsoInLectures.includes(lecture) ? "checked" : ""}>
          <span>${escapeHtml(lecture)}</span>
        </label>`)
      .join("");
  }

  function renderChoiceEditor(question) {
    const answerOptions = question.choices.map((_, index) => {
      const label = String.fromCharCode(65 + index);
      return `<option value="${label}">${label}</option>`;
    }).join("");
    return `
      <div class="choice-editor">
        ${(question.choices || []).map((choice, index) => `
          <div class="choice-row">
            <div class="choice-label">${String.fromCharCode(65 + index)}</div>
            <input type="text" data-role="choice" data-index="${index}" value="${escapeHtml(choice)}">
            <button class="mini-btn danger" type="button" data-action="remove-choice" data-index="${index}">Remove</button>
          </div>`).join("")}
        <div class="choice-row">
          <div class="choice-label">Answer</div>
          <select data-role="answer">${answerOptions}</select>
          <button class="mini-btn" type="button" data-action="add-choice">Add Choice</button>
        </div>
      </div>`;
  }

  function renderOscePart(part, partIndex) {
    const choices = Array.isArray(part.choices) ? part.choices : [];
    const answerOptions = choices.map((_, index) => {
      const label = String.fromCharCode(65 + index);
      return `<option value="${label}" ${part.ans === label ? "selected" : ""}>${label}</option>`;
    }).join("");
    return `
      <div class="osce-part">
        <label>
          Part prompt
          <textarea rows="3" data-role="osce-question" data-part-index="${partIndex}">${escapeHtml(part.q || "")}</textarea>
        </label>
        ${choices.map((choice, choiceIndex) => `
          <div class="choice-row">
            <div class="choice-label">${String.fromCharCode(65 + choiceIndex)}</div>
            <input type="text" data-role="osce-choice" data-part-index="${partIndex}" data-choice-index="${choiceIndex}" value="${escapeHtml(choice)}">
            <button class="mini-btn danger" type="button" data-action="remove-osce-choice" data-part-index="${partIndex}" data-choice-index="${choiceIndex}">Remove</button>
          </div>`).join("")}
        <div class="choice-row">
          <div class="choice-label">Answer</div>
          <select data-role="osce-answer" data-part-index="${partIndex}">${answerOptions}</select>
          <button class="mini-btn" type="button" data-action="add-osce-choice" data-part-index="${partIndex}">Add Choice</button>
        </div>
      </div>`;
  }

  function renderTypeEditor(question) {
    if (question.cardType === "MCQ") {
      els.typeEditor.innerHTML = renderChoiceEditor(question);
      const answerSelect = els.typeEditor.querySelector('[data-role="answer"]');
      if (answerSelect) answerSelect.value = question.ans || "A";
      return;
    }
    if (question.cardType === "FLASHCARD" || question.cardType === "SAQ") {
      els.typeEditor.innerHTML = `
        <label>
          Answer
          <textarea rows="5" data-role="type-answer">${escapeHtml(question.a || "")}</textarea>
        </label>`;
      return;
    }
    if (question.cardType === "OSCE") {
      els.typeEditor.innerHTML = `
        ${(question.subParts || []).map((part, partIndex) => renderOscePart(part, partIndex)).join("")}
        <button class="mini-btn" type="button" data-action="add-osce-part">Add OSCE Part</button>`;
      return;
    }
    els.typeEditor.innerHTML = '<div class="subtle">No editor available for this type.</div>';
  }

  function renderPreview(question) {
    const repeats = uniqueStrings([question.lecture].concat(question.alsoInLectures || []).filter(Boolean));
    let body = "";
    if (question.cardType === "MCQ") {
      body = (question.choices || []).map((choice, index) => `
        <div class="preview-choice"><strong>${String.fromCharCode(65 + index)}.</strong> ${escapeHtml(choice)}</div>`).join("");
      body += `<div class="subtle">Correct answer: ${escapeHtml(question.ans || "")}</div>`;
    } else if (question.cardType === "FLASHCARD" || question.cardType === "SAQ") {
      body = `<div class="preview-choice"><strong>Answer:</strong> ${escapeHtml(question.a || "")}</div>`;
    } else if (question.cardType === "OSCE") {
      body = (question.subParts || []).map((part, partIndex) => `
        <div class="preview-choice">
          <div><strong>Part ${partIndex + 1}</strong>${part.q ? `: ${escapeHtml(part.q)}` : ""}</div>
          ${(part.choices || []).map((choice, choiceIndex) => `<div class="subtle">${String.fromCharCode(65 + choiceIndex)}. ${escapeHtml(choice)}</div>`).join("")}
          <div class="subtle">Answer: ${escapeHtml(part.ans || "")}</div>
        </div>`).join("");
    }
    els.previewCard.innerHTML = `
      <div class="preview-title">${escapeHtml(question.lecture || "No lecture")} | ${escapeHtml(question.cardType)}</div>
      <div class="preview-question">${escapeHtml(question.q || "")}</div>
      ${question.note ? `<div class="preview-note"><strong>Note:</strong> ${escapeHtml(question.note)}</div>` : ""}
      ${body}
      <div class="chip-row">
        <span class="chip chip-type">${escapeHtml(question.cardType)}</span>
        <span class="chip ${question.active === false ? "chip-inactive" : "chip-active"}">${question.active === false ? "Inactive" : "Active"}</span>
        ${repeats.length > 1 ? `<span class="chip chip-repeat">Also in ${escapeHtml(repeats.slice(1).join(", "))}</span>` : ""}
      </div>`;
  }

  function validateQuestion(question, lectureOptions) {
    const errors = [];
    const warnings = [];

    if (!String(question.id || "").trim()) errors.push("Question ID is missing.");
    if (!TYPE_OPTIONS.includes(question.cardType)) errors.push("Question type is invalid.");
    if (!String(question.lecture || "").trim()) errors.push("Lecture is required.");
    if (!String(question.q || "").trim()) errors.push("Question stem/body is required.");
    if (question.lecture && lectureOptions.length && !lectureOptions.includes(question.lecture)) {
      warnings.push("Lecture is not part of the current lecture list.");
    }
    if ((question.alsoInLectures || []).some((lecture) => !lectureOptions.includes(lecture))) {
      warnings.push("One or more repeated lecture links are not recognized.");
    }

    if (question.cardType === "MCQ") {
      const choices = (question.choices || []).map((choice) => String(choice || "").trim()).filter(Boolean);
      if (choices.length < 2) errors.push("MCQ needs at least 2 non-empty choices.");
      const answerIndex = String(question.ans || "").trim().toUpperCase().charCodeAt(0) - 65;
      if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex > choices.length - 1) {
        errors.push("MCQ answer must point to an existing choice.");
      }
    }

    if ((question.cardType === "FLASHCARD" || question.cardType === "SAQ") && !String(question.a || "").trim()) {
      errors.push(`${question.cardType} requires an answer.`);
    }

    if (question.cardType === "OSCE") {
      const parts = Array.isArray(question.subParts) ? question.subParts : [];
      if (!parts.length) errors.push("OSCE requires at least one sub-part.");
      parts.forEach((part, index) => {
        const choices = (part.choices || []).map((choice) => String(choice || "").trim()).filter(Boolean);
        if (!String(part.q || "").trim() && parts.length > 1) warnings.push(`OSCE part ${index + 1} has no prompt.`);
        if (choices.length < 2) errors.push(`OSCE part ${index + 1} needs at least 2 non-empty choices.`);
        const answerIndex = String(part.ans || "").trim().toUpperCase().charCodeAt(0) - 65;
        if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex > choices.length - 1) {
          errors.push(`OSCE part ${index + 1} answer must match an existing choice.`);
        }
      });
    }

    return { errors, warnings };
  }

  function validateAll() {
    const lectureOptions = getLectureOptions();
    const idCounts = new Map();
    state.working.forEach((question) => {
      const key = String(question.id || "").trim();
      idCounts.set(key, (idCounts.get(key) || 0) + 1);
    });
    const results = state.working.map((question) => {
      const result = validateQuestion(question, lectureOptions);
      if ((idCounts.get(String(question.id || "").trim()) || 0) > 1) {
        result.errors.unshift("Duplicate question ID.");
      }
      return { id: question.id, title: questionTitle(question), ...result };
    });
    return {
      errorCount: results.reduce((sum, item) => sum + item.errors.length, 0),
      warningCount: results.reduce((sum, item) => sum + item.warnings.length, 0),
      results,
    };
  }

  function renderValidation() {
    const validation = validateAll();
    const selected = getSelectedQuestion();
    const selectedValidation = selected
      ? validation.results.find((item) => item.id === selected.id) || { errors: [], warnings: [] }
      : { errors: [], warnings: [] };

    els.validationSummary.textContent = `${validation.errorCount} errors, ${validation.warningCount} warnings across ${state.working.length} questions.`;
    const items = [];
    selectedValidation.errors.forEach((message) => {
      items.push(`<div class="validation-item error"><strong>${escapeHtml(selected?.id || "Question")}</strong>: ${escapeHtml(message)}</div>`);
    });
    selectedValidation.warnings.forEach((message) => {
      items.push(`<div class="validation-item warning"><strong>${escapeHtml(selected?.id || "Question")}</strong>: ${escapeHtml(message)}</div>`);
    });
    if (!items.length) {
      if (!validation.errorCount && !validation.warningCount) {
        items.push('<div class="validation-item">No validation issues found.</div>');
      } else {
        validation.results.filter((item) => item.errors.length || item.warnings.length).slice(0, 8).forEach((item) => {
          item.errors.forEach((message) => {
            items.push(`<div class="validation-item error"><strong>${escapeHtml(item.id)}</strong>: ${escapeHtml(message)}</div>`);
          });
          item.warnings.forEach((message) => {
            items.push(`<div class="validation-item warning"><strong>${escapeHtml(item.id)}</strong>: ${escapeHtml(message)}</div>`);
          });
        });
      }
    }
    els.validationList.innerHTML = items.join("");
    return validation;
  }

  function renderEditor() {
    const question = getSelectedQuestion();
    if (!question) {
      els.emptyState.textContent = "No question selected.";
      els.emptyState.classList.remove("hidden");
      els.editorWrap.classList.add("hidden");
      els.previewCard.innerHTML = "";
      return;
    }
    els.emptyState.classList.add("hidden");
    els.editorWrap.classList.remove("hidden");

    els.editorQuestionId.textContent = question.id;
    els.editorQuestionSub.textContent = `${question.lecture || "No lecture"} | ${question.cardType}${question.source ? ` | ${question.source}` : ""}`;
    els.fieldId.value = question.id || "";
    els.fieldNum.value = question.num || "";
    els.fieldLecture.innerHTML = renderLectureSelect(question);
    els.fieldLecture.value = question.lecture || "";
    els.fieldExam.value = question.exam || "mid";
    els.fieldCardType.value = question.cardType || "MCQ";
    els.fieldSource.value = question.source || "";
    els.fieldDoctor.value = question.doctor || "";
    els.fieldActive.checked = question.active !== false;
    els.fieldQ.value = question.q || "";
    els.fieldNote.value = question.note || "";
    els.repeatLectures.innerHTML = renderRepeatGrid(question);

    renderTypeEditor(question);
    renderPreview(question);
    renderValidation();
  }

  function renderAll() {
    renderSummary();
    renderSearchFilters();
    renderQuestionList();
    renderEditor();
  }

  function updateQuestion(mutator, options = {}) {
    const index = state.working.findIndex((question) => question.id === state.selectedId);
    if (index < 0) return;
    const draft = deepClone(state.working[index]);
    mutator(draft);
    if (draft.lecture) {
      draft.alsoInLectures = uniqueStrings((draft.alsoInLectures || []).filter((lecture) => lecture && lecture !== draft.lecture));
    }
    state.working[index] = normalizeQuestion(draft);
    setDirty(true);
    if (options.fullRender === false) {
      renderSummary();
      renderPreview(state.working[index]);
      renderValidation();
      return;
    }
    renderAll();
  }

  function convertQuestionType(question, nextType) {
    const draft = deepClone(question);
    const previousType = draft.cardType;
    draft.cardType = nextType;
    if (nextType === "MCQ") {
      draft.choices = Array.isArray(draft.choices) && draft.choices.length ? draft.choices : ["", ""];
      draft.ans = draft.ans || "A";
      delete draft.a;
      delete draft.subParts;
    } else if (nextType === "FLASHCARD" || nextType === "SAQ") {
      draft.a = draft.a || (previousType === "MCQ" ? draft.ans || "" : "");
      delete draft.choices;
      delete draft.ans;
      delete draft.subParts;
    } else if (nextType === "OSCE") {
      draft.subParts = Array.isArray(draft.subParts) && draft.subParts.length ? draft.subParts.map(normalizeOscePart) : [makeOscePart()];
      delete draft.choices;
      delete draft.ans;
      delete draft.a;
    }
    return normalizeQuestion(draft);
  }

  function normalizeForSave(question) {
    const normalized = normalizeQuestion(question);
    const output = {
      id: normalized.id,
      num: normalized.num || "",
      cardType: normalized.cardType,
      lecture: normalized.lecture,
      exam: normalized.exam || "mid",
      source: normalized.source || "",
    };
    if (normalized.doctor) output.doctor = normalized.doctor;
    output.q = normalized.q || "";
    if (normalized.cardType === "MCQ") {
      output.choices = (normalized.choices || []).map((choice) => String(choice || "").trim());
      output.ans = normalized.ans || "";
    } else if (normalized.cardType === "FLASHCARD" || normalized.cardType === "SAQ") {
      output.a = normalized.a || "";
    } else if (normalized.cardType === "OSCE") {
      output.stem = normalized.stem || normalized.q || "";
      output.subParts = (normalized.subParts || []).map((part) => ({
        q: String(part.q || "").trim(),
        choices: (part.choices || []).map((choice) => String(choice || "").trim()),
        ans: String(part.ans || "").trim(),
      }));
    }
    if (normalized.cardType !== "OSCE" && normalized.stem) output.stem = normalized.stem;
    if (Array.isArray(normalized.tags) && normalized.tags.length) output.tags = normalized.tags;
    if (normalized.imagePlaceholder) output.imagePlaceholder = true;
    if (normalized.imagePlaceholderText) output.imagePlaceholderText = normalized.imagePlaceholderText;
    if (normalized._extra) output._extra = true;
    if (normalized._mergedPrevExam) output._mergedPrevExam = true;
    if (normalized.note) output.note = normalized.note;
    if (normalized.active === false) output.active = false;
    if (Array.isArray(normalized.alsoInLectures) && normalized.alsoInLectures.length) {
      output.alsoInLectures = uniqueStrings(normalized.alsoInLectures);
    }
    return output;
  }

  function getSerializedQuestions() {
    const normalized = state.working.map((question) => normalizeForSave(question));
    return `${JSON.stringify(normalized, null, 2)}\n`;
  }

  function downloadJson() {
    const validation = validateAll();
    if (validation.errorCount) {
      setStatus(`Export blocked: fix ${validation.errorCount} validation errors first.`, "error");
      renderValidation();
      return;
    }
    const blob = new Blob([getSerializedQuestions()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "questions.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported questions.json at ${new Date().toLocaleTimeString()}.`, "ok");
  }

  function toBase64Utf8(content) {
    const bytes = new TextEncoder().encode(content);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  async function saveToGitHub() {
    const validation = validateAll();
    renderValidation();
    if (validation.errorCount) {
      setStatus(`GitHub save blocked: fix ${validation.errorCount} validation errors first.`, "error");
      return;
    }

    const owner = els.githubOwner.value.trim();
    const repo = els.githubRepo.value.trim();
    const branch = els.githubBranch.value.trim() || "main";
    const token = els.githubToken.value.trim();
    if (!owner || !repo || !branch || !token) {
      setStatus("GitHub owner, repo, branch, and session token are required.", "error");
      return;
    }

    saveGithubSettings();
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/data/questions.json`;
    const readUrl = `${url}?ref=${encodeURIComponent(branch)}`;
    const headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      setStatus("Fetching current GitHub file state...", "warn");
      const currentResponse = await fetch(readUrl, { headers });
      if (!currentResponse.ok) {
        throw new Error(`GitHub read failed (${currentResponse.status}): ${await currentResponse.text()}`);
      }
      const currentPayload = await currentResponse.json();
      setStatus("Saving updated questions.json to GitHub...", "warn");
      const saveResponse = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: COMMIT_MESSAGE,
          branch,
          sha: currentPayload.sha,
          content: toBase64Utf8(getSerializedQuestions()),
        }),
      });
      if (!saveResponse.ok) {
        throw new Error(`GitHub save failed (${saveResponse.status}): ${await saveResponse.text()}`);
      }
      setDirty(false);
      setStatus(`Saved data/questions.json to ${owner}/${repo}@${branch} at ${new Date().toLocaleTimeString()}.`, "ok");
    } catch (error) {
      setStatus(error.message || "GitHub save failed.", "error");
    }
  }

  function handleStaticFieldChange(event) {
    const target = event.target;
    if (!target || !target.id) return;
    if (target.id === "field-card-type") {
      const selected = getSelectedQuestion();
      if (!selected) return;
      state.working = state.working.map((question) => (
        question.id === selected.id ? convertQuestionType(question, target.value) : question
      ));
      setDirty(true);
      renderAll();
      return;
    }
    const needsFullRender = ["field-lecture", "field-exam", "field-active"].includes(target.id);
    updateQuestion((draft) => {
      if (target.id === "field-num") draft.num = target.value;
      if (target.id === "field-lecture") draft.lecture = target.value;
      if (target.id === "field-exam") draft.exam = target.value;
      if (target.id === "field-source") draft.source = target.value;
      if (target.id === "field-doctor") draft.doctor = target.value;
      if (target.id === "field-active") draft.active = target.checked;
      if (target.id === "field-q") draft.q = target.value;
      if (target.id === "field-note") draft.note = target.value;
    }, { fullRender: needsFullRender });
  }

  function handleRepeatChange() {
    updateQuestion((draft) => {
      draft.alsoInLectures = [...els.repeatLectures.querySelectorAll('input[type="checkbox"]:checked')]
        .map((input) => input.value)
        .filter((lecture) => lecture && lecture !== draft.lecture);
    });
  }

  function handleTypeEditorInput(event) {
    const target = event.target;
    if (!target || !target.dataset) return;
    const role = target.dataset.role;
    updateQuestion((draft) => {
      if (role === "choice") {
        draft.choices[Number(target.dataset.index)] = target.value;
      } else if (role === "answer") {
        draft.ans = target.value;
      } else if (role === "type-answer") {
        draft.a = target.value;
      } else if (role === "osce-question") {
        draft.subParts[Number(target.dataset.partIndex)].q = target.value;
      } else if (role === "osce-choice") {
        draft.subParts[Number(target.dataset.partIndex)].choices[Number(target.dataset.choiceIndex)] = target.value;
      } else if (role === "osce-answer") {
        draft.subParts[Number(target.dataset.partIndex)].ans = target.value;
      }
    }, { fullRender: false });
  }

  function handleTypeEditorClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    updateQuestion((draft) => {
      const action = trigger.dataset.action;
      if (action === "add-choice") {
        draft.choices.push("");
      } else if (action === "remove-choice") {
        if (draft.choices.length <= 2) return;
        draft.choices.splice(Number(trigger.dataset.index), 1);
        const answerIndex = String(draft.ans || "A").charCodeAt(0) - 65;
        if (answerIndex > draft.choices.length - 1) {
          draft.ans = String.fromCharCode(64 + draft.choices.length);
        }
      } else if (action === "add-osce-part") {
        draft.subParts.push(makeOscePart());
      } else if (action === "remove-osce-part") {
        if (draft.subParts.length <= 1) return;
        draft.subParts.splice(Number(trigger.dataset.partIndex), 1);
      } else if (action === "add-osce-choice") {
        draft.subParts[Number(trigger.dataset.partIndex)].choices.push("");
      } else if (action === "remove-osce-choice") {
        const part = draft.subParts[Number(trigger.dataset.partIndex)];
        if (part.choices.length <= 2) return;
        part.choices.splice(Number(trigger.dataset.choiceIndex), 1);
        const answerIndex = String(part.ans || "A").charCodeAt(0) - 65;
        if (answerIndex > part.choices.length - 1) {
          part.ans = String.fromCharCode(64 + part.choices.length);
        }
      }
    });
  }

  function handleDelete() {
    const selected = getSelectedQuestion();
    if (!selected) return;
    const mode = els.deleteMode.value || "soft";
    if (mode === "hard") {
      if (!window.confirm(`Permanently delete ${selected.id}? This cannot be undone after export/save.`)) return;
      state.working = state.working.filter((question) => question.id !== selected.id);
      state.selectedId = state.working[0]?.id || null;
      setDirty(true);
      renderAll();
      setStatus(`Permanently removed ${selected.id} from the working copy.`, "warn");
      return;
    }
    updateQuestion((draft) => {
      draft.active = false;
    });
    setStatus(`Soft-deleted ${selected.id}. It will be hidden after export/save.`, "warn");
  }

  function handleRestore() {
    const selected = getSelectedQuestion();
    if (!selected) return;
    updateQuestion((draft) => {
      draft.active = true;
    });
    setStatus(`Restored ${selected.id}.`, "ok");
  }

  function bindEvents() {
    const handleSearchUpdate = () => {
      renderQuestionList();
      renderEditor();
    };
    els.searchInput.addEventListener("input", handleSearchUpdate);
    els.searchLecture.addEventListener("change", handleSearchUpdate);
    els.searchType.addEventListener("change", handleSearchUpdate);
    els.searchStatus.addEventListener("change", handleSearchUpdate);
    els.questionList.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-question-id]");
      if (!trigger) return;
      state.selectedId = trigger.dataset.questionId;
      renderQuestionList();
      renderEditor();
    });

    [els.fieldNum, els.fieldLecture, els.fieldExam, els.fieldCardType, els.fieldSource, els.fieldDoctor, els.fieldActive, els.fieldQ, els.fieldNote]
      .forEach((field) => {
        field.addEventListener(field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input", handleStaticFieldChange);
      });

    els.repeatLectures.addEventListener("change", handleRepeatChange);
    els.typeEditor.addEventListener("input", handleTypeEditorInput);
    els.typeEditor.addEventListener("change", handleTypeEditorInput);
    els.typeEditor.addEventListener("click", handleTypeEditorClick);

    els.restoreBtn.addEventListener("click", handleRestore);
    els.deleteBtn.addEventListener("click", handleDelete);
    els.exportBtn.addEventListener("click", downloadJson);
    els.saveGithubBtn.addEventListener("click", saveToGitHub);
    els.validateAllBtn.addEventListener("click", () => {
      const validation = renderValidation();
      setStatus(
        `Validation finished: ${validation.errorCount} errors, ${validation.warningCount} warnings.`,
        validation.errorCount ? "error" : validation.warningCount ? "warn" : "ok"
      );
    });
    [els.githubOwner, els.githubRepo, els.githubBranch].forEach((field) => {
      field.addEventListener("change", saveGithubSettings);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function cacheElements() {
    els.summaryGrid = byId("summary-grid");
    els.githubOwner = byId("github-owner");
    els.githubRepo = byId("github-repo");
    els.githubBranch = byId("github-branch");
    els.githubToken = byId("github-token");
    els.searchInput = byId("search-input");
    els.searchLecture = byId("search-lecture");
    els.searchType = byId("search-type");
    els.searchStatus = byId("search-status");
    els.listMeta = byId("list-meta");
    els.questionList = byId("question-list");
    els.emptyState = byId("empty-state");
    els.editorWrap = byId("editor-wrap");
    els.editorQuestionId = byId("editor-question-id");
    els.editorQuestionSub = byId("editor-question-sub");
    els.dirtyBadge = byId("dirty-badge");
    els.fieldId = byId("field-id");
    els.fieldNum = byId("field-num");
    els.fieldLecture = byId("field-lecture");
    els.fieldExam = byId("field-exam");
    els.fieldCardType = byId("field-card-type");
    els.fieldSource = byId("field-source");
    els.fieldDoctor = byId("field-doctor");
    els.fieldActive = byId("field-active");
    els.fieldQ = byId("field-q");
    els.fieldNote = byId("field-note");
    els.repeatLectures = byId("repeat-lectures");
    els.typeEditor = byId("type-editor");
    els.deleteMode = byId("delete-mode");
    els.restoreBtn = byId("restore-btn");
    els.deleteBtn = byId("delete-btn");
    els.previewCard = byId("preview-card");
    els.validationSummary = byId("validation-summary");
    els.validationList = byId("validation-list");
    els.saveStatus = byId("save-status");
    els.validateAllBtn = byId("validate-all-btn");
    els.exportBtn = byId("export-btn");
    els.saveGithubBtn = byId("save-github-btn");
  }

  async function init() {
    cacheElements();
    loadGithubSettings();
    bindEvents();
    try {
      setStatus("Loading question bank...", "warn");
      await loadQuestions();
      renderAll();
      setStatus("Question bank loaded. You can now edit, export, or save to GitHub.", "ok");
    } catch (error) {
      setStatus(error.message || "Failed to load question bank.", "error");
      els.emptyState.textContent = error.message || "Failed to load question bank.";
      els.emptyState.classList.remove("hidden");
      els.editorWrap.classList.add("hidden");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
