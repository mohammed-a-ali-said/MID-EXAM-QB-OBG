(function () {
  const DATA_URL = "/api/questions";
  const TYPE_OPTIONS = ["MCQ", "FLASHCARD", "SAQ", "OSCE"];
  const TEMPLATE_CHOICE_HEADERS = ["choiceA", "choiceB", "choiceC", "choiceD", "choiceE", "choiceF"];

  function readBootUser() {
    const node = document.getElementById("admin-user-data");
    if (!node) return null;
    try {
      const raw = decodeURIComponent(node.dataset.user || "");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("Failed to parse admin boot user payload.", error);
      return null;
    }
  }

  const state = {
    original: [],
    working: [],
    metadata: { lectures: [], exams: [] },
    selectedId: null,
    dirty: false,
    fileSha: "",
    metadataSha: "",
    repo: null,
    user: readBootUser(),
    saving: false,
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

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();
  }

  function normalizeHeaderKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function parseCsvLine(line) {
    const out = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        out.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    out.push(current);
    return out;
  }

  function normalizeMetadata(metadata) {
    const input = metadata && typeof metadata === "object" ? metadata : {};
    return {
      lectures: Array.isArray(input.lectures) ? input.lectures.map((lecture, index) => ({
        id: String(lecture?.id || slugify(lecture?.name) || `lecture-${index + 1}`),
        name: String(lecture?.name || "").trim(),
        active: lecture?.active !== false,
        order: Number(lecture?.order || index + 1),
      })).filter((lecture) => lecture.name) : [],
      exams: Array.isArray(input.exams) ? input.exams.map((exam, index) => ({
        id: String(exam?.id || slugify(exam?.label) || `exam-${index + 1}`),
        label: String(exam?.label || "").trim(),
        active: exam?.active !== false,
        order: Number(exam?.order || index + 1),
      })).filter((exam) => exam.label) : [],
    };
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
      question.a = String(question.a || "").trim() || "Answer not included";
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
      (state.metadata.lectures || []).map((lecture) => lecture.name)
        .concat(state.working.flatMap((question) => [question.lecture].concat(question.alsoInLectures || [])))
    ).sort((a, b) => a.localeCompare(b));
  }

  function getExamOptions() {
    return uniqueStrings(
      (state.metadata.exams || []).map((exam) => exam.label)
        .concat(state.working.map((question) => question.exam))
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

  function setStatusHtml(html, tone) {
    els.saveStatus.innerHTML = html;
    els.saveStatus.className = `save-status${tone ? ` ${tone}` : ""}`;
  }

  function setSaving(nextSaving) {
    state.saving = !!nextSaving;
    const label = state.saving ? "Saving..." : "Save to GitHub";
    [els.saveGithubBtn, els.saveQuestionGithubBtn].forEach((button) => {
      if (!button) return;
      button.disabled = state.saving;
      button.textContent = label;
    });
  }

  function redirectToLogin() {
    window.location.href = "/";
  }

  async function loadQuestions() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (response.status === 401) {
      redirectToLogin();
      throw new Error("Session expired. Please sign in again.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.error || `Failed to load questions (${response.status})`;
      throw new Error(detail);
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.questions)) throw new Error("Question bank payload is invalid.");
    state.fileSha = String(payload.sha || "");
    state.metadataSha = String(payload.metadataSha || "");
    state.repo = payload.repo || null;
    state.original = payload.questions.map((question) => normalizeQuestion(question));
    state.working = deepClone(state.original);
    state.metadata = normalizeMetadata(payload.metadata);
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
    const hiddenLectures = (state.metadata.lectures || []).filter((lecture) => lecture.active === false).length;
    const validation = validateAll();
    els.summaryGrid.innerHTML = [
      summaryCard("Questions", total, `${active} active, ${inactive} inactive`),
      summaryCard("Repeated", repeated, "Cross-lecture links"),
      summaryCard("Lectures", getLectureOptions().length, `${hiddenLectures} hidden`),
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

  function renderExamOptions(selectedValue) {
    return getExamOptions()
      .map((exam) => `<option value="${escapeHtml(exam)}" ${exam === selectedValue ? "selected" : ""}>${escapeHtml(exam)}</option>`)
      .join("");
  }

  function renderBucketLists() {
    if (els.lectureBuckets) {
      els.lectureBuckets.innerHTML = (state.metadata.lectures || []).map((lecture) => `
        <div class="bucket-item ${lecture.active === false ? "inactive" : ""}">
          <div>
            <div class="bucket-name">${escapeHtml(lecture.name)}</div>
            <div class="bucket-meta">${escapeHtml(lecture.id)} · ${lecture.active === false ? "Hidden from students" : "Visible to students"}</div>
          </div>
          <div class="bucket-actions">
            <button class="mini-btn" type="button" data-bucket-action="toggle-lecture" data-bucket-id="${escapeHtml(lecture.id)}">${lecture.active === false ? "Show" : "Hide"}</button>
            <button class="mini-btn" type="button" data-bucket-action="rename-lecture" data-bucket-id="${escapeHtml(lecture.id)}">Rename</button>
          </div>
        </div>`).join("") || '<div class="subtle">No lectures configured yet.</div>';
    }
    if (els.examBuckets) {
      els.examBuckets.innerHTML = (state.metadata.exams || []).map((exam) => `
        <div class="bucket-item ${exam.active === false ? "inactive" : ""}">
          <div>
            <div class="bucket-name">${escapeHtml(exam.label)}</div>
            <div class="bucket-meta">${escapeHtml(exam.id)} · ${exam.active === false ? "Inactive" : "Active"}</div>
          </div>
          <div class="bucket-actions">
            <button class="mini-btn" type="button" data-bucket-action="toggle-exam" data-bucket-id="${escapeHtml(exam.id)}">${exam.active === false ? "Enable" : "Disable"}</button>
            <button class="mini-btn" type="button" data-bucket-action="rename-exam" data-bucket-id="${escapeHtml(exam.id)}">Rename</button>
          </div>
        </div>`).join("") || '<div class="subtle">No exam sections configured yet.</div>';
    }
    if (els.templateLectureOptions) {
      els.templateLectureOptions.innerHTML = getLectureOptions()
        .map((lecture) => `<option value="${escapeHtml(lecture)}"></option>`)
        .join("");
    }
    if (els.templateExamOptions) {
      els.templateExamOptions.innerHTML = getExamOptions()
        .map((exam) => `<option value="${escapeHtml(exam)}"></option>`)
        .join("");
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

  function validateQuestion(question, lectureOptions, examOptions) {
    const errors = [];
    const warnings = [];

    if (!String(question.id || "").trim()) errors.push("Question ID is missing.");
    if (!TYPE_OPTIONS.includes(question.cardType)) errors.push("Question type is invalid.");
    if (!String(question.lecture || "").trim()) errors.push("Lecture is required.");
    if (!String(question.q || "").trim()) errors.push("Question stem/body is required.");
    if (question.lecture && lectureOptions.length && !lectureOptions.includes(question.lecture)) {
      warnings.push("Lecture is not part of the current lecture list.");
    }
    if (question.exam && examOptions.length && !examOptions.includes(question.exam)) {
      warnings.push("Exam section is not part of the current exam list.");
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
    const examOptions = getExamOptions();
    const idCounts = new Map();
    const metadataErrors = [];
    const lectureIds = new Set();
    const examIds = new Set();
    (state.metadata.lectures || []).forEach((lecture) => {
      if (!lecture.id || !lecture.name) metadataErrors.push("Lecture bucket is missing id or name.");
      if (lecture.id && lectureIds.has(lecture.id)) metadataErrors.push(`Duplicate lecture id: ${lecture.id}`);
      lectureIds.add(lecture.id);
    });
    (state.metadata.exams || []).forEach((exam) => {
      if (!exam.id || !exam.label) metadataErrors.push("Exam section is missing id or label.");
      if (exam.id && examIds.has(exam.id)) metadataErrors.push(`Duplicate exam id: ${exam.id}`);
      examIds.add(exam.id);
    });
    state.working.forEach((question) => {
      const key = String(question.id || "").trim();
      idCounts.set(key, (idCounts.get(key) || 0) + 1);
    });
    const results = state.working.map((question) => {
      const result = validateQuestion(question, lectureOptions, examOptions);
      if ((idCounts.get(String(question.id || "").trim()) || 0) > 1) {
        result.errors.unshift("Duplicate question ID.");
      }
      return { id: question.id, title: questionTitle(question), ...result };
    });
    return {
      errorCount: results.reduce((sum, item) => sum + item.errors.length, 0) + metadataErrors.length,
      warningCount: results.reduce((sum, item) => sum + item.warnings.length, 0),
      results,
      metadataErrors,
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
    (validation.metadataErrors || []).forEach((message) => {
      items.push(`<div class="validation-item error"><strong>Metadata</strong>: ${escapeHtml(message)}</div>`);
    });
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
    els.fieldExam.innerHTML = renderExamOptions(question.exam || "mid");
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
    renderBucketLists();
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

  function nextQuestionId() {
    const ids = state.working
      .map((question) => Number(String(question.id || "").replace(/^c/i, "")))
      .filter(Number.isFinite);
    return `c${(ids.length ? Math.max(...ids) : 0) + 1}`;
  }

  function ensureLecture(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "";
    const existing = (state.metadata.lectures || []).find((lecture) => lecture.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.name;
    state.metadata.lectures.push({
      id: slugify(trimmed) || `lecture-${state.metadata.lectures.length + 1}`,
      name: trimmed,
      active: true,
      order: state.metadata.lectures.length + 1,
    });
    return trimmed;
  }

  function ensureExam(label) {
    const trimmed = String(label || "").trim();
    if (!trimmed) return "";
    const existing = (state.metadata.exams || []).find((exam) => exam.label.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.label;
    state.metadata.exams.push({
      id: slugify(trimmed) || `exam-${state.metadata.exams.length + 1}`,
      label: trimmed,
      active: true,
      order: state.metadata.exams.length + 1,
    });
    return trimmed;
  }

  function createQuestion(type) {
    const lecture = ensureLecture((els.templateLecture?.value || "").trim() || getLectureOptions()[0] || "New Lecture");
    const exam = ensureExam((els.templateExam?.value || "").trim() || getExamOptions()[0] || "mid");
    const question = normalizeQuestion({
      id: nextQuestionId(),
      num: "",
      cardType: type || "MCQ",
      lecture,
      exam,
      source: els.templateSource?.value || "",
      doctor: els.templateDoctor?.value || "",
      q: "Write the question stem here",
      note: els.templateNote?.value || "",
      active: true,
      choices: ["", ""],
      ans: "A",
      a: "Answer not included",
      subParts: [makeOscePart()],
    });
    state.working.unshift(question);
    state.selectedId = question.id;
    setDirty(true);
    renderAll();
    setStatus(`Created ${question.id}.`, "ok");
  }

  function duplicateCurrentQuestion() {
    const selected = getSelectedQuestion();
    if (!selected) return;
    const duplicate = normalizeQuestion({
      ...deepClone(selected),
      id: nextQuestionId(),
      num: "",
    });
    state.working.unshift(duplicate);
    state.selectedId = duplicate.id;
    setDirty(true);
    renderAll();
    setStatus(`Duplicated ${selected.id} as ${duplicate.id}.`, "ok");
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
      output.a = String(normalized.a || "").trim() || "Answer not included";
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

  function getSerializedMetadata() {
    return `${JSON.stringify({
      lectures: (state.metadata.lectures || []).map((lecture, index) => ({
        id: String(lecture.id || slugify(lecture.name) || `lecture-${index + 1}`),
        name: String(lecture.name || "").trim(),
        active: lecture.active !== false,
        order: Number(lecture.order || index + 1),
      })),
      exams: (state.metadata.exams || []).map((exam, index) => ({
        id: String(exam.id || slugify(exam.label) || `exam-${index + 1}`),
        label: String(exam.label || "").trim(),
        active: exam.active !== false,
        order: Number(exam.order || index + 1),
      })),
    }, null, 2)}\n`;
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

  function saveQuestionDraft() {
    const question = getSelectedQuestion();
    if (!question) return;
    const lectureOptions = getLectureOptions();
    const validation = validateQuestion(question, lectureOptions);
    renderPreview(question);
    renderValidation();
    if (validation.errors.length) {
      setStatus(`Question ${question.id} still has ${validation.errors.length} validation error(s).`, "error");
      return;
    }
    setStatus(
      `Saved ${question.id} in the working draft. Use Save to GitHub to publish it to the repo.`,
      validation.warnings.length ? "warn" : "ok"
    );
  }

  async function saveToGitHub() {
    const validation = validateAll();
    renderValidation();
    if (validation.errorCount) {
      setStatus(`GitHub save blocked: fix ${validation.errorCount} validation errors first.`, "error");
      return;
    }

    try {
      setSaving(true);
      setStatus("Saving updated questions.json to GitHub...", "warn");
      const saveResponse = await fetch(DATA_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questions: state.working.map((question) => normalizeForSave(question)),
          metadata: JSON.parse(getSerializedMetadata()),
          sha: state.fileSha,
          metadataSha: state.metadataSha,
        }),
      });
      if (!saveResponse.ok) {
        const payload = await saveResponse.json().catch(() => null);
        if (saveResponse.status === 401) {
          redirectToLogin();
          throw new Error("Session expired. Please sign in again.");
        }
        const detail = payload?.errors?.join(" | ") || payload?.error || (await saveResponse.text());
        throw new Error(`GitHub save failed (${saveResponse.status}): ${detail}`);
      }
      const payload = await saveResponse.json();
      state.fileSha = String(payload.sha || state.fileSha || "");
      state.metadataSha = String(payload.metadataSha || state.metadataSha || "");
      if (payload.metadata) state.metadata = normalizeMetadata(payload.metadata);
      setDirty(false);
      const location = state.repo ? `${state.repo.owner}/${state.repo.repo}@${state.repo.branch}` : "GitHub";
      if (payload.url) {
        setStatusHtml(
          `Saved <strong>questions and metadata</strong> to ${escapeHtml(location)} at ${escapeHtml(new Date().toLocaleTimeString())}. <a href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer">Open commit</a>`,
          "ok"
        );
      } else {
        setStatus(`Saved data/questions.json to ${location} at ${new Date().toLocaleTimeString()}.`, "ok");
      }
    } catch (error) {
      setStatus(error.message || "GitHub save failed.", "error");
    } finally {
      setSaving(false);
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
      if (target.id === "field-lecture") draft.lecture = ensureLecture(target.value);
      if (target.id === "field-exam") draft.exam = ensureExam(target.value);
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

  function allocateNextQuestionId(usedIds) {
    const numericIds = [...usedIds]
      .map((id) => Number(String(id || "").replace(/^c/i, "")))
      .filter(Number.isFinite);
    const nextId = `c${(numericIds.length ? Math.max(...numericIds) : 0) + 1}`;
    usedIds.add(nextId);
    return nextId;
  }

  function pickTemplateValue(row, keys) {
    for (const key of keys) {
      const value = row[key];
      if (value != null && String(value).trim() !== "") return String(value);
    }
    return "";
  }

  function extractTemplateChoices(row) {
    const choiceKeys = Object.keys(row).filter((key) => /^choice[a-z0-9]+$/.test(key) || /^option[a-z0-9]+$/.test(key));
    const values = choiceKeys.map((key) => String(row[key] || ""));
    while (values.length > 2 && !String(values[values.length - 1] || "").trim()) {
      values.pop();
    }
    return values.length ? values : ["", ""];
  }

  function buildTemplateQuestionFromRow(row, rowNumber, usedIds) {
    const requestedId = String(pickTemplateValue(row, ["id"])).trim();
    const generatedId = requestedId || allocateNextQuestionId(usedIds);
    if (requestedId) usedIds.add(requestedId);

    const requestedType = String(pickTemplateValue(row, ["cardtype", "type"])).trim().toUpperCase();
    const inferredType = TYPE_OPTIONS.includes(requestedType)
      ? requestedType
      : String(pickTemplateValue(row, ["oscejson", "subpartsjson"])).trim()
        ? "OSCE"
        : String(pickTemplateValue(row, ["a", "answer"])).trim()
          ? "SAQ"
          : "MCQ";

    let osceParts = [makeOscePart()];
    const osceJson = String(pickTemplateValue(row, ["oscejson", "subpartsjson"])).trim();
    if (osceJson) {
      try {
        osceParts = JSON.parse(osceJson);
      } catch (error) {
        throw new Error(`Row ${rowNumber}: osce_json is not valid JSON.`);
      }
    }

    const question = normalizeQuestion({
      id: generatedId,
      num: String(pickTemplateValue(row, ["num", "number"])).trim(),
      lecture: ensureLecture(String(pickTemplateValue(row, ["lecture"])).trim()),
      exam: ensureExam(String(pickTemplateValue(row, ["exam", "examsection"])).trim() || "mid"),
      cardType: inferredType,
      source: String(pickTemplateValue(row, ["source"])).trim(),
      doctor: String(pickTemplateValue(row, ["doctor"])).trim(),
      note: String(pickTemplateValue(row, ["note", "studentnote"])).trim(),
      active: !/^(false|0|no)$/i.test(String(pickTemplateValue(row, ["active"])).trim()),
      q: String(pickTemplateValue(row, ["q", "question", "stem"])).trim(),
      a: String(pickTemplateValue(row, ["a", "answer"])).trim() || "Answer not included",
      ans: String(pickTemplateValue(row, ["ans", "correctanswer"])).trim().toUpperCase() || "A",
      choices: extractTemplateChoices(row),
      subParts: osceParts,
    });

    return question;
  }

  function exportTemplateCsv() {
    const templateKind = els.templateKind?.value || "MIXED";
    const starterRows = Math.max(0, Number(els.templateRows?.value || 0));
    const defaultLecture = String(els.templateLecture?.value || "").trim();
    const defaultExam = String(els.templateExam?.value || "").trim();
    const source = String(els.templateSource?.value || "").trim();
    const doctor = String(els.templateDoctor?.value || "").trim();
    const note = String(els.templateNote?.value || "").trim();
    const prefix = (els.templatePrefix?.value || "Write the question here").trim();
    const numPrefix = String(els.templateNumPrefix?.value || "Q").trim() || "Q";
    const generateIds = !!els.templateGenerateIds?.checked;
    const fillDefaults = !!els.templateFillDefaults?.checked;
    const starterType = templateKind === "MIXED" ? "" : templateKind;
    const headers = ["id", "num", "lecture", "exam", "cardType", "source", "doctor", "note", "active", "q"]
      .concat(TEMPLATE_CHOICE_HEADERS, ["ans", "a", "osce_json"]);
    const usedIds = new Set(state.working.map((question) => question.id));
    const rows = [headers.join(",")];
    for (let i = 0; i < starterRows; i += 1) {
      const rowType = starterType || (i % TYPE_OPTIONS.length === 0 ? "MCQ" : i % TYPE_OPTIONS.length === 1 ? "FLASHCARD" : i % TYPE_OPTIONS.length === 2 ? "SAQ" : "OSCE");
      const numberValue = `${numPrefix}${i + 1}`;
      const prompt = starterRows === 1 ? prefix : `${prefix} ${i + 1}`;
      const row = {
        id: generateIds ? allocateNextQuestionId(usedIds) : "",
        num: fillDefaults ? numberValue : "",
        lecture: fillDefaults ? defaultLecture : "",
        exam: fillDefaults ? (defaultExam || "mid") : "",
        cardType: rowType,
        source: fillDefaults ? source : "",
        doctor: fillDefaults ? doctor : "",
        note: fillDefaults ? note : "",
        active: "true",
        q: prompt,
        choiceA: rowType === "MCQ" ? "Option A" : "",
        choiceB: rowType === "MCQ" ? "Option B" : "",
        choiceC: "",
        choiceD: "",
        choiceE: "",
        choiceF: "",
        ans: rowType === "MCQ" || rowType === "OSCE" ? "A" : "",
        a: rowType === "FLASHCARD" || rowType === "SAQ" ? "Answer not included" : "",
        osce_json: rowType === "OSCE" ? JSON.stringify([{ q: "Part 1", choices: ["Option A", "Option B"], ans: "A" }]) : "",
      };
      rows.push(headers.map((header) => csvCell(row[header] || "")).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(defaultLecture || "obg-question-bank")}-${templateKind.toLowerCase()}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(
      starterRows
        ? `Exported ${starterRows} starter row(s). You can duplicate rows, mix question types, and add brand-new lecture or exam names before import.`
        : "Exported a header-only CSV template. Duplicate rows freely in Excel or Google Sheets before importing.",
      "ok"
    );
  }

  async function importTemplateCsv(file) {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setStatus("Template import failed: CSV is empty.", "error");
      return;
    }
    const headers = parseCsvLine(lines[0]).map((header) => String(header || "").trim());
    const normalizedHeaders = headers.map((header) => normalizeHeaderKey(header));
    const indexById = new Map(state.working.map((question, index) => [question.id, index]));
    const usedIds = new Set(state.working.map((question) => question.id));
    const staged = [];
    const importErrors = [];
    let created = 0;
    let updated = 0;
    for (const [index, line] of lines.slice(1).entries()) {
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(normalizedHeaders.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      const isBlankRow = Object.values(row).every((value) => String(value || "").trim() === "");
      if (isBlankRow) continue;
      try {
        const question = buildTemplateQuestionFromRow(row, index + 2, usedIds);
        const perQuestionValidation = validateQuestion(question, getLectureOptions().concat(question.lecture || []), getExamOptions().concat(question.exam || []));
        if (perQuestionValidation.errors.length) {
          importErrors.push(...perQuestionValidation.errors.map((message) => `Row ${index + 2} (${question.id}): ${message}`));
          continue;
        }
        staged.push(question);
      } catch (error) {
        importErrors.push(error.message || `Row ${index + 2}: import failed.`);
      }
    }
    const stagedIds = new Map();
    staged.forEach((question) => {
      stagedIds.set(question.id, (stagedIds.get(question.id) || 0) + 1);
    });
    staged.forEach((question) => {
      if ((stagedIds.get(question.id) || 0) > 1) {
        importErrors.push(`Duplicate imported ID detected: ${question.id}`);
      }
    });
    if (importErrors.length) {
      setStatus(`Template import blocked. ${importErrors[0]}${importErrors.length > 1 ? ` (+${importErrors.length - 1} more)` : ""}`, "error");
      return;
    }
    staged.forEach((question) => {
      if (indexById.has(question.id)) {
        state.working[indexById.get(question.id)] = question;
        updated += 1;
      } else {
        state.working.push(question);
        indexById.set(question.id, state.working.length - 1);
        created += 1;
      }
    });
    if (!created && !updated) {
      setStatus("Template import finished, but no non-empty rows were found.", "warn");
      return;
    }
    state.selectedId = state.working[0]?.id || null;
    setDirty(true);
    renderAll();
    setStatus(`Imported completed CSV: ${created} created, ${updated} updated. New lecture and exam values were added automatically where needed.`, "ok");
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
    els.saveQuestionBtn.addEventListener("click", saveQuestionDraft);
    els.saveQuestionGithubBtn.addEventListener("click", saveToGitHub);
    if (els.newQuestionBtn) els.newQuestionBtn.addEventListener("click", () => createQuestion(els.newQuestionType?.value || "MCQ"));
    if (els.duplicateQuestionBtn) els.duplicateQuestionBtn.addEventListener("click", duplicateCurrentQuestion);
    if (els.addLectureBtn) els.addLectureBtn.addEventListener("click", () => {
      const value = els.newLectureInput.value.trim();
      if (!value) return;
      ensureLecture(value);
      els.newLectureInput.value = "";
      setDirty(true);
      renderAll();
      setStatus(`Added lecture bucket "${value}".`, "ok");
    });
    if (els.addExamBtn) els.addExamBtn.addEventListener("click", () => {
      const value = els.newExamInput.value.trim();
      if (!value) return;
      ensureExam(value);
      els.newExamInput.value = "";
      setDirty(true);
      renderAll();
      setStatus(`Added exam section "${value}".`, "ok");
    });
    if (els.generateTemplateBtn) els.generateTemplateBtn.addEventListener("click", exportTemplateCsv);
    if (els.importTemplateBtn) els.importTemplateBtn.addEventListener("click", () => els.templateFileInput?.click());
    if (els.templateFileInput) els.templateFileInput.addEventListener("change", (event) => importTemplateCsv(event.target.files?.[0]));
    if (els.lectureBuckets) els.lectureBuckets.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-bucket-action]");
      if (!trigger) return;
      const lecture = state.metadata.lectures.find((item) => item.id === trigger.dataset.bucketId);
      if (!lecture) return;
      if (trigger.dataset.bucketAction === "toggle-lecture") lecture.active = lecture.active === false;
      if (trigger.dataset.bucketAction === "rename-lecture") {
        const nextName = prompt("Rename lecture", lecture.name);
        if (nextName && nextName.trim()) {
          const previousName = lecture.name;
          lecture.name = nextName.trim();
          state.working = state.working.map((question) => normalizeQuestion({
            ...question,
            lecture: question.lecture === previousName ? lecture.name : question.lecture,
            alsoInLectures: (question.alsoInLectures || []).map((value) => value === previousName ? lecture.name : value),
          }));
        }
      }
      setDirty(true);
      renderAll();
    });
    if (els.examBuckets) els.examBuckets.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-bucket-action]");
      if (!trigger) return;
      const exam = state.metadata.exams.find((item) => item.id === trigger.dataset.bucketId);
      if (!exam) return;
      if (trigger.dataset.bucketAction === "toggle-exam") exam.active = exam.active === false;
      if (trigger.dataset.bucketAction === "rename-exam") {
        const nextLabel = prompt("Rename exam section", exam.label);
        if (nextLabel && nextLabel.trim()) {
          const previousLabel = exam.label;
          exam.label = nextLabel.trim();
          state.working = state.working.map((question) => normalizeQuestion({
            ...question,
            exam: question.exam === previousLabel ? exam.label : question.exam,
          }));
        }
      }
      setDirty(true);
      renderAll();
    });
    els.validateAllBtn.addEventListener("click", () => {
      const validation = renderValidation();
      setStatus(
        `Validation finished: ${validation.errorCount} errors, ${validation.warningCount} warnings.`,
        validation.errorCount ? "error" : validation.warningCount ? "warn" : "ok"
      );
    });

    document.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (event.shiftKey) {
        saveToGitHub();
        return;
      }
      saveQuestionDraft();
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function cacheElements() {
    els.summaryGrid = byId("summary-grid");
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
    els.saveQuestionBtn = byId("save-question-btn");
    els.saveQuestionGithubBtn = byId("save-question-github-btn");
    els.newQuestionType = byId("new-question-type");
    els.newQuestionBtn = byId("new-question-btn");
    els.duplicateQuestionBtn = byId("duplicate-question-btn");
    els.newLectureInput = byId("new-lecture-input");
    els.addLectureBtn = byId("add-lecture-btn");
    els.lectureBuckets = byId("lecture-buckets");
    els.newExamInput = byId("new-exam-input");
    els.addExamBtn = byId("add-exam-btn");
    els.examBuckets = byId("exam-buckets");
    els.templateKind = byId("template-kind");
    els.templateRows = byId("template-rows");
    els.templateLecture = byId("template-lecture");
    els.templateExam = byId("template-exam");
    els.templateLectureOptions = byId("template-lecture-options");
    els.templateExamOptions = byId("template-exam-options");
    els.templateSource = byId("template-source");
    els.templateDoctor = byId("template-doctor");
    els.templateNumPrefix = byId("template-num-prefix");
    els.templatePrefix = byId("template-prefix");
    els.templateNote = byId("template-note");
    els.templateGenerateIds = byId("template-generate-ids");
    els.templateFillDefaults = byId("template-fill-defaults");
    els.generateTemplateBtn = byId("generate-template-btn");
    els.importTemplateBtn = byId("import-template-btn");
    els.templateFileInput = byId("template-file-input");
  }

  let initialized = false;

  async function init() {
    if (initialized) return;
    initialized = true;
    cacheElements();
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
