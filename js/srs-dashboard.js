(() => {
  const dashboardState = { open: false, lecture: "all" };
  const DASHBOARD_LECTURE_KEY = "obg_dashboard_lecture";

  function normalizeLecture(lecture) {
    const helper = window.OBG_QB_Utils && window.OBG_QB_Utils.normalizeLectureFilter;
    return helper ? helper(lecture) : (lecture || "all");
  }

  function selectedLecture() {
    return normalizeLecture(
      dashboardState.lecture ||
      localStorage.getItem(DASHBOARD_LECTURE_KEY) ||
      "all"
    );
  }

  function persistLecture(lecture) {
    dashboardState.lecture = normalizeLecture(lecture);
    try {
      localStorage.setItem(DASHBOARD_LECTURE_KEY, dashboardState.lecture);
    } catch (error) {
      console.warn("Unable to persist dashboard lecture filter.", error);
    }
  }

  function lectureOptions() {
    return [...new Set(supportedQuestions().map((card) => card.lecture).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }

  function examDateValue() {
    return localStorage.getItem("obg_exam_date") || "";
  }

  function supportedQuestions() {
    const cards = (window.ALL_CARDS || []).filter((card) => ["MCQ", "FLASHCARD", "SAQ"].includes(card.cardType));
    const helper = window.OBG_QB_Utils && window.OBG_QB_Utils.getStudyEligibleCards;
    return helper ? helper({ cards, lecture: "all", dedupe: false }) : cards;
  }

  function inLecture(card, lecture) {
    if (!lecture || lecture === "all") return true;
    const lectures = Array.isArray(card.lectures) && card.lectures.length ? card.lectures : [card.lecture];
    return lectures.map((item) => String(item)).includes(String(lecture));
  }

  function questionByQid(qid) {
    const helper = window.OBG_QB_Utils && window.OBG_QB_Utils.getRepresentativeForCanonical;
    if (helper) return helper(qid, selectedLecture()) || helper(qid, "all") || null;
    return supportedQuestions().find((card) => window.SRS_Storage.getQid(card) === qid) || null;
  }

  function ensureOverlay() {
    if (document.getElementById("srs-dashboard-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "srs-dashboard-overlay";
    overlay.className = "srs-overlay";
    overlay.innerHTML = `
      <div class="srs-panel">
        <div class="srs-panel-header">
          <div>
            <div class="srs-panel-title">SRS Dashboard</div>
            <div class="srs-panel-subtitle">Compressed spaced repetition for MCQ, Flash, and SAQ cards.</div>
          </div>
          <button class="srs-panel-close" type="button" data-close-dashboard>×</button>
        </div>
        <div id="srs-dashboard-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector("[data-close-dashboard]").addEventListener("click", close);
  }

  function open() {
    ensureOverlay();
    dashboardState.open = true;
    document.getElementById("srs-dashboard-overlay").classList.add("visible");
    render();
  }

  function close() {
    const overlay = document.getElementById("srs-dashboard-overlay");
    if (overlay) overlay.classList.remove("visible");
    dashboardState.open = false;
  }

  function isOpen() {
    return dashboardState.open;
  }

  function streak(activity) {
    let count = 0;
    for (let i = activity.length - 1; i >= 0; i -= 1) {
      if (activity[i].count > 0) count += 1;
      else break;
    }
    return count;
  }

  function examCountdownText() {
    const raw = examDateValue();
    if (!raw) return "No exam date set yet.";
    const exam = new Date(raw);
    const diff = Math.ceil((exam.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (diff < 0) return "Exam date has passed.";
    if (diff <= 3) return `Exam in ${diff} day${diff === 1 ? "" : "s"} • cram mode is active.`;
    return `Exam in ${diff} day${diff === 1 ? "" : "s"}.`;
  }

  function reviewForecast(daysAhead, lecture = "all") {
    const target = new Date();
    target.setDate(target.getDate() + daysAhead);
    return window.SRS_Storage
      .getAllCards()
      .filter((card) => ["MCQ", "FLASHCARD", "SAQ"].includes(card.cardType))
      .filter((card) => inLecture(card, lecture))
      .filter((card) => card.nextReviewDate)
      .filter((card) => new Date(card.nextReviewDate).toDateString() === target.toDateString()).length;
  }

  function repeatEstimate(stats) {
    const raw = examDateValue();
    if (!raw) return "Set an exam date to estimate your remaining review cycles.";
    const exam = new Date(raw);
    const diffDays = Math.max(1, Math.ceil((exam.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const duePerDay = Math.max(1, stats.due + stats.learning + 10);
    const projected = ((duePerDay * diffDays) / Math.max(1, stats.total)).toFixed(1);
    return `At this pace, you'll cycle through the active deck about ${projected} times before the exam.`;
  }

  function renderOverview(stats) {
    return `
      <div class="srs-overview-grid">
        <div class="srs-overview-card"><div class="num">${stats.new}</div><div class="lbl">New</div></div>
        <div class="srs-overview-card"><div class="num">${stats.learning}</div><div class="lbl">Learning</div></div>
        <div class="srs-overview-card"><div class="num">${stats.due}</div><div class="lbl">Due</div></div>
        <div class="srs-overview-card"><div class="num">${stats.review}</div><div class="lbl">Review</div></div>
        <div class="srs-overview-card"><div class="num">${stats.mastered}</div><div class="lbl">Mastered</div></div>
      </div>
    `;
  }

  function renderResumeBanner() {
    const raw = localStorage.getItem("obg_progress_v1");
    if (!raw) return "";
    try {
      const d = JSON.parse(raw);
      if (!d.idx || d.idx < 1) return "";
      const lecture = d.filterState && typeof d.filterState === "object" ? d.filterState.lecture : d.activeLec;
      const lec = lecture ? `in ${lecture}` : "across all lectures";
      return `
        <div class="srs-resume-banner">
          <span>You were at card ${d.idx + 1} ${lec}</span>
          <button class="srs-review-btn" type="button" id="srs-resume-btn">Resume</button>
        </div>
      `;
    } catch (error) {
      return "";
    }
  }

  function renderLectureRows() {
    const rows = window.SRS_Storage.getStatsByLecture();
    return rows
      .map((row, index) => {
        const cls = row.due >= 5 ? "row-hot" : row.mastered >= Math.max(1, row.total * 0.6) ? "row-calm" : "";
        const dueLabel = row.due > 0 ? ` (${row.due} due)` : "";
        return `
          <tr class="${cls}">
            <td>${index + 1}</td>
            <td>${row.lecture}</td>
            <td>${row.new}</td>
            <td>${row.learning}</td>
            <td>${row.due}</td>
            <td>${row.mastered}</td>
            <td>${row.total}</td>
            <td><button class="srs-review-btn ${row.due > 0 ? "" : "srs-file-btn"}" type="button" data-review-lecture="${String(row.lecture).replace(/"/g, "&quot;")}">Review${dueLabel}</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderHeatmap() {
    const activity = window.SRS_Storage.getActivity(21);
    const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return activity.map((entry) => {
      const level = Math.min(4, entry.count);
      const colors = ["#f8fafc", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8"];
      const dow = days[new Date(entry.date + "T12:00:00").getDay()];
      return `
        <div class="srs-heatday" style="background:${colors[level]};border-color:${level ? "#7dd3fc" : "#e5e7eb"}">
          <strong>${entry.count}</strong>
          <span>${dow}</span>
          <span style="font-size:.6rem;opacity:.7">${entry.date.slice(5)}</span>
        </div>
      `;
    }).join("");
  }

  function renderStorageBar(storage) {
    const totalKB = storage.totalBytes / 1024;
    const limitKB = 5120;
    const pct = Math.min(100, (totalKB / limitKB) * 100).toFixed(1);
    const warn = pct > 70 ? "color:#b45309;font-weight:600" : "color:#475569";
    return `
      <div class="srs-empty" style="${warn}">
        Storage: ${totalKB.toFixed(1)} KB used of ~5,120 KB
        (${pct}%) - SRS: ${(storage.srsBytes / 1024).toFixed(1)} KB
        ${pct > 70 ? " Consider exporting a backup." : ""}
      </div>
    `;
  }

  function renderForecast() {
    const lecture = selectedLecture();
    const counts = [
      { label: "Tomorrow", count: reviewForecast(1, lecture) },
      { label: "In 3 days", count: reviewForecast(3, lecture) },
      { label: "In 7 days", count: reviewForecast(7, lecture) },
    ];
    const max = Math.max(1, ...counts.map((row) => row.count));
    return counts
      .map(
        (row) => `
          <div class="srs-forecast-row">
            <span>${row.label}</span>
            <div class="srs-forecast-bar"><div class="srs-forecast-fill" style="width:${(row.count / max) * 100}%"></div></div>
            <strong>${row.count}</strong>
          </div>
        `
      )
      .join("");
  }

  function hardestList(mode, lecture = "all") {
    const cards = window.SRS_Storage
      .getAllCards()
      .filter((card) => ["MCQ", "FLASHCARD", "SAQ"].includes(card.cardType))
      .filter((card) => inLecture(card, lecture))
      .filter((card) => (mode === "ease" ? card.totalAttempts > 0 : card.wrongCount > 0))
      .sort((a, b) => {
        if (mode === "ease") {
          if ((a.easeFactor || 2.5) !== (b.easeFactor || 2.5)) {
            return (a.easeFactor || 2.5) - (b.easeFactor || 2.5);
          }
          return (b.wrongCount || 0) - (a.wrongCount || 0);
        }
        return (b.wrongCount || 0) - (a.wrongCount || 0);
      })
      .slice(0, 10);

    if (!cards.length) return `<div class="srs-empty">No data yet.</div>`;

    return `
      <div class="srs-list">
        ${cards
          .map((card) => {
            const question = questionByQid(card.qid);
            if (!question || (lecture !== "all" && !inLecture(question, lecture))) return "";
            const metric = mode === "ease" ? `Ease ${card.easeFactor.toFixed(2)}` : `${card.wrongCount} misses`;
            const questionText = question.q || "";
            const stem = questionText.slice(0, 120);
            return `
              <button class="srs-list-item" type="button" data-open-qid="${card.qid}">
                <div class="meta">${question.lecture} • ${metric}</div>
                <div class="stem">${stem}${questionText.length > 120 ? "..." : ""}</div>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function goToQuestion(qid) {
    const question = questionByQid(qid);
    if (!question) return;
    close();
    if (typeof goToCard === "function") {
      goToCard(question.id);
    }
  }

  function bindEvents() {
    const content = document.getElementById("srs-dashboard-content");
    if (!content) return;

    content.querySelectorAll("[data-review-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.getAttribute("data-review-mode");
        close();
        window.SRS_Review.startSession({
          lecture: selectedLecture(),
          mode,
          maxCards: 30,
          examDate: examDateValue(),
        });
      });
    });

    content.querySelector("#srs-dashboard-lecture")?.addEventListener("change", (event) => {
      persistLecture(event.target.value || "all");
      render();
    });

    content.querySelectorAll("[data-review-lecture]").forEach((button) => {
      button.addEventListener("click", () => {
        close();
        window.SRS_Review.startSession({
          lecture: button.getAttribute("data-review-lecture"),
          mode: "smart",
          maxCards: 30,
          examDate: examDateValue(),
        });
      });
    });

    content.querySelector("#srs-exam-date")?.addEventListener("change", (event) => {
      const value = event.target.value;
      if (value) localStorage.setItem("obg_exam_date", value);
      else localStorage.removeItem("obg_exam_date");
      render();
    });

    content.querySelector("#srs-export-btn")?.addEventListener("click", () => window.SRS_Storage.exportData());
    content.querySelector("#srs-reset-btn")?.addEventListener("click", () => {
      const first = confirm("Reset all SRS progress?");
      if (!first) return;
      const second = confirm("This will erase your SRS schedule and streak data. Continue?");
      if (!second) return;
      window.SRS_Storage.resetAll(true);
      render();
      window.SRS_UI.decorateCurrentCard();
    });

    content.querySelector("#srs-import-file")?.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const text = await file.text();
      window.SRS_Storage.importData(text);
      render();
      window.SRS_UI.decorateCurrentCard();
    });

    content.querySelector("#srs-resume-btn")?.addEventListener("click", () => {
      close();
    });

    content.querySelectorAll("[data-open-qid]").forEach((button) => {
      button.addEventListener("click", () => goToQuestion(button.getAttribute("data-open-qid")));
    });
  }

  function render() {
    ensureOverlay();
    const content = document.getElementById("srs-dashboard-content");
    if (!content) return;

    const lecture = selectedLecture();
    const stats = window.SRS_Storage.getStats(lecture === "all" ? undefined : lecture);
    const activity = window.SRS_Storage.getActivity(21);
    const storage = window.SRS_Storage.getStorageUsage();
    const streakCount = streak(activity);
    const lectureSelect = `<select class="srs-select" id="srs-dashboard-lecture"><option value="all">All lectures</option>${lectureOptions()
      .map((item) => `<option value="${String(item).replace(/"/g, "&quot;")}" ${String(item) === lecture ? "selected" : ""}>${item}</option>`)
      .join("")}</select>`;

    content.innerHTML = `
      ${renderResumeBanner()}
      ${renderOverview(stats)}
      <div class="srs-dashboard-grid">
        <div>
          <div class="srs-section">
            <h3>Today's Actions</h3>
            <div class="srs-inline-form" style="margin-bottom:10px">${lectureSelect}</div>
            <p style="margin-bottom:10px;color:#334155;font-size:.83rem">You have ${stats.due} cards due and ${stats.new} new cards waiting for ${lecture === "all" ? "all lectures" : lecture}.</p>
            <div class="srs-action-row" style="margin-bottom:8px">
              <button class="srs-review-btn" type="button" data-review-mode="smart">Start Review</button>
              <button class="srs-file-btn" type="button" data-review-mode="due">Due Only</button>
              <button class="srs-file-btn" type="button" data-review-mode="new">New Only</button>
              <button class="srs-file-btn" type="button" data-review-mode="weakest">Weakest</button>
            </div>
            <div class="srs-empty">${repeatEstimate(stats)}</div>
          </div>

          <div class="srs-section">
            <h3>Per Lecture</h3>
            <table class="srs-table">
              <thead>
                <tr>
                  <th>#</th><th>Lecture</th><th>New</th><th>Learning</th><th>Due</th><th>Mastered</th><th>Total</th><th>Action</th>
                </tr>
              </thead>
              <tbody>${renderLectureRows()}</tbody>
            </table>
          </div>

          <div class="srs-section">
            <h3>Difficulty Analysis</h3>
            <div class="srs-dashboard-grid" style="grid-template-columns:1fr 1fr;gap:14px">
              <div>
                <div class="srs-panel-subtitle" style="margin-bottom:8px">Lowest ease factor</div>
                ${hardestList("ease", lecture)}
              </div>
              <div>
                <div class="srs-panel-subtitle" style="margin-bottom:8px">Most failed</div>
                ${hardestList("wrong", lecture)}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="srs-section">
            <h3>Exam Countdown</h3>
            <div class="srs-inline-form" style="margin-bottom:10px">
              <input class="srs-input" id="srs-exam-date" type="date" value="${examDateValue()}">
              <button class="srs-file-btn" type="button" data-review-mode="cram">Cram Mode</button>
            </div>
            <div style="font-size:.84rem;color:#334155;margin-bottom:6px">${examCountdownText()}</div>
            <div class="srs-empty">${window.SRS_Algorithm.isCramMode(examDateValue()) ? "All review intervals are now clamped to 12 hours." : "Set the date early so the compressed schedule can warn you before cram mode."}</div>
          </div>

          <div class="srs-section">
            <h3>Study Streak</h3>
            <div style="font-size:.84rem;color:#334155;margin-bottom:10px">${streakCount}-day streak</div>
            <div class="srs-heatmap">${renderHeatmap()}</div>
          </div>

          <div class="srs-section">
            <h3>Forecast</h3>
            ${renderForecast()}
          </div>

          <div class="srs-section">
            <h3>Data Management</h3>
            <div class="srs-mini-actions" style="margin-bottom:10px">
              <button class="srs-file-btn" type="button" id="srs-export-btn">Export Backup</button>
              <label class="srs-file-btn" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
                Import Backup
                <input id="srs-import-file" type="file" accept=".json,application/json" hidden>
              </label>
              <button class="srs-file-btn" type="button" id="srs-reset-btn">Reset All Progress</button>
            </div>
            ${renderStorageBar(storage)}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function init() {
    ensureOverlay();
  }

  window.SRS_Dashboard = { init, open, close, render, isOpen };
})();
