import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const TYPE_OPTIONS = new Set(["MCQ", "FLASHCARD", "SAQ", "OSCE"]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function deriveDefaultMetadata(questions = []) {
  const lectureNames = uniqueStrings(questions.map((question) => question?.lecture).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  const exams = uniqueStrings(questions.map((question) => question?.exam).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  return {
    lectures: lectureNames.map((name, index) => ({
      id: slugify(name) || `lecture-${index + 1}`,
      name,
      active: true,
      order: index + 1,
    })),
    exams: (exams.length ? exams : ["mid"]).map((label, index) => ({
      id: slugify(label) || `exam-${index + 1}`,
      label,
      active: true,
      order: index + 1,
    })),
  };
}

export function normalizeMetadata(metadata, questions = []) {
  const defaults = deriveDefaultMetadata(questions);
  const input = metadata && typeof metadata === "object" ? metadata : {};
  const lectureMap = new Map();
  [...defaults.lectures, ...((input.lectures || []).map((lecture, index) => ({
    id: String(lecture?.id || slugify(lecture?.name) || `lecture-${index + 1}`),
    name: String(lecture?.name || "").trim(),
    active: lecture?.active !== false,
    order: Number.isFinite(Number(lecture?.order)) ? Number(lecture.order) : index + 1,
  })))].forEach((lecture, index) => {
    const name = String(lecture.name || "").trim();
    if (!name) return;
    const id = String(lecture.id || slugify(name) || `lecture-${index + 1}`).trim();
    if (!lectureMap.has(id)) {
      lectureMap.set(id, {
        id,
        name,
        active: lecture.active !== false,
        order: Number.isFinite(Number(lecture.order)) ? Number(lecture.order) : lectureMap.size + 1,
      });
    }
  });

  const examMap = new Map();
  [...defaults.exams, ...((input.exams || []).map((exam, index) => ({
    id: String(exam?.id || slugify(exam?.label) || `exam-${index + 1}`),
    label: String(exam?.label || "").trim(),
    active: exam?.active !== false,
    order: Number.isFinite(Number(exam?.order)) ? Number(exam.order) : index + 1,
  })))].forEach((exam, index) => {
    const label = String(exam.label || "").trim();
    if (!label) return;
    const id = String(exam.id || slugify(label) || `exam-${index + 1}`).trim();
    if (!examMap.has(id)) {
      examMap.set(id, {
        id,
        label,
        active: exam.active !== false,
        order: Number.isFinite(Number(exam.order)) ? Number(exam.order) : examMap.size + 1,
      });
    }
  });

  return {
    lectures: [...lectureMap.values()].sort((a, b) => Number(a.order) - Number(b.order) || a.name.localeCompare(b.name)),
    exams: [...examMap.values()].sort((a, b) => Number(a.order) - Number(b.order) || a.label.localeCompare(b.label)),
  };
}

export function normalizeSiteConfig(siteConfig) {
  const input = siteConfig && typeof siteConfig === "object" ? siteConfig : {};
  const rawVersion = String(input.offlineVersion || "").trim();
  const rawDisableMode = String(input.offlineDisableMode || "").trim().toLowerCase();
  return {
    offlineEnabled: input.offlineEnabled === true,
    offlineVersion: rawVersion || "v1",
    offlineDisableMode: rawDisableMode === "purge_existing" ? "purge_existing" : "keep_existing",
  };
}

export function validateQuestionsPayload(questions) {
  const errors = [];
  if (!Array.isArray(questions)) {
    errors.push("Payload must be a JSON array.");
    return errors;
  }

  const idCounts = new Map();
  questions.forEach((question) => {
    const id = String(question?.id || "").trim();
    if (id) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
  });

  questions.forEach((question, index) => {
    const prefix = `Question ${index + 1}`;
    if (!question || typeof question !== "object") {
      errors.push(`${prefix}: item must be an object.`);
      return;
    }

    const id = String(question.id || "").trim();
    if (!id) errors.push(`${prefix}: missing id.`);
    if (id && idCounts.get(id) > 1) errors.push(`${prefix}: duplicate id "${id}".`);
    if (!TYPE_OPTIONS.has(String(question.cardType || "").trim())) errors.push(`${prefix}: invalid cardType.`);
    if (!String(question.lecture || "").trim()) errors.push(`${prefix}: lecture is required.`);
    if (!String(question.q || question.stem || "").trim()) errors.push(`${prefix}: question body is required.`);

    if (question.cardType === "MCQ") {
      const choices = Array.isArray(question.choices) ? question.choices.filter((choice) => String(choice || "").trim()) : [];
      if (choices.length < 2) errors.push(`${prefix}: MCQ needs at least 2 choices.`);
      const answer = String(question.ans || "").trim().toUpperCase();
      const answerIndex = answer ? answer.charCodeAt(0) - 65 : -1;
      if (answerIndex < 0 || answerIndex >= choices.length) errors.push(`${prefix}: MCQ answer does not match available choices.`);
    }

    if ((question.cardType === "FLASHCARD" || question.cardType === "SAQ") && !String(question.a || "").trim()) {
      errors.push(`${prefix}: ${question.cardType} answer is required.`);
    }

    if (question.cardType === "OSCE") {
      const parts = Array.isArray(question.subParts) ? question.subParts : [];
      if (!parts.length) errors.push(`${prefix}: OSCE requires at least one subPart.`);
      parts.forEach((part, partIndex) => {
        const choices = Array.isArray(part?.choices) ? part.choices.filter((choice) => String(choice || "").trim()) : [];
        if (choices.length < 2) errors.push(`${prefix}: OSCE part ${partIndex + 1} needs at least 2 choices.`);
        const answer = String(part?.ans || "").trim().toUpperCase();
        const answerIndex = answer ? answer.charCodeAt(0) - 65 : -1;
        if (answerIndex < 0 || answerIndex >= choices.length) errors.push(`${prefix}: OSCE part ${partIndex + 1} answer does not match choices.`);
      });
    }
  });

  return errors;
}

export function validateMetadataPayload(metadata) {
  const normalized = normalizeMetadata(metadata);
  const errors = [];
  const lectureIds = new Set();
  const lectureNames = new Set();
  const examIds = new Set();
  const examLabels = new Set();

  normalized.lectures.forEach((lecture, index) => {
    const prefix = `Lecture ${index + 1}`;
    if (!lecture.id) errors.push(`${prefix}: missing id.`);
    if (!lecture.name) errors.push(`${prefix}: missing name.`);
    if (lectureIds.has(lecture.id)) errors.push(`${prefix}: duplicate lecture id "${lecture.id}".`);
    if (lectureNames.has(lecture.name.toLowerCase())) errors.push(`${prefix}: duplicate lecture name "${lecture.name}".`);
    lectureIds.add(lecture.id);
    lectureNames.add(lecture.name.toLowerCase());
  });

  normalized.exams.forEach((exam, index) => {
    const prefix = `Exam ${index + 1}`;
    if (!exam.id) errors.push(`${prefix}: missing id.`);
    if (!exam.label) errors.push(`${prefix}: missing label.`);
    if (examIds.has(exam.id)) errors.push(`${prefix}: duplicate exam id "${exam.id}".`);
    if (examLabels.has(exam.label.toLowerCase())) errors.push(`${prefix}: duplicate exam label "${exam.label}".`);
    examIds.add(exam.id);
    examLabels.add(exam.label.toLowerCase());
  });

  return { normalized, errors };
}

export function validateSiteConfigPayload(siteConfig) {
  const normalized = normalizeSiteConfig(siteConfig);
  const errors = [];
  if (!String(normalized.offlineVersion || "").trim()) {
    errors.push("Site config: offline version is required.");
  }
  if (!["keep_existing", "purge_existing"].includes(String(normalized.offlineDisableMode || "").trim())) {
    errors.push("Site config: offline disable mode is invalid.");
  }
  return { normalized, errors };
}

export function computePublicStudyStats(questions = [], metadata = {}) {
  const safeQuestions = Array.isArray(questions) ? JSON.parse(JSON.stringify(questions)) : [];
  const safeMetadata = normalizeMetadata(metadata, safeQuestions);
  const fallbackActive = safeQuestions.filter((question) => question && question.active !== false).length;
  const fallback = {
    playableCount: fallbackActive,
    activeRows: fallbackActive,
    inactiveRows: Math.max(0, safeQuestions.length - fallbackActive),
    rawTotal: safeQuestions.length,
    collapsedCount: 0,
  };

  try {
    const resolverPath = path.resolve(process.cwd(), "..", "js", "question-resolution.js");
    const source = fs.readFileSync(resolverPath, "utf8");
    const context = {
      window: {},
      console: {
        info() {},
        warn() {},
        error() {},
        log() {},
      },
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const initialize = context.window?.initializeQuestionResolution;
    if (typeof initialize !== "function") return fallback;
    const helpers = initialize(safeQuestions, safeMetadata);
    const activeRows = safeQuestions.filter((question) => helpers.questionIsActive(question)).length;
    const playableCount = helpers.getStudyEligibleCards({
      cards: safeQuestions,
      lecture: "all",
      dedupe: true,
    }).length;
    return {
      playableCount,
      activeRows,
      inactiveRows: Math.max(0, safeQuestions.length - activeRows),
      rawTotal: safeQuestions.length,
      collapsedCount: Math.max(0, activeRows - playableCount),
    };
  } catch (error) {
    console.warn("[questions] Falling back to raw admin counts.", error);
    return fallback;
  }
}
