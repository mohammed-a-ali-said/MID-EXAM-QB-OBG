(function(){
  window.initializeQuestionResolution = function initializeQuestionResolution(cards){
    const ALL_CARDS = Array.isArray(cards) ? cards : [];
    const questionResolutionHelpers = (() => {
      const lectureNames = [...new Set(ALL_CARDS.map((card) => card.lecture).filter(Boolean))];
      const unresolved = [];
      const resolved = [];
      const report = {
        totalCards: ALL_CARDS.length,
        stubsDetected: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
        unresolved: unresolved,
        resolved: resolved,
      };
    
      const lectureAliasMap = {
        anc: "Antenatal Care (ANC)",
        diagnosis: "Diagnosis of Pregnancy",
        aph: "Antepartum Hemorrhage (APH)",
        heg: "Hyperemesis Gravidarum (HEG)",
        vte: "VTE, UTI & Thyroid",
        uti: "VTE, UTI & Thyroid",
        thyroid: "VTE, UTI & Thyroid",
        pph: "Postpartum Hemorrhage",
      };
    
      function uniqueStrings(values) {
        return [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
      }
    
      function stripEntities(value) {
        return String(value || "")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
      }
    
      function cleanWhitespace(value) {
        return stripEntities(value)
          .replace(/[★↔]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    
      function normalizeText(value) {
        return cleanWhitespace(value)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    
      function parseQuestionNumber(value) {
        const match = String(value || "").match(/Q\s*(\d+(?:\.\d+)?)/i);
        return match ? match[1] : "";
      }
    
      function questionStem(question) {
        return String(question?.q || question?.stem || "");
      }

      function questionIsActive(question) {
        return !!question && question.active !== false;
      }

      function normalizeLectureName(name) {
        const raw = cleanWhitespace(name);
        if (!raw) return "";
        const normalized = normalizeText(raw.replace(/^also in[:\s-]*/i, "").replace(/^lecture\s*/i, "lecture "));
        if (!normalized) return "";
        if (lectureAliasMap[normalized]) return lectureAliasMap[normalized];
        const exact = lectureNames.find((lecture) => normalizeText(lecture) === normalized);
        if (exact) return exact;
        const alias = Object.entries(lectureAliasMap).find(([key]) => normalized === key || normalized.startsWith(`${key} `));
        if (alias) return alias[1];
        const byContainment = lectureNames.find((lecture) => {
          const lectureNorm = normalizeText(lecture);
          return lectureNorm.includes(normalized) || normalized.includes(lectureNorm);
        });
        if (byContainment) return byContainment;
        const tokenMatch = lectureNames.find((lecture) => {
          const lectureNorm = normalizeText(lecture);
          const tokens = normalized.split(" ").filter((token) => token.length > 2);
          return tokens.length && tokens.every((token) => lectureNorm.includes(token));
        });
        return tokenMatch || "";
      }
    
      function parseAlsoInLectures(text) {
        const lectures = [];
        const raw = stripEntities(text);
        const pattern = /also in:\s*([^★↔\n\r]+)/gi;
        let match;
        while ((match = pattern.exec(raw))) {
          const lecture = normalizeLectureName(match[1].split("—")[0].split("-")[0]);
          if (lecture) lectures.push(lecture);
        }
        return uniqueStrings(lectures);
      }
    
      function parseReferenceTargets(text) {
        const raw = stripEntities(text);
        const targets = [];
        const patterns = [
          /(?:see|refer to|same as|duplicate of)\s+([A-Za-z][A-Za-z&(),/\-\s]+?)\s+Q(?:uestion\s*)?(\d+(?:\.\d+)?)/gi,
          /(?:see|refer to|same as|duplicate of)\s+Lecture\s*(\d+)\s+Q(?:uestion\s*)?(\d+(?:\.\d+)?)/gi,
        ];
        patterns.forEach((pattern) => {
          let match;
          while ((match = pattern.exec(raw))) {
            const lectureRaw = match[1];
            const lecture = normalizeLectureName(lectureRaw);
            targets.push({
              lectureRaw: cleanWhitespace(lectureRaw),
              lecture: lecture || cleanWhitespace(lectureRaw),
              questionNumber: match[2],
            });
          }
        });
        return targets;
      }
    
      function stripInlineMetadata(text) {
        let output = stripEntities(text);
        output = output.replace(/\s*[★*]\s*REPEATED\b/gi, "");
        output = output.replace(/\s*[↔]\s*ALSO IN:\s*.+$/i, "");
        output = output.replace(/\s{2,}/g, " ");
        return output.trim();
      }
    
      function deriveQuestionMeta(question) {
        const rawStem = questionStem(question);
        const tagText = (question.tags || []).map((tag) => String(tag.txt || "")).join(" ");
        const combined = `${rawStem} ${tagText}`.trim();
        const repeated = /\brepeated\b/i.test(combined);
        const alsoInLectures = uniqueStrings([
          ...parseAlsoInLectures(rawStem),
          ...parseAlsoInLectures(tagText),
        ]);
        return {
          repeated,
          alsoInLectures,
          referenceTargets: parseReferenceTargets(rawStem),
          strippedStem: stripInlineMetadata(rawStem),
        };
      }
    
      function isReferenceStub(question) {
        const text = cleanWhitespace(questionStem(question));
        if (!text) return false;
        if (/^\[same patient as q\d+/i.test(text)) return false;
        if (/repeated first trimester abortions/i.test(text)) return false;
        const hasReferenceVerb = /\b(see|refer to|same as|duplicate of)\b/i.test(text);
        const hasQuestionRef = /\bq\d+(?:\.\d+)?\b/i.test(text) || /\blecture\s*\d+\s*q\d+/i.test(text);
        if (!hasReferenceVerb || !hasQuestionRef) return false;
        const stripped = stripInlineMetadata(text)
          .replace(/\b(see|refer to|same as|duplicate of)\b.*$/i, "")
          .replace(/[-—:]\s*$/, "")
          .trim();
        const wordCount = stripped ? stripped.split(/\s+/).length : 0;
        const hasChoices = Array.isArray(question.choices) && question.choices.length > 0;
        const contentfulStem = /(\?|:)/.test(stripped) || wordCount >= 10 || stripped.length >= 85;
        if (!hasChoices && wordCount <= 10) return true;
        return !contentfulStem && wordCount <= 8;
      }
    
      function buildQuestionIndex(allQuestions) {
        const byId = new Map();
        const byLectureNumber = new Map();
        const byStemSignature = new Map();
        const byMcqSignature = new Map();
    
        function store(map, key, question) {
          if (!key) return;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(question);
        }
    
        allQuestions.forEach((question) => {
          byId.set(question.id, question);
          const lecture = normalizeLectureName(question.lecture || "");
          const questionNumber = parseQuestionNumber(question.num);
          const lectureKey = lecture && questionNumber ? `${normalizeText(lecture)}::${questionNumber}` : "";
          store(byLectureNumber, lectureKey, question);
          store(byStemSignature, question._stemSignature, question);
          store(byMcqSignature, question._mcqSignature, question);
        });
    
        return { byId, byLectureNumber, byStemSignature, byMcqSignature };
      }
    
      function normalizeChoiceList(choices) {
        return (choices || []).map((choice) => normalizeText(choice)).join("|");
      }
    
      function signatureStem(question) {
        return normalizeText(stripInlineMetadata(questionStem(question)));
      }
    
      function signatureMcq(question) {
        if (question.cardType !== "MCQ") return "";
        return [signatureStem(question), normalizeChoiceList(question.choices), String(question.ans || "").trim()].join("::");
      }
    
      ALL_CARDS.forEach((question) => {
        const meta = deriveQuestionMeta(question);
        question.active = question.active !== false;
        question._questionNumber = parseQuestionNumber(question.num);
        question._metaRepeated = meta.repeated || (Array.isArray(question.alsoInLectures) && question.alsoInLectures.length > 0);
        question._metaAlsoInLectures = meta.alsoInLectures;
        question.referenceTargets = meta.referenceTargets;
        question.isStub = isReferenceStub(question);
        question.resolvedFromStub = false;
        question.unresolvedStub = false;
        question.canonicalSourceId = question.id;
        question.canonicalQid = question.id;
        question._canonicalQid = question.id;
        question.primaryLecture = question.lecture || "";
        question.displayStem = meta.strippedStem || questionStem(question);
        question.displayChoices = Array.isArray(question.choices) ? question.choices.slice() : [];
        question.displayAnswer = question.cardType === "MCQ" ? question.ans : (question.a || "");
        question.displayTags = [];
        question._stemSignature = signatureStem(question);
        question._mcqSignature = signatureMcq(question);
        question._associatedLectures = uniqueStrings([
          question.lecture,
          ...meta.alsoInLectures,
          ...(Array.isArray(question.alsoInLectures) ? question.alsoInLectures : []),
        ]);
      });
    
      function chooseBestCandidate(candidates) {
        return (candidates || [])
          .filter(Boolean)
          .filter((candidate) => questionIsActive(candidate))
          .filter((candidate) => !candidate.isStub || candidate.resolvedFromStub)
          .sort((left, right) => {
            const leftScore = Number(questionIsActive(left)) * 10 + Number(!left.isStub) + Number(!!left.choices?.length) + Number(!!left.a || !!left.ans);
            const rightScore = Number(questionIsActive(right)) * 10 + Number(!right.isStub) + Number(!!right.choices?.length) + Number(!!right.a || !!right.ans);
            if (leftScore !== rightScore) return rightScore - leftScore;
            return String(left.id).localeCompare(String(right.id));
          })[0] || null;
      }
    
      const questionIndex = buildQuestionIndex(ALL_CARDS);
    
      function resolveQuestionBody(question, allQuestions, index, seen = new Set()) {
        if (!question?.isStub) return question;
        if (seen.has(question.id)) return null;
        seen.add(question.id);
    
        const targets = question.referenceTargets || parseReferenceTargets(questionStem(question));
        for (const target of targets) {
          const lecture = normalizeLectureName(target.lecture || target.lectureRaw || "");
          const lectureKey = lecture && target.questionNumber ? `${normalizeText(lecture)}::${target.questionNumber}` : "";
          let candidates = lectureKey ? (index.byLectureNumber.get(lectureKey) || []) : [];
          let match = chooseBestCandidate(candidates);
          if (!match && target.lectureRaw) {
            const relaxedLecture = normalizeLectureName(target.lectureRaw);
            const relaxedKey = relaxedLecture && target.questionNumber ? `${normalizeText(relaxedLecture)}::${target.questionNumber}` : "";
            candidates = relaxedKey ? (index.byLectureNumber.get(relaxedKey) || []) : [];
            match = chooseBestCandidate(candidates);
          }
          if (match?.isStub && !match.resolvedFromStub) {
            match = resolveQuestionBody(match, allQuestions, index, seen);
          }
          if (match && match.id !== question.id) {
            question.resolvedFromStub = true;
            question.unresolvedStub = false;
            question.canonicalSourceId = match.canonicalSourceId || match.id;
            question.canonicalQid = question.canonicalSourceId;
            question._canonicalQid = question.canonicalSourceId;
            question.primaryLecture = match.primaryLecture || match.lecture || "";
            question.displayStem = match.displayStem || stripInlineMetadata(questionStem(match));
            question.displayChoices = Array.isArray(match.displayChoices) ? match.displayChoices.slice() : (match.choices || []).slice();
            question.displayAnswer = match.displayAnswer || (match.cardType === "MCQ" ? match.ans : (match.a || ""));
            question._associatedLectures = uniqueStrings([
              question.lecture,
              ...(question._metaAlsoInLectures || []),
              ...(match._associatedLectures || [match.lecture]),
            ]);
            resolved.push({
              id: question.id,
              canonicalSourceId: question.canonicalSourceId,
              reference: questionStem(question),
            });
            return match;
          }
        }
    
        const titleHint = normalizeText(
          stripInlineMetadata(questionStem(question))
            .replace(/\b(see|refer to|same as|duplicate of)\b.*$/i, "")
            .trim()
        );
        if (titleHint) {
          const fallback = allQuestions.find((candidate) => {
            if (!candidate || candidate.id === question.id || candidate.unresolvedStub || !questionIsActive(candidate)) return false;
            if (candidate.isStub && !candidate.resolvedFromStub) return false;
            const candidateStem = candidate._stemSignature || "";
            if (!candidateStem) return false;
            const sameLectureContext = (question._metaAlsoInLectures || [])
              .concat(targets.map((target) => normalizeLectureName(target.lecture || target.lectureRaw || "")))
              .filter(Boolean);
            const lectureMatch = !sameLectureContext.length || sameLectureContext.some((lecture) => (candidate._associatedLectures || []).includes(lecture) || candidate.lecture === lecture);
            return lectureMatch && (candidateStem.includes(titleHint) || titleHint.includes(candidateStem));
          });
          if (fallback) {
            question.resolvedFromStub = true;
            question.unresolvedStub = false;
            question.canonicalSourceId = fallback.canonicalSourceId || fallback.id;
            question.canonicalQid = question.canonicalSourceId;
            question._canonicalQid = question.canonicalSourceId;
            question.primaryLecture = fallback.primaryLecture || fallback.lecture || "";
            question.displayStem = fallback.displayStem || stripInlineMetadata(questionStem(fallback));
            question.displayChoices = Array.isArray(fallback.displayChoices) ? fallback.displayChoices.slice() : (fallback.choices || []).slice();
            question.displayAnswer = fallback.displayAnswer || (fallback.cardType === "MCQ" ? fallback.ans : (fallback.a || ""));
            question._associatedLectures = uniqueStrings([
              question.lecture,
              ...(question._metaAlsoInLectures || []),
              ...(fallback._associatedLectures || [fallback.lecture]),
            ]);
            resolved.push({
              id: question.id,
              canonicalSourceId: question.canonicalSourceId,
              reference: questionStem(question),
            });
            return fallback;
          }
        }
    
        question.unresolvedStub = true;
        unresolved.push({
          id: question.id,
          lecture: question.lecture,
          num: question.num,
          stem: questionStem(question),
          references: targets,
        });
        return null;
      }
    
      ALL_CARDS.forEach((question) => {
        if (question.isStub) {
          report.stubsDetected += 1;
          resolveQuestionBody(question, ALL_CARDS, questionIndex);
        }
      });
    
      function clusterKey(question) {
        if (question.unresolvedStub) return "";
        if (question.isStub && question.resolvedFromStub) return "";
        if (question.cardType === "MCQ") return question._mcqSignature;
        if (question.cardType === "OSCE") return "";
        return `${question.cardType}::${question._stemSignature}`;
      }
    
      const duplicateGroups = new Map();
      ALL_CARDS.forEach((question) => {
        const key = clusterKey(question);
        if (!key) return;
        if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
        duplicateGroups.get(key).push(question);
      });
    
      duplicateGroups.forEach((group) => {
        if (group.length < 2) return;
        const canonical = group.slice().sort((left, right) => {
          const leftScore = Number(questionIsActive(left)) * 10 + Number(!left.isStub);
          const rightScore = Number(questionIsActive(right)) * 10 + Number(!right.isStub);
          if (leftScore !== rightScore) return rightScore - leftScore;
          return String(left.id).localeCompare(String(right.id));
        })[0];
        const associatedLectures = uniqueStrings(group.flatMap((question) => question._associatedLectures || [question.lecture]));
        group.forEach((question) => {
          question.canonicalSourceId = canonical.canonicalSourceId || canonical.id;
          question.canonicalQid = question.canonicalSourceId;
          question._canonicalQid = question.canonicalSourceId;
          question.primaryLecture = canonical.primaryLecture || canonical.lecture || "";
          question._associatedLectures = uniqueStrings([
            ...(question._associatedLectures || []),
            ...associatedLectures,
          ]);
          if (!question.displayStem) question.displayStem = stripInlineMetadata(questionStem(question));
          if (!question.displayChoices?.length && canonical.displayChoices?.length) question.displayChoices = canonical.displayChoices.slice();
          if (!question.displayAnswer && canonical.displayAnswer) question.displayAnswer = canonical.displayAnswer;
        });
      });
    
      function buildDisplayTags(question) {
        const existing = [];
        const seen = new Set();
        (question.tags || []).forEach((tag) => {
          const txt = cleanWhitespace(tag.txt || "");
          if (!txt || /also in|repeated/i.test(txt)) return;
          const key = `${tag.cls || ""}::${txt}`;
          if (seen.has(key)) return;
          seen.add(key);
          existing.push({ cls: tag.cls || "tag-also", txt });
        });
        if (question._metaRepeated) {
          existing.push({ cls: "tag-repeated", txt: "REPEATED" });
        }
        const alsoInLectures = uniqueStrings(
          (question._associatedLectures || []).filter((lecture) => lecture && lecture !== question.lecture)
        );
        alsoInLectures.forEach((lecture) => {
          const txt = `ALSO IN: ${lecture}`;
          const key = `tag-also::${txt}`;
          if (seen.has(key)) return;
          seen.add(key);
          existing.push({ cls: "tag-also", txt });
        });
        return existing;
      }
    
      ALL_CARDS.forEach((question) => {
        if (!question.displayStem) question.displayStem = stripInlineMetadata(questionStem(question));
        if (!Array.isArray(question.displayChoices)) question.displayChoices = Array.isArray(question.choices) ? question.choices.slice() : [];
        if (!question.displayAnswer) question.displayAnswer = question.cardType === "MCQ" ? question.ans : (question.a || "");
        question.alsoInLectures = uniqueStrings(
          (question._associatedLectures || []).filter((lecture) => lecture && lecture !== question.lecture)
        );
        question.displayTags = buildDisplayTags(question);
      });
    
      report.resolvedCount = resolved.length;
      report.unresolvedCount = unresolved.length;
      window.QuestionResolutionReport = report;
      window.listResolvedStubs = () => resolved.slice();
      window.listUnresolvedStubs = () => unresolved.slice();
      console.info("[QuestionResolution]", {
        totalCards: report.totalCards,
        stubsDetected: report.stubsDetected,
        resolved: report.resolvedCount,
        unresolved: report.unresolvedCount,
      });
    
      function cardHasLectureAssociation(card, lectureFilter) {
        const lecture = normalizeLectureName(lectureFilter);
        if (!lecture || lecture === "all") return true;
        return uniqueStrings([card.lecture, ...(card._associatedLectures || []), ...(card.lectures || [])]).includes(lecture);
      }
    
      function representativeScore(card, lectureFilter) {
        const lecture = normalizeLectureName(lectureFilter);
        const canonical = !!card && (card.canonicalSourceId || card.id) === card.id;
        if (!lecture || lecture === "all") {
          return (canonical ? 100 : 0) + Number(!card.isStub) * 10 + Number(!!card.displayStem);
        }
        return Number(card.lecture === lecture) * 100
          + Number(cardHasLectureAssociation(card, lecture)) * 10
          + Number(canonical) * 5
          + Number(!card.isStub) * 2
          + Number(!!card.displayStem);
      }
    
      function getCanonicalQuestion(question) {
        if (!question) return null;
        return questionIndex.byId.get(question.canonicalSourceId || question.id) || question || null;
      }
    
      function getRepresentativeForCanonical(canonicalId, lectureFilter) {
        const lecture = normalizeLectureName(lectureFilter);
        const candidates = ALL_CARDS.filter((card) => questionIsActive(card) && !card.unresolvedStub && (card.canonicalSourceId || card.id) === canonicalId);
        if (!candidates.length) return null;
        return candidates.slice().sort((a, b) => representativeScore(b, lecture) - representativeScore(a, lecture))[0] || null;
      }
    
      function getStudyEligibleCards(options = {}) {
        const cards = Array.isArray(options.cards) ? options.cards.slice() : ALL_CARDS.slice();
        const lecture = normalizeLectureName(options.lecture || "all") || "all";
        const dedupe = options.dedupe !== false;
        const filtered = cards
          .filter((card) => questionIsActive(card))
          .filter((card) => !card.unresolvedStub)
          .filter((card) => cardHasLectureAssociation(card, lecture));
        if (!dedupe) return filtered;
        const chosen = new Map();
        filtered.forEach((card) => {
          const canonicalId = card.canonicalSourceId || card.id;
          const existing = chosen.get(canonicalId);
          if (!existing) {
            chosen.set(canonicalId, card);
            return;
          }
          const existingScore = representativeScore(existing, lecture);
          const candidateScore = representativeScore(card, lecture);
          if (candidateScore > existingScore) chosen.set(canonicalId, card);
        });
        return filtered.filter((card) => chosen.get(card.canonicalSourceId || card.id) === card);
      }
    
      return {
        isReferenceStub,
        parseReferenceTargets,
        normalizeLectureName,
        buildQuestionIndex,
        resolveQuestionBody: (question, allQuestions, index) => resolveQuestionBody(question, allQuestions, index || questionIndex),
        getCanonicalQuestion,
        getStudyEligibleCards,
        getRepresentativeForCanonical,
        cardHasLectureAssociation,
        questionIsActive,
        lectureNames: lectureNames.slice(),
      };
    })();
    
    window.questionResolutionHelpers = questionResolutionHelpers;
    return questionResolutionHelpers;
  };
})();
