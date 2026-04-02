(() => {
  const reviewState = {
    active: false,
    queue: [],
    currentIndex: 0,
    startTime: null,
    results: { again: 0, hard: 0, good: 0, easy: 0 },
    snapshot: null,
    options: null,
    launcherOpen: false,
  };

  function supportedCardMap() {
    return new Map(
      (window.ALL_CARDS || [])
        .filter((card) => ["MCQ", "FLASHCARD", "SAQ"].includes(card.cardType))
        .map((card) => [window.SRS_Storage.getQid(card), card])
    );
  }

  function getAllSupportedQuestions(lecture) {
    return (window.ALL_CARDS || [])
      .filter((card) => ["MCQ", "FLASHCARD", "SAQ"].includes(card.cardType))
      .filter((card) => !lecture || lecture === "all" || card.lecture === lecture);
  }

  function isDueToday(card) {
    if (!card.nextReviewDate) return false;
    const due = new Date(card.nextReviewDate);
    const now = new Date();
    return due.toDateString() === now.toDateString() && due.getTime() > now.getTime();
  }

  function weakestCards(cards) {
    return cards.slice().sort((a, b) => {
      const aAttempts = Math.max(1, a.totalAttempts || 0);
      const bAttempts = Math.max(1, b.totalAttempts || 0);
      const aRatio = (a.correctCount || 0) / aAttempts;
      const bRatio = (b.correctCount || 0) / bAttempts;
      if (aRatio !== bRatio) return aRatio - bRatio;
      return (a.easeFactor || 2.5) - (b.easeFactor || 2.5);
    });
  }

  function uniquePush(queue, qid) {
    if (qid && !queue.includes(qid)) queue.push(qid);
  }

  function buildQueue(options) {
    const lecture = options.lecture && options.lecture !== "all" ? options.lecture : null;
    const supported = getAllSupportedQuestions(lecture);
    const allCards = supported
      .map((question) => window.SRS_Storage.getCard(window.SRS_Storage.getQid(question)))
      .filter(Boolean);
    const due = window.SRS_Storage.getDueCards(lecture);
    const dueToday = allCards.filter((card) => card.status !== "new" && !window.SRS_Algorithm.isOverdue(card) && isDueToday(card));
    const againCards = allCards.filter((card) => card.interval === 0 && card.status === "learning");
    const newCards = window.SRS_Storage.getNewCards(lecture, options.mode === "smart" ? 10 : options.maxCards);

    if (options.mode === "due") {
      return [...due, ...dueToday].map((card) => card.qid).filter(Boolean).slice(0, options.maxCards);
    }
    if (options.mode === "new") {
      return newCards.map((card) => card.qid).slice(0, options.maxCards);
    }
    if (options.mode === "weakest") {
      return weakestCards(allCards).map((card) => card.qid).slice(0, options.maxCards);
    }
    if (options.mode === "cram") {
      return weakestCards(
        allCards.slice().sort((a, b) => {
          const aWrong = a.wrongCount || 0;
          const bWrong = b.wrongCount || 0;
          if (aWrong !== bWrong) return bWrong - aWrong;
          const aDue = window.SRS_Algorithm.isOverdue(a) ? -1 : 0;
          const bDue = window.SRS_Algorithm.isOverdue(b) ? -1 : 0;
          if (aDue !== bDue) return aDue - bDue;
          return (a.easeFactor || 2.5) - (b.easeFactor || 2.5);
        })
      ).map((card) => card.qid).slice(0, options.maxCards);
    }

    const queue = [];
    [...due, ...dueToday, ...againCards].forEach((card) => uniquePush(queue, card.qid));
    newCards.forEach((card) => uniquePush(queue, card.qid));
    return queue.slice(0, options.maxCards);
  }

  function ensureMounts() {
    if (!document.getElementById("srs-review-launcher")) {
      const launcher = document.createElement("div");
      launcher.id = "srs-review-launcher";
      launcher.className = "srs-overlay";
      launcher.innerHTML = `
        <div class="srs-panel">
          <div class="srs-panel-header">
            <div>
              <div class="srs-panel-title">Start SRS Review</div>
              <div class="srs-panel-subtitle">Build a focused queue from due, new, weak, or cram cards.</div>
            </div>
            <button class="srs-panel-close" type="button" data-close-review-launcher>×</button>
          </div>
          <div class="srs-inline-form" style="margin-bottom:12px">
            <select class="srs-select" id="srs-launch-mode">
              <option value="smart">Smart</option>
              <option value="due">Due only</option>
              <option value="new">New only</option>
              <option value="weakest">Weakest</option>
              <option value="cram">Cram</option>
            </select>
            <select class="srs-select" id="srs-launch-lecture"></select>
            <input class="srs-input" id="srs-launch-max" type="number" min="5" max="200" step="5" value="30">
            <button class="srs-review-btn" type="button" id="srs-launch-start">▶ Start</button>
          </div>
          <div class="srs-empty">Smart mode pulls overdue cards first, then due-today, reset cards, and up to 10 new cards.</div>
        </div>
      `;
      document.body.appendChild(launcher);
      launcher.addEventListener("click", (event) => {
        if (event.target === launcher) closeLauncher();
      });
      launcher.querySelector("[data-close-review-launcher]").addEventListener("click", closeLauncher);
      launcher.querySelector("#srs-launch-start").addEventListener("click", () => {
        startSession({
          lecture: launcher.querySelector("#srs-launch-lecture").value || "all",
          mode: launcher.querySelector("#srs-launch-mode").value || "smart",
          maxCards: Number(launcher.querySelector("#srs-launch-max").value || 30),
          examDate: localStorage.getItem("obg_exam_date"),
        });
        closeLauncher();
      });
    }

    if (!document.getElementById("srs-session-summary")) {
      const overlay = document.createElement("div");
      overlay.id = "srs-session-summary";
      overlay.className = "srs-overlay";
      overlay.innerHTML = `
        <div class="srs-panel srs-session-complete">
          <button class="srs-panel-close" type="button" data-close-summary style="float:right">×</button>
          <div class="big">🎉 Session Complete</div>
          <div id="srs-summary-sub" class="srs-panel-subtitle"></div>
          <div class="srs-session-stats" id="srs-summary-stats"></div>
          <div class="srs-action-row" style="justify-content:center">
            <button class="srs-review-btn" type="button" id="srs-summary-again">Review Again</button>
            <button class="srs-file-btn" type="button" id="srs-summary-dashboard">Open Dashboard</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) overlay.classList.remove("visible");
      });
      overlay.querySelector("[data-close-summary]").addEventListener("click", () => overlay.classList.remove("visible"));
      overlay.querySelector("#srs-summary-dashboard").addEventListener("click", () => {
        overlay.classList.remove("visible");
        window.SRS_Dashboard.open();
      });
      overlay.querySelector("#srs-summary-again").addEventListener("click", () => {
        overlay.classList.remove("visible");
        if (reviewState.options) startSession(reviewState.options);
      });
    }

    if (!document.getElementById("srs-session-banner")) {
      const banner = document.createElement("div");
      banner.id = "srs-session-banner";
      banner.className = "srs-session-banner";
      banner.innerHTML = `
        <div class="srs-session-top">
          <div>
            <div class="srs-session-title" id="srs-session-title">SRS Review</div>
            <div class="srs-session-meta" id="srs-session-meta"></div>
          </div>
          <div class="srs-action-row">
            <button class="srs-file-btn" type="button" id="srs-session-exit">Exit Review</button>
          </div>
        </div>
        <div class="srs-session-bar"><div class="srs-session-fill" id="srs-session-fill"></div></div>
      `;
      const anchor = document.querySelector(".deck-info");
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(banner, anchor);
      }
      banner.querySelector("#srs-session-exit").addEventListener("click", restoreSnapshot);
    }
  }

  function populateLectureSelect() {
    const select = document.getElementById("srs-launch-lecture");
    if (!select) return;
    const lectures = [...new Set(getAllSupportedQuestions().map((card) => card.lecture))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    select.innerHTML = `<option value="all">All lectures</option>${lectures
      .map((lecture) => `<option value="${String(lecture).replace(/"/g, "&quot;")}">${lecture}</option>`)
      .join("")}`;
  }

  function captureSnapshot() {
    return {
      deck: deck.slice(),
      idx,
      flipped,
      reviewed,
      scores: { ...scores },
      mcqRes: { ...mcqRes },
      activeFilter,
      activeSrc,
      activeType,
      activeLec,
      activeLecType,
      title: document.getElementById("deck-title")?.textContent || "",
      meta: document.getElementById("deck-meta")?.innerHTML || "",
    };
  }

  function applySessionDeck(queue) {
    const cardLookup = supportedCardMap();
    deck = queue.map((qid) => cardLookup.get(qid)).filter(Boolean);
    idx = 0;
    flipped = false;
    reviewed = 0;
    scores = { again: 0, good: 0, easy: 0 };
    mcqRes = { correct: 0, wrong: 0 };
    activeFilter = "all";
    activeSrc = "";
    activeType = "";
    activeLec = null;
    activeLecType = "all";
    if (typeof renderCard === "function") renderCard();
    if (typeof updateNav === "function") updateNav();
    if (typeof updateStats === "function") updateStats();
    if (typeof updateProgress === "function") updateProgress();
  }

  function syncBanner() {
    const banner = document.getElementById("srs-session-banner");
    if (!banner) return;
    banner.classList.toggle("visible", reviewState.active);
    if (!reviewState.active) return;
    const total = Math.max(1, reviewState.queue.length);
    const current = Math.min(total, idx + 1);
    const fill = ((current - 1) / total) * 100;
    document.getElementById("srs-session-title").textContent = `SRS Review • ${reviewState.options.mode}`;
    const elapsedMin = Math.max(1, Math.round((Date.now() - reviewState.startTime) / 60000));
    document.getElementById("srs-session-meta").innerHTML = `
      <span>${current}/${total}</span>
      <span>${elapsedMin} min</span>
      <span>${reviewState.options.lecture === "all" ? "All lectures" : reviewState.options.lecture}</span>
    `;
    document.getElementById("srs-session-fill").style.width = `${fill}%`;
  }

  function restoreSnapshot() {
    if (!reviewState.snapshot) {
      reviewState.active = false;
      syncBanner();
      return;
    }
    const snap = reviewState.snapshot;
    deck = snap.deck;
    idx = snap.idx;
    flipped = snap.flipped;
    reviewed = snap.reviewed;
    scores = snap.scores;
    mcqRes = snap.mcqRes;
    activeFilter = snap.activeFilter;
    activeSrc = snap.activeSrc;
    activeType = snap.activeType;
    activeLec = snap.activeLec;
    activeLecType = snap.activeLecType;
    const title = document.getElementById("deck-title");
    const meta = document.getElementById("deck-meta");
    if (title) title.textContent = snap.title;
    if (meta) meta.innerHTML = snap.meta;
    reviewState.active = false;
    reviewState.queue = [];
    if (typeof renderCard === "function") renderCard();
    if (typeof updateNav === "function") updateNav();
    if (typeof updateStats === "function") updateStats();
    if (typeof updateProgress === "function") updateProgress();
    syncBanner();
  }

  function showSummary() {
    const overlay = document.getElementById("srs-session-summary");
    if (!overlay) return;
    const total = Object.values(reviewState.results).reduce((sum, count) => sum + count, 0);
    const elapsedMin = Math.max(1, Math.round((Date.now() - reviewState.startTime) / 60000));
    const accuracyBase = reviewState.results.good + reviewState.results.easy + reviewState.results.hard;
    const accuracy = total ? Math.round((accuracyBase / total) * 100) : 0;
    document.getElementById("srs-summary-sub").textContent = `${total} cards reviewed in ${elapsedMin} minutes • Accuracy ${accuracy}%`;
    document.getElementById("srs-summary-stats").innerHTML = `
      <div class="tile"><strong>${reviewState.results.again}</strong><span>Again</span></div>
      <div class="tile"><strong>${reviewState.results.hard}</strong><span>Hard</span></div>
      <div class="tile"><strong>${reviewState.results.good}</strong><span>Good</span></div>
      <div class="tile"><strong>${reviewState.results.easy}</strong><span>Easy</span></div>
      <div class="tile"><strong>${elapsedMin}</strong><span>Minutes</span></div>
      <div class="tile"><strong>${reviewState.queue.length}</strong><span>Total queue</span></div>
    `;
    overlay.classList.add("visible");
  }

  function startSession(options = {}) {
    ensureMounts();
    populateLectureSelect();
    const normalized = {
      lecture: options.lecture || "all",
      mode: options.mode || "smart",
      maxCards: Math.max(5, Number(options.maxCards || 30)),
      examDate: options.examDate || localStorage.getItem("obg_exam_date"),
    };
    const queue = buildQueue(normalized);
    if (!queue.length) {
      window.SRS_UI.toast("No cards matched this SRS review queue.");
      return;
    }
    reviewState.snapshot = captureSnapshot();
    reviewState.active = true;
    reviewState.queue = queue.slice();
    reviewState.currentIndex = 0;
    reviewState.startTime = Date.now();
    reviewState.results = { again: 0, hard: 0, good: 0, easy: 0 };
    reviewState.options = normalized;
    applySessionDeck(queue);
    syncBanner();
  }

  function openLauncher() {
    ensureMounts();
    populateLectureSelect();
    document.getElementById("srs-review-launcher").classList.add("visible");
    reviewState.launcherOpen = true;
  }

  function closeLauncher() {
    const launcher = document.getElementById("srs-review-launcher");
    if (launcher) launcher.classList.remove("visible");
    reviewState.launcherOpen = false;
  }

  function recordRating(question, rating) {
    const key = ["again", "hard", "good", "easy"][rating];
    reviewState.results[key] += 1;
    if (rating === 0 && question) {
      const qid = window.SRS_Storage.getQid(question);
      if (qid) {
        const insertAt = Math.min(deck.length, idx + 4);
        const duplicate = supportedCardMap().get(qid);
        if (duplicate) {
          deck.splice(insertAt, 0, duplicate);
          reviewState.queue.splice(insertAt, 0, qid);
        }
      }
    }
  }

  function advance() {
    if (!reviewState.active) return;
    if (idx < deck.length - 1) {
      idx += 1;
      flipped = false;
      if (typeof renderCard === "function") renderCard();
      if (typeof updateNav === "function") updateNav();
      if (typeof updateProgress === "function") updateProgress();
      syncBanner();
      return;
    }
    reviewState.active = false;
    syncBanner();
    showSummary();
    restoreSnapshot();
  }

  function isActive() {
    return reviewState.active;
  }

  function init() {
    ensureMounts();
    populateLectureSelect();
  }

  window.SRS_Review = {
    init,
    isActive,
    openLauncher,
    closeLauncher,
    startSession,
    recordRating,
    advance,
    restoreSnapshot,
    syncBanner,
  };
})();
