(() => {
  const supportedTypes = new Set(["MCQ", "FLASHCARD", "SAQ"]);
  const ratingMap = { 0: "again", 1: "hard", 2: "good", 3: "easy" };

  const state = {
    initialized: false,
    toastWrap: null,
  };

  function getCurrentCard() {
    if (typeof deck === "undefined" || typeof idx === "undefined") {
      return null;
    }
    return deck[idx] || null;
  }

  function getSupportedCard() {
    const current = getCurrentCard();
    return current && supportedTypes.has(current.cardType) ? current : null;
  }

  function getExamDate() {
    const raw = localStorage.getItem("obg_exam_date");
    return raw ? new Date(raw) : null;
  }

  function getSrsCard(question) {
    const qid = window.SRS_Storage.getQid(question);
    return qid ? window.SRS_Storage.getCard(qid) : null;
  }

  function visualStatus(card) {
    if (!card) return null;
    if (card.status === "new") return "new";
    if (card.status === "learning") return window.SRS_Algorithm.isOverdue(card) ? "due" : "learning";
    if (window.SRS_Algorithm.isOverdue(card)) return "due";
    if (card.status === "mastered") return "mastered";
    return "review";
  }

  function dueLabel(card) {
    if (!card || card.status === "new") return "Ready to learn";
    const days = window.SRS_Algorithm.getDaysUntilDue(card);
    if (days <= 0) {
      if (days < -1) return `Overdue by ${Math.round(Math.abs(days))} days`;
      if (days < -0.04) return `Overdue by ${Math.round(Math.abs(days) * 24)} hours`;
      return "Due now";
    }
    return `Due in ${window.SRS_Algorithm.getIntervalDisplay(days)}`;
  }

  function statusLabel(status) {
    return {
      new: "NEW",
      learning: "LEARNING",
      due: "DUE",
      review: "REVIEW",
      mastered: "MASTERED",
    }[status] || "SRS";
  }

  function statusIcon(status) {
    return {
      new: "N",
      learning: "L",
      due: "!",
      review: "R",
      mastered: "★",
    }[status] || "S";
  }

  function decorateCurrentCard() {
    const question = getSupportedCard();
    if (!question) return;

    const srsCard = getSrsCard(question);
    if (!srsCard) return;

    const status = visualStatus(srsCard);
    const container =
      document.querySelector(".mcq-card, .card-stage, .osce-card") ||
      document.querySelector("#card-stage > *");
    if (!container) return;

    ["srs-card-new", "srs-card-learning", "srs-card-due", "srs-card-review", "srs-card-mastered"].forEach((cls) =>
      container.classList.remove(cls)
    );
    container.classList.add(`srs-card-${status}`);

    document.querySelectorAll(".srs-badge.live-badge").forEach((node) => node.remove());

    const badge = document.createElement("div");
    const light = question.cardType === "MCQ" ? "" : " light";
    badge.className = `srs-badge live-badge ${status}${light}`;
    badge.innerHTML = `
      <span class="srs-badge-status"><span class="srs-badge-dot"></span>${statusIcon(status)} ${statusLabel(status)}</span>
      <span class="srs-badge-meta">${dueLabel(srsCard)}</span>
    `;

    const mount =
      document.querySelector(".mcq-hdr") ||
      document.querySelector(".cf-body") ||
      document.querySelector(".ans-hdr") ||
      container;
    mount.appendChild(badge);
  }

  function toast(message) {
    if (!state.toastWrap) {
      state.toastWrap = document.createElement("div");
      state.toastWrap.className = "srs-toast-wrap";
      document.body.appendChild(state.toastWrap);
    }
    const item = document.createElement("div");
    item.className = "srs-toast";
    item.textContent = message;
    state.toastWrap.appendChild(item);
    setTimeout(() => item.remove(), 2200);
  }

  function clearInjectedRatings() {
    document.querySelectorAll(".srs-rating-container").forEach((node) => node.remove());
  }

  function makePreviewButton(label, rating, preview, suggested) {
    return `
      <button class="srs-btn srs-${ratingMap[rating]}${suggested === rating ? " suggested" : ""}" data-srs-rating="${rating}">
        ${label}
        <span class="srs-interval-preview">${preview}</span>
      </button>
    `;
  }

  function mountRatingButtons(question, suggestedRating) {
    clearInjectedRatings();
    const srsCard = getSrsCard(question);
    if (!srsCard) return;

    const preview = window.SRS_Algorithm.previewIntervals(srsCard, getExamDate());
    const wrap = document.createElement("div");
    wrap.className = "srs-rating-container";
    wrap.innerHTML = `
      <div class="srs-rating-prompt">How well did you know this?</div>
      <div class="srs-rating-buttons">
        ${makePreviewButton("❌ Again", 0, preview.again, suggestedRating)}
        ${makePreviewButton("😐 Hard", 1, preview.hard, suggestedRating)}
        ${makePreviewButton("✅ Good", 2, preview.good, suggestedRating)}
        ${makePreviewButton("🌟 Easy", 3, preview.easy, suggestedRating)}
      </div>
    `;

    const footer = document.querySelector(".mcq-footer") || document.querySelector(".ans-footer");
    if (!footer) return;

    footer.querySelectorAll(".rate-btns").forEach((node) => {
      node.style.display = "none";
    });
    footer.appendChild(wrap);

    wrap.querySelectorAll("[data-srs-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        handleRating(question, Number(button.getAttribute("data-srs-rating")));
      });
    });

    if (question.cardType === "MCQ") {
      const flipButton = document.getElementById("btn-flip");
      if (flipButton) {
        flipButton.disabled = true;
        flipButton.textContent = "Rate Card";
      }
    }
  }

  function legacyOutcome(rating) {
    if (typeof scores !== "undefined") {
      if (rating === 0) scores.again = (scores.again || 0) + 1;
      else if (rating === 3) scores.easy = (scores.easy || 0) + 1;
      else scores.good = (scores.good || 0) + 1;
    }
    if (typeof saveProgress === "function") {
      saveProgress();
    }
  }

  function advanceAfterRating() {
    if (window.SRS_Review && window.SRS_Review.isActive()) {
      window.SRS_Review.advance();
      return;
    }
    if (typeof nextCard === "function") {
      setTimeout(() => nextCard(), 320);
    }
  }

  function handleRating(question, rating) {
    const qid = window.SRS_Storage.getQid(question);
    const card = qid ? window.SRS_Storage.getCard(qid) : null;
    if (!card) return;

    const updated = window.SRS_Algorithm.processRating(card, rating, getExamDate());
    window.SRS_Storage.saveCard(updated);
    legacyOutcome(rating);
    decorateCurrentCard();
    clearInjectedRatings();

    const intervalText = window.SRS_Algorithm.getIntervalDisplay(updated.interval);
    toast(updated.interval === 0 ? "Card reset — you'll see it again soon." : `Next review in ${intervalText}.`);

    if (window.SRS_Review && window.SRS_Review.isActive()) {
      window.SRS_Review.recordRating(question, rating, updated);
    }
    if (window.SRS_Dashboard && window.SRS_Dashboard.isOpen()) {
      window.SRS_Dashboard.render();
    }
    advanceAfterRating();
  }

  function showRatingButtons(question, suggestedRating) {
    if (!question || !supportedTypes.has(question.cardType)) return;
    mountRatingButtons(question, suggestedRating);
  }

  function interceptKeys(event) {
    const active = document.querySelector(".srs-rating-container");
    if (!active) return;
    const question = getSupportedCard();
    if (!question) return;

    const rating = { "1": 0, "2": 1, "3": 2, "4": 3 }[event.key];
    if (typeof rating === "number") {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleRating(question, rating);
    }
  }

  function patchRender() {
    const original = window.renderCard;
    if (typeof original !== "function") return;
    window.renderCard = function patchedRenderCard() {
      original.apply(this, arguments);
      decorateCurrentCard();
      if (window.SRS_Review && window.SRS_Review.isActive()) {
        window.SRS_Review.syncBanner();
      }
    };
  }

  function patchPick() {
    const original = window.pick;
    if (typeof original !== "function") return;
    window.pick = function patchedPick() {
      original.apply(this, arguments);
      const question = getSupportedCard();
      if (!question || question.cardType !== "MCQ") return;
      const chosen = arguments[1];
      const correct = arguments[2];
      showRatingButtons(question, chosen === correct ? 2 : 0);
    };
  }

  function patchFlip() {
    const original = window.flipCard;
    if (typeof original !== "function") return;
    window.flipCard = function patchedFlipCard() {
      original.apply(this, arguments);
      const question = getSupportedCard();
      if (!question || question.cardType === "MCQ") return;
      const flip = document.getElementById("cflip");
      if (flip && flip.classList.contains("flipped")) showRatingButtons(question, 2);
      else clearInjectedRatings();
    };
  }

  function injectToolbarButtons() {
    const actions = document.querySelector(".deck-actions");
    if (!actions || actions.querySelector(".srs-toolbar")) return;

    const group = document.createElement("div");
    group.className = "srs-toolbar";
    group.innerHTML = `
      <button class="btn srs-btn-nav" type="button">🔄 Start Review</button>
      <button class="btn srs-btn-dash" type="button">📊 SRS Dashboard</button>
    `;
    actions.appendChild(group);
    group.querySelector(".srs-btn-nav").addEventListener("click", () => window.SRS_Review.openLauncher());
    group.querySelector(".srs-btn-dash").addEventListener("click", () => window.SRS_Dashboard.open());
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    window.SRS_Storage.init(window.ALL_CARDS || []);
    patchRender();
    patchPick();
    patchFlip();
    injectToolbarButtons();
    document.addEventListener("keydown", interceptKeys, true);
    decorateCurrentCard();
  }

  window.SRS_UI = {
    init,
    toast,
    showRatingButtons,
    decorateCurrentCard,
    getCurrentCard,
  };
})();
