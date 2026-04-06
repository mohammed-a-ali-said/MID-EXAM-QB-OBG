(() => {
  const MAX_INTERVAL = 7;
  const INITIAL_EASE = 2.5;
  const MIN_EASE = 1.3;
  const GRADUATING_STEPS = [0.007, 0.5, 1];
  const EASY_BONUS = 1.3;
  const MASTERED_THRESHOLD = 7;
  const EXAM_CRAM_DAYS = 3;
  const CRAM_MAX_INTERVAL = 0.5;

  function clone(card) {
    return JSON.parse(JSON.stringify(card));
  }

  function toDate(value) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  function isCramMode(examDate, now = new Date()) {
    const exam = toDate(examDate);
    if (!exam) {
      return false;
    }
    const diffDays = (exam.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays <= EXAM_CRAM_DAYS;
  }

  function effectiveMaxInterval(examDate, now) {
    return isCramMode(examDate, now) ? CRAM_MAX_INTERVAL : MAX_INTERVAL;
  }

  function shortInterval(days) {
    if (days <= 0) {
      return "now";
    }
    if (days < 0.04) {
      return "10 min";
    }
    if (days < 1) {
      return `${Math.round(days * 24)}h`;
    }
    if (Math.abs(days - Math.round(days)) < 0.05) {
      return `${Math.round(days)}d`;
    }
    return `${days.toFixed(1)}d`;
  }

  function longInterval(days) {
    if (days <= 0) {
      return "now";
    }
    if (days < 0.04) {
      return "10 minutes";
    }
    if (days < 1) {
      const hours = Math.round(days * 24);
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    const rounded = Math.round(days * 10) / 10;
    return `${rounded} day${rounded === 1 ? "" : "s"}`;
  }

  function normalizeCard(card) {
    const next = clone(card || {});
    next.easeFactor = Number(next.easeFactor || INITIAL_EASE);
    next.interval = Number(next.interval || 0);
    next.repetitions = Number(next.repetitions || 0);
    next.learningStep = Number(next.learningStep || 0);
    next.totalAttempts = Number(next.totalAttempts || 0);
    next.correctCount = Number(next.correctCount || 0);
    next.wrongCount = Number(next.wrongCount || 0);
    next.status = next.status || "new";
    return next;
  }

  function isLearning(card) {
    return card.status === "new" || card.status === "learning" || Number(card.learningStep || 0) < 2;
  }

  function processRating(card, rating, examDate) {
    const now = new Date();
    const next = normalizeCard(card);
    const cram = isCramMode(examDate, now);
    const learning = isLearning(next);

    if (rating === 0) {
      next.repetitions = 0;
      next.learningStep = 0;
      next.interval = 0;
      next.status = "learning";
      next.easeFactor = Math.max(MIN_EASE, next.easeFactor - 0.2);
      next.wrongCount += 1;
      next.nextReviewDate = now.toISOString();
    } else if (rating === 1) {
      next.correctCount += 1;
      next.repetitions += 1;
      next.easeFactor = Math.max(MIN_EASE, next.easeFactor - 0.15);
      if (learning) {
        const stepIndex = Math.max(0, Math.min(next.learningStep, GRADUATING_STEPS.length - 1));
        next.interval = GRADUATING_STEPS[stepIndex];
        next.status = "learning";
      } else {
        next.interval = Math.max(1, Math.round(next.interval * 1.2));
        next.status = next.interval >= MASTERED_THRESHOLD ? "mastered" : "review";
      }
      next.nextReviewDate = addDays(now, next.interval).toISOString();
    } else if (rating === 2) {
      next.correctCount += 1;
      next.repetitions += 1;
      if (learning) {
        if (next.learningStep <= 0) {
          next.learningStep = 1;
          next.interval = 0.5;
          next.status = "learning";
        } else {
          next.learningStep = 2;
          next.interval = 1;
          next.status = "review";
        }
      } else {
        next.interval = Math.max(1, next.interval * next.easeFactor);
        next.status = "review";
      }
      next.nextReviewDate = addDays(now, next.interval).toISOString();
    } else if (rating === 3) {
      next.correctCount += 1;
      next.repetitions += 1;
      next.easeFactor += 0.15;
      next.learningStep = 2;
      if (learning) {
        next.interval = 2;
        next.status = "review";
      } else {
        next.interval = Math.max(1, next.interval * next.easeFactor * EASY_BONUS);
        next.status = "review";
      }
      next.nextReviewDate = addDays(now, next.interval).toISOString();
    } else {
      return next;
    }

    const maxInterval = effectiveMaxInterval(examDate, now);
    next.interval = Math.max(0, Math.min(next.interval, maxInterval));
    if (cram && next.interval > CRAM_MAX_INTERVAL) {
      next.interval = CRAM_MAX_INTERVAL;
      next.nextReviewDate = addDays(now, next.interval).toISOString();
    }
    next.lastReviewDate = now.toISOString();
    next.totalAttempts += 1;

    if (next.interval >= MASTERED_THRESHOLD && !cram) {
      next.status = "mastered";
    } else if (next.status !== "learning" && next.status !== "new") {
      next.status = "review";
    }

    if (next.interval === 0) {
      next.nextReviewDate = now.toISOString();
    }
    return next;
  }

  function getDaysUntilDue(card) {
    const nextReview = toDate(card && card.nextReviewDate);
    if (!nextReview) {
      return 0;
    }
    return (nextReview.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  }

  function isOverdue(card) {
    return getDaysUntilDue(card) < 0;
  }

  function getNextReviewDate(card) {
    if (!card || !card.nextReviewDate) {
      return "Due now";
    }
    const due = toDate(card.nextReviewDate);
    return due ? due.toLocaleString() : "Due now";
  }

  function previewIntervals(card, examDate) {
    const normalized = normalizeCard(card);
    const result = {};
    [
      ["again", 0],
      ["hard", 1],
      ["good", 2],
      ["easy", 3],
    ].forEach(([label, rating]) => {
      const next = processRating(normalized, rating, examDate);
      result[label] = shortInterval(next.interval);
    });
    return result;
  }

  window.SRS_Algorithm = {
    MAX_INTERVAL,
    INITIAL_EASE,
    MIN_EASE,
    GRADUATING_STEPS,
    EASY_BONUS,
    MASTERED_THRESHOLD,
    EXAM_CRAM_DAYS,
    CRAM_MAX_INTERVAL,
    processRating,
    getNextReviewDate,
    getDaysUntilDue,
    isOverdue,
    getIntervalDisplay: longInterval,
    previewIntervals,
    isCramMode,
    effectiveMaxInterval,
  };
})();
