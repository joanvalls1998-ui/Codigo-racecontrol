window.__racecontrolScriptLoaded = true;

const DEFAULT_SETTINGS = Object.freeze({
  language: "es-ES",
  autoSelectNextRace: true,
  showCircuitLocalTime: true,
  homeCompactMode: false,
  weekendExplainerMode: true,
  experienceMode: "casual"
});

const DEFAULT_UI_STATE = Object.freeze({
  standingsViewType: "drivers",
  standingsScope: "top10",
  currentNewsFilterKey: "favorite"
});

const DEFAULT_NEWS_FILTER_KEY = DEFAULT_UI_STATE.currentNewsFilterKey;

function createInitialRuntimeState() {
  return {
    standingsCache: null,
    calendarCache: null,
    homeNewsCache: {},
    lastPredictData: null,
    lastPredictContext: null,
    detectedNextRaceName: null,
    standingsDelta: { drivers: {}, teams: {} },
    standingsViewType: DEFAULT_UI_STATE.standingsViewType,
    standingsScope: DEFAULT_UI_STATE.standingsScope,
    currentNewsFilterKey: DEFAULT_UI_STATE.currentNewsFilterKey,
    weekendContext: null,
    weekendNowIso: null
  };
}

const state = createInitialRuntimeState();

const STORAGE_KEYS = Object.freeze({
  favorite: "racecontrolFavorite",
  settings: "racecontrolSettings",
  selectedRace: "racecontrolSelectedRace",
  predictionHistory: "racecontrolPredictionHistory",
  standingsSnapshot: "racecontrolStandingsSnapshot",
  uiState: "racecontrolUiState"
});

const ALL_STORAGE_KEYS = Object.freeze(Object.values(STORAGE_KEYS));

const CIRCUIT_ASSET_FILES = Object.freeze({
  "GP de Australia": "australia.png",
  "GP de China": "china.png",
  "GP de Japón": "japan.png",
  "GP de Baréin": "bahrain.png",
  "GP de Arabia Saudí": "saudi.png",
  "GP Miami": "miami.png",
  "GP de Canadá": "canada.png",
  "GP de Mónaco": "monaco.png",
  "GP de España": "spain.png",
  "GP de Austria": "austria.png",
  "GP de Gran Bretaña": "britain.png",
  "GP de Bélgica": "belgium.png",
  "GP de Hungría": "hungary.png",
  "GP de Países Bajos": "netherlands.png",
  "GP de Italia": "italy.png",
  "GP de España (Madrid)": "madrid.png",
  "GP de Azerbaiyán": "baku.png",
  "GP de Singapur": "singapore.png",
  "GP de Estados Unidos": "usa.png",
  "GP de México": "mexico.png",
  "GP de São Paulo": "brazil.png",
  "GP de Las Vegas": "vegas.png",
  "GP de Catar": "qatar.png",
  "GP de Abu Dabi": "abudhabi.png"
});

function clearStorageKeys(keys) {
  keys.forEach(key => storageRemove(key));
}

function storageReadJson(key, fallback) {
  return safeJsonParse(localStorage.getItem(key), fallback);
}

function storageRead(key) {
  return localStorage.getItem(key);
}

function storageWriteJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function storageWrite(key, value) {
  localStorage.setItem(key, value);
}

function storageRemove(key) {
  localStorage.removeItem(key);
}

function contentEl() {
  return document.getElementById("content");
}

function modalEl() {
  return document.getElementById("detailModal");
}

function modalContentEl() {
  return document.getElementById("detailModalContent");
}

function setActiveNav(tabId) {
  const ids = ["nav-home", "nav-predict", "nav-favorito", "nav-news", "nav-more"];
  ids.forEach(id => document.getElementById(id)?.classList.remove("active"));
  document.getElementById(tabId)?.classList.add("active");
}

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


function normalizeFavorite(favorite) {
  const defaultDriver = getDefaultFavorite();

  if (!favorite || typeof favorite !== "object") {
    return defaultDriver;
  }

  if (favorite.type !== "driver" && favorite.type !== "team") {
    return defaultDriver;
  }

  if (!favorite.name) {
    return defaultDriver;
  }

  if (favorite.type === "driver") {
    return {
      type: "driver",
      name: favorite.name || defaultDriver.name,
      team: favorite.team || defaultDriver.team,
      number: String(favorite.number ?? defaultDriver.number),
      points: String(favorite.points ?? defaultDriver.points),
      colorClass: favorite.colorClass || defaultDriver.colorClass,
      image: favorite.image || defaultDriver.image,
      pos: String(favorite.pos ?? defaultDriver.pos)
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
  return terms.some(term => text.includes(term));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}


function getFavorite() {
  const saved = storageReadJson(STORAGE_KEYS.favorite, null);
  return normalizeFavorite(saved);
}

function saveFavorite(favorite) {
  storageWriteJson(STORAGE_KEYS.favorite, normalizeFavorite(favorite));
}

function applyFavoriteTheme() {
  const favorite = getFavorite();
  const root = document.body;
  if (!root) return;

  const team = favorite?.colorClass || "aston";
  const themeClasses = [
    "theme-aston",
    "theme-ferrari",
    "theme-mercedes",
    "theme-mclaren",
    "theme-redbull",
    "theme-alpine",
    "theme-williams",
    "theme-audi",
    "theme-cadillac",
    "theme-haas",
    "theme-rb"
  ];

  root.classList.remove(...themeClasses);
  root.classList.add(`theme-${team}`);
}

function getPredictRaceOptions() {
  return [
    "GP de Australia",
    "GP de China",
    "GP de Japón",
    "GP de Baréin",
    "GP de Arabia Saudí",
    "GP Miami",
    "GP de Canadá",
    "GP de Mónaco",
    "GP de España",
    "GP de Austria",
    "GP de Gran Bretaña",
    "GP de Bélgica",
    "GP de Hungría",
    "GP de Países Bajos",
    "GP de Italia",
    "GP de España (Madrid)",
    "GP de Azerbaiyán",
    "GP de Singapur",
    "GP de Estados Unidos",
    "GP de México",
    "GP de São Paulo",
    "GP de Las Vegas",
    "GP de Catar",
    "GP de Abu Dabi"
  ];
}

function getSelectedRace() {
  const settings = getSettings();
  const stored = storageRead(STORAGE_KEYS.selectedRace);
  if (settings.autoSelectNextRace && state.detectedNextRaceName) return state.detectedNextRaceName;
  if (stored) return stored;
  return state.detectedNextRaceName || "GP Miami";
}

function saveSelectedRace(raceName) {
  storageWrite(STORAGE_KEYS.selectedRace, raceName);
  const settings = getSettings();
  if (settings.autoSelectNextRace) {
    saveSettings({ ...settings, autoSelectNextRace: false });
  }
}

function updateSubtitle() {
  const favorite = getFavorite();
  const subtitle = document.getElementById("appSubtitle");
  if (!subtitle) return;

  subtitle.textContent = favorite.type === "driver"
    ? `F1 · ${favorite.name} · ${favorite.team}`
    : `F1 · ${favorite.name}`;
}

function formatNewsDate(pubDate) {
  if (!pubDate) return "";
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatDateTimeShort(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCalendarDateRange(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "";
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const startMonth = startDate.toLocaleDateString("es-ES", { month: "short" });
  const endMonth = endDate.toLocaleDateString("es-ES", { month: "short" });
  if (startMonth === endMonth) return `${startDay}-${endDay} ${startMonth}`;
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

function getCalendarStatusLabel(status, type) {
  if (type === "testing" && status === "completed") return "Pretemporada completada";
  if (status === "completed") return "Completado";
  if (status === "next") return "Siguiente";
  return "Próximamente";
}

function getRaceHeuristics(raceName) {
  const map = {
    "GP de Australia": { safetyCar: 42, rain: 24, tag: "semiurbano" },
    "GP de China": { safetyCar: 28, rain: 20, tag: "permanente" },
    "GP de Japón": { safetyCar: 24, rain: 26, tag: "permanente" },
    "GP de Baréin": { safetyCar: 26, rain: 1, tag: "permanente" },
    "GP de Arabia Saudí": { safetyCar: 47, rain: 1, tag: "urbano" },
    "GP Miami": { safetyCar: 46, rain: 18, tag: "semiurbano" },
    "GP de Canadá": { safetyCar: 50, rain: 21, tag: "semiurbano" },
    "GP de Mónaco": { safetyCar: 38, rain: 16, tag: "urbano" },
    "GP de España": { safetyCar: 20, rain: 11, tag: "permanente" },
    "GP de Austria": { safetyCar: 32, rain: 28, tag: "permanente" },
    "GP de Gran Bretaña": { safetyCar: 24, rain: 29, tag: "permanente" },
    "GP de Bélgica": { safetyCar: 33, rain: 36, tag: "permanente" },
    "GP de Hungría": { safetyCar: 27, rain: 19, tag: "permanente" },
    "GP de Países Bajos": { safetyCar: 25, rain: 23, tag: "permanente" },
    "GP de Italia": { safetyCar: 26, rain: 18, tag: "permanente" },
    "GP de España (Madrid)": { safetyCar: 41, rain: 10, tag: "urbano" },
    "GP de Azerbaiyán": { safetyCar: 48, rain: 9, tag: "urbano" },
    "GP de Singapur": { safetyCar: 57, rain: 33, tag: "urbano" },
    "GP de Estados Unidos": { safetyCar: 27, rain: 17, tag: "permanente" },
    "GP de México": { safetyCar: 29, rain: 8, tag: "altitud" },
    "GP de São Paulo": { safetyCar: 35, rain: 31, tag: "permanente" },
    "GP de Las Vegas": { safetyCar: 39, rain: 4, tag: "urbano" },
    "GP de Catar": { safetyCar: 22, rain: 2, tag: "permanente" },
    "GP de Abu Dabi": { safetyCar: 23, rain: 1, tag: "permanente" }
  };
  return map[raceName] || { safetyCar: 30, rain: 15, tag: "circuito" };
}

function mapCalendarEventToPredictRace(event) {
  if (!event) return null;
  const title = event.title || "";
  const venue = event.venue || "";

  if (title.includes("Australian")) return "GP de Australia";
  if (title.includes("Chinese")) return "GP de China";
  if (title.includes("Japanese")) return "GP de Japón";
  if (title.includes("Bahrain")) return "GP de Baréin";
  if (title.includes("Saudi")) return "GP de Arabia Saudí";
  if (title.includes("Miami")) return "GP Miami";
  if (title.includes("Canadian")) return "GP de Canadá";
  if (title.includes("Monaco")) return "GP de Mónaco";
  if (title.includes("Spanish") && venue.includes("Madrid")) return "GP de España (Madrid)";
  if (title.includes("Spanish")) return "GP de España";
  if (title.includes("Austrian")) return "GP de Austria";
  if (title.includes("British")) return "GP de Gran Bretaña";
  if (title.includes("Belgian")) return "GP de Bélgica";
  if (title.includes("Hungarian")) return "GP de Hungría";
  if (title.includes("Dutch")) return "GP de Países Bajos";
  if (title.includes("Italian")) return "GP de Italia";
  if (title.includes("Azerbaijan")) return "GP de Azerbaiyán";
  if (title.includes("Singapore")) return "GP de Singapur";
  if (title.includes("United States")) return "GP de Estados Unidos";
  if (title.includes("Mexico")) return "GP de México";
  if (title.includes("São Paulo")) return "GP de São Paulo";
  if (title.includes("Las Vegas")) return "GP de Las Vegas";
  if (title.includes("Qatar")) return "GP de Catar";
  if (title.includes("Abu Dhabi")) return "GP de Abu Dabi";

  return null;
}

function getNextRaceFromCalendar(events) {
  if (!Array.isArray(events)) return null;
  return events.find(event => event.type === "race" && event.status === "next")
    || events.find(event => event.type === "race" && event.status === "upcoming")
    || null;
}

/* ===== FASE 1 v1.2 · WEEKEND INTELLIGENCE ===== */

const OFFICIAL_2026_SESSION_CONFIG = {
  "GP de Australia": {
    timeZone: "Australia/Melbourne",
    format: "standard",
    sessions: {
      fp1: "12:30",
      fp2: "16:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de China": {
    timeZone: "Asia/Shanghai",
    format: "sprint",
    sessions: {
      fp1: "11:30",
      sprintShootout: "15:30",
      sprint: "11:00",
      qualifying: "15:00",
      race: "15:00"
    }
  },
  "GP de Japón": {
    timeZone: "Asia/Tokyo",
    format: "standard",
    sessions: {
      fp1: "11:30",
      fp2: "15:00",
      fp3: "11:30",
      qualifying: "15:00",
      race: "14:00"
    }
  },
  "GP de Baréin": {
    timeZone: "Asia/Bahrain",
    format: "standard",
    sessions: {
      fp1: "14:30",
      fp2: "18:00",
      fp3: "15:30",
      qualifying: "19:00",
      race: "18:00"
    }
  },
  "GP de Arabia Saudí": {
    timeZone: "Asia/Riyadh",
    format: "unavailable",
    reason: "La web oficial no muestra un horario de sesiones utilizable para este GP ahora mismo."
  },
  "GP Miami": {
    timeZone: "America/New_York",
    format: "sprint",
    sessions: {
      fp1: "12:30",
      sprintShootout: "16:30",
      sprint: "12:00",
      qualifying: "16:00",
      race: "16:00"
    }
  },
  "GP de Canadá": {
    timeZone: "America/Toronto",
    format: "sprint",
    sessions: {
      fp1: "12:30",
      sprintShootout: "16:30",
      sprint: "12:00",
      qualifying: "16:00",
      race: "16:00"
    }
  },
  "GP de Mónaco": {
    timeZone: "Europe/Monaco",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de España": {
    timeZone: "Europe/Madrid",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Austria": {
    timeZone: "Europe/Vienna",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Gran Bretaña": {
    timeZone: "Europe/London",
    format: "sprint",
    sessions: {
      fp1: "12:30",
      sprintShootout: "16:30",
      sprint: "12:00",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Bélgica": {
    timeZone: "Europe/Brussels",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Hungría": {
    timeZone: "Europe/Budapest",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Países Bajos": {
    timeZone: "Europe/Amsterdam",
    format: "sprint",
    sessions: {
      fp1: "12:30",
      sprintShootout: "16:30",
      sprint: "12:00",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Italia": {
    timeZone: "Europe/Rome",
    format: "standard",
    sessions: {
      fp1: "12:30",
      fp2: "16:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de España (Madrid)": {
    timeZone: "Europe/Madrid",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Azerbaiyán": {
    timeZone: "Asia/Baku",
    format: "standard",
    sessions: {
      fp1: "12:30",
      fp2: "16:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de Singapur": {
    timeZone: "Asia/Singapore",
    format: "sprint",
    sessions: {
      fp1: "16:30",
      sprintShootout: "20:30",
      sprint: "17:00",
      qualifying: "21:00",
      race: "20:00"
    }
  },
  "GP de Estados Unidos": {
    timeZone: "America/Chicago",
    format: "standard",
    sessions: {
      fp1: "12:30",
      fp2: "16:00",
      fp3: "12:30",
      qualifying: "16:00",
      race: "15:00"
    }
  },
  "GP de México": {
    timeZone: "America/Mexico_City",
    format: "standard",
    sessions: {
      fp1: "12:30",
      fp2: "16:00",
      fp3: "11:30",
      qualifying: "15:00",
      race: "14:00"
    }
  },
  "GP de São Paulo": {
    timeZone: "America/Sao_Paulo",
    format: "standard",
    sessions: {
      fp1: "12:30",
      fp2: "16:00",
      fp3: "11:30",
      qualifying: "15:00",
      race: "14:00"
    }
  },
  "GP de Las Vegas": {
    timeZone: "America/Los_Angeles",
    format: "standard",
    sessions: {
      fp1: "16:30",
      fp2: "20:00",
      fp3: "16:30",
      qualifying: "20:00",
      race: "20:00"
    }
  },
  "GP de Catar": {
    timeZone: "Asia/Qatar",
    format: "standard",
    sessions: {
      fp1: "16:30",
      fp2: "20:00",
      fp3: "17:30",
      qualifying: "21:00",
      race: "19:00"
    }
  },
  "GP de Abu Dabi": {
    timeZone: "Asia/Dubai",
    format: "standard",
    sessions: {
      fp1: "13:30",
      fp2: "17:00",
      fp3: "14:30",
      qualifying: "18:00",
      race: "17:00"
    }
  }
};

function getWeekendNow() {
  return new Date();
}

function getSessionKeyLabel(sessionKey) {
  const map = {
    fp1: "FP1",
    fp2: "FP2",
    fp3: "FP3",
    sprintShootout: "Sprint Shootout",
    sprint: "Sprint",
    qualifying: "Clasificación",
    race: "Carrera"
  };
  return map[sessionKey] || sessionKey;
}

function getOfficialSessionConfig(raceName) {
  return OFFICIAL_2026_SESSION_CONFIG[raceName] || null;
}

function isSprintRaceName(raceName) {
  return getOfficialSessionConfig(raceName)?.format === "sprint";
}

function addDaysToDateString(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getSessionDurationMinutes(sessionKey) {
  const map = {
    fp1: 60,
    fp2: 60,
    fp3: 60,
    sprintShootout: 44,
    sprint: 60,
    qualifying: 60,
    race: 120
  };
  return map[sessionKey] || 60;
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

function getSessionImportance(sessionKey) {
  const map = {
    fp1: "Primera referencia",
    fp2: "Clave para ritmo largo",
    fp3: "Ajuste final",
    sprintShootout: "Define la Sprint",
    sprint: "Impacto medio-alto",
    qualifying: "Muy alta",
    race: "Máxima"
  };
  return map[sessionKey] || "Importancia media";
}

function buildOfficialSession(dateStr, key, dayKey, raceName, config) {
  const timeStr = config?.sessions?.[key];
  if (!timeStr) return null;

  const start = zonedLocalToUtcIso(dateStr, timeStr, config.timeZone);
  const endDate = new Date(start);
  endDate.setMinutes(endDate.getMinutes() + getSessionDurationMinutes(key));

  return {
    key,
    label: getSessionKeyLabel(key),
    start,
    end: endDate.toISOString(),
    dayKey,
    importance: getSessionImportance(key),
    raceName,
    isSprint: config.format === "sprint",
    timeZone: config.timeZone,
    circuitLocalTime: timeStr
  };
}

function buildWeekendSessionsFromEvent(event) {
  const raceName = mapCalendarEventToPredictRace(event) || event?.title || "GP";
  const config = getOfficialSessionConfig(raceName);

  if (!config || config.format === "unavailable" || !event?.start || !event?.end) {
    return [];
  }

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
    .map(item => buildOfficialSession(item.date, item.key, item.dayKey, raceName, config))
    .filter(Boolean);
}

function resolveSessionStatus(session, now) {
  const start = new Date(session.start);
  const end = new Date(session.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "upcoming";
  }

  if (now > end) return "completed";
  if (now >= start && now <= end) return "live";
  return "upcoming";
}

function decorateSessionsWithStatus(sessions, now) {
  const decorated = (Array.isArray(sessions) ? sessions : []).map(session => ({
    ...session,
    status: resolveSessionStatus(session, now)
  }));

  const firstUpcomingIndex = decorated.findIndex(session => session.status === "upcoming");
  if (firstUpcomingIndex !== -1) {
    decorated[firstUpcomingIndex] = {
      ...decorated[firstUpcomingIndex],
      status: "next"
    };
  }

  return decorated;
}

function getWeekendPhaseFromSessions(sessions, now) {
  if (!Array.isArray(sessions) || !sessions.length) return "pre_weekend";

  const firstSession = sessions[0];
  const firstStart = new Date(firstSession.start);

  if (!Number.isNaN(firstStart.getTime()) && now < firstStart) {
    return "pre_weekend";
  }

  if (sessions.every(session => session.status === "completed")) {
    return "post_race";
  }

  const reference =
    sessions.find(session => session.status === "live") ||
    sessions.find(session => session.status === "next") ||
    sessions.find(session => session.status === "upcoming") ||
    sessions[sessions.length - 1];

  if (!reference) return "pre_weekend";

  if (reference.dayKey === "friday") return "friday";
  if (reference.dayKey === "saturday") return "saturday";
  return "sunday";
}

function getWeekendPhaseLabel(phase) {
  const map = {
    pre_weekend: "Previa",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo",
    post_race: "Post GP"
  };
  return map[phase] || "Previa";
}

function getCurrentSession(sessions) {
  return (sessions || []).find(session => session.status === "live") || null;
}

function getNextSession(sessions) {
  return (sessions || []).find(session => session.status === "next") || null;
}

function getLastCompletedSession(sessions) {
  const completed = (sessions || []).filter(session => session.status === "completed");
  return completed.length ? completed[completed.length - 1] : null;
}

function getWeekendFocus(phase, currentSession, nextSession) {
  if (phase === "pre_weekend") {
    return {
      label: "previa del GP",
      description: "Todavía manda más la lectura general del fin de semana que un resultado concreto."
    };
  }

  if (phase === "friday") {
    return {
      label: "viernes de referencias",
      description: currentSession?.key === "fp2" || nextSession?.key === "fp2"
        ? "FP2 suele ser la sesión más útil para leer ritmo largo y degradación."
        : "Viernes sirve para separar ruido de tabla y ritmo real."
    };
  }

  if (phase === "saturday") {
    return {
      label: "sábado de clasificación",
      description: currentSession?.key === "sprint" || nextSession?.key === "sprint"
        ? "La Sprint añade contexto, pero la qualy sigue pesando muchísimo en el guion del domingo."
        : "La posición de salida puede cambiar por completo el techo del domingo."
    };
  }

  if (phase === "sunday") {
    return {
      label: "domingo de estrategia",
      description: "Salida, primer stint, Safety Car y ventana de parada son ahora lo más importante."
    };
  }

  return {
    label: "fin de semana completado",
    description: "El GP ya está cerrado. Esta lectura queda como contexto del guion que se esperaba."
  };
}

function getWhatToWatchNow(phase, currentSession, nextSession, favorite) {
  const favoriteName = favorite?.name || "tu favorito";
  const favoriteTeam = favorite?.type === "driver" ? favorite.team : favorite?.name || "su equipo";

  if (phase === "pre_weekend") {
    return [
      "Mira quién llega con mejor base de ritmo antes de sobrevalorar titulares.",
      `Atento a si ${favoriteTeam} llega con mejoras o con dudas de fiabilidad.`,
      "No confundas narrativa previa con ritmo real: eso lo empiezan a aclarar las sesiones."
    ];
  }

  if (phase === "friday") {
    return [
      "Mira tandas largas, no solo una vuelta rápida suelta.",
      `Compara a ${favoriteName} con su compañero para ver la referencia interna real.`,
      "Fíjate en degradación, tráfico y consistencia más que en la tabla final."
    ];
  }

  if (phase === "saturday") {
    return [
      "La qualy pesa mucho: tráfico, vuelta final y ejecución lo cambian todo.",
      `Una mala posición de salida puede recortar bastante el techo real de ${favoriteName}.`,
      "Separa ritmo puro de posición en pista: no siempre van de la mano."
    ];
  }

  if (phase === "sunday") {
    return [
      "La salida y el primer stint suelen marcar la carrera más de lo que parece.",
      "Mira la ventana de parada y si aparece un Safety Car que rompa el guion.",
      `Si ${favoriteName} queda atrapado en tráfico, su carrera puede cambiar aunque tenga ritmo.`
    ];
  }

  return [
    "Repasa qué sesión cambió el guion del GP.",
    "Distingue qué fue ritmo real y qué fue ejecución.",
    `Úsalo como base para la siguiente predicción de ${favoriteName}.`
  ];
}

function getSessionImpactOnFavorite(sessionKey, favorite) {
  const favoriteName = favorite?.name || "tu favorito";

  const map = {
    fp1: `Primera lectura útil de ${favoriteName}, pero todavía poco concluyente.`,
    fp2: `Suele medir mejor el ritmo real de ${favoriteName} en tanda larga.`,
    fp3: "Sirve para afinar detalles antes de la sesión decisiva del sábado.",
    sprintShootout: "Puede condicionar cómo de limpio o complicado queda el sábado.",
    sprint: "Añade contexto de posición en pista y ritmo, aunque no define por completo el domingo.",
    qualifying: `Puede decidir si ${favoriteName} pelea por el objetivo o queda atrapado.`,
    race: "Es la sesión que más peso tiene: estrategia, salida y ejecución lo deciden casi todo."
  };

  return map[sessionKey] || `Sesión relevante para entender mejor a ${favoriteName}.`;
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

function formatSessionCircuitDateTime(dateIso, timeZone) {
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

function getCountdownToSession(session) {
  if (!session?.start) return "";
  const start = new Date(session.start);
  const now = getWeekendNow();

  if (Number.isNaN(start.getTime())) return "";

  const diffMs = start.getTime() - now.getTime();
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

function buildWeekendContext(events, favorite) {
  const raceEvents = (Array.isArray(events) ? events : []).filter(event => event.type === "race");

  const raceEvent =
    raceEvents.find(event => event.status === "next") ||
    raceEvents.find(event => event.status === "upcoming") ||
    [...raceEvents].reverse().find(event => event.status === "completed") ||
    null;

  const raceName = mapCalendarEventToPredictRace(raceEvent) || getSelectedRace();
  const now = getWeekendNow();
  const config = getOfficialSessionConfig(raceName);
  const rawSessions = raceEvent ? buildWeekendSessionsFromEvent(raceEvent) : [];
  const sessions = decorateSessionsWithStatus(rawSessions, now);
  const phase = getWeekendPhaseFromSessions(sessions, now);
  const phaseLabel = getWeekendPhaseLabel(phase);
  const currentSession = getCurrentSession(sessions);
  const nextSession = getNextSession(sessions);
  const lastCompletedSession = getLastCompletedSession(sessions);
  const focus = getWeekendFocus(phase, currentSession, nextSession);

  return {
    raceEvent,
    raceName,
    isSprint: config?.format === "sprint",
    scheduleUnavailable: !config || config.format === "unavailable",
    scheduleReason: config?.reason || "",
    sessions,
    phase,
    phaseLabel,
    currentSession,
    nextSession,
    lastCompletedSession,
    focusLabel: focus.label,
    focusDescription: focus.description,
    whatToWatch: getWhatToWatchNow(phase, currentSession, nextSession, favorite),
    nextSessionCountdown: getCountdownToSession(nextSession),
    generatedAt: now.toISOString()
  };
}

/* ===== FASE 2 v1.2 · PANTALLA SESIONES ===== */

function getSessionStatusLabel(status) {
  const map = {
    live: "En curso",
    next: "Siguiente",
    upcoming: "Próxima",
    completed: "Completada"
  };
  return map[status] || "Próxima";
}

function getSessionStatusTagClass(status) {
  if (status === "live") return "statement";
  if (status === "next") return "market";
  if (status === "completed") return "general";
  return "technical";
}

function getWeekendPhaseTagClass(phase) {
  if (phase === "sunday") return "statement";
  if (phase === "saturday") return "market";
  if (phase === "friday") return "general";
  return "technical";
}

function getSessionsHeroLead(context) {
  if (!context) return "No hay contexto de fin de semana disponible ahora mismo.";

  if (context.scheduleUnavailable) {
    return context.scheduleReason || "No hay horarios oficiales disponibles para este GP ahora mismo.";
  }

  if (context.currentSession) {
    return `${context.currentSession.label} está en curso. ${context.focusDescription}`;
  }

  if (context.nextSession) {
    return `${context.nextSession.label} es la siguiente sesión ${context.nextSessionCountdown ? `(${context.nextSessionCountdown})` : ""}. ${context.focusDescription}`;
  }

  return context.focusDescription || "Usa esta pantalla para leer el valor real de cada sesión del GP.";
}

function getSessionWhatToWatch(session, favorite, context) {
  const favoriteName = favorite?.name || "tu favorito";

  const map = {
    fp1: [
      "Primeras sensaciones del coche y comparación interna de pilotos.",
      `No sobrevalores la tabla: importa más cómo empieza ${favoriteName} a construir confianza.`,
      "Fíjate en balance, correcciones y primeras tandas."
    ],
    fp2: [
      "Es la referencia más útil del viernes para ritmo largo.",
      `Mira la consistencia de ${favoriteName} en tanda larga y la degradación.`,
      "Separa vuelta suelta de comportamiento real a varias vueltas."
    ],
    fp3: [
      "Último ajuste fino antes de la clasificación.",
      "Sirve para confirmar si el setup va en la dirección correcta.",
      `Mira si ${favoriteName} llega afinado o sigue corrigiendo demasiado el coche.`
    ],
    sprintShootout: [
      "Define buena parte del sábado sprint.",
      "La ejecución a una vuelta vuelve a ganar mucho peso.",
      `Un resultado limpio aquí puede dar aire a ${favoriteName} para el resto del día.`
    ],
    sprint: [
      "Da contexto de tráfico, salida y posición en pista.",
      "No decide todo el domingo, pero sí enseña mucho del comportamiento real en carrera corta.",
      `Mira si ${favoriteName} puede adelantar o queda condicionado por el aire sucio.`
    ],
    qualifying: [
      "La posición de salida puede definir gran parte del domingo.",
      "Atento a tráfico, última vuelta y gestión del pico de agarre.",
      `Una buena qualy cambia el techo real de ${favoriteName}.`
    ],
    race: [
      "Salida, primer stint y ventana de parada son clave.",
      "Safety Car, estrategia y tráfico pueden romper el guion esperado.",
      `Mira si ${favoriteName} consigue aire limpio o queda atrapado.`
    ]
  };

  return map[session?.key] || context?.whatToWatch || [
    "Mira el guion general del fin de semana.",
    "Compara ejecución con ritmo real.",
    "Úsalo para entender mejor lo que viene después."
  ];
}

function renderSessionsHero(context) {
  if (!context) {
    return `
      <div class="card highlight-card">
        <div class="mini-pill">SESIONES</div>
        <div class="card-title">Este GP</div>
        <div class="card-sub">No hay contexto del fin de semana disponible ahora mismo.</div>
      </div>
    `;
  }

  if (context.scheduleUnavailable) {
    return `
      <div class="card highlight-card">
        <div class="mini-pill">WEEKEND INTELLIGENCE</div>
        <div class="card-title">${escapeHtml(context.raceName || "GP")}</div>
        <div class="card-sub">${escapeHtml(getSessionsHeroLead(context))}</div>

        <div class="news-meta-row" style="margin-top:10px;">
          <span class="tag technical">${escapeHtml(context.phaseLabel)}</span>
          <span class="tag reliability">Horario no disponible</span>
        </div>
      </div>
    `;
  }

  const principalSession = context.currentSession || context.nextSession || context.lastCompletedSession;
  const principalLabel = principalSession?.label || "Sin datos";
  const principalStatus = principalSession
    ? getSessionStatusLabel(principalSession.status)
    : "Sin datos";
  const principalUserMeta = principalSession?.start
    ? formatSessionDateTime(principalSession.start)
    : "Sin hora cargada";
  const principalCircuitMeta = principalSession?.start
    ? formatSessionCircuitDateTime(principalSession.start, principalSession.timeZone)
    : "Sin hora circuito";

  return `
    <div class="card highlight-card">
      <div class="mini-pill">WEEKEND INTELLIGENCE</div>
      <div class="card-title">${escapeHtml(context.raceName || "GP")}</div>
      <div class="card-sub">${escapeHtml(getSessionsHeroLead(context))}</div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${getWeekendPhaseTagClass(context.phase)}">${escapeHtml(context.phaseLabel)}</span>
        <span class="tag ${context.isSprint ? "statement" : "general"}">${context.isSprint ? "Sprint weekend" : "Formato normal"}</span>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Foco del GP</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(context.focusLabel)}</div>
          <div class="meta-caption">${escapeHtml(context.focusDescription)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">${context.currentSession ? "Sesión actual" : "Siguiente sesión"}</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(principalLabel)}</div>
          <div class="meta-caption">${escapeHtml(principalStatus)} · Tu hora: ${escapeHtml(principalUserMeta)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Hora circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(principalCircuitMeta)}</div>
          <div class="meta-caption">${escapeHtml(context.nextSessionCountdown || (context.currentSession ? "ahora" : "—"))}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSessionCard(session, favorite, context) {
  const watchItems = getSessionWhatToWatch(session, favorite, context);
  const impact = getSessionImpactOnFavorite(session.key, favorite);
  const statusLabel = getSessionStatusLabel(session.status);
  const statusClass = getSessionStatusTagClass(session.status);
  const isPrimary = session.status === "live" || session.status === "next";
  const userTime = formatSessionDateTime(session.start);
  const circuitTime = formatSessionCircuitDateTime(session.start, session.timeZone);

  return `
    <div class="card ${isPrimary ? "highlight-card" : ""}">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">${escapeHtml(session.label)}</div>
          <div class="card-sub">Tu hora: ${escapeHtml(userTime)}</div>
        </div>
        <div class="card-head-actions">
          <span class="tag ${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>
      </div>

      <div class="info-line">${escapeHtml(impact)}</div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Tu hora</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(userTime)}</div>
          <div class="meta-caption">${session.status === "next" ? `Empieza ${escapeHtml(getCountdownToSession(session))}` : escapeHtml(getSessionStatusLabel(session.status))}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Hora circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(circuitTime)}</div>
          <div class="meta-caption">${escapeHtml(session.timeZone)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Formato</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(session.isSprint ? "Sprint" : "Normal")}</div>
          <div class="meta-caption">${escapeHtml(session.dayKey === "friday" ? "Viernes" : session.dayKey === "saturday" ? "Sábado" : "Domingo")}</div>
        </div>
      </div>

      <div class="meta-kicker" style="margin-top:14px;">Qué mirar</div>
      <div class="insight-list">
        ${watchItems.map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
      </div>
    </div>
  `;
}

async function showSessions() {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Sesiones", "Preparando el hub del fin de semana y el valor real de cada sesión…", true);

  try {
    await fetchCalendarData();
    const context = state.weekendContext;
    const favorite = getFavorite();

    contentEl().innerHTML = `
      ${renderSessionsHero(context)}

      <div class="card">
        <div class="card-title">Qué mirar ahora</div>
        <div class="insight-list">
          ${(context?.whatToWatch || [
            "No hay contexto disponible ahora mismo.",
            "Recarga el calendario para volver a intentarlo.",
            "Cuando haya GP cargado, aquí saldrán las claves del momento."
          ]).map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
        </div>
      </div>

      ${isExpertMode() ? renderContextGlossaryCard("sessions", context?.phase || "pre_weekend") : ""}

      ${(context?.sessions || []).length
        ? context.sessions.map(session => renderSessionCard(session, favorite, context)).join("")
        : `
          <div class="card">
            <div class="card-title">Sesiones</div>
            <div class="empty-line">${escapeHtml(context?.scheduleReason || "No se han podido construir las sesiones del GP ahora mismo.")}</div>
          </div>
        `}
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Sesiones", "Error al preparar esta pantalla", error.message);
  }
}

/* ===== FIN FASE 2 ===== */

function saveStandingsSnapshot(data) {
  const snapshot = {
    updatedAt: data?.updatedAt || null,
    drivers: Object.fromEntries((data?.drivers || []).map(d => [d.name, d.pos])),
    teams: Object.fromEntries((data?.teams || []).map(t => [t.team, t.pos]))
  };
  storageWriteJson(STORAGE_KEYS.standingsSnapshot, snapshot);
}

function computeStandingsDelta(data) {
  const previous = storageReadJson(STORAGE_KEYS.standingsSnapshot, null);
  const driverDelta = {};
  const teamDelta = {};

  (data?.drivers || []).forEach(driver => {
    const prev = previous?.drivers?.[driver.name];
    driverDelta[driver.name] = typeof prev === "number" ? prev - driver.pos : 0;
  });

  (data?.teams || []).forEach(team => {
    const prev = previous?.teams?.[team.team];
    teamDelta[team.team] = typeof prev === "number" ? prev - team.pos : 0;
  });

  state.standingsDelta = { drivers: driverDelta, teams: teamDelta };
  saveStandingsSnapshot(data);
}

async function fetchStandingsData(force = false) {
  if (state.standingsCache && !force) return state.standingsCache;
  const response = await fetch("/api/standings");
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "No se pudo cargar la clasificación");
  state.standingsCache = data;
  computeStandingsDelta(data);
  refreshFavoriteFromStandings(data);
  return data;
}

async function fetchCalendarData(force = false) {
  if (state.calendarCache && !force) return state.calendarCache;

  const response = await fetch("/api/calendar");
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "No se pudo cargar el calendario");

  state.calendarCache = data;

  const nextRace = getNextRaceFromCalendar(data?.events || []);
  const mappedRace = mapCalendarEventToPredictRace(nextRace);
  if (mappedRace) state.detectedNextRaceName = mappedRace;

  const favorite = getFavorite();
  state.weekendContext = buildWeekendContext(data?.events || [], favorite);
  state.weekendNowIso = new Date().toISOString();

  return data;
}

function getNewsCacheKey(favorite) {
  return `${favorite.type}:${favorite.name}`;
}

async function fetchNewsDataForFavorite(favorite, force = false) {
  const cacheKey = getNewsCacheKey(favorite);
  if (state.homeNewsCache[cacheKey] && !force) return state.homeNewsCache[cacheKey];

  const response = await fetch("/api/news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || data?.error || "No se pudieron cargar las noticias");
  state.homeNewsCache[cacheKey] = data;
  return data;
}

async function fetchPredictData(favorite, raceName) {
  const response = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite, raceName })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || data?.error || "Error al generar la predicción");
  return data;
}

function refreshFavoriteFromStandings(data) {
  const favorite = getFavorite();

  if (favorite.type === "driver") {
    const driver = (data?.drivers || []).find(d => d.name === favorite.name);
    if (!driver) return;
    saveFavorite({
      ...favorite,
      team: driver.team,
      number: driver.number,
      points: String(driver.points),
      colorClass: driver.colorClass,
      image: driver.image,
      pos: String(driver.pos)
    });
    return;
  }

  const team = (data?.teams || []).find(t => t.team === favorite.name);
  if (!team) return;
  saveFavorite({
    ...favorite,
    name: team.team,
    drivers: team.drivers,
    points: String(team.points),
    colorClass: team.colorClass,
    pos: String(team.pos)
  });
}

function getTeamData(team) {
  const data = {
    "Mercedes": { racePace: 92, qualyPace: 91, reliability: 83, outlook: "Alta", drivers: ["George Russell", "Kimi Antonelli"], forms: [90, 88], aero: 90, topSpeed: 85, traction: 88, tyreManagement: 84, recentTrend: 4 },
    "Ferrari": { racePace: 88, qualyPace: 87, reliability: 78, outlook: "Alta", drivers: ["Charles Leclerc", "Lewis Hamilton"], forms: [89, 87], aero: 86, topSpeed: 90, traction: 84, tyreManagement: 80, recentTrend: 2 },
    "McLaren": { racePace: 84, qualyPace: 85, reliability: 82, outlook: "Alta", drivers: ["Lando Norris", "Oscar Piastri"], forms: [88, 88], aero: 87, topSpeed: 82, traction: 85, tyreManagement: 84, recentTrend: 1 },
    "Red Bull": { racePace: 80, qualyPace: 82, reliability: 74, outlook: "Media", drivers: ["Max Verstappen", "Isack Hadjar"], forms: [91, 77], aero: 88, topSpeed: 84, traction: 81, tyreManagement: 75, recentTrend: -2 },
    "Aston Martin": { racePace: 72, qualyPace: 68, reliability: 61, outlook: "Media", drivers: ["Fernando Alonso", "Lance Stroll"], forms: [88, 82], aero: 60, topSpeed: 56, traction: 58, tyreManagement: 60, recentTrend: -1 },
    "Alpine": { racePace: 66, qualyPace: 61, reliability: 58, outlook: "Media", drivers: ["Pierre Gasly", "Franco Colapinto"], forms: [82, 76], aero: 70, topSpeed: 67, traction: 69, tyreManagement: 67, recentTrend: 1 },
    "Williams": { racePace: 64, qualyPace: 60, reliability: 63, outlook: "Media", drivers: ["Carlos Sainz", "Alexander Albon"], forms: [81, 79], aero: 63, topSpeed: 68, traction: 61, tyreManagement: 63, recentTrend: -1 },
    "Audi": { racePace: 61, qualyPace: 58, reliability: 67, outlook: "Media", drivers: ["Nico Hulkenberg", "Gabriel Bortoleto"], forms: [77, 74], aero: 64, topSpeed: 64, traction: 63, tyreManagement: 65, recentTrend: 0 },
    "Cadillac": { racePace: 59, qualyPace: 56, reliability: 60, outlook: "Media", drivers: ["Sergio Perez", "Valtteri Bottas"], forms: [78, 75], aero: 60, topSpeed: 66, traction: 60, tyreManagement: 62, recentTrend: 0 },
    "Haas": { racePace: 63, qualyPace: 59, reliability: 64, outlook: "Media", drivers: ["Esteban Ocon", "Oliver Bearman"], forms: [78, 80], aero: 69, topSpeed: 73, traction: 70, tyreManagement: 69, recentTrend: 2 },
    "Racing Bulls": { racePace: 68, qualyPace: 65, reliability: 66, outlook: "Media", drivers: ["Liam Lawson", "Arvid Lindblad"], forms: [79, 75], aero: 72, topSpeed: 70, traction: 71, tyreManagement: 68, recentTrend: 1 }
  };

  return data[team] || {
    racePace: 70,
    qualyPace: 67,
    reliability: 62,
    outlook: "Media",
    drivers: ["Piloto 1", "Piloto 2"],
    forms: [80, 78],
    aero: 70,
    topSpeed: 70,
    traction: 70,
    tyreManagement: 70,
    recentTrend: 0
  };
}

function sameDriverName(a, b) {
  if (!a || !b) return false;
  const aa = a.toLowerCase().trim();
  const bb = b.toLowerCase().trim();
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

function getDriverComparison(team, driverName) {
  const teamData = getTeamData(team);
  const [driverA, driverB] = teamData.drivers;
  const [formA, formB] = teamData.forms;

  if (sameDriverName(driverName, driverA)) {
    return { primaryName: driverA, primaryForm: formA, secondaryName: driverB, secondaryForm: formB };
  }
  if (sameDriverName(driverName, driverB)) {
    return { primaryName: driverB, primaryForm: formB, secondaryName: driverA, secondaryForm: formA };
  }
  return { primaryName: driverA, primaryForm: formA, secondaryName: driverB, secondaryForm: formB };
}

function getTrendInfo(teamName, favorite) {
  const teamData = getTeamData(teamName);
  let score = teamData.recentTrend || 0;

  if (favorite.type === "driver") {
    const comparison = getDriverComparison(teamName, favorite.name);
    score += (comparison.primaryForm - comparison.secondaryForm) * 0.12;
  }

  if (score >= 2) {
    return { label: "Al alza", className: "up", description: "Llega con señales positivas y mejor lectura del fin de semana." };
  }
  if (score <= -1.5) {
    return { label: "A la baja", className: "down", description: "Sigue necesitando un salto claro para estabilizar el rendimiento." };
  }
  return { label: "Estable", className: "neutral", description: "Rendimiento bastante estable, sin un giro claro todavía." };
}

function getFavoriteStrengthWindow(favorite, teamData) {
  let composite = teamData.racePace * 0.62 + teamData.qualyPace * 0.18 + teamData.reliability * 0.20;

  if (favorite.type === "driver") {
    const comparison = getDriverComparison(favorite.team, favorite.name);
    composite += (comparison.primaryForm - 80) * 0.25;
  } else {
    composite += (((teamData.forms[0] + teamData.forms[1]) / 2) - 80) * 0.15;
  }

  if (composite >= 90) return "P1-P3";
  if (composite >= 85) return "P3-P5";
  if (composite >= 80) return "P5-P7";
  if (composite >= 75) return "P7-P10";
  if (composite >= 70) return "P9-P12";
  if (composite >= 65) return "P11-P14";
  return "P14-P18";
}

function getFavoriteHomeMetrics(favorite) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const trendInfo = getTrendInfo(teamName, favorite);
  const window = getFavoriteStrengthWindow(favorite, teamData);

  let formBoost = 0;
  if (favorite.type === "driver") {
    const comparison = getDriverComparison(teamName, favorite.name);
    formBoost = (comparison.primaryForm - 80) * 0.5;
  } else {
    formBoost = (((teamData.forms[0] + teamData.forms[1]) / 2) - 80) * 0.3;
  }

  const pointsProbability = Math.round(Math.max(12, Math.min(92, (teamData.racePace - 50) * 1.8 + formBoost)));
  const dnfRisk = Math.round(Math.max(8, Math.min(45, 34 - teamData.reliability * 0.27 + (100 - teamData.racePace) * 0.06)));

  return {
    pointsProbability,
    dnfRisk,
    trendInfo,
    expectedWindow: window,
    teamData
  };
}

function getFavoriteMetrics(favorite) {
  return getFavoriteHomeMetrics(favorite);
}

function getFavoriteInsights(favorite, selectedRace) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const insights = [];

  if (favorite.type === "driver") {
    const comparison = getDriverComparison(teamName, favorite.name);
    if (comparison.primaryForm >= comparison.secondaryForm) {
      insights.push(`${comparison.primaryName} llega por delante de ${comparison.secondaryName} dentro del equipo.`);
    } else {
      insights.push(`${comparison.primaryName} necesita recortar terreno frente a ${comparison.secondaryName}.`);
    }
  } else {
    if (teamData.forms[0] >= teamData.forms[1]) {
      insights.push(`${teamData.drivers[0]} es ahora mismo la referencia interna del equipo.`);
    } else {
      insights.push(`${teamData.drivers[1]} está sosteniendo mejor el rendimiento del equipo.`);
    }
  }

  if (teamData.racePace > teamData.qualyPace) {
    insights.push("El punto fuerte actual está más en ritmo de carrera que en vuelta única.");
  } else if (teamData.qualyPace > teamData.racePace + 3) {
    insights.push("Necesita transformar mejor la clasificación en resultado de carrera.");
  } else {
    insights.push("Qualy y carrera están bastante alineadas, sin una debilidad dominante.");
  }

  if (teamData.reliability < 65) {
    insights.push("La fiabilidad sigue siendo el principal factor que puede condicionar el fin de semana.");
  } else if (
    selectedRace.includes("Mónaco") ||
    selectedRace.includes("Singapur") ||
    selectedRace.includes("Arabia Saudí") ||
    selectedRace.includes("Azerbaiyán") ||
    selectedRace.includes("Miami") ||
    selectedRace.includes("Las Vegas") ||
    selectedRace.includes("Madrid")
  ) {
    insights.push("El siguiente circuito exige precisión y confianza cerca de los muros.");
  } else {
    insights.push("Con un fin de semana limpio, hay base para consolidar un resultado sólido.");
  }

  return insights.slice(0, 3);
}

function getWeekendSignal(favorite, raceName) {
  const metrics = getFavoriteMetrics(favorite);
  const heuristics = getRaceHeuristics(raceName);
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);

  let score = 0;
  score += (metrics.pointsProbability - 50) * 0.45;
  score -= (metrics.dnfRisk - 18) * 0.65;
  score += (teamData.racePace - 70) * 0.55;
  score += (teamData.qualyPace - 68) * 0.25;
  score += (teamData.reliability - 62) * 0.30;

  if (metrics.trendInfo.label === "Al alza") score += 8;
  if (metrics.trendInfo.label === "A la baja") score -= 8;

  if (heuristics.safetyCar >= 45) score += 3;
  if (heuristics.rain >= 28) score -= 2;

  if (score >= 18) {
    return {
      label: "Favorable",
      className: "up",
      description: "El contexto general del GP es bastante bueno para el favorito."
    };
  }

  if (score <= -4) {
    return {
      label: "Difícil",
      className: "down",
      description: "El fin de semana exige maximizar ejecución y minimizar errores."
    };
  }

  return {
    label: "Neutro",
    className: "neutral",
    description: "Hay opciones, pero el resultado dependerá mucho de la ejecución."
  };
}

function getWeekendKeyPoints(favorite, raceName) {
  const metrics = getFavoriteMetrics(favorite);
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const heuristics = getRaceHeuristics(raceName);
  const points = [];

  if (teamData.racePace > teamData.qualyPace + 3) {
    points.push("El coche parece más fuerte en ritmo de carrera que en vuelta única.");
  } else if (teamData.qualyPace > teamData.racePace + 3) {
    points.push("La clasificación puede ser más sólida que el ritmo largo del domingo.");
  } else {
    points.push("Clasificación y carrera llegan bastante equilibradas.");
  }

  if (teamData.reliability < 65) {
    points.push("La fiabilidad sigue siendo el mayor factor de riesgo del fin de semana.");
  } else {
    points.push("Con un fin de semana limpio, hay base para consolidar un resultado competitivo.");
  }

  if (heuristics.safetyCar >= 45) {
    points.push("La probabilidad de Safety Car es alta y puede alterar mucho la estrategia.");
  } else if (heuristics.rain >= 28) {
    points.push("La meteorología puede abrir escenarios de carrera menos previsibles.");
  } else {
    points.push("En principio se espera un GP bastante ordenado y más dependiente del ritmo puro.");
  }

  return points.slice(0, 3);
}

function getWeekendSummaryData(nextRace) {
  const favorite = getFavorite();
  const raceName = mapCalendarEventToPredictRace(nextRace) || getSelectedRace();
  const heuristics = getRaceHeuristics(raceName);
  const metrics = getFavoriteMetrics(favorite);
  const signal = getWeekendSignal(favorite, raceName);
  const keyPoints = getWeekendKeyPoints(favorite, raceName);

  const gpFavorite =
    metrics.teamData.racePace >= 90 ? "Mercedes" :
    metrics.teamData.racePace >= 86 ? "Ferrari" :
    metrics.teamData.racePace >= 82 ? "McLaren" :
    "Zona muy abierta";

  return { favorite, raceName, heuristics, metrics, signal, keyPoints, gpFavorite };
}

function formatFavoritePredictionText(favoritePrediction) {
  if (!favoritePrediction) {
    return { qualy: "Sin datos", race: "Sin datos", points: "Sin datos", dnf: "Sin datos" };
  }

  if (favoritePrediction.type === "driver") {
    return {
      qualy: favoritePrediction.predictedQualyPosition ? `P${favoritePrediction.predictedQualyPosition}` : "Sin datos",
      race: favoritePrediction.predictedRacePosition ? `P${favoritePrediction.predictedRacePosition}` : "Sin datos",
      points: favoritePrediction.pointsProbability != null ? `${favoritePrediction.pointsProbability}%` : "Sin datos",
      dnf: favoritePrediction.dnfProbability != null ? `${favoritePrediction.dnfProbability}%` : "Sin datos"
    };
  }

  return {
    qualy: favoritePrediction.bestQualyPosition ? `P${favoritePrediction.bestQualyPosition}` : "Sin datos",
    race: favoritePrediction.bestRacePosition ? `P${favoritePrediction.bestRacePosition}` : "Sin datos",
    points: favoritePrediction.teamPointsProbability != null ? `${favoritePrediction.teamPointsProbability}%` : "Sin datos",
    dnf: favoritePrediction.teamAtLeastOneDnfProbability != null ? `${favoritePrediction.teamAtLeastOneDnfProbability}%` : "Sin datos"
  };
}

function formatPredictResponse(data) {
  const raceName = data?.raceName || "GP";
  const summary = data?.summary || {};
  const favoritePrediction = formatFavoritePredictionText(data?.favoritePrediction);

  return `PREDICCIÓN ${raceName.toUpperCase()}

Favorito para la victoria: ${summary.predictedWinner || "Sin datos"}
Equipos con más ritmo: ${Array.isArray(summary.topTeams) ? summary.topTeams.join(", ") : "Sin datos"}
Equipos con peor ritmo: ${Array.isArray(summary.weakestTeams) ? summary.weakestTeams.join(", ") : "Sin datos"}

Predicción del favorito en clasificación: ${favoritePrediction.qualy}
Predicción del favorito en carrera: ${favoritePrediction.race}
Probabilidad de puntos del favorito (%): ${favoritePrediction.points}
Probabilidad de abandono del favorito (%): ${favoritePrediction.dnf}

Probabilidad de lluvia (%): ${summary.rainProbability != null ? `${summary.rainProbability}%` : "Sin datos"}
Probabilidad de Safety Car (%): ${summary.safetyCarProbability != null ? `${summary.safetyCarProbability}%` : "Sin datos"}

Estrategia más probable: ${summary.strategy?.label || "Sin datos"}
Número de paradas: ${summary.strategy?.stops ?? "Sin datos"}`;
}

function getPredictLocalEstimate(favorite, raceName) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const heuristics = getRaceHeuristics(raceName);
  const metrics = getFavoriteMetrics(favorite);

  const qualyRange =
    teamData.qualyPace >= 88 ? "P2-P5" :
    teamData.qualyPace >= 82 ? "P4-P7" :
    teamData.qualyPace >= 75 ? "P6-P10" :
    teamData.qualyPace >= 68 ? "P9-P13" :
    "P12-P16";

  const raceRange = metrics.expectedWindow || "P10-P14";

  return {
    teamName,
    teamData,
    heuristics,
    metrics,
    qualyRange,
    raceRange,
    pointsProbability: metrics.pointsProbability,
    dnfRisk: metrics.dnfRisk
  };
}

function shiftPositionLabel(label, delta) {
  if (!label || label === "Sin datos") return label;

  const exactMatch = /^P(\d+)$/.exec(label);
  if (exactMatch) {
    const pos = clamp(parseInt(exactMatch[1], 10) + delta, 1, 20);
    return `P${pos}`;
  }

  const rangeMatch = /^P(\d+)-P(\d+)$/.exec(label);
  if (rangeMatch) {
    const start = clamp(parseInt(rangeMatch[1], 10) + delta, 1, 20);
    const end = clamp(parseInt(rangeMatch[2], 10) + delta, 1, 20);
    return `P${Math.min(start, end)}-P${Math.max(start, end)}`;
  }

  return label;
}

function getPredictScenarios(favorite, raceName, data = null) {
  const local = getPredictLocalEstimate(favorite, raceName);
  const favoritePrediction = data ? formatFavoritePredictionText(data?.favoritePrediction) : null;
  const baseRace = favoritePrediction?.race && favoritePrediction.race !== "Sin datos" ? favoritePrediction.race : local.raceRange;
  const baseQualy = favoritePrediction?.qualy && favoritePrediction.qualy !== "Sin datos" ? favoritePrediction.qualy : local.qualyRange;
  const favorableRace = shiftPositionLabel(baseRace, -2);
  const difficultRace = shiftPositionLabel(baseRace, 2);
  const safetyCarText = local.heuristics.safetyCar >= 45 ? "y aparece una neutralización útil" : "y ejecuta bien la estrategia";
  const reliabilityRisk = local.teamData.reliability < 65 ? "o aparece la fiabilidad" : "o pierde posición en tráfico";
  const pointsText = favoritePrediction?.points && favoritePrediction.points !== "Sin datos"
    ? favoritePrediction.points
    : `${local.pointsProbability}%`;

  if (favorite.type === "driver") {
    return [
      {
        kicker: "Escenario favorable",
        value: favorableRace,
        text: `${favorite.name} puede moverse hacia ${favorableRace} si sale cerca de ${baseQualy} ${safetyCarText}.`
      },
      {
        kicker: "Escenario base",
        value: baseRace,
        text: `La lectura más estable ahora mismo sitúa a ${favorite.name} alrededor de ${baseRace}, con ${pointsText} de opciones de puntos.`
      },
      {
        kicker: "Escenario difícil",
        value: difficultRace,
        text: `Si cae en tráfico ${reliabilityRisk}, el domingo puede irse hacia ${difficultRace}.`
      }
    ];
  }

  return [
    {
      kicker: "Escenario favorable",
      value: favorableRace,
      text: `${favorite.name} puede cerrar un GP fuerte y meter sus coches delante si el sábado acompaña.`
    },
    {
      kicker: "Escenario base",
      value: baseRace,
      text: `Lo más razonable es esperar una ventana alrededor de ${baseRace}, con presencia en zona media-alta.`
    },
    {
      kicker: "Escenario difícil",
      value: difficultRace,
      text: `Si el ritmo no aparece desde el viernes o la estrategia se complica, el equipo puede caer hacia ${difficultRace}.`
    }
  ];
}

function getPredictKeyFactors(favorite, raceName, data = null) {
  const local = getPredictLocalEstimate(favorite, raceName);
  const heuristics = local.heuristics;
  const teamData = local.teamData;
  const points = [];

  if (teamData.racePace > teamData.qualyPace + 3) {
    points.push({
      title: "Ritmo largo",
      text: "El coche debería defenderse mejor en tandas largas que en pura vuelta de clasificación."
    });
  } else if (teamData.qualyPace > teamData.racePace + 3) {
    points.push({
      title: "Sábado clave",
      text: "La posición de salida pesa mucho porque el rendimiento parece más fuerte a una vuelta."
    });
  } else {
    points.push({
      title: "Equilibrio general",
      text: "No hay una diferencia enorme entre sábado y domingo; la ejecución manda."
    });
  }

  if (teamData.reliability < 65) {
    points.push({
      title: "Fiabilidad",
      text: "El principal riesgo sigue siendo completar un fin de semana limpio sin sobresaltos."
    });
  } else {
    points.push({
      title: "Consistencia",
      text: "La base del coche permite pensar en un fin de semana ordenado si no cae en tráfico."
    });
  }

  if (heuristics.safetyCar >= 45) {
    points.push({
      title: "Neutralizaciones",
      text: "La probabilidad alta de Safety Car puede abrir una ventana estratégica importante."
    });
  } else if (heuristics.rain >= 28) {
    points.push({
      title: "Meteorología",
      text: "La lluvia o la pista cambiante pueden mezclar más la carrera de lo normal."
    });
  } else if (heuristics.tag === "urbano") {
    points.push({
      title: "Posición en pista",
      text: "En este trazado importa mucho clasificar bien y evitar quedar atrapado detrás."
    });
  } else {
    points.push({
      title: "Ritmo puro",
      text: "Sin demasiados factores externos, la carrera debería decidirse sobre todo por ritmo real."
    });
  }

  if (data?.summary?.predictedWinner) {
    points.push({
      title: "Referencia del GP",
      text: `${data.summary.predictedWinner} parte como referencia global del fin de semana.`
    });
  }

  return points.slice(0, 3);
}

function getQualyRaceBalance(favorite, raceName, data = null) {
  const local = getPredictLocalEstimate(favorite, raceName);
  const favoritePrediction = data ? formatFavoritePredictionText(data?.favoritePrediction) : null;
  const qualy = favoritePrediction?.qualy && favoritePrediction.qualy !== "Sin datos" ? favoritePrediction.qualy : local.qualyRange;
  const race = favoritePrediction?.race && favoritePrediction.race !== "Sin datos" ? favoritePrediction.race : local.raceRange;

  let label = "Equilibrado";
  let description = "No hay una diferencia muy marcada entre sábado y domingo; lo decisivo será ejecutar bien todo el fin de semana.";

  if (local.teamData.racePace > local.teamData.qualyPace + 3) {
    label = "Mejor en carrera";
    description = "El coche debería tener mejor lectura de stint largo que de una vuelta pura. El domingo puede ofrecer más que el sábado.";
  } else if (local.teamData.qualyPace > local.teamData.racePace + 3) {
    label = "Mejor a una vuelta";
    description = "El potencial en clasificación parece algo más fuerte que el ritmo largo. Convertir bien la salida será clave.";
  }

  return { label, description, qualy, race };
}

function getStrategyWindow(raceName, stops) {
  const heuristics = getRaceHeuristics(raceName);
  const tag = heuristics.tag;

  if (stops >= 2) {
    if (tag === "urbano") return "V10-16 y V28-36";
    if (tag === "semiurbano") return "V12-18 y V30-38";
    return "V14-20 y V32-40";
  }

  if (tag === "urbano") return "V18-28";
  if (tag === "semiurbano") return "V16-24";
  if (tag === "altitud") return "V17-25";
  return "V18-26";
}

function getStrategyNarrative(favorite, raceName, data = null) {
  const local = getPredictLocalEstimate(favorite, raceName);
  const summaryStrategy = data?.summary?.strategy || null;
  const heuristics = local.heuristics;
  const stops = Number.isFinite(summaryStrategy?.stops) ? summaryStrategy.stops : (heuristics.safetyCar >= 45 ? 2 : 1);
  const label = summaryStrategy?.label || (stops >= 2 ? "Estrategia flexible a dos paradas" : "Una parada como base");
  const window = getStrategyWindow(raceName, stops);

  let factor = "Track position";
  let note = "La lectura base es de carrera relativamente ordenada, donde el ritmo puro tendrá bastante peso.";

  if (heuristics.safetyCar >= 45) {
    factor = "Safety Car";
    note = "La estrategia puede romperse con una neutralización. Conviene mantener margen para reaccionar rápido.";
  } else if (heuristics.rain >= 28) {
    factor = "Meteorología";
    note = "La ventana estratégica puede abrirse o cerrarse rápido si cambia la pista.";
  } else if (heuristics.tag === "urbano") {
    factor = "Posición en pista";
    note = "Aquí adelantar suele costar más, así que la salida y la primera parada condicionan casi todo.";
  } else if (local.teamData.tyreManagement < 68) {
    factor = "Gestión de neumáticos";
    note = "El mayor punto de vigilancia es no pasarse de degrado en el stint medio.";
  }

  return { label, stops, window, factor, note };
}

function getPredictGridRead(favorite, raceName, data = null) {
  if (data?.summary) {
    const summary = data.summary;
    return {
      winner: summary.predictedWinner || "Sin datos",
      topTeams: Array.isArray(summary.topTeams) ? summary.topTeams.join(", ") : "Sin datos",
      weakestTeams: Array.isArray(summary.weakestTeams) ? summary.weakestTeams.join(", ") : "Sin datos"
    };
  }

  const ranking = [
    { team: "Mercedes", pace: getTeamData("Mercedes").racePace },
    { team: "Ferrari", pace: getTeamData("Ferrari").racePace },
    { team: "McLaren", pace: getTeamData("McLaren").racePace },
    { team: "Red Bull", pace: getTeamData("Red Bull").racePace },
    { team: "Aston Martin", pace: getTeamData("Aston Martin").racePace },
    { team: "Racing Bulls", pace: getTeamData("Racing Bulls").racePace },
    { team: "Alpine", pace: getTeamData("Alpine").racePace },
    { team: "Williams", pace: getTeamData("Williams").racePace },
    { team: "Haas", pace: getTeamData("Haas").racePace },
    { team: "Audi", pace: getTeamData("Audi").racePace },
    { team: "Cadillac", pace: getTeamData("Cadillac").racePace }
  ].sort((a, b) => b.pace - a.pace);

  const winner = ranking[0]?.team || "Sin datos";
  const topTeams = ranking.slice(0, 3).map(item => item.team).join(", ");
  const weakestTeams = ranking.slice(-3).map(item => item.team).join(", ");

  return { winner, topTeams, weakestTeams };
}

function getRaceWeekendStage(event) {
  if (!event?.start || !event?.end) {
    return {
      key: "preview",
      label: "Previo",
      description: "Pantalla pensada para leer el guion del GP antes de que empiecen a mandar las sesiones."
    };
  }

  const now = new Date();
  const start = new Date(`${event.start}T00:00:00`);
  const end = new Date(`${event.end}T23:59:59`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      key: "preview",
      label: "Previo",
      description: "Pantalla pensada para leer el guion del GP antes de que empiecen a mandar las sesiones."
    };
  }

  if (now < start) {
    return {
      key: "preview",
      label: "Previo",
      description: "Todavía manda más el potencial general que un resultado concreto. Lo importante es entender el guion base del GP."
    };
  }

  if (now > end) {
    return {
      key: "completed",
      label: "Completado",
      description: "La cita ya debería estar cerrada. Esta pantalla queda como lectura del guion que se esperaba antes del domingo."
    };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const offset = Math.floor((today - firstDay) / 86400000);

  if (offset <= 0) {
    return {
      key: "friday",
      label: "Viernes",
      description: "Viernes de referencias: el ritmo largo empieza a importar más que un tiempo aislado en tabla."
    };
  }

  if (offset === 1) {
    return {
      key: "saturday",
      label: "Sábado",
      description: "Sábado de clasificación: la posición en pista gana mucho peso y el margen se estrecha."
    };
  }

  return {
    key: "sunday",
    label: "Domingo",
    description: "Domingo de carrera: salida, estrategia y neutralizaciones pueden decidir por completo el resultado."
  };
}

function getRaceModeQuickRead(favorite, raceName, predictData, stage) {
  const grid = getPredictGridRead(favorite, raceName, predictData);
  const strategy = getStrategyNarrative(favorite, raceName, predictData);
  const balance = getQualyRaceBalance(favorite, raceName, predictData);
  const metrics = getFavoriteMetrics(favorite);
  const signal = getWeekendSignal(favorite, raceName);
  const favoriteLabel = favorite.type === "driver" ? favorite.name : `el equipo ${favorite.name}`;

  let needsText = `Necesita ejecutar limpio y proteger su ventana competitiva (${metrics.expectedWindow}).`;

  if (metrics.dnfRisk >= 28) {
    needsText = "Necesita un fin de semana limpio y sin comprometer fiabilidad para sostener su objetivo real.";
  } else if (balance.label === "Mejor a una vuelta") {
    needsText = "Necesita cerrar un sábado limpio y defender posición desde la salida para no perder aire limpio.";
  } else if (balance.label === "Mejor en carrera") {
    needsText = "Necesita mantenerse en ventana hasta la primera parada y dejar que el stint largo construya su carrera.";
  } else if (strategy.factor === "Safety Car") {
    needsText = "Necesita mantenerse vivo en estrategia para aprovechar cualquier neutralización que rompa el guion.";
  }

  let stageText = "Antes de empezar, la lectura manda más que el resultado.";
  if (stage?.key === "friday") stageText = "Viernes abierto: filtra el ruido de tabla y fíjate en tanda larga y consistencia.";
  if (stage?.key === "saturday") stageText = "Sábado crítico: la qualy puede condicionar casi todo el domingo.";
  if (stage?.key === "sunday") stageText = "Domingo puro: la estrategia y la primera vuelta pueden cambiarlo todo.";

  return [
    {
      title: "Quién llega mejor",
      text: `${grid.winner} parte como referencia inicial del GP, con ${grid.topTeams} marcando la zona alta esperada.`
    },
    {
      title: "Qué define este fin de semana",
      text: `${stageText} Señal general: ${signal.label.toLowerCase()}. Factor estratégico: ${strategy.factor}.`
    },
    {
      title: `Qué necesita ${favoriteLabel}`,
      text: needsText
    }
  ];
}


function renderRaceModeFavoriteSummary(favorite, raceName, predictData) {
  const favoritePrediction = formatFavoritePredictionText(predictData?.favoritePrediction);
  const metrics = getFavoriteMetrics(favorite);
  const balance = getQualyRaceBalance(favorite, raceName, predictData);

  return `
    <div class="card">
      <div class="card-title">Tu favorito</div>

      <div class="predict-grid">
        <div class="stat-tile">
          <div class="stat-kicker">Clasificación</div>
          <div class="stat-value">${favoritePrediction.qualy}</div>
          <div class="stat-caption">${escapeHtml(favorite.name)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Carrera</div>
          <div class="stat-value">${favoritePrediction.race}</div>
          <div class="stat-caption">Carrera</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Puntos</div>
          <div class="stat-value">${favoritePrediction.points}</div>
          <div class="stat-caption">Puntos</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Abandono</div>
          <div class="stat-value">${favoritePrediction.dnf}</div>
          <div class="stat-caption">DNF</div>
        </div>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Ventana</div>
          <div class="meta-value">${escapeHtml(metrics.expectedWindow)}</div>
          <div class="meta-caption">Rango</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Tendencia</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(metrics.trendInfo.label)}</div>
          <div class="meta-caption">${escapeHtml(metrics.trendInfo.description)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Balance</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(balance.label)}</div>
          <div class="meta-caption">Qualy / carrera</div>
        </div>
      </div>
    </div>
  `;
}

function renderRaceModeTop10(predictData, favorite) {
  const top10 = Array.isArray(predictData?.raceOrder) ? predictData.raceOrder.slice(0, 10) : [];
  const favoriteTeam = favorite.type === "driver" ? favorite.team : favorite.name;
  const favoriteName = favorite.type === "driver" ? favorite.name : null;

  return `
    <div class="card">
      <div class="card-title">Top 10 estimado</div>

      <div class="mode-race-top10">
        ${top10.length ? top10.map(driver => {
          const badges = [];
          if (driver.position === 1) badges.push(`<span class="tag statement">Favorito GP</span>`);
          if (favoriteName && sameDriverName(driver.name, favoriteName)) badges.push(`<span class="tag market">Tu favorito</span>`);
          if (!favoriteName && driver.team === favoriteTeam) badges.push(`<span class="tag market">Equipo fav.</span>`);

          return `
            <div class="mode-race-line">
              <div class="mode-race-left">
                <div class="mode-race-pos">${driver.position}</div>
                <div class="row-stripe ${getTeamColorClass(driver.team)}"></div>
                <div>
                  <div class="mode-race-name">${escapeHtml(driver.name)}</div>
                  <div class="mode-race-team">${escapeHtml(driver.team)}</div>
                </div>
              </div>
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                ${badges.length ? `<div class="news-meta-row" style="justify-content:flex-end;">${badges.join("")}</div>` : ""}
                <div class="mode-race-team">${driver.pointsProbability != null ? `${driver.pointsProbability}% pts` : ""}</div>
              </div>
            </div>
          `;
        }).join("") : `<div class="empty-line">No hay top 10 disponible.</div>`}
      </div>
    </div>
  `;
}

function renderErrorCard(title, subtitle, message) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-sub">${escapeHtml(subtitle)}</div>
      <pre class="ai-output">${escapeHtml(message || "Error")}</pre>
    </div>
  `;
}

function renderLoadingCard(title, subtitle, withTiles = false) {
  return `
    <div class="card">
      <div class="card-title">${title}</div>
      <div class="card-sub">${subtitle}</div>
      <div class="skeleton-wrap">
        <div class="skeleton skeleton-line lg"></div>
        <div class="skeleton skeleton-line md"></div>
        <div class="skeleton skeleton-line sm"></div>
        ${withTiles ? `
          <div class="skeleton-grid">
            <div class="skeleton skeleton-tile"></div>
            <div class="skeleton skeleton-tile"></div>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderHomeHero() {
  const favorite = getFavorite();
  const accent = favorite.colorClass;
  const badge = favorite.type === "driver" ? favorite.number : "EQ";
  const subtitle = favorite.type === "driver"
    ? `${favorite.team} · P${favorite.pos}`
    : `${favorite.drivers || ""} · P${favorite.pos}`;

  const avatar = favorite.type === "driver"
    ? `<img class="hero-avatar" src="${favorite.image}" alt="${escapeHtml(favorite.name)}" onerror="this.style.display='none'">`
    : `<div class="team-stripe ${accent}" style="height:56px;"></div>`;

  return `
    <div class="card home-hero">
      <div class="card-title" style="color: var(--${accent});">
        ${favorite.type === "driver" ? "PILOTO FAVORITO" : "EQUIPO FAVORITO"}
      </div>

      <div class="hero-main">
        <div class="hero-left">
          ${avatar}
          <div class="hero-badge" style="color: var(--${accent});">${badge}</div>
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

/* ===== FASE 3 v1.2 · HOME DINÁMICO ===== */

function getHomeWeekendContext() {
  const favorite = getFavorite();

  if (state.weekendContext) return state.weekendContext;
  if (state.calendarCache?.events) {
    state.weekendContext = buildWeekendContext(state.calendarCache.events, favorite);
    state.weekendNowIso = new Date().toISOString();
    return state.weekendContext;
  }

  return null;
}

function renderHomePhaseHero(context) {
  if (!context) {
    return `
      <div class="card highlight-card">
        <div class="mini-pill">HOME INTELIGENTE</div>
        <div class="card-title">Centro del fin de semana</div>
        <div class="card-sub">No se ha podido cargar el contexto del GP ahora mismo.</div>
      </div>
    `;
  }

  if (context.scheduleUnavailable) {
    return `
      <div class="card highlight-card">
        <div class="mini-pill">HOME INTELIGENTE</div>
        <div class="card-title">${escapeHtml(context.raceName || "GP")}</div>
        <div class="card-sub">${escapeHtml(context.scheduleReason || "No hay horario oficial disponible ahora mismo.")}</div>

        <div class="news-meta-row" style="margin-top:10px;">
          <span class="tag technical">${escapeHtml(context.phaseLabel)}</span>
          <span class="tag reliability">Horario no disponible</span>
        </div>
      </div>
    `;
  }

  const leadSession = context.currentSession || context.nextSession || context.lastCompletedSession;
  const leadLabel = leadSession?.label || "Sin datos";
  const leadStatus = leadSession ? getSessionStatusLabel(leadSession.status) : "Sin datos";
  const leadUserTime = leadSession?.start ? formatSessionDateTime(leadSession.start) : "Sin hora";

  return `
    <div class="card highlight-card">
      <div class="mini-pill">HOME INTELIGENTE</div>
      <div class="card-title">${escapeHtml(context.raceName)}</div>
      <div class="card-sub">${escapeHtml(context.focusDescription)}</div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${getWeekendPhaseTagClass(context.phase)}">${escapeHtml(context.phaseLabel)}</span>
        <span class="tag ${context.isSprint ? "statement" : "general"}">${context.isSprint ? "Sprint weekend" : "Formato normal"}</span>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Foco</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(context.focusLabel)}</div>
          <div class="meta-caption">Momento GP</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">${context.currentSession ? "Ahora mismo" : "Siguiente sesión"}</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(leadLabel)}</div>
          <div class="meta-caption">${escapeHtml(leadStatus)} · ${escapeHtml(leadUserTime)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Cuenta atrás</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(context.nextSessionCountdown || (context.currentSession ? "ahora" : "—"))}</div>
          <div class="meta-caption">Próxima referencia</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeNowCard(context, favorite, options = {}) {
  const compact = Boolean(options?.compact);

  if (!context) {
    return `
      <div class="card">
        <div class="card-title">Siguiente sesión</div>
        <div class="empty-line">No hay contexto suficiente para leer el momento del fin de semana.</div>
      </div>
    `;
  }

  if (context.scheduleUnavailable) {
    return `
      <div class="card">
        <div class="card-title">Siguiente sesión</div>
        <div class="card-sub">No hay una sesión oficial cargada para este GP.</div>
        <div class="empty-line">${escapeHtml(context.scheduleReason || "Horario no disponible.")}</div>
      </div>
    `;
  }

  const target = context.currentSession || context.nextSession || context.lastCompletedSession;

  if (!target) {
    return `
      <div class="card">
        <div class="card-title">Siguiente sesión</div>
        <div class="empty-line">No hay sesión destacada disponible ahora mismo.</div>
      </div>
    `;
  }

  const userTime = formatSessionDateTime(target.start);
  const circuitTime = formatSessionCircuitDateTime(target.start, target.timeZone);
  const impact = getSessionImpactOnFavorite(target.key, favorite);

  if (compact) {
    return `
      <div class="card">
        <div class="card-title">Siguiente sesión</div>
        <div class="info-line" style="margin-top:10px;">${escapeHtml(impact)}</div>
        <div class="news-meta-row" style="margin-top:12px;">
          <span class="tag technical">${escapeHtml(getSessionStatusLabel(target.status))}</span>
          <span class="tag general">${escapeHtml(target.label)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="card home-next-session-expert-card">
      <div class="card-title">${context.currentSession ? "Ahora mismo" : target.status === "next" ? "Siguiente sesión" : "Última sesión"}</div>
      <div class="info-line" style="margin-top:10px;">${escapeHtml(impact)}</div>

      <div class="meta-grid home-next-session-expert-grid">
        <div class="meta-tile home-next-session-expert-tile">
          <div class="meta-kicker">Tu hora</div>
          <div class="meta-value home-next-session-expert-value">${escapeHtml(userTime)}</div>
          <div class="meta-caption">${escapeHtml(target.label)} · ${escapeHtml(getSessionStatusLabel(target.status))}</div>
        </div>
        <div class="meta-tile home-next-session-expert-tile">
          <div class="meta-kicker">Hora circuito</div>
          <div class="meta-value home-next-session-expert-value">${escapeHtml(circuitTime)}</div>
          <div class="meta-caption">${escapeHtml(target.timeZone || "Circuito")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeQuickLinks(context) {
  const raceName = context?.raceName || getSelectedRace();

  return `
    <div class="card">
      <div class="card-title">Accesos</div>

      <div class="quick-row">
        <a href="#" class="btn" onclick="saveSelectedRace('${String(raceName).replace(/'/g, "\\'")}'); showPredict(); return false;">Predicción</a>
        <a href="#" class="btn-secondary" onclick="showSessions(); return false;">Sesiones</a>
        <a href="#" class="btn-secondary" onclick="showRaceMode(); return false;">Carrera</a>
      </div>
    </div>
  `;
}


/* ===== FIN FASE 3 ===== */

/* ===== FASE 5 · GLOSARIO CONTEXTUAL ===== */

function getGlossarySections() {
  return [
    {
      id: "strategy",
      title: "Estrategia",
      subtitle: "Términos que salen mucho cuando se habla de paradas, ritmo y gestión de carrera.",
      items: [
        {
          term: "Undercut",
          level: "muy usado",
          short: "Parar antes que el rival para intentar adelantarle con neumáticos más frescos.",
          easy: "En fácil: entras antes al pit, ruedas más rápido y buscas salir por delante cuando el otro pare."
        },
        {
          term: "Overcut",
          level: "muy usado",
          short: "Parar más tarde que el rival para ganar tiempo mientras él ya está en boxes o calentando neumáticos.",
          easy: "En fácil: te quedas fuera más tiempo e intentas que ese aire limpio te dé la posición."
        },
        {
          term: "Stint",
          level: "básico",
          short: "Tramo de carrera entre una parada y la siguiente, o entre la salida y la primera parada.",
          easy: "Cada vez que un piloto rueda con el mismo juego de neumáticos, está haciendo un stint."
        },
        {
          term: "Delta",
          level: "muy usado",
          short: "Diferencia de tiempo respecto a otra referencia.",
          easy: "Puede ser la diferencia con otro piloto, con tu vuelta anterior o con el tiempo objetivo."
        },
        {
          term: "Ventana de parada",
          level: "básico",
          short: "Rango de vueltas en el que una parada tiene más sentido estratégico.",
          easy: "Es el momento en el que parar suele salir mejor que parar mucho antes o mucho después."
        },
        {
          term: "Track position",
          level: "muy usado",
          short: "La importancia de la posición en pista respecto al ritmo puro.",
          easy: "A veces no gana el más rápido, sino el que va delante y no se queda atrapado."
        }
      ]
    },
    {
      id: "race",
      title: "Carrera",
      subtitle: "Conceptos que ayudan a entender lo que pasa en pista y por qué cambia una carrera.",
      items: [
        {
          term: "Safety Car",
          level: "básico",
          short: "Coche de seguridad que neutraliza la carrera cuando hay un incidente importante.",
          easy: "Agrupa la parrilla, baja el ritmo y puede cambiar la estrategia de todos."
        },
        {
          term: "VSC",
          level: "muy usado",
          short: "Virtual Safety Car: obliga a los pilotos a respetar un ritmo mínimo sin sacar el Safety Car físico.",
          easy: "Se va más lento, no se puede adelantar y las diferencias suelen mantenerse más que con un Safety Car normal."
        },
        {
          term: "Dirty air",
          level: "muy usado",
          short: "Aire turbulento que recibe el coche de detrás al seguir de cerca a otro.",
          easy: "Cuando vas pegado a otro coche, pierdes carga y te cuesta más girar y cuidar neumáticos."
        },
        {
          term: "Tráfico",
          level: "básico",
          short: "Rodar detrás de coches más lentos o en medio de un grupo que te hace perder tiempo.",
          easy: "Aunque tengas ritmo, si sales detrás de varios coches te quedas atrapado."
        },
        {
          term: "Lift and coast",
          level: "muy usado",
          short: "Levantar el pie antes de la frenada y dejar correr el coche para ahorrar combustible o gestionar energía.",
          easy: "El piloto deja de acelerar un poco antes para gastar menos y castigar menos el coche."
        }
      ]
    },
    {
      id: "performance",
      title: "Rendimiento",
      subtitle: "Palabras típicas cuando se analiza si un coche va mejor el sábado o el domingo.",
      items: [
        {
          term: "Ritmo de carrera",
          level: "básico",
          short: "Velocidad media que un coche puede sostener durante tandas largas.",
          easy: "No es una vuelta brillante; es lo rápido que eres de verdad cuando la carrera se alarga."
        },
        {
          term: "Ritmo a una vuelta",
          level: "básico",
          short: "Potencial del coche para hacer una vuelta rápida, especialmente en clasificación.",
          easy: "Es el ritmo del sábado: sacar todo durante una sola vuelta."
        },
        {
          term: "Degradación",
          level: "muy usado",
          short: "Pérdida de rendimiento del neumático con el uso.",
          easy: "Cuanto más se degrada una goma, más cae el ritmo del piloto."
        },
        {
          term: "Graining",
          level: "avanzado",
          short: "Fenómeno en el que se forman pequeñas bolitas de goma sobre la superficie del neumático.",
          easy: "La rueda deja de agarrar bien durante unas vueltas porque su superficie se ensucia y se rompe."
        },
        {
          term: "Overheating",
          level: "muy usado",
          short: "Exceso de temperatura en neumáticos, frenos, motor o batería.",
          easy: "Cuando todo se calienta demasiado, el coche pierde rendimiento y a veces también fiabilidad."
        },
        {
          term: "Package / paquete de mejoras",
          level: "muy usado",
          short: "Conjunto de piezas nuevas o cambios que un equipo trae a un Gran Premio.",
          easy: "No es una pieza suelta: es un bloque de mejoras para intentar dar un salto."
        }
      ]
    },
    {
      id: "ers",
      title: "ERS / motor / energía",
      subtitle: "Términos modernos de F1 que cada vez salen más en análisis técnicos y retransmisiones.",
      items: [
        {
          term: "Overtake mode",
          level: "actual 2026",
          short: "Modo de adelantamiento de 2026 que sustituye al DRS y solo puede activarse si vas a menos de un segundo del coche de delante en el punto de detección.",
          easy: "Te da un empujón extra para atacar, pero no está siempre disponible y hay que usarlo con cabeza."
        },
        {
          term: "Harvesting",
          level: "muy usado",
          short: "Recuperación de energía para recargar la batería del coche.",
          easy: "El coche guarda energía mientras frena o en otras fases para usarla más tarde."
        },
        {
          term: "Deployment",
          level: "muy usado",
          short: "Momento en que el coche gasta o libera la energía eléctrica acumulada.",
          easy: "Es cuando usa esa batería para empujar más y ganar velocidad."
        },
        {
          term: "Clipping",
          level: "avanzado",
          short: "Momento en el que el coche deja de empujar con toda la energía eléctrica disponible al final de una recta.",
          easy: "Lo notas cuando parece que el coche ya no sigue acelerando igual porque se le acaba ese extra eléctrico."
        },
        {
          term: "Super clipping",
          level: "actual 2026",
          short: "En 2026, parte de la recarga puede producirse incluso al final de recta y a fondo, según el mapa motor y el circuito.",
          easy: "Es una forma más avanzada de gestionar energía: el coche empieza a recuperar antes de lo que parecería normal."
        }
      ]
    },
    {
      id: "weekend",
      title: "Fin de semana F1",
      subtitle: "Conceptos que ayudan a leer mejor libres, quali y carrera.",
      items: [
        {
          term: "Parc fermé",
          level: "muy usado",
          short: "Periodo regulado en el que el equipo ya no puede cambiar libremente la configuración del coche.",
          easy: "Cuando entra en parc fermé, el coche queda casi congelado para que no lo transformen entre quali y carrera."
        },
        {
          term: "Quali sim",
          level: "básico",
          short: "Simulación de clasificación: tanda corta buscando mostrar el potencial a una vuelta.",
          easy: "Es el típico intento de libres que parece una vuelta de quali."
        },
        {
          term: "Race sim",
          level: "básico",
          short: "Simulación de carrera: tanda larga para medir ritmo, degradación y consistencia.",
          easy: "Sirve para ver quién aguanta mejor muchas vueltas seguidas."
        },
        {
          term: "Setup",
          level: "muy usado",
          short: "Configuración del coche: alerones, alturas, suspensión, frenos, diferencial y más.",
          easy: "Es cómo ajustan el coche para ese circuito y para ese piloto."
        },
        {
          term: "Out-lap",
          level: "básico",
          short: "Vuelta de salida de boxes antes de empezar a empujar de verdad.",
          easy: "Se usa para calentar neumáticos, frenos y preparar la vuelta rápida."
        },
        {
          term: "In-lap",
          level: "básico",
          short: "Vuelta en la que el piloto vuelve a boxes.",
          easy: "Puede ser para parar en carrera o para terminar una tanda en libres o quali."
        }
      ]
    }
  ];
}

function getGlossaryLevelTagClass(level) {
  if (level === "básico") return "general";
  if (level === "muy usado") return "market";
  if (level === "actual 2026") return "statement";
  return "technical";
}

function getAllGlossaryItems() {
  return getGlossarySections().flatMap(section =>
    section.items.map(item => ({
      ...item,
      sectionId: section.id,
      sectionTitle: section.title
    }))
  );
}

function findGlossaryItemByTerm(term) {
  const wanted = normalizeText(term);
  return getAllGlossaryItems().find(item => normalizeText(item.term) === wanted) || null;
}

function getContextGlossaryTerms(screen, phase) {
  const map = {
    home: {
      pre_weekend: ["Package / paquete de mejoras", "Setup", "Race sim"],
      friday: ["Race sim", "Degradación", "Quali sim"],
      saturday: ["Track position", "Dirty air", "Parc fermé"],
      sunday: ["Undercut", "Safety Car", "Tráfico"],
      post_race: ["Stint", "Degradación", "Track position"]
    },
    sessions: {
      pre_weekend: ["Setup", "Out-lap", "Race sim"],
      friday: ["FP1", "Race sim", "Degradación"],
      saturday: ["Quali sim", "Parc fermé", "Track position"],
      sunday: ["Undercut", "VSC", "Dirty air"],
      post_race: ["Stint", "Lift and coast", "Degradación"]
    },
    predict: {
      pre_weekend: ["Track position", "Package / paquete de mejoras", "Ritmo de carrera"],
      friday: ["Race sim", "Degradación", "Ritmo de carrera"],
      saturday: ["Ritmo a una vuelta", "Track position", "Parc fermé"],
      sunday: ["Undercut", "Overcut", "Safety Car"],
      post_race: ["Stint", "Ritmo de carrera", "Degradación"]
    },
    news: {
      pre_weekend: ["Package / paquete de mejoras", "Setup", "Fiabilidad"],
      friday: ["Race sim", "Quali sim", "Degradación"],
      saturday: ["Track position", "Ritmo a una vuelta", "Parc fermé"],
      sunday: ["Undercut", "Safety Car", "Dirty air"],
      post_race: ["Stint", "Track position", "Lift and coast"]
    },
    raceMode: {
      pre_weekend: ["Track position", "Ritmo de carrera", "Ventana de parada"],
      friday: ["Race sim", "Degradación", "Dirty air"],
      saturday: ["Track position", "Ritmo a una vuelta", "Parc fermé"],
      sunday: ["Undercut", "Overcut", "Safety Car"],
      post_race: ["Stint", "Lift and coast", "Track position"]
    }
  };

  const screenMap = map[screen] || map.home;
  return screenMap[phase] || screenMap.pre_weekend || [];
}

function getContextGlossaryItems(screen, phase) {
  return getContextGlossaryTerms(screen, phase)
    .map(findGlossaryItemByTerm)
    .filter(Boolean)
    .slice(0, 3);
}

function getContextGlossaryTitle(screen, phase) {
  const screenLabelMap = {
    home: "Conceptos útiles ahora",
    sessions: "Conceptos útiles para seguir las sesiones",
    predict: "Conceptos útiles para leer la predicción",
    news: "Conceptos útiles para interpretar las noticias",
    raceMode: "Conceptos útiles para el modo carrera"
  };

  const phaseLabelMap = {
    pre_weekend: "Previa",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo",
    post_race: "Post GP"
  };

  return {
    title: screenLabelMap[screen] || "Conceptos útiles",
    sub: `Mini glosario contextual · ${phaseLabelMap[phase] || "Previa"}`
  };
}


/* ===== HOME ===== */

async function showHome() {
  setActiveNav("nav-home");
  updateSubtitle();

  contentEl().innerHTML = `
    ${renderHomeHero()}
    ${renderLoadingCard("Cargando centro de control…", "Leyendo fase del GP, sesión actual y accesos rápidos.", true)}
  `;

  const favorite = getFavorite();
  let calendarError = null;

  try {
    const calendarData = await fetchCalendarData();

    const nextRace = getNextRaceFromCalendar(calendarData?.events || []);
    if (nextRace) {
      const mappedRace = mapCalendarEventToPredictRace(nextRace);
      if (mappedRace && getSettings().autoSelectNextRace) {
        state.detectedNextRaceName = mappedRace;
      }
    }
  } catch (error) {
    calendarError = error;
  }

  const context = getHomeWeekendContext();

  try {
    await fetchNewsDataForFavorite(favorite, false);
  } catch {
    // silencioso: la home mantiene fallback sin romper la carga
  }

  contentEl().innerHTML = `
    <div class="home-stack${isExpertMode() ? " home-stack-expert" : ""}">
      ${renderHomeHero()}
      ${calendarError ? renderErrorCard("Inicio", "No se pudo cargar el calendario del GP", calendarError.message) : ""}
      ${renderHomeDynamicBlocks(context, favorite)}
    </div>
  `;
}

/* ===== FASE 4 v1.2 · PREDICCIÓN ADAPTATIVA ===== */

function getPredictContextForRace(raceName) {
  const context = getHomeWeekendContext();
  if (!context) {
    return { context: null, phase: "pre_weekend", sameRace: false };
  }

  const sameRace = context.raceName === raceName;
  return {
    context: sameRace ? context : null,
    phase: sameRace ? context.phase : "pre_weekend",
    sameRace
  };
}

function getPredictPhaseCopy(phase, context, favorite, raceName) {
  const favoriteName = favorite?.name || "tu favorito";
  const nextSessionLabel = context?.nextSession?.label || "la siguiente sesión";
  const currentSessionLabel = context?.currentSession?.label || "la sesión actual";

  const base = {
    phaseLabel: "Previa",
    phaseTagClass: "technical",
    heroSub: `Predicción centrada en ${favoriteName} para ${raceName}.`,
    heroFocus: "Lectura previa del GP",
    heroFocusText: "Antes de que hablen las sesiones, lo más útil es entender el guion general del fin de semana.",
    guidanceTitle: "Qué mirar en esta fase",
    guidanceSub: "La pantalla cambia según el momento del fin de semana para que la lectura sea más útil.",
    summaryTitle: "Resumen instantáneo",
    summarySub: "Lo importante arriba, para saber en segundos dónde está el favorito.",
    scenariosTitle: "Escenarios",
    scenariosSub: "Una lectura más realista del fin de semana: mejor caso, base y escenario complicado.",
    factorsTitle: "Claves",
    factorsSub: "Dónde puede aparecer el rendimiento y qué puede torcer el guion.",
    qualyTitle: "Qualy vs carrera",
    qualySub: "Cómo debería comportarse el coche a una vuelta y en stint largo.",
    strategyTitle: "Estrategia",
    strategySub: "Plan base, ventana de parada y principal factor que puede alterar la carrera.",
    gridTitle: "Parrilla",
    gridSub: "Quién llega como referencia y cómo debería repartirse la parrilla.",
    textTitle: "Texto completo",
    textSub: "Resumen extendido del escenario actual."
  };

  if (phase === "friday") {
    return {
      ...base,
      phaseLabel: "Viernes",
      phaseTagClass: "general",
      heroSub: `${favoriteName} entra en fase de referencias. El foco pasa a ritmo largo, consistencia y lectura real del coche.`,
      heroFocus: "Viernes de referencias",
      heroFocusText: context?.currentSession
        ? `${currentSessionLabel} está en marcha. Hoy importa más separar ruido de tabla y ritmo real.`
        : `La siguiente referencia útil será ${nextSessionLabel}. FP2 o la sesión larga del día suele pesar más que un tiempo aislado.`,
      guidanceTitle: "Qué mirar hoy",
      guidanceSub: "Viernes sirve para entender si el coche tiene base real o solo una buena vuelta suelta.",
      summaryTitle: "Lectura rápida del viernes",
      summarySub: "Predicción base con foco extra en referencias de tanda larga y consistencia.",
      scenariosSub: "Los escenarios importan más por base de ritmo que por posición final cerrada.",
      factorsSub: "Qué señales del viernes deberían hacerte confiar más o menos en la predicción.",
      qualySub: "Todavía es pronto para dar por cerrada la qualy; hoy manda más el comportamiento del coche.",
      strategySub: "La estrategia sigue siendo preliminar: el viernes ayuda a detectar degradación y margen real."
    };
  }

  if (phase === "saturday") {
    return {
      ...base,
      phaseLabel: "Sábado",
      phaseTagClass: "market",
      heroSub: `${favoriteName} entra en el día que más puede cambiar su techo real. La qualy y la posición en pista mandan mucho más.`,
      heroFocus: "Sábado decisivo",
      heroFocusText: context?.currentSession
        ? `${currentSessionLabel} está en marcha. Hoy la ejecución a una vuelta puede cambiar por completo el domingo.`
        : `La siguiente sesión clave es ${nextSessionLabel}. El sábado suele decidir más de lo que parece.`,
      guidanceTitle: "Qué mirar hoy",
      guidanceSub: "Sábado significa tráfico, vuelta final, orden de salida y margen real para el domingo.",
      summaryTitle: "Resumen clave del sábado",
      summarySub: "Predicción con foco principal en qualy, salida y ventana real de carrera.",
      scenariosSub: "Hoy el mejor y peor caso dependen mucho más de la posición en pista.",
      factorsSub: "Qué puede hacer despegar o hundir el fin de semana del favorito durante el sábado.",
      qualySub: "Ahora esta comparación pesa más: una buena o mala qualy cambia por completo el GP.",
      strategySub: "La estrategia ya importa, pero la casilla de salida puede condicionarla casi toda."
    };
  }

  if (phase === "sunday") {
    return {
      ...base,
      phaseLabel: "Domingo",
      phaseTagClass: "statement",
      heroSub: `${favoriteName} entra en fase de carrera. Ahora manda la ejecución: salida, estrategia, tráfico y neutralizaciones.`,
      heroFocus: "Domingo de carrera",
      heroFocusText: context?.currentSession
        ? `${currentSessionLabel} está en curso. La predicción se interpreta sobre todo en clave de estrategia y ejecución.`
        : `La siguiente referencia será ${nextSessionLabel}. A estas alturas, la salida y la primera ventana de parada pesan muchísimo.`,
      guidanceTitle: "Qué mirar hoy",
      guidanceSub: "Domingo es menos teoría y más ejecución: aire limpio, stint inicial y reacción a Safety Car.",
      summaryTitle: "Resumen de carrera",
      summarySub: "Predicción con foco máximo en estrategia, tráfico y conversión real del resultado.",
      scenariosSub: "El mejor y peor caso del domingo suelen decidirse por salida, tráfico y neutralizaciones.",
      factorsSub: "Qué elementos pueden romper el guion incluso si la base del coche parecía clara.",
      qualySub: "La qualy sigue pesando, pero ahora importa sobre todo cómo se transforma en carrera.",
      strategySub: "Esta es la parte más importante del día: plan base, ventanas y factores que rompen el guion."
    };
  }

  if (phase === "post_race") {
    return {
      ...base,
      phaseLabel: "Post GP",
      phaseTagClass: "technical",
      heroSub: `${favoriteName} ya deja esta predicción como lectura de contexto. Sirve para comparar lo esperado con lo que debía venir.`,
      heroFocus: "Transición al siguiente GP",
      heroFocusText: "La carrera ya ha pasado. Esta pantalla queda como referencia del guion previo antes del próximo evento.",
      guidanceTitle: "Cómo usar esta pantalla ahora",
      guidanceSub: "Después del GP, esta predicción sirve más como contexto que como lectura operativa del momento.",
      summaryTitle: "Lectura guardada del GP",
      summarySub: "Usa esta predicción como referencia de cómo llegaba el fin de semana.",
      scenariosSub: "Los escenarios ahora se leen como marco previo, no como pronóstico activo.",
      factorsSub: "Qué variables explicaban el guion esperado antes de la carrera.",
      qualySub: "Esta comparación ya sirve más para contextualizar que para decidir el próximo paso.",
      strategySub: "La estrategia queda como marco teórico del GP ya disputado."
    };
  }

  return base;
}

function getPredictGuidanceItems(predict) {
  const contextItems = predict?.context?.whatToWatch;
  if (Array.isArray(contextItems) && contextItems.length) {
    return contextItems;
  }

  const favoriteName = predict?.favorite?.name || "tu favorito";

  if (predict?.phase === "friday") {
    return [
      "Fíjate más en tanda larga y consistencia que en una vuelta aislada.",
      `Compara a ${favoriteName} con su compañero para medir la referencia real interna.`,
      "No cierres demasiado la predicción de carrera todavía: el viernes sirve sobre todo para filtrar ruido."
    ];
  }

  if (predict?.phase === "saturday") {
    return [
      "La qualy pesa muchísimo: tráfico, ejecución y última vuelta cambian por completo el GP.",
      "Una posición de salida mala puede recortar mucho el techo real del domingo.",
      "Hoy importa mucho más posición en pista que narrativa previa."
    ];
  }

  if (predict?.phase === "sunday") {
    return [
      "Mira salida, primer stint y ventana de parada.",
      "Un Safety Car puede romper por completo el escenario base.",
      `Aunque ${favoriteName} tenga ritmo, el tráfico puede cambiar la lectura real de carrera.`
    ];
  }

  if (predict?.phase === "post_race") {
    return [
      "Usa esta pantalla como referencia de contexto, no como pronóstico activo.",
      "Compara el guion esperado con lo que realmente ocurrió.",
      "Te servirá para ajustar mejor la lectura del siguiente GP."
    ];
  }

  return [
    "Antes de que hablen las sesiones, manda más el potencial global que un detalle suelto.",
    "La jerarquía de equipos, fiabilidad y tipo de circuito siguen siendo la base.",
    `La primera sesión útil te dirá si ${favoriteName} confirma o no esta lectura previa.`
  ];
}

function renderPredictPhaseGuideCard(predict) {
  const items = getPredictGuidanceItems(predict);

  return `
    <div class="insight-list">
      ${items.map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
    </div>
  `;
}

function renderPredictContent() {
  const favorite = getFavorite();
  const raceName = getSelectedRace();
  const predictContext = getPredictContextForRace(raceName);
  const copy = getPredictPhaseCopy(predictContext.phase, predictContext.context, favorite, raceName);

  return {
    title: `PREDICCIÓN · ${favorite.name.toUpperCase()}`,
    sub: copy.heroSub,
    accent: favorite.colorClass,
    raceName,
    phase: predictContext.phase,
    context: predictContext.context,
    copy,
    favorite
  };
}

/* ===== FIN FASE 4 ===== */

function renderPredictLoadingState() {
  return `
    <div class="predict-grid">
      <div class="stat-tile"><div class="stat-kicker">Clasificación</div><div class="stat-value">...</div><div class="stat-caption">Calculando</div></div>
      <div class="stat-tile"><div class="stat-kicker">Carrera</div><div class="stat-value">...</div><div class="stat-caption">Calculando</div></div>
      <div class="stat-tile"><div class="stat-kicker">Puntos</div><div class="stat-value">...</div><div class="stat-caption">Calculando</div></div>
      <div class="stat-tile"><div class="stat-kicker">Abandono</div><div class="stat-value">...</div><div class="stat-caption">Calculando</div></div>
    </div>
  `;
}

function renderPredictSummaryCards(data) {
  const summary = data?.summary || {};
  const favoritePrediction = formatFavoritePredictionText(data?.favoritePrediction);

  return `
    <div class="predict-grid">
      <div class="stat-tile">
        <div class="stat-kicker">Clasificación</div>
        <div class="stat-value">${favoritePrediction.qualy}</div>
        <div class="stat-caption">Posición estimada del favorito</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Carrera</div>
        <div class="stat-value">${favoritePrediction.race}</div>
        <div class="stat-caption">Resultado previsto el domingo</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Puntos</div>
        <div class="stat-value">${favoritePrediction.points}</div>
        <div class="stat-caption">Opción real de puntuar</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Abandono</div>
        <div class="stat-value">${favoritePrediction.dnf}</div>
        <div class="stat-caption">Riesgo aproximado</div>
      </div>
    </div>

    <div class="meta-grid" style="margin-top:12px;">
      <div class="meta-tile">
        <div class="meta-kicker">Favorito</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(summary.predictedWinner || "—")}</div>
        <div class="meta-caption">Victoria estimada</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Safety Car</div>
        <div class="meta-value">${summary.safetyCarProbability != null ? `${summary.safetyCarProbability}%` : "—"}</div>
        <div class="meta-caption">Probabilidad base</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Lluvia</div>
        <div class="meta-value">${summary.rainProbability != null ? `${summary.rainProbability}%` : "—"}</div>
        <div class="meta-caption">Condición prevista</div>
      </div>
    </div>
  `;
}

function renderPredictPreviewCards(favorite, raceName) {
  const preview = getPredictLocalEstimate(favorite, raceName);

  return `
    <div class="predict-grid">
      <div class="stat-tile">
        <div class="stat-kicker">Clasificación</div>
        <div class="stat-value">${preview.qualyRange}</div>
        <div class="stat-caption">Estimación rápida previa</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Carrera</div>
        <div class="stat-value">${preview.raceRange}</div>
        <div class="stat-caption">Ventana competitiva esperada</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Puntos</div>
        <div class="stat-value">${preview.pointsProbability}%</div>
        <div class="stat-caption">Probabilidad local aproximada</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Safety Car</div>
        <div class="stat-value">${preview.heuristics.safetyCar}%</div>
        <div class="stat-caption">Base histórica del circuito</div>
      </div>
    </div>
  `;
}

function renderPredictScenarioCards(favorite, raceName, data = null) {
  const scenarios = getPredictScenarios(favorite, raceName, data);
  const scenarioMap = [
    { title: "Suelo", sub: "Objetivo mínimo" },
    { title: "Escenario base", sub: "Objetivo razonable" },
    { title: "Techo", sub: "Objetivo alto" }
  ];

  return `
    <div class="grid-stats">
      ${scenarios.map((item, index) => `
        <div class="stat-tile">
          <div class="stat-kicker">${escapeHtml(scenarioMap[index]?.title || item.kicker)}</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(item.value)}</div>
          <div class="stat-caption"><strong>${escapeHtml(scenarioMap[index]?.sub || "Escenario")}</strong> · ${escapeHtml(item.text)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPredictKeyFactors(favorite, raceName, data = null) {
  const factors = getPredictKeyFactors(favorite, raceName, data);
  return `
    <div class="insight-list">
      ${factors.map(item => `
        <div class="insight-item">
          <strong>${escapeHtml(item.title)}</strong><br>
          ${escapeHtml(item.text)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderPredictQualyRaceCard(favorite, raceName, data = null) {
  const balance = getQualyRaceBalance(favorite, raceName, data);

  return `
    <div class="meta-grid">
      <div class="meta-tile">
        <div class="meta-kicker">Qualy esperada</div>
        <div class="meta-value">${escapeHtml(balance.qualy)}</div>
        <div class="meta-caption">Referencia del sábado</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Carrera esperada</div>
        <div class="meta-value">${escapeHtml(balance.race)}</div>
        <div class="meta-caption">Ventana del domingo</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Lectura</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(balance.label)}</div>
        <div class="meta-caption">${escapeHtml(balance.description)}</div>
      </div>
    </div>
  `;
}

function renderPredictStrategyDetail(favorite, raceName, data = null) {
  const strategy = getStrategyNarrative(favorite, raceName, data);
  const sprint = isSprintRaceName(raceName);

  return `
    <div class="info-line" style="margin-bottom:14px;">${escapeHtml(strategy.note)}</div>
    <div class="meta-grid">
      <div class="meta-tile">
        <div class="meta-kicker">Plan base</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.label)}</div>
        <div class="meta-caption">Paradas: ${strategy.stops}</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Ventana</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.window)}</div>
        <div class="meta-caption">Momento probable</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Factor crítico</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.factor)}</div>
        <div class="meta-caption">Lo que más puede cambiar el guion</div>
      </div>
      ${sprint ? `
        <div class="meta-tile">
          <div class="meta-kicker">Impacto sprint</div>
          <div class="meta-value" style="font-size:18px;">Sábado más pesado</div>
          <div class="meta-caption">La Sprint puede alterar más la posición de salida y el riesgo de tráfico.</div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderPredictGridRead(favorite, raceName, data = null) {
  const gridRead = getPredictGridRead(favorite, raceName, data);
  const sprint = isSprintRaceName(raceName);

  return `
    <div class="meta-grid">
      <div class="meta-tile">
        <div class="meta-kicker">Favorito del GP</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(gridRead.winner)}</div>
        <div class="meta-caption">Lectura general del fin de semana</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Equipos top</div>
        <div class="meta-value" style="font-size:17px; line-height:1.2;">${escapeHtml(gridRead.topTeams)}</div>
        <div class="meta-caption">La zona alta esperada</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Zona baja</div>
        <div class="meta-value" style="font-size:17px; line-height:1.2;">${escapeHtml(gridRead.weakestTeams)}</div>
        <div class="meta-caption">Equipos con menos base</div>
      </div>
      ${sprint ? `
        <div class="meta-tile">
          <div class="meta-kicker">Formato sprint</div>
          <div class="meta-value" style="font-size:17px;">Mayor varianza</div>
          <div class="meta-caption">Dos días competitivos: más opciones de ganancia o pérdida de posición.</div>
        </div>
      ` : ""}
    </div>
  `;
}

/* ===== FAVORITO ===== */

function renderFavoriteCard() {
  const favorite = getFavorite();
  const badge = favorite.type === "driver" ? favorite.number : "EQ";
  const subtitle = favorite.type === "driver"
    ? `${favorite.team} · P${favorite.pos}`
    : `${favorite.drivers || ""} · P${favorite.pos}`;

  return `
    <div class="card favorite-card">
      <div class="favorite-label">Favorito</div>
      <div class="favorite-main">
        <div class="favorite-left">
          <div class="team-stripe ${favorite.colorClass}"></div>
          <div class="driver-number" style="color: var(--${favorite.colorClass});">${badge}</div>
          <div>
            <div class="favorite-name">${escapeHtml(favorite.name)}</div>
            <div class="favorite-sub">${escapeHtml(subtitle)}</div>
          </div>
        </div>
        <div class="favorite-points">
          <div class="favorite-points-value">${escapeHtml(favorite.points)}</div>
          <div class="favorite-points-label">pts</div>
        </div>
      </div>
    </div>
  `;
}

function renderFavoritoTrendCard(favorite, teamName) {
  const trendInfo = getTrendInfo(teamName, favorite);
  const metrics = getFavoriteMetrics(favorite);

  return `
    <div class="card">
      <div class="card-title">Momento actual</div>

      <div class="trend-pill ${trendInfo.className}" style="margin-bottom:12px;">${trendInfo.label}</div>
      <div class="info-line">${trendInfo.description}</div>

      <div class="grid-stats" style="margin-top:14px;">
        <div class="stat-tile">
          <div class="stat-kicker">Ventana esperada</div>
          <div class="stat-value">${metrics.expectedWindow}</div>
          <div class="stat-caption">Rango</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Puntos</div>
          <div class="stat-value">${metrics.pointsProbability}%</div>
          <div class="stat-caption">Probabilidad</div>
        </div>
      </div>
    </div>
  `;
}

function renderFavoritoComparisonCard(favorite, teamName, teamData, accent) {
  if (favorite.type === "driver") {
    const comparison = getDriverComparison(teamName, favorite.name);
    const gap = comparison.primaryForm - comparison.secondaryForm;

    return `
      <div class="card">
        <div class="card-title">${escapeHtml(comparison.primaryName.toUpperCase())} vs ${escapeHtml(comparison.secondaryName.toUpperCase())}</div>
        <div class="card-sub">Comparación más clara con su compañero para leer el contexto interno del equipo.</div>

        <div class="stat">Rendimiento de ${escapeHtml(comparison.primaryName)} <span>${comparison.primaryForm}%</span></div>
        <div class="bar"><div class="bar-fill ${accent}" style="width:${comparison.primaryForm}%;"></div></div>

        <div class="stat" style="margin-top:14px;">Rendimiento de ${escapeHtml(comparison.secondaryName)} <span>${comparison.secondaryForm}%</span></div>
        <div class="bar"><div class="bar-fill ${accent}" style="width:${comparison.secondaryForm}%; opacity:0.68;"></div></div>

        <div class="info-line" style="margin-top:14px;">
          ${gap >= 0
            ? `${escapeHtml(comparison.primaryName)} llega con una ventaja interna aproximada de ${gap} puntos de forma.`
            : `${escapeHtml(comparison.primaryName)} está por detrás en forma y necesita recortar ${Math.abs(gap)} puntos.`}
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-title">${escapeHtml(teamName.toUpperCase())} · ALINEACIÓN</div>
      <div class="card-sub">Comparación directa entre los dos pilotos del equipo favorito.</div>

      <div class="stat">Estado de forma de ${escapeHtml(teamData.drivers[0])} <span>${teamData.forms[0]}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.forms[0]}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Estado de forma de ${escapeHtml(teamData.drivers[1])} <span>${teamData.forms[1]}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.forms[1]}%; opacity:0.68;"></div></div>

      <div class="info-line" style="margin-top:14px;">
        ${teamData.forms[0] >= teamData.forms[1]
          ? `${escapeHtml(teamData.drivers[0])} está liderando actualmente la referencia interna.`
          : `${escapeHtml(teamData.drivers[1])} está sosteniendo mejor el nivel competitivo del equipo.`}
      </div>
    </div>
  `;
}

function getMoreNextRaceName() {
  if (state.weekendContext?.raceName) return state.weekendContext.raceName;

  const events = Array.isArray(state.calendarCache?.events) ? state.calendarCache.events : [];
  const raceEvent =
    events.find(event => event.type === "race" && event.status === "next") ||
    events.find(event => event.type === "race" && event.status === "upcoming") ||
    [...events].reverse().find(event => event.type === "race" && event.status === "completed") ||
    null;

  return mapCalendarEventToPredictRace(raceEvent) || getSelectedRace();
}

function getMoreNewsFilterLabel() {
  const map = {
    favorite: `Favorito: ${getFavorite().name}`,
    aston: "Filtro: Aston Martin",
    alonso: "Filtro: Fernando Alonso",
    grid: "Filtro: Parrilla"
  };
  return map[state.currentNewsFilterKey] || map.favorite;
}

function getMoreQuickAccessContext() {
  const favorite = getFavorite();
  const context = state.weekendContext;
  const selectedRace = getSelectedRace();
  const nextRaceName = getMoreNextRaceName();
  const hasRecentPredict = Boolean(
    state.lastPredictData &&
    state.lastPredictContext &&
    state.lastPredictContext.raceName === selectedRace
  );

  return {
    sessions: context
      ? (context.currentSession
        ? `Ahora: ${context.currentSession.label} · ${getSessionStatusLabel(context.currentSession.status)}`
        : context.nextSession
          ? `Siguiente: ${context.nextSession.label}${context.nextSessionCountdown ? ` (${context.nextSessionCountdown})` : ""}`
          : `Fase actual: ${context.phaseLabel}`)
      : "Fase del GP no disponible aún.",
    calendar: `Siguiente GP: ${nextRaceName}`,
    standings: `Favorito: ${favorite.name} · P${favorite.pos || "—"}`,
    raceMode: `GP activo: ${selectedRace}${hasRecentPredict ? " · Predicción reciente lista" : ""}`,
    news: getMoreNewsFilterLabel(),
    predict: `GP objetivo: ${selectedRace}${hasRecentPredict ? " · Con predicción reciente" : " · Sin predicción reciente"}`
  };
}

function showMore() {
  setActiveNav("nav-more");
  updateSubtitle();

  const isExpert = isExpertMode();
  const settings = getSettings();
  const favorite = getFavorite();
  const favoriteTypeLabel = favorite.type === "driver" ? "Piloto" : "Equipo";
  const favoriteTeamLine = favorite.type === "driver"
    ? `Equipo: ${favorite.team}`
    : favorite.drivers
      ? `Pilotos: ${favorite.drivers}`
      : "Constructor";
  const quickContext = getMoreQuickAccessContext();

  const renderNavCard = ({ title, description, contextLine, onclick }) => `
    <a href="#" class="menu-link more-card more-quick-card" onclick="${onclick}; return false;">
      <div class="more-card-title">${escapeHtml(title)}</div>
      <div class="more-card-sub">${escapeHtml(description)}</div>
      ${isExpert && contextLine ? `<div class="more-card-context">${escapeHtml(contextLine)}</div>` : ""}
    </a>
  `;

  contentEl().innerHTML = `
    <div class="card more-hub-card">
      <div class="card-title">MÁS</div>
      <div class="card-sub">${isExpert ? "Centro de control rápido con contexto del estado actual." : "Centro de control rápido para usar RaceControl sin fricción."}</div>

      <div class="more-section">
        <div class="more-section-title">Control rápido</div>
        <div class="more-control-stack">
          <div class="more-control-card">
            <div class="more-card-title">Favorito actual</div>
            <div class="more-card-sub">${escapeHtml(favorite.name)}</div>
            <div class="more-card-context">${escapeHtml(favoriteTypeLabel)} · ${escapeHtml(favoriteTeamLine)}${isExpert ? ` · P${escapeHtml(favorite.pos || "—")}` : ""}</div>
            <div class="action-row">
              <button class="btn-secondary" onclick="showStandings()">Cambiar favorito</button>
              <button class="danger-btn" onclick="resetFavoriteToDefault(); showMore();">Reset favorito</button>
            </div>
          </div>

          <div class="more-control-card">
            <div class="more-card-title">Modo de experiencia</div>
            <div class="more-card-sub">${isExpert ? "Ajusta densidad de información sin salir de esta pantalla." : "Cambia al instante cómo quieres ver la app."}</div>
            <div class="quick-row more-experience-row">
              <button class="chip ${!isExpert ? "active" : ""}" onclick="setExperienceMode('casual')">Casual</button>
              <button class="chip ${isExpert ? "active" : ""}" onclick="setExperienceMode('expert')">Experto</button>
            </div>
          </div>

          <div class="more-control-card">
            <div class="more-card-title">Visualización</div>
            <div class="more-card-sub">${isExpert ? "Toggles inmediatos para controlar qué se ve y cómo se prioriza." : "Ajustes frecuentes en un toque."}</div>
            <div class="quick-row more-toggle-row">
              <button class="toggle-btn ${settings.homeCompactMode ? "active" : ""}" onclick="togglePremiumSetting('homeCompactMode')">Inicio compacto</button>
              <button class="toggle-btn ${settings.showCircuitLocalTime ? "active" : ""}" onclick="togglePremiumSetting('showCircuitLocalTime')">Hora local circuito</button>
              <button class="toggle-btn ${settings.autoSelectNextRace ? "active" : ""}" onclick="togglePremiumSetting('autoSelectNextRace')">Auto GP siguiente</button>
            </div>
          </div>
        </div>
      </div>

      <div class="more-section">
        <div class="more-section-title">Accesos rápidos</div>
        <div class="more-card-grid">
          ${renderNavCard({ title: "Sesiones", description: "Estado del fin de semana y próxima sesión.", contextLine: quickContext.sessions, onclick: "showSessions()" })}
          ${renderNavCard({ title: "Calendario", description: "Fechas clave y próximo GP del campeonato.", contextLine: quickContext.calendar, onclick: "showCalendar()" })}
          ${renderNavCard({ title: "Clasificación", description: "Tabla de pilotos y equipos, con favorito.", contextLine: quickContext.standings, onclick: "showStandings()" })}
          ${renderNavCard({ title: "Modo carrera", description: "Lectura táctica y escenario del GP activo.", contextLine: quickContext.raceMode, onclick: "showRaceMode()" })}
          ${renderNavCard({ title: "Noticias", description: "Titulares filtrados para leer rápido.", contextLine: quickContext.news, onclick: "showNews()" })}
          ${renderNavCard({ title: "Predicción", description: "Escenario del GP y probabilidad rápida.", contextLine: quickContext.predict, onclick: "showPredict()" })}
        </div>
      </div>

      <div class="more-section">
        <div class="more-section-title">Sistema</div>
        <div class="more-control-stack">
          <div class="more-control-card more-system-card" onclick="showGlossary()">
            <div class="more-card-title">Glosario F1</div>
            <div class="more-card-sub">Conceptos clave de F1 en formato simple.</div>
          </div>
          <div class="more-control-card more-system-card" onclick="showSettingsPanel()">
            <div class="more-card-title">Ajustes avanzados</div>
            <div class="more-card-sub">Configuración completa y opciones secundarias.</div>
          </div>
          <div class="more-control-card">
            <div class="more-card-title">Limpieza total / reset</div>
            <div class="more-card-sub">Restaura el favorito por defecto en un toque.</div>
            <div class="action-row">
              <button class="danger-btn" onclick="resetFavoriteToDefault(); showMore();">Reset completo</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getDriverContextBadges(name, pos, team) {
  const favorite = getFavorite();
  const badges = [];
  if (pos === 1) badges.push(`<span class="context-badge leader">Líder</span>`);
  if (favorite.type === "driver" && favorite.name === name) badges.push(`<span class="context-badge favorite">Favorito</span>`);
  if (favorite.type === "driver" && favorite.team === team && favorite.name !== name) badges.push(`<span class="context-badge teammate">Compañero</span>`);
  return badges.join("");
}

function getTeamContextBadges(team, pos) {
  const favorite = getFavorite();
  const badges = [];
  if (pos === 1) badges.push(`<span class="context-badge leader">Líder</span>`);
  if (favorite.type === "team" && favorite.name === team) badges.push(`<span class="context-badge favorite">Favorito</span>`);
  if (favorite.type === "driver" && favorite.team === team) badges.push(`<span class="context-badge teammate">Equipo fav.</span>`);
  return badges.join("");
}

function renderDeltaBadge(delta) {
  if (delta > 0) return `<span class="delta-badge up">+${delta}</span>`;
  if (delta < 0) return `<span class="delta-badge down">${delta}</span>`;
  return `<span class="delta-badge flat">0</span>`;
}

function openDriverDetail(name, team, number, points, colorClass, pos) {
  const teamData = getTeamData(team);
  const favorite = getFavorite();
  const comparison = getDriverComparison(team, name);
  const isFav = favorite.type === "driver" && favorite.name === name;

  openDetailModal(`
    <div class="card" style="margin-bottom:0;">
      <div class="card-title" style="color: var(--${colorClass});">${escapeHtml(name)} · #${escapeHtml(number)}</div>
      <div class="card-sub">${escapeHtml(team)} · P${escapeHtml(pos)} · ${escapeHtml(points)} pts</div>

      <div class="grid-stats">
        <div class="stat-tile">
          <div class="stat-kicker">Ritmo carrera</div>
          <div class="stat-value">${teamData.racePace}%</div>
          <div class="stat-caption">Base del coche</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Ritmo qualy</div>
          <div class="stat-value">${teamData.qualyPace}%</div>
          <div class="stat-caption">Vuelta única</div>
        </div>
      </div>

      <div class="info-line" style="margin-top:14px;">
        ${isFav ? "Es tu favorito actual. La app adaptará Home, Predicción y Noticias a este piloto." : `${escapeHtml(name)} está siendo comparado dentro del equipo con ${escapeHtml(comparison.secondaryName)}.`}
      </div>

      <div class="stat" style="margin-top:14px;">Forma frente a su compañero <span>${comparison.primaryForm}%</span></div>
      <div class="bar"><div class="bar-fill ${colorClass}" style="width:${comparison.primaryForm}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Forma del compañero (${escapeHtml(comparison.secondaryName)}) <span>${comparison.secondaryForm}%</span></div>
      <div class="bar"><div class="bar-fill ${colorClass}" style="width:${comparison.secondaryForm}%; opacity:0.68;"></div></div>
    </div>
  `);
}

function openTeamDetail(team, drivers, points, colorClass, pos) {
  const teamData = getTeamData(team);
  const favorite = getFavorite();
  const isFav = favorite.type === "team" && favorite.name === team;

  openDetailModal(`
    <div class="card" style="margin-bottom:0;">
      <div class="card-title" style="color: var(--${colorClass});">${escapeHtml(team)}</div>
      <div class="card-sub">P${escapeHtml(pos)} · ${escapeHtml(points)} pts · ${escapeHtml(drivers)}</div>

      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Carrera</div>
          <div class="meta-value">${teamData.racePace}%</div>
          <div class="meta-caption">Ritmo base</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Qualy</div>
          <div class="meta-value">${teamData.qualyPace}%</div>
          <div class="meta-caption">Vuelta única</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Fiabilidad</div>
          <div class="meta-value">${teamData.reliability}%</div>
          <div class="meta-caption">Riesgo mecánico</div>
        </div>
      </div>

      <div class="info-line" style="margin-top:14px;">
        ${isFav ? "Es tu equipo favorito actual. La app adaptará pantallas y predicciones a este equipo." : "Ficha rápida para leer el nivel actual del equipo."}
      </div>
    </div>
  `);
}

function getTeamLogo(team) {
  if (team.includes("Aston")) return "assets/logos/aston.png";
  if (team.includes("Mercedes")) return "assets/logos/mercedes.png";
  if (team.includes("Ferrari")) return "assets/logos/ferrari.png";
  if (team.includes("McLaren")) return "assets/logos/mclaren.png";
  if (team.includes("Red Bull")) return "assets/logos/redbull.png";
  if (team.includes("Alpine")) return "assets/logos/alpine.png";
  if (team.includes("Williams")) return "assets/logos/williams.png";
  if (team.includes("Haas")) return "assets/logos/haas.png";
  if (team.includes("Audi")) return "assets/logos/audi.png";
  if (team.includes("Cadillac")) return "assets/logos/cadillac.png";
  if (team.includes("Racing Bulls")) return "assets/logos/racingbulls.png";
  return "";
}

function driverRow(pos, number, name, team, points, colorClass, image, delta) {
  const favorite = getFavorite();
  const isFav = favorite.type === "driver" && favorite.name === name;
  const isTeammate = favorite.type === "driver" && favorite.team === team && favorite.name !== name;
  const rowClass = [pos === 1 ? "leader" : "", isFav ? "favorite-row" : "", isTeammate ? "teammate-row" : ""].join(" ").trim();

  return `
    <div class="standing-row ${rowClass}" onclick="openDriverDetail(${JSON.stringify(name)}, ${JSON.stringify(team)}, ${JSON.stringify(number)}, ${JSON.stringify(points)}, ${JSON.stringify(colorClass)}, ${JSON.stringify(pos)})">
      <div class="row-left">
        <div class="row-pos-wrap">
          <div class="row-pos">${pos}</div>
          ${renderDeltaBadge(delta)}
        </div>
        <img class="row-avatar" src="${image}" alt="${escapeHtml(name)}" onerror="this.style.display='none'">
        <div class="row-stripe ${colorClass}"></div>
        <div class="row-number" style="color: var(--${colorClass});">${number}</div>
        <div class="row-info">
          <div class="row-name">${escapeHtml(name)}</div>
          <div class="row-team">
            <span>${escapeHtml(team)}</span>
            <img class="team-logo" src="${getTeamLogo(team)}" alt="${escapeHtml(team)}" onerror="this.style.display='none'">
          </div>
        </div>
      </div>
      <div class="row-badges">
        ${getDriverContextBadges(name, pos, team)}
        <div class="row-points">${escapeHtml(points)}<small>pts</small></div>
        <button class="fav-btn ${isFav ? "active" : ""}" onclick='event.stopPropagation(); setFavoriteDriver(${JSON.stringify(name)}, ${JSON.stringify(team)}, ${JSON.stringify(number)}, ${JSON.stringify(points)}, ${JSON.stringify(colorClass)}, ${JSON.stringify(image)}, ${JSON.stringify(pos)})'>★</button>
      </div>
    </div>
  `;
}

function teamRow(pos, team, drivers, points, colorClass, delta) {
  const favorite = getFavorite();
  const isFav = favorite.type === "team" && favorite.name === team;
  const isFavoriteDriverTeam = favorite.type === "driver" && favorite.team === team;
  const rowClass = [pos === 1 ? "leader" : "", isFav ? "favorite-row" : "", isFavoriteDriverTeam ? "teammate-row" : ""].join(" ").trim();

  return `
    <div class="standing-row ${rowClass}" onclick="openTeamDetail(${JSON.stringify(team)}, ${JSON.stringify(drivers)}, ${JSON.stringify(points)}, ${JSON.stringify(colorClass)}, ${JSON.stringify(pos)})">
      <div class="row-left">
        <div class="row-pos-wrap">
          <div class="row-pos">${pos}</div>
          ${renderDeltaBadge(delta)}
        </div>
        <div class="row-stripe ${colorClass}"></div>
        <div class="row-info">
          <div class="row-name" style="color: var(--${colorClass});">${escapeHtml(team)}</div>
          <div class="row-team">
            <span>${escapeHtml(drivers)}</span>
            <img class="team-logo" src="${getTeamLogo(team)}" alt="${escapeHtml(team)}" onerror="this.style.display='none'">
          </div>
        </div>
      </div>
      <div class="row-badges">
        ${getTeamContextBadges(team, pos)}
        <div class="row-points">${escapeHtml(points)}<small>pts</small></div>
        <button class="fav-btn ${isFav ? "active" : ""}" onclick='event.stopPropagation(); setFavoriteTeam(${JSON.stringify(team)}, ${JSON.stringify(drivers)}, ${JSON.stringify(points)}, ${JSON.stringify(colorClass)}, ${JSON.stringify(pos)})'>★</button>
      </div>
    </div>
  `;
}

function setFavoriteDriver(name, team, number, points, colorClass, image, pos) {
  saveFavorite({ type: "driver", name, team, number, points, colorClass, image, pos });

  if (state.calendarCache?.events) {
    state.weekendContext = buildWeekendContext(state.calendarCache.events, getFavorite());
    state.weekendNowIso = new Date().toISOString();
  }

  applyFavoriteTheme();
  updateSubtitle();
  showStandings();
}

function setFavoriteTeam(name, drivers, points, colorClass, pos) {
  saveFavorite({ type: "team", name, drivers, points, colorClass, pos });

  if (state.calendarCache?.events) {
    state.weekendContext = buildWeekendContext(state.calendarCache.events, getFavorite());
    state.weekendNowIso = new Date().toISOString();
  }

  applyFavoriteTheme();
  updateSubtitle();
  showStandings();
}

async function refreshStandings() {
  await showStandings(true);
}


function showDriversStandings() {
  const drivers = state.standingsCache?.drivers || [];
  const visible = state.standingsScope === "top10" ? drivers.slice(0, 10) : drivers;
  const el = document.getElementById("standingsContent");
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      ${visible.map(driver =>
        driverRow(
          driver.pos,
          driver.number,
          driver.name,
          driver.team,
          String(driver.points),
          driver.colorClass,
          driver.image,
          state.standingsDelta.drivers?.[driver.name] || 0
        )
      ).join("")}
    </div>
  `;
}

function showTeamsStandings() {
  const teams = state.standingsCache?.teams || [];
  const visible = state.standingsScope === "top10" ? teams.slice(0, 10) : teams;
  const el = document.getElementById("standingsContent");
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      ${visible.map(team =>
        teamRow(
          team.pos,
          team.team,
          team.drivers,
          String(team.points),
          team.colorClass,
          state.standingsDelta.teams?.[team.team] || 0
        )
      ).join("")}
    </div>
  `;
}

async function refreshCalendar() {
  await showCalendar(true);
}


function getTeamColorClass(team) {
  if (team.includes("Aston")) return "aston";
  if (team.includes("Mercedes")) return "mercedes";
  if (team.includes("Ferrari")) return "ferrari";
  if (team.includes("McLaren")) return "mclaren";
  if (team.includes("Red Bull")) return "redbull";
  if (team.includes("Alpine")) return "alpine";
  if (team.includes("Williams")) return "williams";
  if (team.includes("Audi")) return "audi";
  if (team.includes("Cadillac")) return "cadillac";
  if (team.includes("Haas")) return "haas";
  if (team.includes("Racing Bulls")) return "rb";
  return "aston";
}

function resetFavoriteToDefault() {
  saveFavorite(getDefaultFavorite());
  if (state.calendarCache?.events) {
    state.weekendContext = buildWeekendContext(state.calendarCache.events, getFavorite());
    state.weekendNowIso = new Date().toISOString();
  }
  applyFavoriteTheme();
  updateSubtitle();
  showSettingsPanel();
}


function toggleAutoNextRace() {
  // Compatibilidad legacy por si algún onclick externo aún usa este nombre.
  togglePremiumSetting("autoSelectNextRace");
}


function openDetailModal(html) {
  modalContentEl().innerHTML = html;
  modalEl().classList.add("open");
}

function closeDetailModal(evt) {
  if (evt && evt.target && evt.target.id !== "detailModal") return;
  modalEl().classList.remove("open");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetailModal();
});

function renderBootError(message) {
  const content = document.getElementById("content");
  if (!content) return;
  content.innerHTML = `
    <div class="card">
      <div class="card-title">Error de arranque</div>
      <div class="card-sub">La app no ha podido iniciarse correctamente.</div>
      <pre class="ai-output">${String(message || "Error desconocido")}</pre>
    </div>
  `;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootRaceControl);
} else {
  setTimeout(bootRaceControl, 0);
}

/* ===== FASE 6 · FAVORITO INTELIGENTE ===== */

function getActivePredictDataForRace(favorite, raceName) {
  if (!state.lastPredictData || !state.lastPredictContext) return null;
  if (state.lastPredictContext.raceName !== raceName) return null;
  if (state.lastPredictContext.favoriteKey !== `${favorite.type}:${favorite.name}`) return null;
  return state.lastPredictData;
}

function getFavoriteRiskFocus(favorite, raceName, predictData) {
  const metrics = getFavoriteMetrics(favorite);
  const heuristics = getRaceHeuristics(raceName);
  const teamData = metrics.teamData;

  if (teamData.reliability < 65) return "Fiabilidad";
  if (teamData.qualyPace + 4 < teamData.racePace && heuristics.tag === "urbano") return "Qualy / tráfico";
  if (heuristics.safetyCar >= 45) return "Safety Car";
  if (heuristics.rain >= 28) return "Meteorología";
  if (predictData?.summary?.strategy?.stops >= 2) return "Estrategia";
  return "Ejecución";
}

function getFavoriteWeekendObjective(favorite, raceName, predictData, context) {
  const metrics = getFavoriteMetrics(favorite);
  const prediction = predictData ? formatFavoritePredictionText(predictData.favoritePrediction) : null;

  const realistic =
    prediction?.race && prediction.race !== "Sin datos"
      ? prediction.race
      : metrics.expectedWindow;

  const high = shiftPositionLabel(realistic, -2);
  const minimum = metrics.dnfRisk >= 28 ? "Terminar limpio" : shiftPositionLabel(realistic, 2);
  const risk = getFavoriteRiskFocus(favorite, raceName, predictData);

  return {
    minimum,
    realistic,
    high,
    risk,
    phase: context?.phaseLabel || "Previa"
  };
}

function getCircuitDemandProfile(raceName) {
  const heuristics = getRaceHeuristics(raceName);

  if (raceName.includes("Italia")) {
    return {
      aero: 58,
      traction: 66,
      topSpeed: 92,
      tyreManagement: 70,
      note: "Monza premia mucho la eficiencia y la velocidad punta."
    };
  }

  if (heuristics.tag === "urbano") {
    return {
      aero: 78,
      traction: 85,
      topSpeed: 62,
      tyreManagement: 72,
      note: "Circuito de muros: confianza, tracción y posición en pista pesan mucho."
    };
  }

  if (heuristics.tag === "semiurbano") {
    return {
      aero: 70,
      traction: 76,
      topSpeed: 74,
      tyreManagement: 74,
      note: "Compromiso entre recta, tracción y ritmo largo."
    };
  }

  if (heuristics.tag === "altitud") {
    return {
      aero: 68,
      traction: 78,
      topSpeed: 82,
      tyreManagement: 68,
      note: "La altitud cambia bastante el comportamiento esperado."
    };
  }

  return {
    aero: 80,
    traction: 72,
    topSpeed: 74,
    tyreManagement: 78,
    note: "Circuito más clásico: aerodinámica, consistencia y gestión de neumáticos suelen mandar."
  };
}

function getCircuitFitValue(teamValue, demandValue) {
  const diff = Math.abs(teamValue - demandValue);
  return clamp(100 - diff * 2, 35, 96);
}

function getFavoriteCircuitFit(favorite, raceName) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const demand = getCircuitDemandProfile(raceName);

  const fit = {
    aero: getCircuitFitValue(teamData.aero, demand.aero),
    traction: getCircuitFitValue(teamData.traction, demand.traction),
    topSpeed: getCircuitFitValue(teamData.topSpeed, demand.topSpeed),
    tyreManagement: getCircuitFitValue(teamData.tyreManagement, demand.tyreManagement)
  };

  const overall = Math.round((fit.aero + fit.traction + fit.topSpeed + fit.tyreManagement) / 4);
  const label = overall >= 78 ? "Encaje alto" : overall >= 66 ? "Encaje medio" : "Encaje delicado";

  return { demand, fit, overall, label, teamData };
}

function getFavoriteComparisonBreakdown(favorite) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const trend = getTrendInfo(teamName, favorite);

  if (favorite.type === "driver") {
    const comparison = getDriverComparison(teamName, favorite.name);
    const gap = comparison.primaryForm - comparison.secondaryForm;

    return {
      title: `${comparison.primaryName} vs ${comparison.secondaryName}`,
      items: [
        {
          kicker: "Forma interna",
          value: `${comparison.primaryForm}%`,
          caption: gap >= 0 ? `Ventaja interna de ${gap}` : `Desventaja interna de ${Math.abs(gap)}`
        },
        {
          kicker: "Lectura qualy",
          value: teamData.qualyPace >= teamData.racePace ? "Sábado" : "Domingo",
          caption: teamData.qualyPace >= teamData.racePace ? "El sábado pesa más" : "El domingo puede abrir más"
        },
        {
          kicker: "Fiabilidad",
          value: `${teamData.reliability}%`,
          caption: teamData.reliability < 65 ? "Factor de riesgo" : "Base razonable"
        },
        {
          kicker: "Tendencia",
          value: trend.label,
          caption: trend.description
        }
      ]
    };
  }

  return {
    title: `${teamData.drivers[0]} vs ${teamData.drivers[1]}`,
    items: [
      {
        kicker: teamData.drivers[0],
        value: `${teamData.forms[0]}%`,
        caption: "Estado actual"
      },
      {
        kicker: teamData.drivers[1],
        value: `${teamData.forms[1]}%`,
        caption: "Estado actual"
      },
      {
        kicker: "Fiabilidad",
        value: `${teamData.reliability}%`,
        caption: teamData.reliability < 65 ? "Factor de riesgo" : "Base razonable"
      },
      {
        kicker: "Tendencia",
        value: trend.label,
        caption: trend.description
      }
    ]
  };
}

function getFavoriteWeekendRadar(favorite, raceName, context, predictData) {
  const heuristics = getRaceHeuristics(raceName);
  const metrics = getFavoriteMetrics(favorite);

  const need =
    metrics.teamData.qualyPace + 4 < metrics.teamData.racePace
      ? "Necesita no perder demasiada posición el sábado."
      : "Necesita construir un fin de semana limpio desde la primera referencia.";

  const danger =
    metrics.dnfRisk >= 28
      ? "La fiabilidad o un sábado torcido pueden romper el objetivo real."
      : heuristics.tag === "urbano"
      ? "El tráfico y la posición en pista pueden recortar mucho el techo del domingo."
      : "Una mala salida o un stint inicial sin aire limpio pueden cambiar el guion.";

  const watch =
    context?.phase === "friday"
      ? "FP2 y las tandas largas son la señal más útil."
      : context?.phase === "saturday"
      ? "La qualy es la señal principal: cambia por completo la lectura del GP."
      : context?.phase === "sunday"
      ? "Mira la salida, la ventana de parada y cualquier Safety Car."
      : `La primera referencia útil será ${context?.nextSession?.label || "la siguiente sesión"}.`;

  return [
    { title: "Qué necesita", text: need },
    { title: "Qué le puede hundir", text: danger },
    { title: "Qué mirar primero", text: watch }
  ];
}

function getFavoriteDirectRivals(favorite, standingsData, predictData) {
  if (!standingsData) return [];

  if (favorite.type === "team") {
    const teams = standingsData.teams || [];
    const current = teams.find(t => t.team === favorite.name);
    if (!current) return [];

    return [current.pos - 1, current.pos + 1]
      .map(pos => teams.find(t => t.pos === pos))
      .filter(Boolean)
      .map(team => ({
        title: team.team,
        sub: team.drivers,
        meta: `P${team.pos} · ${team.points} pts`,
        colorClass: team.colorClass
      }));
  }

  const drivers = standingsData.drivers || [];
  const current = drivers.find(d => d.name === favorite.name);
  if (!current) return [];

  const teammate = drivers.find(d => d.team === favorite.team && d.name !== favorite.name);
  const ahead = drivers.find(d => d.pos === current.pos - 1);
  const behind = drivers.find(d => d.pos === current.pos + 1);

  return [teammate, ahead, behind]
    .filter(Boolean)
    .map(driver => ({
      title: driver.name,
      sub: driver.team,
      meta: `P${driver.pos} · ${driver.points} pts`,
      colorClass: driver.colorClass || getTeamColorClass(driver.team)
    }));
}

function renderFavoritoHeroContextCard(favorite, raceName, predictData, context) {
  const signal = getWeekendSignal(favorite, raceName);
  const objective = getFavoriteWeekendObjective(favorite, raceName, predictData, context);

  return `
    <div class="card highlight-card">
      <div class="mini-pill">FAVORITO INTELIGENTE</div>
      <div class="card-title">${escapeHtml(favorite.name)}</div>
      <div class="card-sub">${escapeHtml(raceName)} · ${escapeHtml(context?.phaseLabel || "Previa")}</div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${context?.phase === "sunday" ? "statement" : context?.phase === "saturday" ? "market" : "general"}">${escapeHtml(context?.phaseLabel || "Previa")}</span>
        <span class="trend-pill ${signal.className}">${escapeHtml(signal.label)}</span>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Objetivo real</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(objective.realistic)}</div>
          <div class="meta-caption">Base</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Objetivo alto</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(objective.high)}</div>
          <div class="meta-caption">Techo</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Riesgo principal</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(objective.risk)}</div>
          <div class="meta-caption">Clave</div>
        </div>
      </div>
    </div>
  `;
}


function getCircuitAssetName(raceName) {
  if (!raceName) return "";
  return CIRCUIT_ASSET_FILES[raceName] || "";
}

function getCircuitAssetPath(raceName) {
  const file = getCircuitAssetName(raceName);
  return file ? `/assets/circuits/${file}` : "";
}


/* ===== FASE 8 · CALENDARIO INTELIGENTE ===== */

function getCalendarFormatLabel(raceName) {
  const config = getOfficialSessionConfig(raceName);
  if (!config) return "Sin datos";
  if (config.format === "sprint") return "Sprint weekend";
  if (config.format === "standard") return "Formato normal";
  return "Horario no disponible";
}

function getCalendarEventNarrative(event) {
  const raceName = mapCalendarEventToPredictRace(event) || event?.title || "GP";
  const heuristics = getRaceHeuristics(raceName);
  const format = getCalendarFormatLabel(raceName);

  if (heuristics.tag === "urbano") return `${format} · Circuito de muros: la posición en pista pesa mucho.`;
  if (heuristics.tag === "semiurbano") return `${format} · Compromiso entre recta, tracción y ritmo largo.`;
  if (heuristics.tag === "altitud") return `${format} · La altitud cambia bastante el comportamiento esperado.`;
  return `${format} · Circuito más clásico donde suele mandar más el ritmo puro.`;
}


/* ===== ARRANQUE + PERSISTENCIA SEGURA ===== */

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeUiState(value) {
  const uiState = asPlainObject(value);

  return {
    standingsViewType: uiState.standingsViewType === "teams" ? "teams" : "drivers",
    standingsScope: uiState.standingsScope === "all" ? "all" : "top10",
    currentNewsFilterKey: uiState.currentNewsFilterKey || DEFAULT_NEWS_FILTER_KEY
  };
}

function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

function getSettings() {
  const savedSettings = asPlainObject(
    storageReadJson(STORAGE_KEYS.settings, null)
  );

  const legacyUiState = asPlainObject(
    storageReadJson(STORAGE_KEYS.uiState, null)
  );

  const migratedLegacySettings = {
    language: legacyUiState.language,
    autoSelectNextRace: legacyUiState.autoSelectNextRace,
    showCircuitLocalTime: legacyUiState.showCircuitLocalTime,
    homeCompactMode: legacyUiState.homeCompactMode,
    weekendExplainerMode: legacyUiState.weekendExplainerMode,
    experienceMode: legacyUiState.experienceMode
  };

  return {
    ...getDefaultSettings(),
    ...migratedLegacySettings,
    ...savedSettings
  };
}

function saveSettings(settings) {
  const next = {
    ...getDefaultSettings(),
    ...asPlainObject(settings)
  };

  storageWriteJson(STORAGE_KEYS.settings, next);
}

function getExperienceMode() {
  return getSettings().experienceMode === "expert" ? "expert" : "casual";
}

function isExpertMode() {
  return getExperienceMode() === "expert";
}

function isCasualMode() {
  return !isExpertMode();
}

function getUiState() {
  return sanitizeUiState(storageReadJson(STORAGE_KEYS.uiState, null));
}

function saveUiState() {
  storageWriteJson(STORAGE_KEYS.uiState, sanitizeUiState({
    standingsViewType: state.standingsViewType,
    standingsScope: state.standingsScope,
    currentNewsFilterKey: state.currentNewsFilterKey
  }));
}

function applyStoredUiState() {
  const saved = getUiState();

  state.standingsViewType = saved.standingsViewType;
  state.standingsScope = saved.standingsScope;
  state.currentNewsFilterKey = saved.currentNewsFilterKey;
}

function getLocalDataSummary() {
  const history = storageReadJson(STORAGE_KEYS.predictionHistory, []);
  return {
    predictions: Array.isArray(history) ? history.length : 0,
    selectedRace: storageRead(STORAGE_KEYS.selectedRace) || "Auto",
    favorite: getFavorite()
  };
}

function repairLocalStorageState() {
  const favorite = getFavorite();
  const settings = getSettings();
  const uiState = getUiState();

  saveFavorite(favorite);
  saveSettings(settings);

  state.standingsViewType = uiState.standingsViewType;
  state.standingsScope = uiState.standingsScope;
  state.currentNewsFilterKey = uiState.currentNewsFilterKey;
  saveUiState();
}

function togglePremiumSetting(key) {
  const settings = getSettings();
  saveSettings({
    ...settings,
    [key]: !settings[key]
  });
  const active = document.querySelector("#bottomNav a.active")?.id;
  if (active === "nav-more") {
    showMore();
    return;
  }
  showSettingsPanel();
}

function setExperienceMode(mode) {
  const nextMode = mode === "expert" ? "expert" : "casual";
  const settings = getSettings();
  if (settings.experienceMode === nextMode) return;

  saveSettings({
    ...settings,
    experienceMode: nextMode
  });

  refreshCurrentView();
}

function refreshCurrentView() {
  const active = document.querySelector("#bottomNav a.active")?.id;

  if (active === "nav-home") return showHome();
  if (active === "nav-predict") return showPredict();
  if (active === "nav-favorito") return showFavorito();
  if (active === "nav-news") return showNews();

  const view = contentEl()?.querySelector(".menu-link");
  if (view) return showMore();

  showSettingsPanel();
}

function clearSelectedRaceSetting() {
  storageRemove(STORAGE_KEYS.selectedRace);

  const settings = getSettings();
  saveSettings({
    ...settings,
    autoSelectNextRace: true
  });

  showSettingsPanel();
}

function setStandingsView(type) {
  state.standingsViewType = type === "teams" ? "teams" : "drivers";
  saveUiState();

  if (typeof renderStandingsSummaryBlock === "function") {
    renderStandingsSummaryBlock();
  }

  if (state.standingsViewType === "teams") showTeamsStandings();
  else showDriversStandings();
}

function setStandingsScope(scope) {
  state.standingsScope = scope === "all" ? "all" : "top10";
  saveUiState();

  if (state.standingsViewType === "teams") showTeamsStandings();
  else showDriversStandings();
}

function switchNewsFilter(key) {
  state.currentNewsFilterKey = key || DEFAULT_NEWS_FILTER_KEY;
  saveUiState();
  showNews();
}

function clearAllLocalData() {
  clearStorageKeys(ALL_STORAGE_KEYS);

  Object.assign(state, createInitialRuntimeState());
}

function resetAllDataAndReboot() {
  clearAllLocalData();
  repairLocalStorageState();
  applyStoredUiState();
  updateSubtitle();
  showHome();
}

function bootRaceControl() {
  try {
    repairLocalStorageState();
    applyStoredUiState();

    const repairedFavorite = getFavorite();
    saveFavorite(repairedFavorite);
    applyFavoriteTheme();

    updateSubtitle();

    fetchStandingsData().catch(() => {});
    fetchCalendarData().catch(() => {});

    showHome();
    window.__racecontrolBooted = true;
  } catch (error) {
    renderBootError(error && error.message ? error.message : String(error));
  }
}
