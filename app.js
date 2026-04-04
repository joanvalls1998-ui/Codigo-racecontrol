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

/* =========================================================
   BLOQUE 2 · HOME REAL
   Pegar ANTES del bloque BOOT
========================================================= */

/* =========================
   CALENDAR / NEWS FETCH
========================= */

async function fetchCalendarData(force = false) {
  if (state.calendarCache && !force) return state.calendarCache;

  const response = await fetch("/api/calendar");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "No se pudo cargar el calendario");
  }

  state.calendarCache = data;
  state.weekendContext = buildWeekendContext(data?.events || []);
  state.detectedNextRaceName = state.weekendContext?.raceLabel || null;

  return data;
}

function getNewsCacheKey(favorite) {
  return `${favorite.type}:${favorite.name}`;
}

async function fetchNewsDataForFavorite(favorite, force = false) {
  const key = getNewsCacheKey(favorite);

  if (state.newsCache[key] && !force) return state.newsCache[key];

  const response = await fetch("/api/news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "No se pudieron cargar las noticias");
  }

  state.newsCache[key] = data;
  return data;
}

/* =========================
   DATE / SESSION HELPERS
========================= */

function formatCalendarDateRange(start, end) {
  if (!start || !end) return "";

  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "";

  const startDay = startDate.getDate();
  const endDay = endDate.getDate();

  const startMonth = startDate.toLocaleDateString("es-ES", { month: "short" });
  const endMonth = endDate.toLocaleDateString("es-ES", { month: "short" });

  if (startMonth === endMonth) {
    return `${startDay}-${endDay} ${startMonth}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

function addDaysToDateString(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getTimeZoneDateParts(timestamp, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(new Date(timestamp));
  const out = {};

  parts.forEach(part => {
    if (part.type !== "literal") out[part.type] = part.value;
  });

  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second)
  };
}

function zonedLocalToUtcIso(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 3; i += 1) {
    const zoned = getTimeZoneDateParts(guess, timeZone);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += targetAsUtc - zonedAsUtc;
  }

  return new Date(guess).toISOString();
}

function formatSessionDateTime(dateIso) {
  if (!dateIso) return "";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCircuitLocalDateTime(dateIso, timeZone) {
  if (!dateIso || !timeZone) return "";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function getCountdownText(dateIso) {
  if (!dateIso) return "";
  const now = new Date();
  const target = new Date(dateIso);

  if (Number.isNaN(target.getTime())) return "";

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "ahora";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 2) return `en ${days} días`;
  if (days === 1) return hours > 0 ? `en 1 día y ${hours} h` : "mañana";
  if (hours >= 1) return minutes > 0 ? `en ${hours} h ${minutes} min` : `en ${hours} h`;
  return `en ${minutes} min`;
}

/* =========================
   RACE / CIRCUIT MAPPING
========================= */

function inferRaceKeyFromEvent(event) {
  const text = normalizeText(`${event?.title || ""} ${event?.venue || ""} ${event?.location || ""}`);

  if (containsAny(text, ["australia", "melbourne"])) return "australia";
  if (containsAny(text, ["china", "shanghai"])) return "china";
  if (containsAny(text, ["japan", "japon", "suzuka"])) return "japan";
  if (containsAny(text, ["bahrain", "baréin", "barein", "sakhir"])) return "bahrain";
  if (containsAny(text, ["saudi", "arabia saud", "jeddah"])) return "saudi";
  if (containsAny(text, ["miami"])) return "miami";
  if (containsAny(text, ["canada", "canadá", "montreal"])) return "canada";
  if (containsAny(text, ["monaco", "mónaco"])) return "monaco";
  if (containsAny(text, ["madrid"])) return "madrid";
  if (containsAny(text, ["spain", "españa", "barcelona-catalunya", "barcelona"])) return "spain";
  if (containsAny(text, ["austria", "spielberg"])) return "austria";
  if (containsAny(text, ["britain", "great britain", "gran bretaña", "silverstone"])) return "britain";
  if (containsAny(text, ["belgium", "spa-francorchamps", "spa"])) return "belgium";
  if (containsAny(text, ["hungary", "hungría", "hungaroring"])) return "hungary";
  if (containsAny(text, ["netherlands", "países bajos", "zandvoort"])) return "netherlands";
  if (containsAny(text, ["italy", "italia", "monza"])) return "italy";
  if (containsAny(text, ["azerbaijan", "azerbaiyán", "baku"])) return "baku";
  if (containsAny(text, ["singapore"])) return "singapore";
  if (containsAny(text, ["united states", "estados unidos", "austin", "cota"])) return "usa";
  if (containsAny(text, ["mexico", "méxico"])) return "mexico";
  if (containsAny(text, ["são paulo", "sao paulo", "brazil", "brasil", "interlagos"])) return "brazil";
  if (containsAny(text, ["las vegas", "vegas"])) return "vegas";
  if (containsAny(text, ["qatar", "catar", "lusail"])) return "qatar";
  if (containsAny(text, ["abu dhabi", "abu dabi", "yas marina"])) return "abudhabi";

  return "miami";
}

function getRaceLabelFromKey(key) {
  const labels = {
    australia: "GP de Australia",
    china: "GP de China",
    japan: "GP de Japón",
    bahrain: "GP de Baréin",
    saudi: "GP de Arabia Saudí",
    miami: "GP Miami",
    canada: "GP de Canadá",
    monaco: "GP de Mónaco",
    spain: "GP de España",
    austria: "GP de Austria",
    britain: "GP de Gran Bretaña",
    belgium: "GP de Bélgica",
    hungary: "GP de Hungría",
    netherlands: "GP de Países Bajos",
    italy: "GP de Italia",
    madrid: "GP de España (Madrid)",
    baku: "GP de Azerbaiyán",
    singapore: "GP de Singapur",
    usa: "GP de Estados Unidos",
    mexico: "GP de México",
    brazil: "GP de São Paulo",
    vegas: "GP de Las Vegas",
    qatar: "GP de Catar",
    abudhabi: "GP de Abu Dabi"
  };

  return labels[key] || "Gran Premio";
}

function getCircuitAssetPath(raceKey) {
  return `/assets/circuits/${raceKey}.png`;
}

function renderCircuitThumb(raceKey, size = 96) {
  const src = getCircuitAssetPath(raceKey);
  const label = getRaceLabelFromKey(raceKey);

  return `
    <div style="display:flex; justify-content:center; margin:10px 0 14px;">
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:20px;
        overflow:hidden;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(255,255,255,0.02);
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <img
          src="${src}"
          alt="${escapeHtml(label)}"
          style="width:100%; height:100%; object-fit:contain;"
          onerror="this.style.display='none'; this.parentNode.innerHTML='<div style=&quot;color:rgba(255,255,255,0.78); font-weight:700; font-size:12px; text-align:center; padding:12px;&quot;>${escapeHtml(label)}</div>';"
        >
      </div>
    </div>
  `;
}

/* =========================
   SESSION CONFIG
========================= */

const RACE_SESSION_CONFIG = {
  australia: {
    timeZone: "Australia/Melbourne",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  china: {
    timeZone: "Asia/Shanghai",
    format: "sprint",
    sessions: { fp1: "11:30", sprintShootout: "15:30", sprint: "11:00", qualifying: "15:00", race: "15:00" }
  },
  japan: {
    timeZone: "Asia/Tokyo",
    format: "standard",
    sessions: { fp1: "11:30", fp2: "15:00", fp3: "11:30", qualifying: "15:00", race: "14:00" }
  },
  bahrain: {
    timeZone: "Asia/Bahrain",
    format: "standard",
    sessions: { fp1: "14:30", fp2: "18:00", fp3: "15:30", qualifying: "19:00", race: "18:00" }
  },
  saudi: {
    timeZone: "Asia/Riyadh",
    format: "standard",
    sessions: { fp1: "16:30", fp2: "20:00", fp3: "16:30", qualifying: "20:00", race: "20:00" }
  },
  miami: {
    timeZone: "America/New_York",
    format: "sprint",
    sessions: { fp1: "12:30", sprintShootout: "16:30", sprint: "12:00", qualifying: "16:00", race: "16:00" }
  },
  canada: {
    timeZone: "America/Toronto",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "14:00" }
  },
  monaco: {
    timeZone: "Europe/Monaco",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  spain: {
    timeZone: "Europe/Madrid",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  austria: {
    timeZone: "Europe/Vienna",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  britain: {
    timeZone: "Europe/London",
    format: "sprint",
    sessions: { fp1: "12:30", sprintShootout: "16:30", sprint: "12:00", qualifying: "16:00", race: "15:00" }
  },
  belgium: {
    timeZone: "Europe/Brussels",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  hungary: {
    timeZone: "Europe/Budapest",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  netherlands: {
    timeZone: "Europe/Amsterdam",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "11:30", qualifying: "15:00", race: "15:00" }
  },
  italy: {
    timeZone: "Europe/Rome",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  madrid: {
    timeZone: "Europe/Madrid",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  baku: {
    timeZone: "Asia/Baku",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "12:30", qualifying: "16:00", race: "15:00" }
  },
  singapore: {
    timeZone: "Asia/Singapore",
    format: "sprint",
    sessions: { fp1: "16:30", sprintShootout: "20:30", sprint: "17:00", qualifying: "21:00", race: "20:00" }
  },
  usa: {
    timeZone: "America/Chicago",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "12:30", qualifying: "16:00", race: "14:00" }
  },
  mexico: {
    timeZone: "America/Mexico_City",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "11:30", qualifying: "15:00", race: "14:00" }
  },
  brazil: {
    timeZone: "America/Sao_Paulo",
    format: "standard",
    sessions: { fp1: "12:30", fp2: "16:00", fp3: "11:30", qualifying: "15:00", race: "14:00" }
  },
  vegas: {
    timeZone: "America/Los_Angeles",
    format: "standard",
    sessions: { fp1: "16:30", fp2: "20:00", fp3: "16:30", qualifying: "20:00", race: "20:00" }
  },
  qatar: {
    timeZone: "Asia/Qatar",
    format: "standard",
    sessions: { fp1: "16:30", fp2: "20:00", fp3: "17:30", qualifying: "21:00", race: "19:00" }
  },
  abudhabi: {
    timeZone: "Asia/Dubai",
    format: "standard",
    sessions: { fp1: "13:30", fp2: "17:00", fp3: "14:30", qualifying: "18:00", race: "17:00" }
  }
};

function getSessionLabel(key) {
  const labels = {
    fp1: "FP1",
    fp2: "FP2",
    fp3: "FP3",
    sprintShootout: "Sprint Shootout",
    sprint: "Sprint",
    qualifying: "Clasificación",
    race: "Carrera"
  };

  return labels[key] || key;
}

function getSessionDurationMinutes(key) {
  const map = {
    fp1: 60,
    fp2: 60,
    fp3: 60,
    sprintShootout: 44,
    sprint: 60,
    qualifying: 60,
    race: 120
  };

  return map[key] || 60;
}

function getNextRaceFromCalendar(events) {
  if (!Array.isArray(events)) return null;

  return (
    events.find(event => event.type === "race" && event.status === "next") ||
    events.find(event => event.type === "race" && event.status === "upcoming") ||
    null
  );
}

function buildWeekendSessions(event, raceKey) {
  const config = RACE_SESSION_CONFIG[raceKey];
  if (!config || !event?.start || !event?.end) return [];

  const friday = event.start;
  const saturday = addDaysToDateString(event.start, 1);
  const sunday = event.end;

  const plan = config.format === "sprint"
    ? [
        { key: "fp1", date: friday, dayKey: "friday" },
        { key: "sprintShootout", date: friday, dayKey: "friday" },
        { key: "sprint", date: saturday, dayKey: "saturday" },
        { key: "qualifying", date: saturday, dayKey: "saturday" },
        { key: "race", date: sunday, dayKey: "sunday" }
      ]
    : [
        { key: "fp1", date: friday, dayKey: "friday" },
        { key: "fp2", date: friday, dayKey: "friday" },
        { key: "fp3", date: saturday, dayKey: "saturday" },
        { key: "qualifying", date: saturday, dayKey: "saturday" },
        { key: "race", date: sunday, dayKey: "sunday" }
      ];

  return plan
    .map(item => {
      const timeStr = config.sessions[item.key];
      if (!timeStr) return null;

      const start = zonedLocalToUtcIso(item.date, timeStr, config.timeZone);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + getSessionDurationMinutes(item.key));

      return {
        key: item.key,
        label: getSessionLabel(item.key),
        start,
        end: end.toISOString(),
        dayKey: item.dayKey,
        timeZone: config.timeZone,
        format: config.format
      };
    })
    .filter(Boolean);
}

function resolveSessionStatus(session) {
  const now = new Date();
  const start = new Date(session.start);
  const end = new Date(session.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "upcoming";
  if (now > end) return "completed";
  if (now >= start && now <= end) return "live";
  return "upcoming";
}

function decorateSessions(sessions) {
  const decorated = (sessions || []).map(session => ({
    ...session,
    status: resolveSessionStatus(session)
  }));

  const firstUpcomingIndex = decorated.findIndex(item => item.status === "upcoming");
  if (firstUpcomingIndex !== -1) {
    decorated[firstUpcomingIndex] = {
      ...decorated[firstUpcomingIndex],
      status: "next"
    };
  }

  return decorated;
}

function buildWeekendContext(events) {
  const nextRace = getNextRaceFromCalendar(events);
  if (!nextRace) return null;

  const raceKey = inferRaceKeyFromEvent(nextRace);
  const raceLabel = getRaceLabelFromKey(raceKey);
  const sessions = decorateSessions(buildWeekendSessions(nextRace, raceKey));

  const liveSession = sessions.find(s => s.status === "live") || null;
  const nextSession = sessions.find(s => s.status === "next") || null;
  const firstSession = sessions[0] || null;

  let phase = "pre_weekend";
  if (liveSession || nextSession) {
    const ref = liveSession || nextSession;
    if (ref.dayKey === "friday") phase = "friday";
    if (ref.dayKey === "saturday") phase = "saturday";
    if (ref.dayKey === "sunday") phase = "sunday";
  }

  return {
    nextRace,
    raceKey,
    raceLabel,
    format: RACE_SESSION_CONFIG[raceKey]?.format || "standard",
    sessions,
    liveSession,
    nextSession: nextSession || firstSession,
    phase
  };
}

/* =========================
   HOME COPY
========================= */

function getHomePhaseLabel(phase) {
  const map = {
    pre_weekend: "Previa",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo"
  };

  return map[phase] || "Previa";
}

function getHomeLeadText(context) {
  if (!context) return "No hay contexto del próximo GP ahora mismo.";

  if (context.phase === "friday") {
    return "Viernes de referencias: importa más el ritmo real que un tiempo aislado.";
  }

  if (context.phase === "saturday") {
    return "Sábado decisivo: la clasificación cambia por completo el techo del domingo.";
  }

  if (context.phase === "sunday") {
    return "Domingo de carrera: estrategia, salida y tráfico pasan a mandar.";
  }

  return "Todavía manda más la lectura general del fin de semana que un resultado concreto.";
}

function getWhatToWatchItems(context, favorite) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const favoriteName = favorite.name;

  if (!context || context.phase === "pre_weekend") {
    return [
      "Mira quién llega con mejor base de ritmo antes de sobrevalorar titulares.",
      `Atento a si ${teamName} llega con mejoras o con dudas de fiabilidad.`,
      "No confundas narrativa previa con ritmo real: eso lo empiezan a aclarar las sesiones."
    ];
  }

  if (context.phase === "friday") {
    return [
      "Da más valor a tandas largas que a una vuelta suelta.",
      `Compara a ${favoriteName} con su compañero para medir la referencia real.`,
      "La sesión útil del viernes suele explicar mucho más que la tabla final."
    ];
  }

  if (context.phase === "saturday") {
    return [
      "La qualy pesa muchísimo en aire limpio, tráfico y techo real del domingo.",
      `Una mala salida de ${favoriteName} puede recortar mucho el objetivo del GP.`,
      "Hoy importa más la posición en pista que la narrativa previa."
    ];
  }

  return [
    "Mira salida, primer stint y ventana de parada.",
    "Un Safety Car puede romper todo el guion esperado.",
    `Aunque ${favoriteName} tenga ritmo, el tráfico puede cambiar por completo su carrera.`
  ];
}

/* =========================
   SIMPLE NEWS ORDER
========================= */

function getSortedHomeNews(items) {
  const list = Array.isArray(items) ? [...items] : [];

  const uniqueByTitle = [];
  const seen = new Set();

  list.forEach(item => {
    const key = normalizeText(item?.title || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueByTitle.push(item);
  });

  return uniqueByTitle.sort((a, b) => {
    const dateA = new Date(a?.pubDate || 0).getTime();
    const dateB = new Date(b?.pubDate || 0).getTime();
    return dateB - dateA;
  });
}

/* =========================
   HOME RENDER
========================= */

function renderHomeFavoriteHero() {
  const favorite = getFavorite();
  const accent = favorite.colorClass || "aston";
  const subtitle = favorite.type === "driver"
    ? `${favorite.team} · P${favorite.pos}`
    : `${favorite.drivers || ""} · P${favorite.pos}`;

  return `
    <div class="card home-hero">
      <div class="card-title" style="color: var(--${accent});">
        ${favorite.type === "driver" ? "PILOTO FAVORITO" : "EQUIPO FAVORITO"}
      </div>

      <div class="hero-main">
        <div class="hero-left">
          ${
            favorite.type === "driver"
              ? `<img class="hero-avatar" src="${favorite.image}" alt="${escapeHtml(favorite.name)}" onerror="this.style.display='none'">`
              : `<div class="team-stripe ${accent}" style="height:56px;"></div>`
          }
          <div class="hero-badge" style="color: var(--${accent});">
            ${favorite.type === "driver" ? favorite.number : "EQ"}
          </div>
          <div>
            <div class="hero-name">${escapeHtml(favorite.name)}</div>
            <div class="hero-sub">${escapeHtml(subtitle)}</div>
          </div>
        </div>

        <div class="hero-points">
          <div class="hero-points-value">${escapeHtml(favorite.points)}</div>
          <div class="hero-points-label">pts</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeGpCard(context) {
  if (!context) {
    return renderEmptyCard("Próximo GP", "No se ha podido construir el contexto del siguiente Gran Premio.");
  }

  const nextRace = context.nextRace;
  const phaseLabel = getHomePhaseLabel(context.phase);
  const nextSession = context.nextSession;
  const formatLabel = context.format === "sprint" ? "Sprint weekend" : "Formato normal";

  return `
    <div class="card highlight-card">
      <div class="mini-pill">HOME INTELIGENTE</div>
      <div class="card-title">${escapeHtml(context.raceLabel)}</div>
      <div class="card-sub">${escapeHtml(getHomeLeadText(context))}</div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag technical">${escapeHtml(phaseLabel)}</span>
        <span class="tag general">${escapeHtml(formatLabel)}</span>
      </div>

      ${renderCircuitThumb(context.raceKey, 92)}

      <div class="meta-grid" style="margin-top:2px;">
        <div class="meta-tile">
          <div class="meta-kicker">Fecha</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(formatCalendarDateRange(nextRace.start, nextRace.end))}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(nextRace.venue || nextRace.location || "—")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Siguiente sesión</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(nextSession?.label || "—")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeSessionCard(context) {
  const session = context?.nextSession || null;

  if (!session) {
    return renderEmptyCard("Siguiente sesión", "No hay una sesión próxima cargada ahora mismo.");
  }

  const settings = getSettings();

  return `
    <div class="card">
      <div class="card-title">Siguiente sesión</div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Sesión</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(session.label)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Tu hora</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(formatSessionDateTime(session.start))}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Empieza</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(getCountdownText(session.start))}</div>
        </div>
      </div>

      ${
        settings.showCircuitLocalTime
          ? `
            <div class="info-line" style="margin-top:12px;">
              Hora circuito · ${escapeHtml(formatCircuitLocalDateTime(session.start, session.timeZone))} · ${escapeHtml(session.timeZone)}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderHomeWhatToWatchCard(context) {
  const favorite = getFavorite();
  const items = getWhatToWatchItems(context, favorite);

  return `
    <div class="card">
      <div class="card-title">Qué mirar ahora</div>
      <div class="insight-list" style="margin-top:14px;">
        ${items.map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderHomeNewsCard(items) {
  const favorite = getFavorite();
  const news = getSortedHomeNews(items).slice(0, 3);

  return `
    <div class="card">
      <div class="card-title">Noticias clave · ${escapeHtml(favorite.name)}</div>

      ${
        news.length
          ? news.map(item => `
              <div class="news-item">
                <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(item.title)}
                </a>
                <div class="news-source">
                  ${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}
                </div>
              </div>
            `).join("")
          : `<div class="empty-line">No hay noticias disponibles ahora mismo.</div>`
      }
    </div>
  `;
}

function renderHomeQuickActions() {
  return `
    <div class="card">
      <div class="card-title">Accesos rápidos</div>
      <div class="quick-row" style="margin-top:14px;">
        <a href="#" class="btn" onclick="showPredict(); return false;">Predicción</a>
        <a href="#" class="btn-secondary" onclick="showNews(); return false;">Noticias</a>
        <a href="#" class="btn-secondary" onclick="showMore(); return false;">Más</a>
      </div>
    </div>
  `;
}

/* =========================
   HOME FINAL
========================= */

async function showHome(force = false) {
  setActiveNav("nav-home");
  updateSubtitle();

  const root = contentEl();
  if (!root) return;

  root.innerHTML = `
    ${renderHomeFavoriteHero()}
    ${renderLoadingCard("Inicio", "Cargando contexto del próximo GP…")}
  `;

  try {
    const favorite = getFavorite();

    const [calendarData, newsData] = await Promise.all([
      fetchCalendarData(force),
      fetchNewsDataForFavorite(favorite, force)
    ]);

    const context = buildWeekendContext(calendarData?.events || []);
    state.weekendContext = context;

    root.innerHTML = `
      ${renderHomeFavoriteHero()}
      ${renderHomeGpCard(context)}
      ${renderHomeSessionCard(context)}
      ${renderHomeWhatToWatchCard(context)}
      ${renderHomeNewsCard(newsData?.items || [])}
      ${renderHomeQuickActions()}
    `;
  } catch (error) {
    root.innerHTML = `
      ${renderHomeFavoriteHero()}
      ${renderErrorCard("Inicio", "Error al montar la home", error.message)}
    `;
  }
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