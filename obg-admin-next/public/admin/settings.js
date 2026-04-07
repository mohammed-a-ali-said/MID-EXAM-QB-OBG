(function () {
  const DATA_URL = "/api/questions";
  const THEME_KEY = "obg-admin-theme";

  const state = {
    questions: [],
    metadata: { lectures: [], exams: [] },
    siteConfig: { offlineEnabled: false, offlineVersion: "v1", offlineDisableMode: "keep_existing" },
    sha: "",
    metadataSha: "",
    siteConfigSha: "",
    saving: false,
    theme: "light",
  };

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeSiteConfig(siteConfig) {
    const input = siteConfig && typeof siteConfig === "object" ? siteConfig : {};
    const rawVersion = String(input.offlineVersion || "").trim();
    const rawDisableMode = String(input.offlineDisableMode || "").trim().toLowerCase();
    return {
      offlineEnabled: input.offlineEnabled === true,
      offlineVersion: rawVersion || "v1",
      offlineDisableMode: rawDisableMode === "purge_existing" ? "purge_existing" : "keep_existing",
    };
  }

  function readThemePreference() {
    try {
      return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      return "light";
    }
  }

  function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    state.theme = nextTheme;
    document.body.classList.toggle("admin-theme-dark", nextTheme === "dark");
    if (els.themeToggleBtn) {
      els.themeToggleBtn.textContent = nextTheme === "dark" ? "Light mode" : "Dark mode";
    }
    try {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.warn("Failed to persist admin theme preference.", error);
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  }

  function setStatus(message, tone) {
    if (!els.saveStatus) return;
    els.saveStatus.textContent = message;
    els.saveStatus.className = `settings-status${tone ? ` ${tone}` : ""}`;
  }

  function setSaving(nextSaving) {
    state.saving = !!nextSaving;
    const label = state.saving ? "Saving..." : "Save to GitHub";
    [els.saveBtn, els.saveBottomBtn].forEach((button) => {
      if (!button) return;
      button.disabled = state.saving;
      button.textContent = label;
    });
  }

  function renderSettings() {
    const config = normalizeSiteConfig(state.siteConfig);
    state.siteConfig = config;
    if (els.offlineEnabled) els.offlineEnabled.checked = config.offlineEnabled;
    if (els.offlineVersion) els.offlineVersion.value = config.offlineVersion;
    if (els.offlineDisableModes.length) {
      els.offlineDisableModes.forEach((input) => {
        input.checked = input.value === config.offlineDisableMode;
        input.disabled = config.offlineEnabled;
      });
    }
    if (els.settingsStatus) {
      els.settingsStatus.textContent = config.offlineEnabled
        ? `Offline mode is enabled for students. Current offline pack version: ${config.offlineVersion}.`
        : "Offline mode is off.";
    }
  }

  async function loadData() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/";
      throw new Error("Session expired. Please sign in again.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Failed to load website settings (${response.status}).`);
    }
    const payload = await response.json();
    state.questions = Array.isArray(payload?.questions) ? payload.questions : [];
    state.metadata = payload?.metadata || { lectures: [], exams: [] };
    state.siteConfig = normalizeSiteConfig(payload?.siteConfig);
    state.sha = String(payload?.sha || "");
    state.metadataSha = String(payload?.metadataSha || "");
    state.siteConfigSha = String(payload?.siteConfigSha || "");
    renderSettings();
  }

  async function saveSettings() {
    try {
      setSaving(true);
      setStatus("Saving website settings to GitHub...", "progress");
      const response = await fetch(DATA_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: state.questions,
          metadata: state.metadata,
          siteConfig: normalizeSiteConfig(state.siteConfig),
          sha: state.sha,
          metadataSha: state.metadataSha,
          siteConfigSha: state.siteConfigSha,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || payload?.errors?.join(" | ") || `Save failed (${response.status}).`);
      }
      const payload = await response.json();
      state.sha = String(payload?.sha || state.sha);
      state.metadataSha = String(payload?.metadataSha || state.metadataSha);
      state.siteConfigSha = String(payload?.siteConfigSha || state.siteConfigSha);
      state.siteConfig = normalizeSiteConfig(payload?.siteConfig || state.siteConfig);
      renderSettings();
      setStatus("Website settings saved to GitHub.", "ok");
    } catch (error) {
      setStatus(error.message || "Failed to save website settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  function bindEvents() {
    if (els.themeToggleBtn) els.themeToggleBtn.addEventListener("click", toggleTheme);
    if (els.offlineEnabled) els.offlineEnabled.addEventListener("change", () => {
      state.siteConfig.offlineEnabled = els.offlineEnabled.checked;
      if (state.siteConfig.offlineEnabled) {
        state.siteConfig.offlineDisableMode = "keep_existing";
      }
      renderSettings();
      setStatus(`Offline mode ${state.siteConfig.offlineEnabled ? "enabled" : "disabled"} in this draft.`, "ok");
    });
    if (els.offlineVersion) els.offlineVersion.addEventListener("input", () => {
      state.siteConfig.offlineVersion = String(els.offlineVersion.value || "").trim() || "v1";
      renderSettings();
    });
    els.offlineDisableModes.forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        state.siteConfig.offlineDisableMode = input.value === "purge_existing" ? "purge_existing" : "keep_existing";
        renderSettings();
        setStatus(`Offline disable behavior set to ${state.siteConfig.offlineDisableMode === "purge_existing" ? "remove existing downloads" : "keep existing downloads"}.`, "ok");
      });
    });
    if (els.bumpBtn) els.bumpBtn.addEventListener("click", () => {
      const current = String(state.siteConfig.offlineVersion || "v1").trim();
      const match = current.match(/^(.*?)(\d+)$/);
      state.siteConfig.offlineVersion = match ? `${match[1]}${Number(match[2]) + 1}` : `${current}-2`;
      renderSettings();
      setStatus(`Offline version bumped to ${state.siteConfig.offlineVersion}.`, "ok");
    });
    [els.saveBtn, els.saveBottomBtn].forEach((button) => {
      if (button) button.addEventListener("click", saveSettings);
    });
  }

  function cacheElements() {
    els.themeToggleBtn = byId("settings-theme-toggle-btn");
    els.saveBtn = byId("settings-save-btn");
    els.saveBottomBtn = byId("settings-save-bottom-btn");
    els.offlineEnabled = byId("site-offline-enabled");
    els.offlineVersion = byId("site-offline-version");
    els.bumpBtn = byId("bump-offline-version-btn");
    els.offlineDisableModes = Array.from(document.querySelectorAll('input[name="site-offline-disable-mode"]'));
    els.settingsStatus = byId("site-settings-status");
    els.saveStatus = byId("settings-save-status");
  }

  async function init() {
    cacheElements();
    applyTheme(readThemePreference());
    bindEvents();
    try {
      setStatus("Loading website settings...", "progress");
      await loadData();
      setStatus("Website settings loaded.", "ok");
    } catch (error) {
      setStatus(error.message || "Failed to load website settings.", "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
