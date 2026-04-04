(function () {
  const DATA_URL = "./data/questions.json";
  const APP_URL = "./js/app.js";

  function setStageStatus(title, detail, tone) {
    const stage = document.getElementById("card-stage");
    const deckTitle = document.getElementById("deck-title");
    const deckMeta = document.getElementById("deck-meta");
    if (deckTitle) deckTitle.textContent = title;
    if (deckMeta) deckMeta.textContent = detail || "";
    if (!stage) return;
    const toneClass = tone ? ` app-status-${tone}` : "";
    stage.innerHTML = `
      <div class="app-status-card${toneClass}">
        <div class="app-status-title">${title}</div>
        <div class="app-status-copy">${detail || ""}</div>
      </div>
    `;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadQuestions() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Question bank request failed (${response.status})`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Question bank payload is not a JSON array.");
    }
    if (!payload.every((card) => card && typeof card === "object" && typeof card.id === "string")) {
      throw new Error("Question bank payload contains malformed cards.");
    }
    return payload;
  }

  async function boot() {
    try {
      setStageStatus("Loading question bank...", "Preparing the study deck and restoring your tools.");
      const cards = await loadQuestions();
      window.ALL_CARDS = cards;
      if (typeof window.initializeQuestionResolution === "function") {
        window.initializeQuestionResolution(window.ALL_CARDS);
      }
      await loadScript(APP_URL);
      if (window.SRS_Review) window.SRS_Review.init();
      if (window.SRS_Dashboard) window.SRS_Dashboard.init();
      if (window.SRS_UI) window.SRS_UI.init();
    } catch (error) {
      console.error("[OBG bootstrap] Failed to initialize app", error);
      setStageStatus(
        "Unable to load the question bank",
        "Make sure you are using a local server or static host and that ./data/questions.json is available.",
        "error"
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
