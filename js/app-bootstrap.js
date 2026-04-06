(function () {
  const DATA_URL = "./data/questions.json";
  const METADATA_URL = "./data/content-metadata.json";
  const APP_URL = "./js/app.js?v=20260406b";
  const CSS_VERSION = "20260406b";

  const srsStylesheet = document.querySelector('link[href*="./css/srs.css"], link[href*="css/srs.css"]');
  if (srsStylesheet) {
    const cleanHref = (srsStylesheet.getAttribute("href") || "./css/srs.css").split("?")[0];
    srsStylesheet.setAttribute("href", `${cleanHref}?v=${CSS_VERSION}`);
  }

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

  async function loadJson(url, fallback = null) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      if (fallback !== null) return fallback;
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buffer);
    return JSON.parse(text);
  }

  function deriveMetadata(cards) {
    const lectureNames = [...new Set((cards || []).map((card) => String(card?.lecture || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const exams = [...new Set((cards || []).map((card) => String(card?.exam || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      lectures: lectureNames.map((name, index) => ({
        id: `lecture-${index + 1}`,
        name,
        active: true,
        order: index + 1,
      })),
      exams: (exams.length ? exams : ["mid"]).map((label, index) => ({
        id: `exam-${index + 1}`,
        label,
        active: true,
        order: index + 1,
      })),
    };
  }

  async function boot() {
    try {
      setStageStatus("Loading question bank...", "Preparing the study deck and restoring your tools.");
      const [cards, metadataPayload] = await Promise.all([
        loadJson(DATA_URL),
        loadJson(METADATA_URL, null).catch(() => null),
      ]);
      if (!Array.isArray(cards)) {
        throw new Error("Question bank payload is not a JSON array.");
      }
      if (!cards.every((card) => card && typeof card === "object" && typeof card.id === "string")) {
        throw new Error("Question bank payload contains malformed cards.");
      }
      window.ALL_CARDS = cards;
      window.OBG_CONTENT_METADATA = metadataPayload && typeof metadataPayload === "object"
        ? metadataPayload
        : deriveMetadata(cards);
      if (typeof window.initializeQuestionResolution === "function") {
        window.initializeQuestionResolution(window.ALL_CARDS, window.OBG_CONTENT_METADATA);
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
