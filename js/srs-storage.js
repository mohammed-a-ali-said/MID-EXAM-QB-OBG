(() => {
  const STORAGE_KEY = "obg_srs_data";
  const PROGRESS_KEY = "obg_progress_v1";
  const SUPPORTED_TYPES = new Set(["MCQ", "FLASHCARD", "SAQ"]);
  const resolutionHelpers = window.questionResolutionHelpers || window.OBG_QB_Utils || {
    questionIsActive: (question) => question && question.active !== false,
  };

  const state = {
    cards: {},
    meta: {
      generatedIds: {},
      activity: {},
    },
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function todayKey(date = new Date()) {
    return new Date(date).toISOString().slice(0, 10);
  }

  function safeParse(raw) {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("SRS storage parse failed, falling back to empty state.", error);
      return null;
    }
  }

  function normalizeState(raw) {
    const next = raw && typeof raw === "object" ? raw : {};
    const cards = next.cards && typeof next.cards === "object" ? next.cards : {};
    const meta = next.meta && typeof next.meta === "object" ? next.meta : {};
    return {
      cards,
      meta: {
        generatedIds: meta.generatedIds && typeof meta.generatedIds === "object" ? meta.generatedIds : {},
        activity: meta.activity && typeof meta.activity === "object" ? meta.activity : {},
      },
    };
  }

  function readStorage() {
    return normalizeState(safeParse(localStorage.getItem(STORAGE_KEY)));
  }

  function writeStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn("Unable to save SRS data to localStorage.", error);
      if (typeof alert === "function") {
        alert("SRS progress could not be saved. Your browser storage may be full.");
      }
      return false;
    }
  }

  function isSupported(question) {
    return question && SUPPORTED_TYPES.has(question.cardType);
  }

  function makeGeneratedId(question, index) {
    const lecture = String(question.lecture || "General")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 18) || "General";
    const exam = String(question.exam || "deck").toLowerCase();
    return `${exam}_${lecture}_${String(index + 1).padStart(4, "0")}`;
  }

  function ensureUniqueQid(baseQid, usedQids) {
    let qid = baseQid;
    let counter = 2;
    while (usedQids.has(qid)) {
      qid = `${baseQid}_${counter}`;
      counter += 1;
    }
    usedQids.add(qid);
    return qid;
  }

  function buildCard(question, qid) {
    const lectures = Array.isArray(question._associatedLectures) && question._associatedLectures.length
      ? [...new Set(question._associatedLectures)]
      : [question.lecture || "Unassigned"];
    return {
      qid,
      lecture: question.lecture || "Unassigned",
      lectures,
      exam: question.exam || "",
      cardType: question.cardType,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      learningStep: 0,
      nextReviewDate: null,
      lastReviewDate: null,
      totalAttempts: 0,
      correctCount: 0,
      wrongCount: 0,
      status: "new",
    };
  }

  function mergeCard(existing, incoming) {
    return {
      ...existing,
      ...incoming,
      qid: existing.qid || incoming.qid,
    };
  }

  function dueComparator(a, b) {
    const aTime = a.nextReviewDate ? new Date(a.nextReviewDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.nextReviewDate ? new Date(b.nextReviewDate).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }

  function inLecture(card, lectureFilter) {
    if (!lectureFilter || lectureFilter === "all") {
      return true;
    }
    const lectures = Array.isArray(card.lectures) && card.lectures.length ? card.lectures : [card.lecture];
    return lectures.map((lecture) => String(lecture)).includes(String(lectureFilter));
  }

  function isDue(card, now = new Date()) {
    if (!card || !card.nextReviewDate) {
      return card && card.status === "new";
    }
    return new Date(card.nextReviewDate).getTime() <= now.getTime();
  }

  function recordActivity(delta) {
    if (!delta || delta < 1) {
      return;
    }
    const key = todayKey();
    const current = Number(state.meta.activity[key] || 0);
    state.meta.activity[key] = current + delta;
  }

  const SRS_Storage = {
    STORAGE_KEY,
    PROGRESS_KEY,
    SUPPORTED_TYPES: Array.from(SUPPORTED_TYPES),

    init(cards = window.ALL_CARDS || []) {
      const stored = readStorage();
      state.cards = stored.cards;
      state.meta = stored.meta;

      const usedQids = new Set();
      cards.forEach((question, index) => {
        if (!isSupported(question) || question.unresolvedStub || !resolutionHelpers.questionIsActive(question)) {
          return;
        }
        const fallbackKey = question.id || `auto_${index}`;
        const preferredQid =
          question._canonicalQid ||
          (question.id && state.cards[question.id] && question.id) ||
          state.meta.generatedIds[fallbackKey] ||
          question.id ||
          makeGeneratedId(question, index);
        const shouldAliasCanonical = !!question._canonicalQid;
        const qid = shouldAliasCanonical || !usedQids.has(preferredQid)
          ? preferredQid
          : ensureUniqueQid(preferredQid, usedQids);
        if (!shouldAliasCanonical) usedQids.add(qid);
        if (!question.id || shouldAliasCanonical) {
          state.meta.generatedIds[fallbackKey] = qid;
        }
        question._srsQid = qid;
        if (!state.cards[qid]) {
          state.cards[qid] = buildCard(question, qid);
        } else {
          const mergedLectures = [...new Set([...(state.cards[qid].lectures || [state.cards[qid].lecture]), ...(question._associatedLectures || [question.lecture])].filter(Boolean))];
          state.cards[qid] = {
            ...state.cards[qid],
            qid,
            lecture: state.cards[qid].lecture || question.lecture || "Unassigned",
            lectures: mergedLectures,
            exam: question.exam || state.cards[qid].exam || "",
            cardType: question.cardType || state.cards[qid].cardType,
          };
        }
      });

      writeStorage();
      return this.getAllCards();
    },

    getQid(question, index = 0) {
      if (!question) {
        return null;
      }
      if (question._srsQid) {
        return question._srsQid;
      }
      if (question._canonicalQid) {
        question._srsQid = question._canonicalQid;
        return question._canonicalQid;
      }
      if (question.id && state.cards[question.id]) {
        question._srsQid = question.id;
        return question.id;
      }
      const fallbackKey = question.id || `auto_${index}`;
      const generated = state.meta.generatedIds[fallbackKey];
      if (generated) {
        question._srsQid = generated;
        return generated;
      }
      return question.id || null;
    },

    getCard(qid) {
      const card = state.cards[qid];
      return card ? deepClone(card) : null;
    },

    saveCard(card) {
      if (!card || !card.qid) {
        return false;
      }
      const previous = state.cards[card.qid];
      const next = previous ? mergeCard(previous, card) : deepClone(card);
      const attemptDelta = Math.max(0, Number(next.totalAttempts || 0) - Number(previous?.totalAttempts || 0));
      state.cards[card.qid] = next;
      if (attemptDelta) {
        recordActivity(attemptDelta);
      }
      return writeStorage();
    },

    getAllCards() {
      return Object.values(state.cards).map(deepClone);
    },

    getDueCards(lectureFilter) {
      const now = new Date();
      return this.getAllCards()
        .filter((card) => inLecture(card, lectureFilter))
        .filter((card) => card.status !== "new" && card.nextReviewDate && isDue(card, now))
        .sort(dueComparator);
    },

    getNewCards(lectureFilter, limit) {
      const cards = this.getAllCards()
        .filter((card) => inLecture(card, lectureFilter))
        .filter((card) => card.status === "new");
      if (typeof limit === "number" && limit >= 0) {
        return cards.slice(0, limit);
      }
      return cards;
    },

    getStats(lectureFilter) {
      const cards = this.getAllCards().filter((card) => inLecture(card, lectureFilter));
      const now = new Date();
      const stats = {
        new: 0,
        learning: 0,
        due: 0,
        review: 0,
        mastered: 0,
        total: cards.length,
      };

      cards.forEach((card) => {
        if (card.status === "new") {
          stats.new += 1;
        } else if (card.status === "learning") {
          stats.learning += 1;
        } else if (card.status === "mastered") {
          stats.mastered += 1;
        } else {
          stats.review += 1;
        }
        if (card.status !== "new" && card.nextReviewDate && isDue(card, now)) {
          stats.due += 1;
        }
      });

      return stats;
    },

    getStatsByLecture() {
      const lectures = [...new Set(this.getAllCards().flatMap((card) => card.lectures && card.lectures.length ? card.lectures : [card.lecture]))].sort((a, b) =>
        String(a).localeCompare(String(b))
      );
      return lectures.map((lecture) => ({
        lecture,
        ...this.getStats(lecture),
      }));
    },

    exportData() {
      const payload = JSON.stringify(state, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `obg_srs_backup_${stamp}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return payload;
    },

    importData(jsonString) {
      const parsed = normalizeState(safeParse(jsonString));
      Object.entries(parsed.cards).forEach(([qid, card]) => {
        if (!qid) {
          return;
        }
        state.cards[qid] = state.cards[qid] ? mergeCard(state.cards[qid], card) : card;
      });
      state.meta.generatedIds = {
        ...state.meta.generatedIds,
        ...parsed.meta.generatedIds,
      };
      Object.entries(parsed.meta.activity).forEach(([key, count]) => {
        const current = Number(state.meta.activity[key] || 0);
        state.meta.activity[key] = Math.max(current, Number(count || 0));
      });
      writeStorage();
      return this.getAllCards();
    },

    resetCard(qid) {
      if (!state.cards[qid]) {
        return false;
      }
      state.cards[qid] = {
        ...state.cards[qid],
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        learningStep: 0,
        nextReviewDate: null,
        lastReviewDate: null,
        totalAttempts: 0,
        correctCount: 0,
        wrongCount: 0,
        status: "new",
      };
      return writeStorage();
    },

    resetAll(force = false) {
      if (!force && typeof confirm === "function" && !confirm("Reset all SRS progress?")) {
        return false;
      }
      state.cards = {};
      state.meta = { generatedIds: {}, activity: {} };
      localStorage.removeItem(STORAGE_KEY);
      this.init(window.ALL_CARDS || []);
      return true;
    },

    getActivity(days = 21) {
      const rows = [];
      for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = todayKey(date);
        rows.push({ date: key, count: Number(state.meta.activity[key] || 0) });
      }
      return rows;
    },

    getStorageUsage() {
      const srsBytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
      const progressBytes = new Blob([localStorage.getItem(PROGRESS_KEY) || ""]).size;
      return {
        srsBytes,
        progressBytes,
        totalBytes: srsBytes + progressBytes,
      };
    },
  };

  window.SRS_Storage = SRS_Storage;
})();
