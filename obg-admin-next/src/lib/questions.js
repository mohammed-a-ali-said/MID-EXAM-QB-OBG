const TYPE_OPTIONS = new Set(["MCQ", "FLASHCARD", "SAQ", "OSCE"]);

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
