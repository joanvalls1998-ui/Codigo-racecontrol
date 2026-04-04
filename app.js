window.__racecontrolScriptLoaded = true;

/* =========================================================
   RACE CONTROL · APP.JS NUEVO
   BLOQUE 1 · BASE / ESTADO / HELPERS / STORAGE / BOOT CORE
========================================================= */

const state = {
  standingsCache: null,
  calendarCache: null,
  newsCache: {},
  predictCache: {},
  weekendContext: null,
  lastPredictData: null,
  lastPredictKey: null,

  detectedNextRaceName: null,

  standingsDelta: {
    drivers: {},
    teams: {}
  },

  ui: {
    currentTab: "home",
    standingsViewType: "drivers",
    standingsScope: "top10",
    currentNewsFilterKey: "favorite"
  }
};

/* =========================
   DOM HELPERS
========================= */

function contentEl() {
  return document.getElementById("content");
}

function modalEl() {
  return document.getElementById("detailModal");
}

function modalContentEl() {
  return document.getElementById("detailModalContent");
}

function subtitleEl() {
  return document.getElementById("appSubtitle");
}

function byId(id) {
  return document.getElementById(id);
}

/* =========================
   NAV
========================= */

function setActiveNav(tabId) {
  const ids = ["nav-home", "nav-predict", "nav-favorito", "nav-news", "nav-more"];
  ids.forEach(id => byId(id)?.classList.remove("active"));
  byId(tabId)?.classList.add("active");
}

/* =========================
   DEFAULTS
========================= */

function getDefaultFavorite() {
  return {
    type: "driver",
    name: "Fernando Alonso",
    team: "Aston Martin",
    number: "14",
    points: "0",
    colorClass: "aston",
    image: "https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_1320/content/dam/fom-website/drivers/2025Drivers/alonso",
    pos: "21"
  };
}

function getDefaultSettings() {
  return {
    language: "es-ES",
    autoSelectNextRace: true,
    showCircuitLocalTime: true
  };
}

function getDefaultUiState() {
  return {
    standingsViewType: "drivers",
    standingsScope: "top10",
    currentNewsFilterKey: "favorite"
  };
}

/* =========================
   SAFE HELPERS
========================= */

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function containsAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some(term => normalized.includes(normalizeText(term)));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

/* =========================
   FAVORITE NORMALIZATION
========================= */

function normalizeFavorite(favorite) {
  const fallback = getDefaultFavorite();

  if (!favorite || typeof favorite !== "object") {
    return fallback;
  }

  if (favorite.type !== "driver" && favorite.type !== "team") {
    return fallback;
  }

  if (!favorite.name) {
    return fallback;
  }

  if (favorite.type === "driver") {
    return {
      type: "driver",
      name: favorite.name || fallback.name,
      team: favorite.team || fallback.team,
      number: String(favorite.number ?? fallback.number),
      points: String(favorite.points ?? fallback.points),
      colorClass: favorite.colorClass || fallback.colorClass,
      image: favorite.image || fallback.image,
      pos: String(favorite.pos ?? fallback.pos)
    };
  }

  return {
    type: "team",
    name: favorite.name,
    drivers: favorite.drivers || "",
    points: String(favorite.points ?? "0"),
    colorClass: favorite.colorClass || "aston",
    pos: String(favorite.pos ?? "10")
  };
}

/* =========================
   STORAGE
========================= */

function getSettings() {
  const saved = safeJsonParse(localStorage.getItem("racecontrolSettings"), null);
  return { ...getDefaultSettings(), ...(saved || {}) };
}

function saveSettings(settings) {
  localStorage.setItem(
    "racecontrolSettings",
    JSON.stringify({ ...getDefaultSettings(), ...(settings || {}) })
  );
}

function getFavorite() {
  const saved = safeJsonParse(localStorage.getItem("racecontrolFavorite"), null);
  return normalizeFavorite(saved);
}

function saveFavorite(favorite) {
  localStorage.setItem(
    "racecontrolFavorite",
    JSON.stringify(normalizeFavorite(favorite))
  );
}

function getUiState() {
  const saved = safeJsonParse(localStorage.getItem("racecontrolUiState"), null);
  return { ...getDefaultUiState(), ...(saved || {}) };
}

function saveUiState() {
  localStorage.setItem("racecontrolUiState", JSON.stringify({
    standingsViewType: state.ui.standingsViewType,
    standingsScope: state.ui.standingsScope,
    currentNewsFilterKey: state.ui.currentNewsFilterKey
  }));
}

function applyStoredUiState() {
  const saved = getUiState();

  state.ui.standingsViewType = saved.standingsViewType || "drivers";
  state.ui.standingsScope = saved.standingsScope || "top10";
  state.ui.currentNewsFilterKey = saved.currentNewsFilterKey || "favorite";
}

/* =========================
   LOCAL DATA CLEANUP
========================= */

function repairLocalStorageState() {
  const repairedFavorite = getFavorite();
  saveFavorite(repairedFavorite);

  const repairedSettings = getSettings();
  saveSettings(repairedSettings);

  const repairedUi = getUiState();
  localStorage.setItem("racecontrolUiState", JSON.stringify(repairedUi));
}

function clearPredictionHistory() {
  localStorage.removeItem("racecontrolPredictionHistory");
}

function getPredictionHistory() {
  const history = safeJsonParse(localStorage.getItem("racecontrolPredictionHistory"), []);
  return Array.isArray(history) ? history : [];
}

function savePredictionHistory(history) {
  localStorage.setItem("racecontrolPredictionHistory", JSON.stringify(history || []));
}

function clearAllLocalData() {
  [
    "racecontrolFavorite",
    "racecontrolSettings",
    "racecontrolUiState",
    "racecontrolSelectedRace",
    "racecontrolPredictionHistory",
    "racecontrolStandingsSnapshot"
  ].forEach(key => localStorage.removeItem(key));

  state.standingsCache = null;
  state.calendarCache = null;
  state.newsCache = {};
  state.predictCache = {};
  state.weekendContext = null;
  state.lastPredictData = null;
  state.lastPredictKey = null;
  state.detectedNextRaceName = null;
  state.standingsDelta = { drivers: {}, teams: {} };
  state.ui = { ...state.ui, ...getDefaultUiState() };
}

/* =========================
   APP SUBTITLE
========================= */

function updateSubtitle() {
  const favorite = getFavorite();
  const el = subtitleEl();
  if (!el) return;

  el.textContent = favorite.type === "driver"
    ? `F1 · ${favorite.name} · ${favorite.team}`
    : `F1 · ${favorite.name}`;
}

/* =========================
   BASIC DATE FORMATTERS
========================= */

function formatNewsDate(pubDate) {
  if (!pubDate) return "";
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short"
  });
}

function formatDateTimeShort(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* =========================
   BASIC COMMON RENDER
========================= */

function renderLoadingCard(title, text) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-sub">${escapeHtml(text)}</div>
      <div class="skeleton-wrap">
        <div class="skeleton skeleton-line lg"></div>
        <div class="skeleton skeleton-line md"></div>
        <div class="skeleton skeleton-line sm"></div>
      </div>
    </div>
  `;
}

function renderErrorCard(title, text, message) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-sub">${escapeHtml(text)}</div>
      <pre class="ai-output">${escapeHtml(message || "Error")}</pre>
    </div>
  `;
}

function renderEmptyCard(title, text) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="empty-line">${escapeHtml(text)}</div>
    </div>
  `;
}

/* =========================
   MODAL
========================= */

function openDetailModal(html) {
  if (!modalEl() || !modalContentEl()) return;
  modalContentEl().innerHTML = html;
  modalEl().classList.add("open");
}

function closeDetailModal(evt) {
  if (evt && evt.target && evt.target.id !== "detailModal") return;
  modalEl()?.classList.remove("open");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetailModal();
});

/* =========================
   BOOT ERROR
========================= */

function renderBootError(message) {
  const content = contentEl();
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <div class="card-title">Error de arranque</div>
      <div class="card-sub">La app no ha podido iniciarse correctamente.</div>
      <pre class="ai-output">${escapeHtml(message || "Error desconocido")}</pre>
    </div>
  `;
}

/* =========================
   PLACEHOLDERS TEMPORALES
   (luego los sustituimos)
========================= */

function showHome() {
  setActiveNav("nav-home");
  updateSubtitle();
  contentEl().innerHTML = renderLoadingCard("Inicio", "Montando nueva home limpia…");
}

function showPredict() {
  setActiveNav("nav-predict");
  updateSubtitle();
  contentEl().innerHTML = renderLoadingCard("Predicción", "Montando nueva pantalla de predicción…");
}

function showFavorito() {
  setActiveNav("nav-favorito");
  updateSubtitle();
  contentEl().innerHTML = renderLoadingCard("Favorito", "Montando nueva pantalla de favorito…");
}

function showNews() {
  setActiveNav("nav-news");
  updateSubtitle();
  contentEl().innerHTML = renderLoadingCard("Noticias", "Montando nueva pantalla de noticias…");
}

function showMore() {
  setActiveNav("nav-more");
  updateSubtitle();
  contentEl().innerHTML = renderLoadingCard("Más", "Montando nuevo panel de utilidades…");
}

/* =========================
   BOOT
========================= */

function bootRaceControl() {
  try {
    repairLocalStorageState();
    applyStoredUiState();
    updateSubtitle();
    showHome();
    window.__racecontrolBooted = true;
  } catch (error) {
    renderBootError(error && error.message ? error.message : String(error));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootRaceControl);
} else {
  bootRaceControl();
}