(function () {
  const DATA_URL = "/api/questions";
  const MEDIA_UPLOAD_URL = "/api/media";
  const TYPE_OPTIONS = ["MCQ", "FLASHCARD", "SAQ", "OSCE"];
  const TEMPLATE_CHOICE_HEADERS = ["choiceA", "choiceB", "choiceC", "choiceD", "choiceE", "choiceF"];
  const LAST_PUBLISH_UNDO_KEY = "obg-admin-last-publish-undo";
  const THEME_KEY = "obg-admin-theme";
  const SELECTED_QUESTION_KEY = "obg-admin-selected-question";

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

  function readThemePreference() {
    try {
      return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      return "light";
    }
  }

  function loadSelectedQuestionId() {
    try {
      return String(window.localStorage.getItem(SELECTED_QUESTION_KEY) || "").trim() || null;
    } catch (error) {
      return null;
    }
  }

  function persistSelectedQuestionId() {
    try {
      if (state.selectedId) {
        window.localStorage.setItem(SELECTED_QUESTION_KEY, state.selectedId);
      } else {
        window.localStorage.removeItem(SELECTED_QUESTION_KEY);
      }
    } catch (error) {
      console.warn("Failed to persist selected question.", error);
    }
  }

  const state = {
    original: [],
    working: [],
    metadata: { lectures: [], exams: [] },
    siteConfig: { offlineEnabled: false, offlineVersion: "v1", offlineDisableMode: "keep_existing" },
    publicStats: null,
    selectedId: null,
    dirty: false,
    fileSha: "",
    metadataSha: "",
    siteConfigSha: "",
    repo: null,
    user: readBootUser(),
    saving: false,
    importPreview: null,
    importPreviewTab: "summary",
    savedSnapshots: {},
    confirmResolver: null,
    historyPast: [],
    historyFuture: [],
    isRestoringHistory: false,
    lastPublishedUndo: null,
    theme: "light",
    pendingImageFile: null,
    uploadingImage: false,
    availableImages: [],
  };

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

    function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    state.theme = nextTheme;
    document.body.classList.toggle("admin-theme-dark", nextTheme === "dark");
    if (els.themeToggleBtn) {
      els.themeToggleBtn.textContent = nextTheme === "dark" ? "Light mode" : "Dark mode";
      els.themeToggleBtn.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
    }
    try {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.warn("Failed to persist admin theme preference.", error);
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    setStatus(`Theme switched to ${state.theme} mode.`, "ok");
  }

  function persistLastPublishedUndo() {
    try {
      if (state.lastPublishedUndo) {
        window.sessionStorage.setItem(LAST_PUBLISH_UNDO_KEY, JSON.stringify(state.lastPublishedUndo));
      } else {
        window.sessionStorage.removeItem(LAST_PUBLISH_UNDO_KEY);
      }
    } catch (error) {
      console.warn("Failed to persist publish undo state.", error);
    }
  }

  function loadLastPublishedUndo() {
    try {
      const raw = window.sessionStorage.getItem(LAST_PUBLISH_UNDO_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.questions) || !parsed?.metadata || !parsed?.siteConfig) return null;
      return parsed;
    } catch (error) {
      console.warn("Failed to restore publish undo state.", error);
      return null;
    }
  }

  function createHistorySnapshot() {
    return {
      working: deepClone(state.working),
      metadata: deepClone(state.metadata),
      siteConfig: deepClone(state.siteConfig),
      selectedId: state.selectedId,
      savedSnapshots: deepClone(state.savedSnapshots || {}),
      dirty: !!state.dirty,
    };
  }

  function getHistorySignature(snapshot) {
    return JSON.stringify({
      working: snapshot?.working || [],
      metadata: snapshot?.metadata || { lectures: [], exams: [] },
      siteConfig: snapshot?.siteConfig || { offlineEnabled: false, offlineVersion: "v1", offlineDisableMode: "keep_existing" },
      selectedId: snapshot?.selectedId || "",
      dirty: !!snapshot?.dirty,
    });
  }

  function pushHistoryEntry(entry, options = {}) {
    if (!entry?.snapshot) return;
    state.historyPast.push(entry);
    if (state.historyPast.length > 80) {
      state.historyPast.shift();
    }
    if (options.clearFuture !== false) {
      state.historyFuture = [];
    }
  }

  function captureHistoryBeforeMutation(label, options = {}) {
    if (state.isRestoringHistory) return;
    const now = Date.now();
    const mergeWindowMs = Number.isFinite(options.mergeWindowMs) ? options.mergeWindowMs : 2500;
    const snapshot = createHistorySnapshot();
    const signature = getHistorySignature(snapshot);
    const last = state.historyPast[state.historyPast.length - 1];
    if (last && last.signature === signature) return;
    if (last && last.label === label && now - last.at < mergeWindowMs) return;
    pushHistoryEntry({
      label,
      at: now,
      signature,
      snapshot,
    });
  }

  function restoreHistorySnapshot(snapshot) {
    state.working = deepClone(snapshot?.working || []);
    state.metadata = normalizeMetadata(snapshot?.metadata || { lectures: [], exams: [] });
    state.siteConfig = normalizeSiteConfig(snapshot?.siteConfig || { offlineEnabled: false, offlineVersion: "v1", offlineDisableMode: "keep_existing" });
    state.selectedId = snapshot?.selectedId || state.working[0]?.id || null;
    state.savedSnapshots = deepClone(snapshot?.savedSnapshots || {});
    persistSelectedQuestionId();
    setDirty(!!snapshot?.dirty);
    renderAll();
  }

  function renderHistory() {
    const canUndo = state.historyPast.length > 0;
    const canRedo = state.historyFuture.length > 0;
    [els.undoBtn, els.redoBtn].forEach((button, index) => {
      if (!button) return;
      const enabled = index === 0 ? canUndo : canRedo;
      button.disabled = !enabled;
      button.classList.toggle("is-disabled-look", !enabled);
    });
    if (els.historyMeta) {
      const undoText = canUndo ? `Undo: ${state.historyPast[state.historyPast.length - 1].label}` : "Nothing to undo yet.";
      const redoText = canRedo ? `Redo: ${state.historyFuture[state.historyFuture.length - 1].label}` : "Nothing queued to redo.";
      els.historyMeta.textContent = `${undoText} ${redoText}`;
    }
    if (els.historyList) {
      const items = [];
      const future = state.historyFuture.slice(-3).reverse().map((entry) => ({ entry, mode: "redo" }));
      const past = state.historyPast.slice(-6).reverse().map((entry, index) => ({ entry, mode: index === 0 ? "undo" : "past" }));
      future.forEach(({ entry }) => {
        items.push(`<div class="history-item"><div class="history-item-title">Redo available: ${escapeHtml(entry.label)}</div><div class="history-item-copy">${escapeHtml(new Date(entry.at).toLocaleTimeString())}</div></div>`);
      });
      past.forEach(({ entry, mode }) => {
        items.push(`<div class="history-item ${mode === "undo" ? "current" : ""}"><div class="history-item-title">${mode === "undo" ? `Undo next: ${escapeHtml(entry.label)}` : escapeHtml(entry.label)}</div><div class="history-item-copy">${escapeHtml(new Date(entry.at).toLocaleTimeString())}</div></div>`);
      });
      els.historyList.innerHTML = items.length ? items.join("") : '<div class="history-item"><div class="history-item-title">No draft history yet</div><div class="history-item-copy">Edits, imports, deletes, and bucket changes will appear here.</div></div>';
    }
  }

  function updateUndoPublishButton() {
    if (!els.undoPublishBtn) return;
    const enabled = !!state.lastPublishedUndo && !state.saving;
    els.undoPublishBtn.disabled = !enabled;
    els.undoPublishBtn.classList.toggle("is-disabled-look", !enabled);
  }

  function undoHistory() {
    if (!state.historyPast.length) return;
    const current = {
      label: "Current draft",
      at: Date.now(),
      signature: getHistorySignature(createHistorySnapshot()),
      snapshot: createHistorySnapshot(),
    };
    const previous = state.historyPast.pop();
    state.historyFuture.push(current);
    state.isRestoringHistory = true;
    restoreHistorySnapshot(previous.snapshot);
    state.isRestoringHistory = false;
    renderHistory();
    setStatus(`Undid: ${previous.label}.`, "ok");
  }

  function redoHistory() {
    if (!state.historyFuture.length) return;
    const current = {
      label: "Current draft",
      at: Date.now(),
      signature: getHistorySignature(createHistorySnapshot()),
      snapshot: createHistorySnapshot(),
    };
    const next = state.historyFuture.pop();
    pushHistoryEntry(current, { clearFuture: false });
    state.isRestoringHistory = true;
    restoreHistorySnapshot(next.snapshot);
    state.isRestoringHistory = false;
    renderHistory();
    setStatus(`Redid: ${next.label}.`, "ok");
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

  function normalizeBucketText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
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

  function normalizeSiteConfig(siteConfig) {
    const input = siteConfig && typeof siteConfig === "object" ? siteConfig : {};
    const rawVersion = String(input.offlineVersion || "").trim();
    const rawDisableMode = String(input.offlineDisableMode || "").trim().toLowerCase();
    return {
      offlineEnabled: input.offlineEnabled === true,
      offlineVersion: rawVersion || "v1",
      offlineDisableMode: rawDisableMode === "purge_existing" ? "purge_existing" : "keep_existing",
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

  function isValidImageValue(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return true;
    return /^https:\/\/\S+/i.test(trimmed)
      || /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed)
      || /^(?:\.\/)?images\/[^\s]+$/i.test(trimmed)
      || /^\/images\/[^\s]+$/i.test(trimmed);
  }

  function hasRenderableImage(question) {
    return !!String(question?.image || "").trim() && isValidImageValue(question.image);
  }

  function resolvePreviewImageSource(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^https:\/\/\S+/i.test(trimmed) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed)) {
      return trimmed;
    }
    const relative = trimmed.replace(/^\.\//, "").replace(/^\/+/, "");
    if (!/^images\//i.test(relative)) return trimmed;
    const owner = String(state.repo?.owner || "").trim();
    const repo = String(state.repo?.repo || "").trim();
    if (!owner || !repo) return `/${relative}`;
    return `https://${owner}.github.io/${repo}/${relative}`;
  }

  function renderPreviewMedia(question) {
    if (hasRenderableImage(question)) {
      return `<div class="preview-media">
        <img src="${escapeHtml(resolvePreviewImageSource(question.image))}" alt="${escapeHtml(question.imageAlt || "Question image")}" loading="lazy">
        ${question.imageAlt ? `<div class="preview-media-caption">${escapeHtml(question.imageAlt)}</div>` : ""}
      </div>`;
    }
    if (question?.imagePlaceholder) {
      return `<div class="preview-media"><div class="preview-media-placeholder">${escapeHtml(question.imagePlaceholderText || "Image placeholder")}</div></div>`;
    }
    return "";
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
    question.image = String(question.image || "").trim();
    question.imageAlt = String(question.imageAlt || "").trim();
    question.imagePlaceholder = question.imagePlaceholder === true;
    question.imagePlaceholderText = String(question.imagePlaceholderText || "").trim();
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
    return getLectureOptionsForMetadata(state.metadata, state.working);
  }

  function getExamOptions() {
    return getExamOptionsForMetadata(state.metadata, state.working);
  }

  function getSelectedQuestion() {
    return state.working.find((question) => question.id === state.selectedId) || null;
  }

  function getLectureOptionsForMetadata(metadata, questions = []) {
    return uniqueStrings(
      (metadata?.lectures || []).map((lecture) => lecture.name)
        .concat((questions || []).flatMap((question) => [question.lecture].concat(question.alsoInLectures || [])))
    ).sort((a, b) => a.localeCompare(b));
  }

  function getExamOptionsForMetadata(metadata, questions = []) {
    return uniqueStrings(
      (metadata?.exams || []).map((exam) => exam.label)
        .concat((questions || []).map((question) => question.exam))
    ).sort((a, b) => a.localeCompare(b));
  }

  function bucketExists(entries, value, labelKey) {
    const resolved = resolveBucketValue(entries, value, labelKey);
    if (!resolved) return false;
    return (Array.isArray(entries) ? entries : []).some((entry) => String(entry?.[labelKey] || "").trim().toLowerCase() === resolved.toLowerCase());
  }

  function resolveBucketValue(entries, value, labelKey) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const normalized = normalizeBucketText(trimmed);
    const slug = slugify(trimmed);
    const list = Array.isArray(entries) ? entries : [];
    const exact = list.find((entry) => String(entry?.[labelKey] || "").trim().toLowerCase() === trimmed.toLowerCase());
    if (exact) return String(exact[labelKey] || "").trim();
    const normalizedMatch = list.find((entry) => normalizeBucketText(entry?.[labelKey]) === normalized);
    if (normalizedMatch) return String(normalizedMatch[labelKey] || "").trim();
    const slugMatch = list.find((entry) => slugify(entry?.[labelKey]) === slug);
    if (slugMatch) return String(slugMatch[labelKey] || "").trim();
    const tokens = normalized.split(" ").filter((token) => token.length > 2);
    if (tokens.length) {
      const tokenMatch = list.find((entry) => {
        const entryNormalized = normalizeBucketText(entry?.[labelKey]);
        return tokens.every((token) => entryNormalized.includes(token));
      });
      if (tokenMatch) return String(tokenMatch[labelKey] || "").trim();
    }
    return trimmed;
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildReplacementSuggestion(beforeValue, afterValue) {
    const before = String(beforeValue || "");
    const after = String(afterValue || "");
    if (!before || !after || before === after) return null;

    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
      prefix += 1;
    }

    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    const oldText = before.slice(prefix, before.length - suffix).trim();
    const newText = after.slice(prefix, after.length - suffix).trim();
    if (!oldText || !newText || oldText === newText) return null;
    if (oldText.length < 4 && newText.length < 4) return null;
    return { oldText, newText };
  }

  function collectQuestionTextEntries(question) {
    const entries = [];
    if (!question) return entries;
    const push = (path, value) => {
      if (value == null) return;
      entries.push({ path, value: String(value) });
    };
    push("lecture", question.lecture);
    push("exam", question.exam);
    push("source", question.source);
    push("doctor", question.doctor);
    push("q", question.q);
    push("note", question.note);
    push("a", question.a);
    (question.choices || []).forEach((choice, index) => push(`choices.${index}`, choice));
    (question.alsoInLectures || []).forEach((lecture, index) => push(`alsoInLectures.${index}`, lecture));
    (question.subParts || []).forEach((part, partIndex) => {
      push(`subParts.${partIndex}.q`, part.q);
      (part.choices || []).forEach((choice, choiceIndex) => push(`subParts.${partIndex}.choices.${choiceIndex}`, choice));
    });
    return entries;
  }

  function readPathValue(root, path) {
    return String(path.split(".").reduce((current, segment) => current?.[segment], root) ?? "");
  }

  function writePathValue(root, path, value) {
    const parts = path.split(".");
    const last = parts.pop();
    let current = root;
    parts.forEach((segment) => {
      current = current?.[segment];
    });
    if (current && last != null) current[last] = value;
  }

  function replaceLiteralText(value, oldText, newText) {
    const source = String(value || "");
    if (!oldText || !source.includes(oldText)) return source;
    return source.replace(new RegExp(escapeRegex(oldText), "g"), newText);
  }

  function findReplacementTargets(oldText, excludeQuestionId) {
    if (!oldText) return [];
    const hits = [];
    state.working.forEach((question) => {
      if (!question || question.id === excludeQuestionId) return;
      collectQuestionTextEntries(question).forEach((entry) => {
        if (entry.value.includes(oldText)) {
          hits.push({ questionId: question.id, path: entry.path });
        }
      });
    });
    return hits;
  }

  function applyTextReplacementAcrossBank(oldText, newText, sourceQuestionId) {
    if (!oldText || oldText === newText) return 0;
    captureHistoryBeforeMutation(`Replace "${oldText}" across the bank`, { mergeWindowMs: 0 });
    let replacements = 0;
    state.working = state.working.map((question) => {
      if (!question || question.id === sourceQuestionId) return question;
      const draft = deepClone(question);
      let changed = false;
      collectQuestionTextEntries(draft).forEach((entry) => {
        if (!entry.value.includes(oldText)) return;
        const nextValue = replaceLiteralText(entry.value, oldText, newText);
        if (nextValue !== entry.value) {
          writePathValue(draft, entry.path, nextValue);
          replacements += 1;
          changed = true;
        }
      });
      return changed ? normalizeQuestion(draft) : question;
    });

    state.metadata.lectures = (state.metadata.lectures || []).map((lecture) => {
      const nextName = replaceLiteralText(lecture.name, oldText, newText);
      if (nextName !== lecture.name) {
        replacements += 1;
        return { ...lecture, name: nextName };
      }
      return lecture;
    });
    state.metadata.exams = (state.metadata.exams || []).map((exam) => {
      const nextLabel = replaceLiteralText(exam.label, oldText, newText);
      if (nextLabel !== exam.label) {
        replacements += 1;
        return { ...exam, label: nextLabel };
      }
      return exam;
    });
    return replacements;
  }

  async function suggestRelatedReplacements(question) {
    return 0;
  }

  function setDirty(nextDirty) {
    state.dirty = !!nextDirty;
    if (els.dirtyBadge) {
      els.dirtyBadge.textContent = state.dirty ? "Unsaved changes" : "Saved";
      els.dirtyBadge.classList.toggle("dirty", state.dirty);
    }
    renderHistory();
  }

  function ensureConfirmModalElements() {
    let modal = byId("confirm-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "confirm-modal";
      modal.className = "confirm-modal hidden";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="confirm-backdrop" data-confirm-dismiss="true"></div>
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="confirm-kicker" id="confirm-kicker">Confirm action</div>
          <h2 id="confirm-title">Apply this change?</h2>
          <p id="confirm-message">Review this action before continuing.</p>
          <div class="confirm-actions">
            <button class="btn btn-ghost" id="confirm-cancel-btn" type="button">Cancel</button>
            <button class="btn btn-primary" id="confirm-accept-btn" type="button">Continue</button>
          </div>
        </section>
      `;
      document.body.appendChild(modal);
    }
    if (!byId("dynamic-confirm-style")) {
      const style = document.createElement("style");
      style.id = "dynamic-confirm-style";
      style.textContent = `
        .confirm-modal{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:20px}
        .confirm-backdrop{position:absolute;inset:0;background:rgba(13,24,45,.44);backdrop-filter:blur(4px)}
        .confirm-dialog{position:relative;z-index:1;width:min(520px,calc(100vw - 28px));padding:24px;background:#fff;border:1px solid #dfe8f3;border-radius:22px;box-shadow:0 28px 80px rgba(18,39,74,.28);animation:fadeUp .18s ease}
        .confirm-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1A6B5A}
        .confirm-dialog h2{margin:10px 0 10px;font-size:1.45rem;line-height:1.2;color:#1B3A6B}
        .confirm-dialog p{margin:0;color:#607184;line-height:1.75}
        .confirm-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:20px}
      `;
      document.head.appendChild(style);
    }
    els.confirmModal = modal;
    els.confirmKicker = byId("confirm-kicker");
    els.confirmTitle = byId("confirm-title");
    els.confirmMessage = byId("confirm-message");
    els.confirmAcceptBtn = byId("confirm-accept-btn");
    els.confirmCancelBtn = byId("confirm-cancel-btn");
  }

  function closeConfirmDialog(result) {
    if (els.confirmModal) {
      els.confirmModal.classList.add("hidden");
      els.confirmModal.setAttribute("aria-hidden", "true");
    }
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    if (resolver) resolver(!!result);
  }

  function openConfirmDialog(options = {}) {
    ensureConfirmModalElements();
    if (state.confirmResolver) {
      state.confirmResolver(false);
      state.confirmResolver = null;
    }
    if (els.confirmKicker) els.confirmKicker.textContent = options.kicker || "Confirm action";
    if (els.confirmTitle) els.confirmTitle.textContent = options.title || "Apply this change?";
    if (els.confirmMessage) els.confirmMessage.textContent = options.message || "Review this action before continuing.";
    if (els.confirmAcceptBtn) els.confirmAcceptBtn.textContent = options.confirmLabel || "Continue";
    if (els.confirmCancelBtn) els.confirmCancelBtn.textContent = options.cancelLabel || "Cancel";
    els.confirmModal.classList.remove("hidden");
    els.confirmModal.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
      state.confirmResolver = resolve;
    });
  }

  function pushToast(message, tone = "ok", title = "") {
    if (!els.toastViewport || !message) return;
    const toast = document.createElement("div");
    toast.className = `toast ${tone || "ok"}`;
    const toastTitle = title || (
      tone === "error" ? "Something needs attention"
      : tone === "warn" ? "Heads up"
      : tone === "progress" ? "Working"
      : "Done"
    );
    toast.innerHTML = `<div class="toast-title">${escapeHtml(toastTitle)}</div><div class="toast-body">${escapeHtml(message)}</div>`;
    els.toastViewport.appendChild(toast);
    const delay = tone === "error" ? 5200 : tone === "progress" ? 1800 : 3200;
    window.setTimeout(() => {
      toast.classList.add("fade-out");
      window.setTimeout(() => toast.remove(), 220);
    }, delay);
  }

  function setStatus(message, tone) {
    els.saveStatus.textContent = message;
    els.saveStatus.className = `save-status${tone ? ` ${tone}` : ""}`;
    pushToast(message, tone || "ok");
  }

  function setStatusHtml(html, tone) {
    els.saveStatus.innerHTML = html;
    els.saveStatus.className = `save-status${tone ? ` ${tone}` : ""}`;
    const plain = String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    pushToast(plain, tone || "ok");
  }

  function setSaving(nextSaving) {
    state.saving = !!nextSaving;
    const label = state.saving ? "Saving..." : "Save to GitHub";
    [els.saveGithubBtn, els.saveQuestionGithubBtn].forEach((button) => {
      if (!button) return;
      button.disabled = state.saving;
      button.textContent = label;
      button.classList.toggle("is-busy", state.saving);
    });
    updateUndoPublishButton();
  }

  function setImageUploading(nextUploading) {
    state.uploadingImage = !!nextUploading;
    if (els.imageUploadBtn) {
      els.imageUploadBtn.disabled = state.uploadingImage || !state.pendingImageFile || !getSelectedQuestion();
      els.imageUploadBtn.textContent = state.uploadingImage ? "Uploading..." : "Upload to GitHub";
      els.imageUploadBtn.classList.toggle("is-busy", state.uploadingImage);
    }
    if (els.imagePickBtn) {
      els.imagePickBtn.disabled = state.uploadingImage;
      els.imagePickBtn.classList.toggle("is-busy", state.uploadingImage);
    }
  }

  function updateImageUploadMeta(message = "") {
    if (!els.imageUploadMeta) return;
    const question = getSelectedQuestion();
    if (message) {
      els.imageUploadMeta.textContent = message;
    } else if (state.pendingImageFile) {
      const sizeKb = Math.max(1, Math.round(Number(state.pendingImageFile.size || 0) / 1024));
      els.imageUploadMeta.textContent = `Selected: ${state.pendingImageFile.name} (${sizeKb} KB)${question ? ` for ${question.id}` : ""}`;
    } else {
      els.imageUploadMeta.textContent = "No image file selected yet.";
    }
    setImageUploading(state.uploadingImage);
  }

  function renderExistingImageOptions() {
    if (!els.existingImageSelect) return;
    const options = ['<option value="">Choose existing repo image...</option>']
      .concat((state.availableImages || []).map((image) => (
        `<option value="${escapeHtml(image.path)}">${escapeHtml(image.name)}</option>`
      )));
    els.existingImageSelect.innerHTML = options.join("");
  }

  function getImageEffectiveness(question) {
    const image = String(question?.image || "").trim();
    if (!image) {
      return { tone: "", text: "Image status: no image selected." };
    }
    if (!isValidImageValue(image)) {
      return { tone: "is-error", text: "Image status: invalid source. Use HTTPS, base64, or a repo image path." };
    }
    if (/^https:\/\/\S+/i.test(image) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(image)) {
      return { tone: "is-ok", text: "Image status: effective. The current source is directly renderable." };
    }
    const repoMatch = (state.availableImages || []).some((entry) => String(entry.path || "").trim() === image.replace(/^\.\//, "").replace(/^\/+/, ""));
    if (repoMatch) {
      return { tone: "is-ok", text: "Image status: effective. The selected repo image exists and is ready to render." };
    }
    return { tone: "is-warn", text: "Image status: path looks valid, but this repo image was not found in the current image library." };
  }

  function updateImageEffectivenessMeta(question = getSelectedQuestion()) {
    if (!els.imageEffectivenessMeta) return;
    const selectedExisting = String(els.existingImageSelect?.value || "").trim();
    let status;
    if (selectedExisting && selectedExisting !== String(question?.image || "").trim()) {
      const exists = (state.availableImages || []).some((entry) => String(entry.path || "").trim() === selectedExisting);
      status = exists
        ? { tone: "is-ok", text: "Image status: effective. The selected existing repo image is available and ready to attach." }
        : { tone: "is-warn", text: "Image status: the selected repo image was not found in the current image library." };
    } else {
      status = getImageEffectiveness(question);
    }
    els.imageEffectivenessMeta.textContent = status.text;
    els.imageEffectivenessMeta.classList.remove("is-ok", "is-warn", "is-error");
    if (status.tone) els.imageEffectivenessMeta.classList.add(status.tone);
    if (els.useExistingImageBtn) {
      els.useExistingImageBtn.disabled = !els.existingImageSelect?.value || !getSelectedQuestion();
    }
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
    state.siteConfigSha = String(payload.siteConfigSha || "");
    state.repo = payload.repo || null;
    state.publicStats = payload.publicStats || null;
    state.original = payload.questions.map((question) => normalizeQuestion(question));
    state.working = deepClone(state.original);
    state.metadata = normalizeMetadata(payload.metadata);
    state.siteConfig = normalizeSiteConfig(payload.siteConfig);
    const persistedSelectedId = loadSelectedQuestionId();
    state.selectedId = state.working.some((question) => question.id === persistedSelectedId)
      ? persistedSelectedId
      : state.working[0]?.id || null;
    state.savedSnapshots = Object.fromEntries(state.working.map((question) => [question.id, snapshotQuestion(question)]));
    state.lastPublishedUndo = loadLastPublishedUndo();
    state.historyPast = [];
    state.historyFuture = [];
    persistSelectedQuestionId();
    setDirty(false);
    updateUndoPublishButton();
  }

  async function loadMediaLibrary() {
    const response = await fetch(MEDIA_UPLOAD_URL, { cache: "no-store" });
    if (response.status === 401) {
      redirectToLogin();
      throw new Error("Session expired. Please sign in again.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.error || `Failed to load repo images (${response.status})`;
      throw new Error(detail);
    }
    const payload = await response.json();
    state.availableImages = Array.isArray(payload?.images) ? payload.images : [];
    renderExistingImageOptions();
    updateImageEffectivenessMeta();
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
    const playableCount = Number.isFinite(Number(state.publicStats?.playableCount))
      ? Number(state.publicStats.playableCount)
      : active;
    const collapsedCount = Number.isFinite(Number(state.publicStats?.collapsedCount))
      ? Number(state.publicStats.collapsedCount)
      : Math.max(0, active - playableCount);
    const repeated = state.working.filter((question) => Array.isArray(question.alsoInLectures) && question.alsoInLectures.length > 0).length;
    const hiddenLectures = (state.metadata.lectures || []).filter((lecture) => lecture.active === false).length;
    const validation = validateAll();
    els.summaryGrid.innerHTML = [
      summaryCard("Questions", playableCount, collapsedCount ? `${active} active rows, ${inactive} inactive, ${collapsedCount} merged in website study view` : `${active} active rows, ${inactive} inactive`),
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
            <div class="bucket-meta">${escapeHtml(lecture.id)} | ${lecture.active === false ? "Hidden from students" : "Visible to students"}</div>
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
            <div class="bucket-meta">${escapeHtml(exam.id)} | ${exam.active === false ? "Inactive" : "Active"}</div>
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
    const lectureOptions = getLectureOptions();
    if (els.mergeLectureSource) {
      const current = els.mergeLectureSource.value || lectureOptions[0] || "";
      els.mergeLectureSource.innerHTML = ['<option value="">Select source lecture</option>']
        .concat(lectureOptions.map((lecture) => `<option value="${escapeHtml(lecture)}">${escapeHtml(lecture)}</option>`))
        .join("");
      if ([...els.mergeLectureSource.options].some((option) => option.value === current)) {
        els.mergeLectureSource.value = current;
      }
    }
    if (els.mergeLectureTarget) {
      const current = els.mergeLectureTarget.value || lectureOptions[1] || lectureOptions[0] || "";
      els.mergeLectureTarget.innerHTML = ['<option value="">Select target lecture</option>']
        .concat(lectureOptions.map((lecture) => `<option value="${escapeHtml(lecture)}">${escapeHtml(lecture)}</option>`))
        .join("");
      if ([...els.mergeLectureTarget.options].some((option) => option.value === current)) {
        els.mergeLectureTarget.value = current;
      }
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
      persistSelectedQuestionId();
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
      <div class="preview-question" dir="auto">${escapeHtml(question.q || "")}</div>
      ${renderPreviewMedia(question)}
      ${question.note ? `<div class="preview-note" dir="auto"><strong>Note:</strong> ${escapeHtml(question.note)}</div>` : ""}
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
    if (question.image && !isValidImageValue(question.image)) {
      errors.push("Image source must be an HTTPS URL or a base64 data:image URI.");
    }
    if (hasRenderableImage(question) && !String(question.imageAlt || "").trim()) {
      warnings.push("Image alt text is recommended when a real image is attached.");
    }
    if (question.imagePlaceholder && !String(question.imagePlaceholderText || "").trim()) {
      warnings.push("Placeholder text is recommended when image placeholder mode is enabled.");
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
    const siteConfig = normalizeSiteConfig(state.siteConfig);
    if (!String(siteConfig.offlineVersion || "").trim()) metadataErrors.push("Offline version is required.");
    if (!["keep_existing", "purge_existing"].includes(siteConfig.offlineDisableMode)) {
      metadataErrors.push("Offline disable mode is invalid.");
    }
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
    els.fieldImage.value = question.image || "";
    els.fieldImageAlt.value = question.imageAlt || "";
    els.fieldImagePlaceholder.checked = question.imagePlaceholder === true;
    els.fieldImagePlaceholderText.value = question.imagePlaceholderText || "";
    els.repeatLectures.innerHTML = renderRepeatGrid(question);

    renderTypeEditor(question);
    updateImageUploadMeta();
    if (els.existingImageSelect) {
      const normalizedImage = String(question.image || "").trim().replace(/^\.\//, "").replace(/^\/+/, "");
      els.existingImageSelect.value = (state.availableImages || []).some((entry) => entry.path === normalizedImage) ? normalizedImage : "";
    }
    updateImageEffectivenessMeta(question);
    renderPreview(question);
    renderValidation();
  }

  function renderAll() {
    renderSummary();
    renderWebsiteSettings();
    renderSearchFilters();
    renderQuestionList();
    renderBucketLists();
    renderEditor();
    renderHistory();
  }

  function getImportPreviewValidation(preview, rowQuestion) {
    const lectureOptions = getLectureOptionsForMetadata(preview.metadata, preview.rows.map((row) => row.question).concat(state.working, rowQuestion || []));
    const examOptions = getExamOptionsForMetadata(preview.metadata, preview.rows.map((row) => row.question).concat(state.working, rowQuestion || []));
    return validateQuestion(rowQuestion, lectureOptions.concat(rowQuestion?.lecture || []), examOptions.concat(rowQuestion?.exam || []));
  }

  function summarizeImportPreview(preview) {
    const existingIds = new Set(state.working.map((question) => question.id));
    const stagedCounts = new Map();
    const baselineLectureNames = new Set((state.metadata.lectures || []).map((lecture) => String(lecture.name || "").trim().toLowerCase()));
    const baselineExamLabels = new Set((state.metadata.exams || []).map((exam) => String(exam.label || "").trim().toLowerCase()));
    const newLectures = new Set();
    const newExams = new Set();
    preview.rows.forEach((row) => {
      const id = String(row.question?.id || "").trim();
      if (id) stagedCounts.set(id, (stagedCounts.get(id) || 0) + 1);
    });

    let created = 0;
    let updated = 0;
    let errorRows = 0;
    let warningRows = 0;

    preview.rows.forEach((row) => {
      const validation = getImportPreviewValidation(preview, row.question);
      const errors = [...validation.errors];
      if ((stagedCounts.get(String(row.question?.id || "").trim()) || 0) > 1) {
        errors.unshift("Duplicate imported ID in preview.");
      }
      row.validation = { errors, warnings: [...validation.warnings] };
      row.mode = existingIds.has(row.question.id) ? "update" : "create";
      row.lectureStatus = baselineLectureNames.has(String(row.question.lecture || "").trim().toLowerCase()) ? "existing" : "new";
      row.examStatus = baselineExamLabels.has(String(row.question.exam || "").trim().toLowerCase()) ? "existing" : "new";
      if (row.question.lecture && row.lectureStatus === "new") newLectures.add(row.question.lecture);
      if (row.question.exam && row.examStatus === "new") newExams.add(row.question.exam);
      if (row.mode === "update") updated += 1;
      else created += 1;
      if (row.validation.errors.length) errorRows += 1;
      else if (row.validation.warnings.length) warningRows += 1;
    });

    preview.summary = {
      fileName: preview.fileName,
      totalRows: preview.rows.length,
      created,
      updated,
      autoGenerateMissingIds: preview.autoGenerateMissingIds !== false,
      parseErrors: preview.invalidRows.length,
      errorRows,
      warningRows,
      readyRows: Math.max(0, preview.rows.length - errorRows),
      newLectures: [...newLectures],
      newExams: [...newExams],
    };
    return preview.summary;
  }

  function importPreviewHasBlockingIssues(preview) {
    if (!preview) return true;
    const summary = summarizeImportPreview(preview);
    return !!summary.parseErrors || !!summary.errorRows || !(summary.created || summary.updated);
  }

  async function maybeApplyImportPreviewChange(field, previousValue, nextValue, rowIndex) {
    if (!state.importPreview || !previousValue || !nextValue || previousValue === nextValue) return;

    if (field === "lecture" || field === "exam") {
      const matches = state.importPreview.rows.filter((row, index) => (
        index !== rowIndex && String(row.question?.[field] || "").trim() === String(previousValue).trim()
      ));
      if (!matches.length) return;
      const bucketLabel = field === "lecture" ? "lecture" : "exam section";
      const shouldApply = await openConfirmDialog({
        kicker: "Import Review",
        title: "Apply this bucket change to the other imported rows?",
        message: `You changed the ${bucketLabel} "${previousValue}" to "${nextValue}". Apply this to ${matches.length} other imported row(s) too?`,
        confirmLabel: "Apply to all",
        cancelLabel: "Only this row",
      });
      if (!shouldApply) return;
      matches.forEach((row) => {
        if (field === "lecture") row.question.lecture = ensureLecture(nextValue, { metadata: state.importPreview.metadata });
        else row.question.exam = ensureExam(nextValue, { metadata: state.importPreview.metadata });
        row.question = normalizeQuestion(row.question);
      });
      return;
    }

    if (field === "q") {
      const replacement = buildReplacementSuggestion(previousValue, nextValue);
      if (!replacement) return;
      const matches = state.importPreview.rows.filter((row, index) => (
        index !== rowIndex && String(row.question?.q || "").includes(replacement.oldText)
      ));
      if (!matches.length) return;
      const shouldApply = await openConfirmDialog({
        kicker: "Import Review",
        title: "Apply this wording change to the other imported rows?",
        message: `You changed "${replacement.oldText}" to "${replacement.newText}". Apply this to ${matches.length} other imported row(s) too?`,
        confirmLabel: "Apply wording",
        cancelLabel: "Only this row",
      });
      if (!shouldApply) return;
      matches.forEach((row) => {
        row.question.q = replaceLiteralText(row.question.q, replacement.oldText, replacement.newText);
        row.question = normalizeQuestion(row.question);
      });
    }
  }

  function renderImportPreview() {
    const preview = state.importPreview;
    if (!els.importPreviewModal) return;
    if (!preview) {
      els.importPreviewModal.classList.add("hidden");
      els.importPreviewModal.setAttribute("aria-hidden", "true");
      return;
    }

    const summary = summarizeImportPreview(preview);
    els.importPreviewModal.classList.remove("hidden");
    els.importPreviewModal.setAttribute("aria-hidden", "false");
    els.importPreviewSummaryPanel.classList.toggle("hidden", state.importPreviewTab !== "summary");
    els.importPreviewRowsPanel.classList.toggle("hidden", state.importPreviewTab !== "rows");
    [els.importPreviewSummaryTab, els.importPreviewRowsTab].forEach((button) => {
      if (!button) return;
      button.classList.toggle("is-active", button.dataset.importTab === state.importPreviewTab);
    });
    if (els.importPreviewApplyBtn) {
      const blocked = importPreviewHasBlockingIssues(preview);
      els.importPreviewApplyBtn.disabled = blocked;
      els.importPreviewApplyBtn.textContent = blocked ? "Fix Issues Before Import" : "Apply Import";
    }

    if (els.importPreviewSummaryGrid) {
      const cards = [
        ["File", summary.fileName || "Imported CSV", "The staged import file currently under review."],
        ["Rows", String(summary.totalRows), `${summary.readyRows} ready rows staged for import.`],
        ["Create", String(summary.created), "Rows that will create brand-new questions."],
        ["Update", String(summary.updated), "Rows that will replace existing IDs."],
        ["Missing IDs", summary.autoGenerateMissingIds ? "Auto-generate" : "Manual review", summary.autoGenerateMissingIds ? "Blank IDs from the CSV were filled automatically during staging." : "Blank IDs stay empty until you type them in the preview."],
        ["Lecture buckets", String(summary.newLectures.length), summary.newLectures.length ? `New: ${summary.newLectures.join(", ")}` : "All rows map to existing lectures."],
        ["Exam buckets", String(summary.newExams.length), summary.newExams.length ? `New: ${summary.newExams.join(", ")}` : "All rows map to existing exam sections."],
        ["Needs attention", String(summary.parseErrors + summary.errorRows), "Blocking issues that must be fixed before import."],
      ];
      els.importPreviewSummaryGrid.innerHTML = cards.map(([label, value, copy]) => `
        <div class="import-preview-stat">
          <div class="import-preview-stat-label">${escapeHtml(label)}</div>
          <div class="import-preview-stat-value">${escapeHtml(value)}</div>
          <div class="import-preview-stat-copy">${escapeHtml(copy)}</div>
        </div>
      `).join("");
    }

    if (els.importPreviewIssuesList) {
      const issues = [];
      preview.invalidRows.forEach((row) => {
        issues.push(`<div class="validation-item error"><strong>Row ${escapeHtml(row.rowNumber)}</strong>: ${escapeHtml(row.message)}</div>`);
      });
      preview.rows.forEach((row) => {
        row.validation.errors.forEach((message) => {
          issues.push(`<div class="validation-item error"><strong>${escapeHtml(row.question.id)}</strong>: ${escapeHtml(message)}</div>`);
        });
        row.validation.warnings.forEach((message) => {
          issues.push(`<div class="validation-item warning"><strong>${escapeHtml(row.question.id)}</strong>: ${escapeHtml(message)}</div>`);
        });
      });
      els.importPreviewIssuesList.innerHTML = issues.length
        ? issues.join("")
        : '<div class="validation-item">No import issues found. This file is ready to merge.</div>';
    }

    if (els.importPreviewRows) {
      const lectureOptions = getLectureOptionsForMetadata(preview.metadata, preview.rows.map((row) => row.question));
      const examOptions = getExamOptionsForMetadata(preview.metadata, preview.rows.map((row) => row.question));
      els.importPreviewRows.innerHTML = preview.rows.length
        ? preview.rows.map((row, index) => {
          const tone = row.validation.errors.length ? "error" : row.validation.warnings.length ? "warn" : "ok";
          const issueMarkup = row.validation.errors.concat(row.validation.warnings).map((message) => `
            <div class="validation-item ${row.validation.errors.includes(message) ? "error" : "warning"}">${escapeHtml(message)}</div>
          `).join("");
          const rowLectures = uniqueStrings(lectureOptions.concat(row.question.lecture || "", row.raw?.lecture || ""));
          const rowExams = uniqueStrings(examOptions.concat(row.question.exam || "", row.raw?.exam || row.raw?.examsection || ""));
          return `
            <article class="import-preview-row">
              <div class="import-preview-row-head">
                <div>
                  <div class="import-preview-row-title">Row ${escapeHtml(row.rowNumber)} | ${escapeHtml(row.question.id)}</div>
                  <div class="import-preview-row-meta">${escapeHtml(row.question.lecture || "No lecture")} | ${escapeHtml(row.question.cardType || "Question")} | ${escapeHtml(row.mode)}${row.raw?.lecture ? ` | imported lecture: ${escapeHtml(row.raw.lecture)}` : ""}${row.raw?.exam ? ` | imported exam: ${escapeHtml(row.raw.exam)}` : row.raw?.examsection ? ` | imported exam: ${escapeHtml(row.raw.examsection)}` : ""}</div>
                  <div class="import-preview-chip-row">
                    <span class="import-preview-chip ${row.lectureStatus === "new" ? "warn" : "ok"}">${row.lectureStatus === "new" ? "New lecture bucket" : "Existing lecture bucket"}</span>
                    <span class="import-preview-chip ${row.examStatus === "new" ? "warn" : "ok"}">${row.examStatus === "new" ? "New exam section" : "Existing exam section"}</span>
                  </div>
                </div>
                <span class="import-preview-chip ${tone}">${row.validation.errors.length ? "Needs fix" : row.validation.warnings.length ? "Review warnings" : row.mode === "update" ? "Will update" : "Ready to create"}</span>
              </div>
              <div class="import-preview-form">
                <label>ID<input type="text" data-import-row="${index}" data-field="id" value="${escapeHtml(row.question.id || "")}" /></label>
                <label>Lecture
                  <select data-import-row="${index}" data-field="lecture">
                    ${rowLectures.map((lecture) => `<option value="${escapeHtml(lecture)}" ${row.question.lecture === lecture ? "selected" : ""}>${escapeHtml(lecture)}</option>`).join("")}
                  </select>
                </label>
                <label>Exam
                  <select data-import-row="${index}" data-field="exam">
                    ${rowExams.map((exam) => `<option value="${escapeHtml(exam)}" ${row.question.exam === exam ? "selected" : ""}>${escapeHtml(exam)}</option>`).join("")}
                  </select>
                </label>
                <label>Type
                  <select data-import-row="${index}" data-field="cardType">
                    ${TYPE_OPTIONS.map((type) => `<option value="${type}" ${row.question.cardType === type ? "selected" : ""}>${type}</option>`).join("")}
                  </select>
                </label>
                <label>Question / stem<textarea rows="3" data-import-row="${index}" data-field="q">${escapeHtml(row.question.q || "")}</textarea></label>
              </div>
              <div class="import-preview-row-issues">
                ${issueMarkup || '<div class="validation-item">No blocking issues on this row.</div>'}
              </div>
            </article>
          `;
        }).join("")
        : '<div class="import-preview-empty">No usable rows were found in this CSV yet.</div>';
    }
  }

  function openImportPreview(preview) {
    state.importPreview = preview;
    state.importPreviewTab = "summary";
    renderImportPreview();
  }

  function closeImportPreview() {
    state.importPreview = null;
    state.importPreviewTab = "summary";
    if (els.templateFileInput) els.templateFileInput.value = "";
    renderImportPreview();
  }

  function updateQuestion(mutator, options = {}) {
    const index = state.working.findIndex((question) => question.id === state.selectedId);
    if (index < 0) return;
    if (options.historyLabel !== false) {
      const selected = state.working[index];
      captureHistoryBeforeMutation(options.historyLabel || `Edit ${selected?.id || "question"}`);
    }
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

  function ensureLecture(name, options = {}) {
    const metadata = options.metadata || state.metadata;
    const trimmed = resolveBucketValue(metadata.lectures, name, "name");
    if (!trimmed) return "";
    metadata.lectures = Array.isArray(metadata.lectures) ? metadata.lectures : [];
    const existing = metadata.lectures.find((lecture) => lecture.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.name;
    metadata.lectures.push({
      id: slugify(trimmed) || `lecture-${metadata.lectures.length + 1}`,
      name: trimmed,
      active: true,
      order: metadata.lectures.length + 1,
    });
    return trimmed;
  }

  function ensureExam(label, options = {}) {
    const metadata = options.metadata || state.metadata;
    const trimmed = resolveBucketValue(metadata.exams, label, "label");
    if (!trimmed) return "";
    metadata.exams = Array.isArray(metadata.exams) ? metadata.exams : [];
    const existing = metadata.exams.find((exam) => exam.label.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.label;
    metadata.exams.push({
      id: slugify(trimmed) || `exam-${metadata.exams.length + 1}`,
      label: trimmed,
      active: true,
      order: metadata.exams.length + 1,
    });
    return trimmed;
  }

  function createQuestion(type) {
    captureHistoryBeforeMutation("Create new question", { mergeWindowMs: 0 });
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
    persistSelectedQuestionId();
    rememberQuestionSnapshot(question);
    setDirty(true);
    renderAll();
    setStatus(`Created ${question.id}.`, "ok");
  }

  function duplicateCurrentQuestion() {
    const selected = getSelectedQuestion();
    if (!selected) return;
    captureHistoryBeforeMutation(`Duplicate ${selected.id}`, { mergeWindowMs: 0 });
    const duplicate = normalizeQuestion({
      ...deepClone(selected),
      id: nextQuestionId(),
      num: "",
    });
    state.working.unshift(duplicate);
    state.selectedId = duplicate.id;
    persistSelectedQuestionId();
    rememberQuestionSnapshot(duplicate);
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
    if (normalized.image) output.image = normalized.image;
    if (normalized.imageAlt) output.imageAlt = normalized.imageAlt;
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

  function getSerializedSiteConfig() {
    return `${JSON.stringify(normalizeSiteConfig(state.siteConfig), null, 2)}\n`;
  }

  function renderWebsiteSettings() {
    const config = normalizeSiteConfig(state.siteConfig);
    state.siteConfig = config;
    if (els.siteOfflineEnabled) els.siteOfflineEnabled.checked = config.offlineEnabled;
    if (els.siteOfflineVersion) els.siteOfflineVersion.value = config.offlineVersion || "v1";
    if (els.siteOfflineDisableModes?.length) {
      els.siteOfflineDisableModes.forEach((input) => {
        input.checked = input.value === config.offlineDisableMode;
        input.disabled = config.offlineEnabled;
      });
    }
    if (!els.siteSettingsStatus) return;
    if (config.offlineEnabled) {
      els.siteSettingsStatus.textContent = `Offline mode is enabled for students. Current offline pack version: ${config.offlineVersion}.`;
      return;
    }
    els.siteSettingsStatus.textContent = "Offline mode is off.";
  }

  function createPublishUndoSnapshot() {
    return {
      questions: state.working.map((question) => normalizeForSave(question)),
      metadata: JSON.parse(getSerializedMetadata()),
      siteConfig: JSON.parse(getSerializedSiteConfig()),
      selectedId: state.selectedId,
      at: Date.now(),
    };
  }

  function updateStringTagValue(tag, sourceLecture, targetLecture) {
    if (typeof tag !== "string") return tag;
    return tag === `also_in:${sourceLecture}` ? `also_in:${targetLecture}` : tag;
  }

  function updateObjectTagValue(tag, sourceLecture, targetLecture) {
    if (!tag || typeof tag !== "object") return tag;
    const next = { ...tag };
    if (typeof next.txt === "string") next.txt = next.txt.split(sourceLecture).join(targetLecture);
    return next;
  }

  async function mergeLectureBuckets() {
    const sourceLecture = String(els.mergeLectureSource?.value || "").trim();
    const targetLecture = String(els.mergeLectureTarget?.value || "").trim();
    if (!sourceLecture || !targetLecture) {
      setStatus("Choose both a source lecture and a target lecture before merging.", "warn");
      return;
    }
    if (sourceLecture === targetLecture) {
      setStatus("Choose two different lectures to merge.", "warn");
      return;
    }
    const sourceCount = state.working.filter((question) => question.lecture === sourceLecture || (question.alsoInLectures || []).includes(sourceLecture)).length;
    const shouldMerge = await openConfirmDialog({
      kicker: "Merge Lectures",
      title: "Merge this lecture into the target?",
      message: `${sourceCount} question(s) and cross-lecture references will move from "${sourceLecture}" into "${targetLecture}". The source lecture bucket will be removed.`,
      confirmLabel: "Merge lectures",
      cancelLabel: "Cancel",
    });
    if (!shouldMerge) return;

    captureHistoryBeforeMutation(`Merge lecture "${sourceLecture}" into "${targetLecture}"`, { mergeWindowMs: 0 });
    state.working = state.working.map((question) => {
      const draft = deepClone(question);
      if (draft.lecture === sourceLecture) draft.lecture = targetLecture;
      draft.alsoInLectures = uniqueStrings((draft.alsoInLectures || []).map((lecture) => lecture === sourceLecture ? targetLecture : lecture))
        .filter((lecture) => lecture && lecture !== draft.lecture);
      if (Array.isArray(draft.tags)) {
        draft.tags = draft.tags.map((tag) => {
          if (typeof tag === "string") return updateStringTagValue(tag, sourceLecture, targetLecture);
          return updateObjectTagValue(tag, sourceLecture, targetLecture);
        });
      }
      return normalizeQuestion(draft);
    });
    state.metadata.lectures = (state.metadata.lectures || []).filter((lecture) => lecture.name !== sourceLecture);
    if (els.searchLecture?.value === sourceLecture) els.searchLecture.value = targetLecture;
    if ((els.templateLecture?.value || "") === sourceLecture) els.templateLecture.value = targetLecture;
    if ((els.fieldLecture?.value || "") === sourceLecture) els.fieldLecture.value = targetLecture;
    setDirty(true);
    renderAll();
    setStatus(`Merged lecture "${sourceLecture}" into "${targetLecture}".`, "ok");
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

  async function saveQuestionDraft() {
    const question = getSelectedQuestion();
    if (!question) return;
    const lectureOptions = getLectureOptions();
    const validation = validateQuestion(question, lectureOptions, getExamOptions());
    renderPreview(question);
    renderValidation();
    if (validation.errors.length) {
      setStatus(`Question ${question.id} still has ${validation.errors.length} validation error(s).`, "error");
      return;
    }
    const propagated = await suggestRelatedReplacements(question);
    rememberQuestionSnapshot(getSelectedQuestion() || question);
    if (propagated) {
      setDirty(true);
      renderAll();
      setStatus(
        `Saved ${question.id} and updated ${propagated} related field(s) across the bank. Use Save to GitHub to publish.`,
        validation.warnings.length ? "warn" : "ok"
      );
      return;
    }
    setStatus(
      `Saved ${question.id} in the working draft. Use Save to GitHub to publish it to the repo.`,
      validation.warnings.length ? "warn" : "ok"
    );
  }

  async function saveToGitHub() {
    const selectedBeforeSave = getSelectedQuestion();
    if (selectedBeforeSave) {
      const propagated = await suggestRelatedReplacements(selectedBeforeSave);
      rememberQuestionSnapshot(getSelectedQuestion() || selectedBeforeSave);
      if (propagated) {
        setDirty(true);
        renderAll();
      }
    }
    const validation = validateAll();
    renderValidation();
    if (validation.errorCount) {
      setStatus(`GitHub save blocked: fix ${validation.errorCount} validation errors first.`, "error");
      return;
    }

    const publishUndoSnapshot = createPublishUndoSnapshot();
    try {
      setSaving(true);
      setStatus("Saving updated questions.json to GitHub...", "progress");
      const saveResponse = await fetch(DATA_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questions: state.working.map((question) => normalizeForSave(question)),
          metadata: JSON.parse(getSerializedMetadata()),
          siteConfig: JSON.parse(getSerializedSiteConfig()),
          sha: state.fileSha,
          metadataSha: state.metadataSha,
          siteConfigSha: state.siteConfigSha,
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
      state.siteConfigSha = String(payload.siteConfigSha || state.siteConfigSha || "");
      if (payload.metadata) state.metadata = normalizeMetadata(payload.metadata);
      if (payload.siteConfig) state.siteConfig = normalizeSiteConfig(payload.siteConfig);
      state.publicStats = payload.publicStats || state.publicStats;
      state.savedSnapshots = Object.fromEntries(state.working.map((question) => [question.id, snapshotQuestion(question)]));
      state.lastPublishedUndo = publishUndoSnapshot;
      persistLastPublishedUndo();
      setDirty(false);
      const location = state.repo ? `${state.repo.owner}/${state.repo.repo}@${state.repo.branch}` : "GitHub";
      if (payload.url) {
        setStatusHtml(
          `Saved <strong>questions, metadata, and website settings</strong> to ${escapeHtml(location)} at ${escapeHtml(new Date().toLocaleTimeString())}. <a href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer">Open commit</a>`,
          "ok"
        );
      } else {
        setStatus(`Saved questions, metadata, and website settings to ${location} at ${new Date().toLocaleTimeString()}.`, "ok");
      }
    } catch (error) {
      setStatus(error.message || "GitHub save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleImageFileSelection(event) {
    const [file] = event.target?.files || [];
    state.pendingImageFile = file || null;
    updateImageUploadMeta(file ? "" : "No image file selected yet.");
    if (file) {
      setStatus(`Selected ${file.name}. Upload it to GitHub when you're ready.`, "ok");
    }
  }

  async function uploadSelectedImage() {
    const question = getSelectedQuestion();
    if (!question) {
      setStatus("Select a question before uploading an image.", "warn");
      return;
    }
    if (!state.pendingImageFile) {
      setStatus("Choose an image file first.", "warn");
      return;
    }

    try {
      setImageUploading(true);
      setStatus(`Uploading ${state.pendingImageFile.name} to GitHub...`, "progress");
      const formData = new FormData();
      formData.set("file", state.pendingImageFile);
      formData.set("questionId", question.id);

      const response = await fetch(MEDIA_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 401) {
          redirectToLogin();
          throw new Error("Session expired. Please sign in again.");
        }
        throw new Error(payload?.error || `Image upload failed (${response.status}).`);
      }

      const payload = await response.json();
      captureHistoryBeforeMutation(`Upload image for ${question.id}`, { mergeWindowMs: 0 });
      updateQuestion((draft) => {
        draft.image = String(payload.imagePath || "").trim();
        draft.imagePlaceholder = false;
      }, { fullRender: true, historyLabel: false });
      state.pendingImageFile = null;
      if (els.imageUploadInput) els.imageUploadInput.value = "";
      await loadMediaLibrary().catch(() => {});
      updateImageUploadMeta(payload.imagePath ? `Uploaded to ${payload.imagePath}` : "Image uploaded.");
      if (payload.url) {
        setStatusHtml(
          `Uploaded image for <strong>${escapeHtml(question.id)}</strong>. <a href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer">Open commit</a>`,
          "ok"
        );
      } else {
        setStatus(`Uploaded image for ${question.id}. Save the question to keep the image path in questions.json.`, "ok");
      }
    } catch (error) {
      setStatus(error.message || "Image upload failed.", "error");
    } finally {
      setImageUploading(false);
    }
  }

  function useExistingImage() {
    const question = getSelectedQuestion();
    const selectedPath = String(els.existingImageSelect?.value || "").trim();
    if (!question) {
      setStatus("Select a question before choosing an existing image.", "warn");
      return;
    }
    if (!selectedPath) {
      setStatus("Choose an existing repo image first.", "warn");
      return;
    }
    updateQuestion((draft) => {
      draft.image = selectedPath;
      draft.imagePlaceholder = false;
    }, { fullRender: true });
    setStatus(`Attached existing repo image to ${question.id}.`, "ok");
  }

  async function undoLastPublish() {
    if (!state.lastPublishedUndo) {
      setStatus("There is no published snapshot to restore yet.", "warn");
      return;
    }
    const shouldRestore = await openConfirmDialog({
      kicker: "Undo Publish",
      title: "Restore the previous published version?",
      message: "This will create a new GitHub commit that restores the question bank and metadata to the snapshot from before your last publish.",
      confirmLabel: "Restore previous publish",
      cancelLabel: "Cancel",
    });
    if (!shouldRestore) return;

    try {
      setSaving(true);
      setStatus("Restoring the previous published version on GitHub...", "progress");
      const restoreResponse = await fetch(DATA_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questions: state.lastPublishedUndo.questions,
          metadata: state.lastPublishedUndo.metadata,
          siteConfig: state.lastPublishedUndo.siteConfig,
          sha: state.fileSha,
          metadataSha: state.metadataSha,
          siteConfigSha: state.siteConfigSha,
        }),
      });
      if (!restoreResponse.ok) {
        const payload = await restoreResponse.json().catch(() => null);
        const detail = payload?.errors?.join(" | ") || payload?.error || (await restoreResponse.text());
        throw new Error(`Undo publish failed (${restoreResponse.status}): ${detail}`);
      }
      const payload = await restoreResponse.json();
      state.fileSha = String(payload.sha || state.fileSha || "");
      state.metadataSha = String(payload.metadataSha || state.metadataSha || "");
      state.siteConfigSha = String(payload.siteConfigSha || state.siteConfigSha || "");
      state.metadata = normalizeMetadata(payload.metadata || state.lastPublishedUndo.metadata);
      state.siteConfig = normalizeSiteConfig(payload.siteConfig || state.lastPublishedUndo.siteConfig);
      state.original = (state.lastPublishedUndo.questions || []).map((question) => normalizeQuestion(question));
      state.working = deepClone(state.original);
      state.selectedId = state.lastPublishedUndo.selectedId || state.working[0]?.id || null;
      persistSelectedQuestionId();
      state.savedSnapshots = Object.fromEntries(state.working.map((question) => [question.id, snapshotQuestion(question)]));
      state.lastPublishedUndo = null;
      persistLastPublishedUndo();
      setDirty(false);
      renderAll();
      if (payload.url) {
        setStatusHtml(
          `Restored the previous published version. <a href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer">Open commit</a>`,
          "ok"
        );
      } else {
        setStatus("Restored the previous published version.", "ok");
      }
    } catch (error) {
      setStatus(error.message || "Undo publish failed.", "error");
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
    const needsFullRender = ["field-lecture", "field-exam", "field-active", "field-image", "field-image-alt", "field-image-placeholder", "field-image-placeholder-text"].includes(target.id);
    updateQuestion((draft) => {
      if (target.id === "field-num") draft.num = target.value;
      if (target.id === "field-lecture") draft.lecture = ensureLecture(target.value);
      if (target.id === "field-exam") draft.exam = ensureExam(target.value);
      if (target.id === "field-source") draft.source = target.value;
      if (target.id === "field-doctor") draft.doctor = target.value;
      if (target.id === "field-active") draft.active = target.checked;
      if (target.id === "field-q") draft.q = target.value;
      if (target.id === "field-note") draft.note = target.value;
      if (target.id === "field-image") draft.image = target.value;
      if (target.id === "field-image-alt") draft.imageAlt = target.value;
      if (target.id === "field-image-placeholder") draft.imagePlaceholder = target.checked;
      if (target.id === "field-image-placeholder-text") draft.imagePlaceholderText = target.value;
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

  async function handleDelete() {
    const selected = getSelectedQuestion();
    if (!selected) return;
    const mode = els.deleteMode.value || "soft";
    if (mode === "hard") {
      const shouldDelete = await openConfirmDialog({
        kicker: "Delete Question",
        title: "Permanently delete this question?",
        message: `${selected.id} will be removed from the working copy and cannot be restored after export or save.`,
        confirmLabel: "Delete permanently",
        cancelLabel: "Cancel",
      });
      if (!shouldDelete) return;
      captureHistoryBeforeMutation(`Delete ${selected.id}`, { mergeWindowMs: 0 });
      state.working = state.working.filter((question) => question.id !== selected.id);
      state.selectedId = state.working[0]?.id || null;
      persistSelectedQuestionId();
      setDirty(true);
      renderAll();
      setStatus(`Permanently removed ${selected.id} from the working copy.`, "warn");
      return;
    }
    updateQuestion((draft) => {
      draft.active = false;
    }, { historyLabel: `Soft delete ${selected.id}` });
    setStatus(`Soft-deleted ${selected.id}. It will be hidden after export/save.`, "warn");
  }

  function handleRestore() {
    const selected = getSelectedQuestion();
    if (!selected) return;
    updateQuestion((draft) => {
      draft.active = true;
    }, { historyLabel: `Restore ${selected.id}` });
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

  function buildTemplateQuestionFromRow(row, rowNumber, usedIds, options = {}) {
    const metadata = options.metadata || state.metadata;
    const autoGenerateMissingIds = options.autoGenerateMissingIds !== false;
    const requestedId = String(pickTemplateValue(row, ["id"])).trim();
    const generatedId = requestedId || (autoGenerateMissingIds ? allocateNextQuestionId(usedIds) : "");
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
      lecture: ensureLecture(String(pickTemplateValue(row, ["lecture"])).trim(), { metadata }),
      exam: ensureExam(String(pickTemplateValue(row, ["exam", "examsection"])).trim() || "mid", { metadata }),
      cardType: inferredType,
      source: String(pickTemplateValue(row, ["source"])).trim(),
      doctor: String(pickTemplateValue(row, ["doctor"])).trim(),
      note: String(pickTemplateValue(row, ["note", "studentnote"])).trim(),
      active: !/^(false|0|no)$/i.test(String(pickTemplateValue(row, ["active"])).trim()),
      q: String(pickTemplateValue(row, ["q", "question", "stem"])).trim(),
      image: String(pickTemplateValue(row, ["image", "imageurl", "imagedata"])).trim(),
      imageAlt: String(pickTemplateValue(row, ["imagealt", "alt", "caption"])).trim(),
      imagePlaceholder: /^(true|1|yes)$/i.test(String(pickTemplateValue(row, ["imageplaceholder"])).trim()),
      imagePlaceholderText: String(pickTemplateValue(row, ["imageplaceholdertext", "imageplaceholdernote", "placeholdertext"])).trim(),
      a: String(pickTemplateValue(row, ["a", "answer"])).trim() || "Answer not included",
      ans: String(pickTemplateValue(row, ["ans", "correctanswer"])).trim().toUpperCase() || "A",
      choices: extractTemplateChoices(row),
      subParts: osceParts,
    });

    return question;
  }

  function snapshotQuestion(question) {
    return normalizeQuestion(deepClone(question || {}));
  }

  function rememberQuestionSnapshot(question) {
    if (!question?.id) return;
    state.savedSnapshots[question.id] = snapshotQuestion(question);
  }

  function getSavedSnapshot(questionId) {
    return questionId ? state.savedSnapshots[questionId] || null : null;
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
    const headers = ["id", "num", "lecture", "exam", "cardType", "source", "doctor", "note", "active", "q", "image", "imageAlt", "imagePlaceholder", "imagePlaceholderText"]
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
        image: "",
        imageAlt: "",
        imagePlaceholder: "false",
        imagePlaceholderText: "",
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
    const usedIds = new Set(state.working.map((question) => question.id));
    const metadataPreview = normalizeMetadata(deepClone(state.metadata));
    const autoGenerateMissingIds = !!els.importGenerateMissingIds?.checked;
    const staged = [];
    const invalidRows = [];
    for (const [index, line] of lines.slice(1).entries()) {
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(normalizedHeaders.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      const isBlankRow = Object.values(row).every((value) => String(value || "").trim() === "");
      if (isBlankRow) continue;
      try {
        const question = buildTemplateQuestionFromRow(row, index + 2, usedIds, {
          metadata: metadataPreview,
          autoGenerateMissingIds,
        });
        staged.push({ rowNumber: index + 2, raw: row, question });
      } catch (error) {
        invalidRows.push({
          rowNumber: index + 2,
          message: error.message || `Row ${index + 2}: import failed.`,
          raw,
        });
      }
    }
    if (!staged.length && !invalidRows.length) {
      setStatus("Template import finished, but no non-empty rows were found.", "warn");
      return;
    }
    openImportPreview({
      fileName: file.name || "import.csv",
      headers,
      metadata: metadataPreview,
      autoGenerateMissingIds,
      rows: staged,
      invalidRows,
    });
    setStatus(
      `Import preview ready: ${staged.length} staged row(s), ${invalidRows.length} parse issue(s). ${autoGenerateMissingIds ? "Missing IDs were auto-generated where needed." : "Missing IDs were left blank for manual review."}`,
      invalidRows.length ? "warn" : "ok"
    );
  }

  async function applyImportPreview() {
    const preview = state.importPreview;
    if (!preview) return;
    const summary = summarizeImportPreview(preview);
    if (importPreviewHasBlockingIssues(preview)) {
      state.importPreviewTab = summary.parseErrors ? "summary" : "rows";
      renderImportPreview();
      setStatus(`Import blocked: fix ${summary.parseErrors + summary.errorRows} issue(s) in the preview first.`, "error");
      return;
    }

    if (summary.updated) {
      const shouldUpdate = await openConfirmDialog({
        kicker: "Import IDs already exist",
        title: "Update the existing questions with these imported rows?",
        message: `${summary.updated} imported row(s) use ID(s) that already exist in the bank. Choose Update if you want those rows to replace the existing questions. Choose Keep separate if you want new IDs instead.`,
        confirmLabel: "Update existing",
        cancelLabel: "Keep separate",
      });
      if (!shouldUpdate) {
        const shouldAutoRename = await openConfirmDialog({
          kicker: "Keep imported rows separate",
          title: "Change those duplicate IDs automatically?",
          message: "Continue to auto-generate fresh IDs for the conflicting import rows, or cancel and edit those IDs manually in the preview first.",
          confirmLabel: "Auto change IDs",
          cancelLabel: "I'll edit manually",
        });
        if (!shouldAutoRename) {
          state.importPreviewTab = "rows";
          renderImportPreview();
          setStatus("Import paused. Edit the duplicate IDs in the preview rows, or apply again and choose automatic ID changes.", "warn");
          return;
        }
        const usedIds = new Set(state.working.map((question) => question.id));
        let renamed = 0;
        preview.rows.forEach((row) => {
          const existingId = String(row.question?.id || "").trim();
          if (!existingId || !usedIds.has(existingId)) return;
          row.question.id = allocateNextQuestionId(usedIds);
          row.question = normalizeQuestion(row.question);
          renamed += 1;
        });
        state.importPreviewTab = "rows";
        renderImportPreview();
        setStatus(`Generated new IDs for ${renamed} imported row(s). Review the preview, then click Apply Import again.`, "ok");
        return;
      }
    }

    captureHistoryBeforeMutation(`Apply import (${preview.fileName || "CSV"})`, { mergeWindowMs: 0 });
    const indexById = new Map(state.working.map((question, index) => [question.id, index]));
    let created = 0;
    let updated = 0;
    preview.rows.forEach((row) => {
      if (indexById.has(row.question.id)) {
        state.working[indexById.get(row.question.id)] = normalizeQuestion(row.question);
        updated += 1;
      } else {
        state.working.push(normalizeQuestion(row.question));
        indexById.set(row.question.id, state.working.length - 1);
        created += 1;
      }
    });
    state.metadata = normalizeMetadata(preview.metadata);
    state.selectedId = preview.rows[0]?.question?.id || state.working[0]?.id || null;
    persistSelectedQuestionId();
    setDirty(true);
    closeImportPreview();
    renderAll();
    setStatus(`Imported reviewed CSV: ${created} created, ${updated} updated. The staged lectures and exam sections were applied too.`, "ok");
  }

  function handleImportPreviewTabClick(event) {
    const trigger = event.target.closest("[data-import-tab]");
    if (!trigger || !state.importPreview) return;
    state.importPreviewTab = trigger.dataset.importTab || "summary";
    renderImportPreview();
  }

  async function handleImportPreviewFieldChange(event) {
    const target = event.target;
    if (!target || target.dataset.importRow == null || !state.importPreview) return;
    const row = state.importPreview.rows[Number(target.dataset.importRow)];
    if (!row) return;
    const field = target.dataset.field;
    const previousValue = field === "lecture" || field === "exam" || field === "q"
      ? String(row.question?.[field] || "")
      : "";
    if (field === "cardType") {
      row.question = convertQuestionType(row.question, target.value);
    } else if (field === "lecture") {
      row.question.lecture = ensureLecture(target.value, { metadata: state.importPreview.metadata });
    } else if (field === "exam") {
      row.question.exam = ensureExam(target.value, { metadata: state.importPreview.metadata });
    } else if (field === "id") {
      row.question.id = String(target.value || "").trim();
    } else if (field === "q") {
      row.question.q = target.value;
    }
    row.question = normalizeQuestion(row.question);
    if (event.type === "change") {
      await maybeApplyImportPreviewChange(field, previousValue, String(row.question?.[field] || ""), Number(target.dataset.importRow));
      renderImportPreview();
      return;
    }
    if (field === "q") return;
    renderImportPreview();
  }

  function bindEvents() {
    ensureConfirmModalElements();
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
      persistSelectedQuestionId();
      renderQuestionList();
      renderEditor();
    });

    [els.fieldNum, els.fieldLecture, els.fieldExam, els.fieldCardType, els.fieldSource, els.fieldDoctor, els.fieldActive, els.fieldQ, els.fieldNote, els.fieldImage, els.fieldImageAlt, els.fieldImagePlaceholder, els.fieldImagePlaceholderText]
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
    if (els.themeToggleBtn) els.themeToggleBtn.addEventListener("click", toggleTheme);
    if (els.undoBtn) els.undoBtn.addEventListener("click", undoHistory);
    if (els.redoBtn) els.redoBtn.addEventListener("click", redoHistory);
    if (els.undoPublishBtn) els.undoPublishBtn.addEventListener("click", undoLastPublish);
    els.saveQuestionBtn.addEventListener("click", saveQuestionDraft);
    els.saveQuestionGithubBtn.addEventListener("click", saveToGitHub);
    if (els.imagePickBtn) els.imagePickBtn.addEventListener("click", () => els.imageUploadInput?.click());
    if (els.imageUploadBtn) els.imageUploadBtn.addEventListener("click", uploadSelectedImage);
    if (els.imageUploadInput) els.imageUploadInput.addEventListener("change", handleImageFileSelection);
    if (els.existingImageSelect) els.existingImageSelect.addEventListener("change", () => updateImageEffectivenessMeta());
    if (els.useExistingImageBtn) els.useExistingImageBtn.addEventListener("click", useExistingImage);
    if (els.newQuestionBtn) els.newQuestionBtn.addEventListener("click", () => createQuestion(els.newQuestionType?.value || "MCQ"));
    if (els.duplicateQuestionBtn) els.duplicateQuestionBtn.addEventListener("click", duplicateCurrentQuestion);
    if (els.addLectureBtn) els.addLectureBtn.addEventListener("click", () => {
      const value = els.newLectureInput.value.trim();
      if (!value) return;
      captureHistoryBeforeMutation(`Add lecture bucket "${value}"`, { mergeWindowMs: 0 });
      ensureLecture(value);
      els.newLectureInput.value = "";
      setDirty(true);
      renderAll();
      setStatus(`Added lecture bucket "${value}".`, "ok");
    });
    if (els.mergeLectureBtn) els.mergeLectureBtn.addEventListener("click", mergeLectureBuckets);
    if (els.siteOfflineEnabled) els.siteOfflineEnabled.addEventListener("change", () => {
      captureHistoryBeforeMutation(`Turn offline mode ${els.siteOfflineEnabled.checked ? "on" : "off"}`, { mergeWindowMs: 0 });
      state.siteConfig.offlineEnabled = els.siteOfflineEnabled.checked;
      if (state.siteConfig.offlineEnabled) {
        state.siteConfig.offlineDisableMode = "keep_existing";
      }
      setDirty(true);
      renderWebsiteSettings();
      renderSummary();
      renderValidation();
      setStatus(`Offline mode ${state.siteConfig.offlineEnabled ? "enabled" : "disabled"} in the working draft.`, "ok");
    });
    if (els.siteOfflineVersion) els.siteOfflineVersion.addEventListener("input", () => {
      state.siteConfig.offlineVersion = String(els.siteOfflineVersion.value || "").trim() || "v1";
      setDirty(true);
      renderWebsiteSettings();
      renderSummary();
      renderValidation();
    });
    if (els.siteOfflineDisableModes?.length) els.siteOfflineDisableModes.forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        captureHistoryBeforeMutation("Change offline disable behavior", { mergeWindowMs: 0 });
        state.siteConfig.offlineDisableMode = input.value === "purge_existing" ? "purge_existing" : "keep_existing";
        setDirty(true);
        renderWebsiteSettings();
        renderSummary();
        renderValidation();
        setStatus(`Offline disable behavior set to ${state.siteConfig.offlineDisableMode === "purge_existing" ? "remove existing downloads" : "keep existing downloads"}.`, "ok");
      });
    });
    if (els.bumpOfflineVersionBtn) els.bumpOfflineVersionBtn.addEventListener("click", () => {
      captureHistoryBeforeMutation("Bump offline version", { mergeWindowMs: 0 });
      const current = String(state.siteConfig.offlineVersion || "v1").trim();
      const match = current.match(/^(.*?)(\d+)$/);
      state.siteConfig.offlineVersion = match ? `${match[1]}${Number(match[2]) + 1}` : `${current}-2`;
      setDirty(true);
      renderWebsiteSettings();
      renderSummary();
      renderValidation();
      setStatus(`Offline version bumped to ${state.siteConfig.offlineVersion}.`, "ok");
    });
    if (els.addExamBtn) els.addExamBtn.addEventListener("click", () => {
      const value = els.newExamInput.value.trim();
      if (!value) return;
      captureHistoryBeforeMutation(`Add exam section "${value}"`, { mergeWindowMs: 0 });
      ensureExam(value);
      els.newExamInput.value = "";
      setDirty(true);
      renderAll();
      setStatus(`Added exam section "${value}".`, "ok");
    });
    if (els.generateTemplateBtn) els.generateTemplateBtn.addEventListener("click", exportTemplateCsv);
    if (els.importTemplateBtn) els.importTemplateBtn.addEventListener("click", () => els.templateFileInput?.click());
    if (els.templateFileInput) els.templateFileInput.addEventListener("change", (event) => importTemplateCsv(event.target.files?.[0]));
    if (els.importPreviewTabs) els.importPreviewTabs.addEventListener("click", handleImportPreviewTabClick);
    if (els.importPreviewRows) {
      els.importPreviewRows.addEventListener("change", handleImportPreviewFieldChange);
    }
    [els.importPreviewCloseBtn, els.importPreviewCancelBtn].forEach((button) => {
      if (button) button.addEventListener("click", closeImportPreview);
    });
    if (els.importPreviewApplyBtn) els.importPreviewApplyBtn.addEventListener("click", applyImportPreview);
    if (els.importPreviewModal) {
      els.importPreviewModal.addEventListener("click", (event) => {
        if (event.target?.dataset?.importDismiss === "true") closeImportPreview();
      });
    }
    if (els.confirmAcceptBtn) els.confirmAcceptBtn.addEventListener("click", () => closeConfirmDialog(true));
    if (els.confirmCancelBtn) els.confirmCancelBtn.addEventListener("click", () => closeConfirmDialog(false));
    if (els.confirmModal) {
      els.confirmModal.addEventListener("click", (event) => {
        if (event.target?.dataset?.confirmDismiss === "true") closeConfirmDialog(false);
      });
    }
    if (els.lectureBuckets) els.lectureBuckets.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-bucket-action]");
      if (!trigger) return;
      const lecture = state.metadata.lectures.find((item) => item.id === trigger.dataset.bucketId);
      if (!lecture) return;
      const historyLabel = trigger.dataset.bucketAction === "rename-lecture" ? `Rename lecture "${lecture.name}"` : `${lecture.active === false ? "Show" : "Hide"} lecture "${lecture.name}"`;
      let changed = false;
      captureHistoryBeforeMutation(historyLabel, { mergeWindowMs: 0 });
      if (trigger.dataset.bucketAction === "toggle-lecture") {
        lecture.active = lecture.active === false;
        changed = true;
      }
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
          changed = true;
        }
      }
      if (!changed) {
        const last = state.historyPast[state.historyPast.length - 1];
        if (last?.label === historyLabel) state.historyPast.pop();
        renderHistory();
        return;
      }
      setDirty(true);
      renderAll();
    });
    if (els.examBuckets) els.examBuckets.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-bucket-action]");
      if (!trigger) return;
      const exam = state.metadata.exams.find((item) => item.id === trigger.dataset.bucketId);
      if (!exam) return;
      const historyLabel = trigger.dataset.bucketAction === "rename-exam" ? `Rename exam "${exam.label}"` : `${exam.active === false ? "Enable" : "Disable"} exam "${exam.label}"`;
      let changed = false;
      captureHistoryBeforeMutation(historyLabel, { mergeWindowMs: 0 });
      if (trigger.dataset.bucketAction === "toggle-exam") {
        exam.active = exam.active === false;
        changed = true;
      }
      if (trigger.dataset.bucketAction === "rename-exam") {
        const nextLabel = prompt("Rename exam section", exam.label);
        if (nextLabel && nextLabel.trim()) {
          const previousLabel = exam.label;
          exam.label = nextLabel.trim();
          state.working = state.working.map((question) => normalizeQuestion({
            ...question,
            exam: question.exam === previousLabel ? exam.label : question.exam,
          }));
          changed = true;
        }
      }
      if (!changed) {
        const last = state.historyPast[state.historyPast.length - 1];
        if (last?.label === historyLabel) state.historyPast.pop();
        renderHistory();
        return;
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
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoHistory();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        event.preventDefault();
        redoHistory();
        return;
      }
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
    els.fieldImage = byId("field-image");
    els.fieldImageAlt = byId("field-image-alt");
    els.fieldImagePlaceholder = byId("field-image-placeholder");
    els.fieldImagePlaceholderText = byId("field-image-placeholder-text");
    els.imageUploadInput = byId("image-upload-input");
    els.imagePickBtn = byId("image-pick-btn");
    els.imageUploadBtn = byId("image-upload-btn");
    els.imageUploadMeta = byId("image-upload-meta");
    els.existingImageSelect = byId("existing-image-select");
    els.useExistingImageBtn = byId("use-existing-image-btn");
    els.imageEffectivenessMeta = byId("image-effectiveness-meta");
    els.repeatLectures = byId("repeat-lectures");
    els.typeEditor = byId("type-editor");
    els.deleteMode = byId("delete-mode");
    els.restoreBtn = byId("restore-btn");
    els.deleteBtn = byId("delete-btn");
    els.previewCard = byId("preview-card");
    els.validationSummary = byId("validation-summary");
    els.validationList = byId("validation-list");
    els.saveStatus = byId("save-status");
    els.historyMeta = byId("history-meta");
    els.historyList = byId("history-list");
    els.validateAllBtn = byId("validate-all-btn");
    els.exportBtn = byId("export-btn");
    els.themeToggleBtn = byId("theme-toggle-btn");
    els.undoBtn = byId("undo-btn");
    els.redoBtn = byId("redo-btn");
    els.undoPublishBtn = byId("undo-publish-btn");
    els.saveGithubBtn = byId("save-github-btn");
    els.siteOfflineEnabled = byId("site-offline-enabled");
    els.siteOfflineVersion = byId("site-offline-version");
    els.bumpOfflineVersionBtn = byId("bump-offline-version-btn");
    els.siteOfflineDisableModes = Array.from(document.querySelectorAll('input[name="site-offline-disable-mode"]'));
    els.siteSettingsStatus = byId("site-settings-status");
    els.saveQuestionBtn = byId("save-question-btn");
    els.saveQuestionGithubBtn = byId("save-question-github-btn");
    els.newQuestionType = byId("new-question-type");
    els.newQuestionBtn = byId("new-question-btn");
    els.duplicateQuestionBtn = byId("duplicate-question-btn");
    els.newLectureInput = byId("new-lecture-input");
    els.addLectureBtn = byId("add-lecture-btn");
    els.lectureBuckets = byId("lecture-buckets");
    els.mergeLectureSource = byId("merge-lecture-source");
    els.mergeLectureTarget = byId("merge-lecture-target");
    els.mergeLectureBtn = byId("merge-lecture-btn");
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
    els.importGenerateMissingIds = byId("import-generate-missing-ids");
    els.templateFillDefaults = byId("template-fill-defaults");
    els.generateTemplateBtn = byId("generate-template-btn");
    els.importTemplateBtn = byId("import-template-btn");
    els.templateFileInput = byId("template-file-input");
    els.importPreviewModal = byId("import-preview-modal");
    els.importPreviewCloseBtn = byId("import-preview-close-btn");
    els.importPreviewCancelBtn = byId("import-preview-cancel-btn");
    els.importPreviewApplyBtn = byId("import-preview-apply-btn");
    els.importPreviewTabs = byId("import-preview-tabs");
    els.importPreviewSummaryTab = byId("import-preview-summary-tab");
    els.importPreviewRowsTab = byId("import-preview-rows-tab");
    els.importPreviewSummaryPanel = byId("import-preview-summary-panel");
    els.importPreviewRowsPanel = byId("import-preview-rows-panel");
    els.importPreviewSummaryGrid = byId("import-preview-summary-grid");
    els.importPreviewIssuesList = byId("import-preview-issues-list");
    els.importPreviewRows = byId("import-preview-rows");
    els.confirmModal = byId("confirm-modal");
    els.confirmKicker = byId("confirm-kicker");
    els.confirmTitle = byId("confirm-title");
    els.confirmMessage = byId("confirm-message");
    els.confirmAcceptBtn = byId("confirm-accept-btn");
    els.confirmCancelBtn = byId("confirm-cancel-btn");
    els.toastViewport = byId("toast-viewport");
  }

  let initialized = false;

  async function init() {
    if (initialized) return;
    initialized = true;
    cacheElements();
    applyTheme(readThemePreference());
    bindEvents();
    try {
      setStatus("Loading question bank...", "progress");
      await loadQuestions();
      await loadMediaLibrary();
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




