window.__racecontrolScriptLoaded = true;

const state = {
  standingsCache: null,
  calendarCache: null,
  homeNewsCache: {},
  lastPredictData: null,
  lastPredictContext: null,
  detectedNextRaceName: null,
  standingsDelta: { drivers: {}, teams: {} },
  standingsViewType: "drivers",
  standingsScope: "top10",
  currentNewsFilterKey: "favorite"
};

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

function getDefaultSettings() {
  return {
    language: "es-ES",
    autoSelectNextRace: true
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
  return String(value || "").toLowerCase().trim();
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getSettings() {
  const saved = safeJsonParse(localStorage.getItem("racecontrolSettings"), null);
  return saved ? { ...getDefaultSettings(), ...saved } : getDefaultSettings();
}

function saveSettings(settings) {
  localStorage.setItem("racecontrolSettings", JSON.stringify(settings));
}

function getFavorite() {
  try {
    const saved = localStorage.getItem("racecontrolFavorite");
    if (!saved) return getDefaultFavorite();

    const parsed = JSON.parse(saved);
    return normalizeFavorite(parsed);
  } catch {
    return getDefaultFavorite();
  }
}

function saveFavorite(favorite) {
  localStorage.setItem("racecontrolFavorite", JSON.stringify(normalizeFavorite(favorite)));
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
  const stored = localStorage.getItem("racecontrolSelectedRace");
  if (settings.autoSelectNextRace && state.detectedNextRaceName) return state.detectedNextRaceName;
  if (stored) return stored;
  return state.detectedNextRaceName || "GP Miami";
}

function saveSelectedRace(raceName) {
  localStorage.setItem("racecontrolSelectedRace", raceName);
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

function saveStandingsSnapshot(data) {
  const snapshot = {
    updatedAt: data?.updatedAt || null,
    drivers: Object.fromEntries((data?.drivers || []).map(d => [d.name, d.pos])),
    teams: Object.fromEntries((data?.teams || []).map(t => [t.team, t.pos]))
  };
  localStorage.setItem("racecontrolStandingsSnapshot", JSON.stringify(snapshot));
}

function computeStandingsDelta(data) {
  const previous = safeJsonParse(localStorage.getItem("racecontrolStandingsSnapshot"), null);
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

function renderWeekendSummary(nextRace) {
  const data = getWeekendSummaryData(nextRace);

  return `
    <div class="card highlight-card">
      <div class="mini-pill">RESUMEN DEL FIN DE SEMANA</div>
      <div class="card-title">Qué esperar del próximo GP</div>
      <div class="card-sub">Lectura rápida para casuals y base de contexto para quien sigue todo el fin de semana.</div>

      <div class="weekend-top">
        <div class="weekend-top-left">
          <div class="trend-pill ${data.signal.className}">${data.signal.label}</div>
          <div class="weekend-top-text">${data.signal.description}</div>
        </div>
        <div class="weekend-race-box">
          <div class="weekend-race-label">Próximo GP</div>
          <div class="weekend-race-name">${escapeHtml(data.raceName)}</div>
        </div>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Favorito GP</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(data.gpFavorite)}</div>
          <div class="meta-caption">Lectura inicial del fin de semana</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Safety Car</div>
          <div class="meta-value">${data.heuristics.safetyCar}%</div>
          <div class="meta-caption">Probabilidad base</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Lluvia</div>
          <div class="meta-value">${data.heuristics.rain}%</div>
          <div class="meta-caption">Escenario meteorológico</div>
        </div>
      </div>

      <div class="grid-stats" style="margin-top:14px;">
        <div class="stat-tile">
          <div class="stat-kicker">Ventana esperada</div>
          <div class="stat-value">${data.metrics.expectedWindow}</div>
          <div class="stat-caption">Rango competitivo del favorito</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Puntos</div>
          <div class="stat-value">${data.metrics.pointsProbability}%</div>
          <div class="stat-caption">Probabilidad estimada de puntuar</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Riesgo</div>
          <div class="stat-value">${data.metrics.dnfRisk}%</div>
          <div class="stat-caption">Riesgo aproximado de abandono</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Tendencia</div>
          <div class="stat-value" style="font-size:18px;">${data.metrics.trendInfo.label}</div>
          <div class="stat-caption">${data.metrics.trendInfo.description}</div>
        </div>
      </div>

      <div class="card-sub" style="margin-top:16px; margin-bottom:10px;">3 claves del fin de semana</div>
      <div class="insight-list">
        ${data.keyPoints.map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderHomeQuickSummary(nextRace) {
  const favorite = getFavorite();
  const metrics = getFavoriteMetrics(favorite);
  const nextRaceName = mapCalendarEventToPredictRace(nextRace) || getSelectedRace();
  const heuristics = getRaceHeuristics(nextRaceName);

  return `
    <div class="card">
      <div class="mini-pill">CENTRO DE CONTROL</div>
      <div class="card-title">Resumen rápido del favorito</div>
      <div class="card-sub">Lectura inmediata para abrir la app y saber en segundos dónde está el favorito.</div>

      <div class="grid-stats">
        <div class="stat-tile">
          <div class="stat-kicker">Puntos</div>
          <div class="stat-value">${metrics.pointsProbability}%</div>
          <div class="stat-caption">Probabilidad aproximada para el próximo GP</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Ventana esperada</div>
          <div class="stat-value">${metrics.expectedWindow}</div>
          <div class="stat-caption">Rango competitivo estimado</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Riesgo</div>
          <div class="stat-value">${metrics.dnfRisk}%</div>
          <div class="stat-caption">Riesgo aproximado de abandono</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Tendencia</div>
          <div class="stat-value" style="font-size:18px;">${metrics.trendInfo.label}</div>
          <div class="stat-caption">${metrics.trendInfo.description}</div>
        </div>
      </div>

      <div class="quick-row" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Safety Car</div>
          <div class="meta-value">${heuristics.safetyCar}%</div>
          <div class="meta-caption">${escapeHtml(nextRaceName)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Lluvia</div>
          <div class="meta-value">${heuristics.rain}%</div>
          <div class="meta-caption">Condición base del circuito</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeNextRace(nextRace) {
  const raceName = mapCalendarEventToPredictRace(nextRace) || getSelectedRace();
  const heuristics = getRaceHeuristics(raceName);

  if (!nextRace) {
    return `
      <div class="card">
        <div class="card-title">Próxima carrera</div>
        <div class="empty-line">No se ha podido detectar la siguiente carrera ahora mismo.</div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="mini-pill">SIGUIENTE GP</div>
      <div class="next-race-main">
        <div>
          <div class="next-race-title">${escapeHtml(nextRace.title)}</div>
          <div class="next-race-sub">${escapeHtml(nextRace.venue)} · ${escapeHtml(nextRace.location)}</div>
          <div class="next-race-sub">${escapeHtml(heuristics.tag)} · ritmo y estrategia condicionados por el circuito</div>
        </div>
        <div class="race-date-box">
          ${formatCalendarDateRange(nextRace.start, nextRace.end)}<br>
          <span style="color:rgba(255,255,255,0.52);">${getCalendarStatusLabel(nextRace.status, nextRace.type)}</span>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Safety Car</div>
          <div class="meta-value">${heuristics.safetyCar}%</div>
          <div class="meta-caption">Probabilidad base</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Lluvia</div>
          <div class="meta-value">${heuristics.rain}%</div>
          <div class="meta-caption">Escenario inicial</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(raceName)}</div>
          <div class="meta-caption">Se usará por defecto</div>
        </div>
      </div>

      <div class="quick-row">
        <a href="#" class="btn-secondary" onclick="saveSelectedRace('${raceName.replace(/'/g, "\\'")}'); showPredict(); return false;">Abrir predicción</a>
      </div>
    </div>
  `;
}

function renderHomeTeamStatus() {
  const favorite = getFavorite();
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const accent = favorite.colorClass;
  const teamData = getTeamData(teamName);

  return `
    <div class="card">
      <div class="card-title" style="color: var(--${accent});">${escapeHtml(teamName.toUpperCase())} · ESTADO</div>
      <div class="stat">Ritmo de carrera <span>${teamData.racePace}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.racePace}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Ritmo a una vuelta <span>${teamData.qualyPace}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.qualyPace}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Fiabilidad <span>${teamData.reliability}%</span></div>
      <div class="bar"><div class="bar-fill ferrari" style="width:${teamData.reliability}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Previsión del fin de semana <span>${escapeHtml(teamData.outlook)}</span></div>
    </div>
  `;
}

function renderHomeHierarchy() {
  const favorite = getFavorite();
  const favoriteTeam = favorite.type === "driver" ? favorite.team : favorite.name;
  const favoriteColor = favorite.colorClass;
  const favoriteData = getTeamData(favoriteTeam);

  const rows = [
    { name: "Mercedes", value: 92, color: "mercedes" },
    { name: "Ferrari", value: 88, color: "ferrari" },
    { name: "McLaren", value: 84, color: "mclaren" },
    { name: "Red Bull", value: 80, color: "redbull" },
    { name: favoriteTeam, value: favoriteData.racePace, color: favoriteColor }
  ];

  const uniqueRows = [];
  const seen = new Set();

  rows.forEach(row => {
    if (!seen.has(row.name)) {
      uniqueRows.push(row);
      seen.add(row.name);
    }
  });

  return `
    <div class="card">
      <div class="card-title">Jerarquía de equipos</div>
      ${uniqueRows.map(row => `
        <div class="stat">
          <span style="${row.name === favoriteTeam ? `color: var(--${row.color}); font-weight: 700;` : ""}">${escapeHtml(row.name)}</span>
          ${row.value}%
        </div>
        <div class="bar"><div class="bar-fill ${row.color}" style="width:${row.value}%;"></div></div>
      `).join("")}
    </div>
  `;
}

function renderHomeNewsPreview(items, favorite) {
  const previewItems = Array.isArray(items) ? items.slice(0, 3) : [];

  return `
    <div class="card">
      <div class="card-title">Noticias clave · ${escapeHtml(favorite.name)}</div>
      <div class="card-sub">Las 3 noticias más útiles para no ir a ciegas antes del próximo GP.</div>

      ${previewItems.length ? previewItems.map(item => `
        <div class="news-item">
          <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
          <div class="news-source">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
        </div>
      `).join("") : `
        <div class="empty-line">No se han podido cargar noticias destacadas ahora mismo.</div>
      `}
    </div>
  `;
}

async function showHome() {
  setActiveNav("nav-home");
  updateSubtitle();

  contentEl().innerHTML = `
    ${renderHomeHero()}
    ${renderLoadingCard("Cargando centro de control…", "Preparando próxima carrera, resumen del favorito y noticias principales.", true)}
  `;

  const favorite = getFavorite();

  try {
    const [calendarData, newsData] = await Promise.all([
      fetchCalendarData(),
      fetchNewsDataForFavorite(favorite)
    ]);

    const nextRace = getNextRaceFromCalendar(calendarData?.events || []);
    if (nextRace) {
      const mappedRace = mapCalendarEventToPredictRace(nextRace);
      if (mappedRace && getSettings().autoSelectNextRace) {
        state.detectedNextRaceName = mappedRace;
      }
    }

    contentEl().innerHTML = `
      ${renderHomeHero()}
      ${renderWeekendSummary(nextRace)}
      ${renderHomeQuickSummary(nextRace)}
      ${renderHomeNextRace(nextRace)}
      ${renderHomeTeamStatus()}
      ${renderHomeNewsPreview(newsData?.items || [], favorite)}
      ${renderHomeHierarchy()}
    `;
  } catch (error) {
    contentEl().innerHTML = `
      ${renderHomeHero()}
      ${renderErrorCard("Inicio", "Error al cargar el centro de control", error.message)}
      ${renderHomeTeamStatus()}
      ${renderHomeHierarchy()}
    `;
  }
}

function renderPredictContent() {
  const favorite = getFavorite();
  const raceName = getSelectedRace();

  return {
    title: `PREDICCIÓN · ${favorite.name.toUpperCase()}`,
    sub: `Predicción centrada en ${favorite.name} para ${raceName}.`,
    accent: favorite.colorClass,
    raceName
  };
}

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

  return `
    <div class="grid-stats">
      ${scenarios.map(item => `
        <div class="stat-tile">
          <div class="stat-kicker">${escapeHtml(item.kicker)}</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(item.value)}</div>
          <div class="stat-caption">${escapeHtml(item.text)}</div>
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
    </div>
  `;
}

function renderPredictGridRead(favorite, raceName, data = null) {
  const gridRead = getPredictGridRead(favorite, raceName, data);

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
    </div>
  `;
}

function getPredictionHistory() {
  const history = safeJsonParse(localStorage.getItem("racecontrolPredictionHistory"), []);
  return Array.isArray(history) ? history : [];
}

function savePredictionHistory(history) {
  localStorage.setItem("racecontrolPredictionHistory", JSON.stringify(history));
}

function pushPredictionHistory(data, favorite, raceName) {
  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    raceName,
    favoriteType: favorite.type,
    favoriteName: favorite.name,
    favoriteTeam: favorite.team || favorite.name,
    summary: {
      winner: data?.summary?.predictedWinner || null,
      favoritePrediction: formatFavoritePredictionText(data?.favoritePrediction),
      strategy: data?.summary?.strategy?.label || null
    },
    text: formatPredictResponse(data)
  };

  const history = getPredictionHistory();
  const next = [entry, ...history].slice(0, 8);
  savePredictionHistory(next);
}

function renderPredictionHistory() {
  const history = getPredictionHistory();
  if (!history.length) return `<div class="empty-line">Todavía no hay predicciones guardadas.</div>`;

  return `
    <div class="history-list">
      ${history.map(item => `
        <div class="history-item" onclick="openPredictionHistoryItem(${item.id})">
          <div class="history-head">
            <div>
              <div class="history-title">${escapeHtml(item.raceName)} · ${escapeHtml(item.favoriteName)}</div>
              <div class="history-sub">Clasificación: ${escapeHtml(item.summary.favoritePrediction.qualy)} · Carrera: ${escapeHtml(item.summary.favoritePrediction.race)}</div>
            </div>
            <div class="history-meta">${escapeHtml(formatDateTimeShort(item.createdAt))}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function clearPredictionHistory() {
  localStorage.removeItem("racecontrolPredictionHistory");
  document.getElementById("predictionHistoryBox")?.replaceChildren();
  const box = document.getElementById("predictionHistoryBox");
  if (box) box.innerHTML = renderPredictionHistory();
}

function openPredictionHistoryItem(id) {
  const item = getPredictionHistory().find(entry => entry.id === id);
  if (!item) return;
  openDetailModal(`
    <div class="card" style="margin-bottom:0;">
      <div class="card-title">${escapeHtml(item.raceName)} · ${escapeHtml(item.favoriteName)}</div>
      <div class="card-sub">${escapeHtml(formatDateTimeShort(item.createdAt))}</div>
      <pre class="ai-output">${escapeHtml(item.text)}</pre>
    </div>
  `);
}

async function runPredict() {
  const output = document.getElementById("predictOutput");
  const favorite = getFavorite();
  const raceSelect = document.getElementById("predictRace");
  const raceName = raceSelect?.value || getSelectedRace();

  saveSelectedRace(raceName);

  if (output) output.innerText = "Generando predicción...";

  const summaryBox = document.getElementById("predictSummaryCards");
  const scenariosBox = document.getElementById("predictScenarioCards");
  const factorsBox = document.getElementById("predictKeyFactors");
  const qualyRaceBox = document.getElementById("predictQualyRace");
  const strategyBox = document.getElementById("predictStrategyDetail");
  const gridBox = document.getElementById("predictGridRead");

  if (summaryBox) summaryBox.innerHTML = renderPredictLoadingState();
  if (scenariosBox) scenariosBox.innerHTML = `<div class="empty-line">Recalculando escenarios del fin de semana…</div>`;
  if (factorsBox) factorsBox.innerHTML = `<div class="empty-line">Releyendo fortalezas, riesgos y contexto…</div>`;
  if (qualyRaceBox) qualyRaceBox.innerHTML = `<div class="empty-line">Comparando comportamiento a una vuelta y ritmo largo…</div>`;
  if (strategyBox) strategyBox.innerHTML = `<div class="empty-line">Actualizando estrategia prevista…</div>`;
  if (gridBox) gridBox.innerHTML = `<div class="empty-line">Reordenando lectura global de la parrilla…</div>`;

  try {
    const data = await fetchPredictData(favorite, raceName);
    state.lastPredictData = data;
    state.lastPredictContext = {
      raceName,
      favoriteKey: `${favorite.type}:${favorite.name}`
    };

    pushPredictionHistory(data, favorite, raceName);

    if (summaryBox) summaryBox.innerHTML = renderPredictSummaryCards(data);
    if (scenariosBox) scenariosBox.innerHTML = renderPredictScenarioCards(favorite, raceName, data);
    if (factorsBox) factorsBox.innerHTML = renderPredictKeyFactors(favorite, raceName, data);
    if (qualyRaceBox) qualyRaceBox.innerHTML = renderPredictQualyRaceCard(favorite, raceName, data);
    if (strategyBox) strategyBox.innerHTML = renderPredictStrategyDetail(favorite, raceName, data);
    if (gridBox) gridBox.innerHTML = renderPredictGridRead(favorite, raceName, data);
    if (output) output.innerText = formatPredictResponse(data);

    const historyBox = document.getElementById("predictionHistoryBox");
    if (historyBox) historyBox.innerHTML = renderPredictionHistory();
  } catch (error) {
    if (output) output.innerText = `Error: ${error.message}`;
    if (summaryBox) summaryBox.innerHTML = `<div class="empty-line">No se ha podido generar el resumen predictivo.</div>`;
    if (scenariosBox) scenariosBox.innerHTML = renderPredictScenarioCards(favorite, raceName, null);
    if (factorsBox) factorsBox.innerHTML = renderPredictKeyFactors(favorite, raceName, null);
    if (qualyRaceBox) qualyRaceBox.innerHTML = renderPredictQualyRaceCard(favorite, raceName, null);
    if (strategyBox) strategyBox.innerHTML = renderPredictStrategyDetail(favorite, raceName, null);
    if (gridBox) gridBox.innerHTML = renderPredictGridRead(favorite, raceName, null);
  }
}

function refreshPredict() {
  runPredict();
}

function shouldAutoGeneratePredict(favorite, raceName) {
  if (!state.lastPredictData || !state.lastPredictContext) return true;

  return (
    state.lastPredictContext.raceName !== raceName ||
    state.lastPredictContext.favoriteKey !== `${favorite.type}:${favorite.name}`
  );
}

function showPredict() {
  setActiveNav("nav-predict");
  updateSubtitle();

  const predict = renderPredictContent();
  const selectedRace = getSelectedRace();
  const favorite = getFavorite();
  const needFreshPredict = shouldAutoGeneratePredict(favorite, selectedRace);
  const activePredictData = !needFreshPredict ? state.lastPredictData : null;

  contentEl().innerHTML = `
    <div class="card highlight-card">
      <div class="pill">IA · MOTOR + RESUMEN VISUAL</div>
      <div class="card-title" style="color: var(--${predict.accent});">${escapeHtml(predict.title)}</div>
      <div class="card-sub">${escapeHtml(predict.sub)}</div>

      <div class="card-sub" style="margin-bottom:6px;">Circuito</div>
      <select id="predictRace" class="select-input" onchange="saveSelectedRace(this.value)">
        ${getPredictRaceOptions().map(race => `
          <option value="${race}" ${race === selectedRace ? "selected" : ""}>${race}</option>
        `).join("")}
      </select>

      <div class="action-row">
        <button class="btn" onclick="runPredict()">Generar predicción</button>
        <button class="icon-btn" onclick="refreshPredict()">Refrescar</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Resumen instantáneo</div>
      <div class="card-sub">Lo importante arriba, para saber en segundos dónde está el favorito.</div>
      <div id="predictSummaryCards">
        ${activePredictData
          ? renderPredictSummaryCards(activePredictData)
          : renderPredictPreviewCards(favorite, selectedRace)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Escenarios</div>
      <div class="card-sub">Una lectura más realista del fin de semana: mejor caso, base y escenario complicado.</div>
      <div id="predictScenarioCards">
        ${renderPredictScenarioCards(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Claves del fin de semana</div>
      <div class="card-sub">Dónde puede aparecer el rendimiento y qué puede torcer el guion.</div>
      <div id="predictKeyFactors">
        ${renderPredictKeyFactors(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Qualy vs carrera</div>
      <div class="card-sub">Cómo debería comportarse el coche a una vuelta y en stint largo.</div>
      <div id="predictQualyRace">
        ${renderPredictQualyRaceCard(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Estrategia esperada</div>
      <div class="card-sub">Plan base, ventana de parada y principal factor que puede alterar la carrera.</div>
      <div id="predictStrategyDetail">
        ${renderPredictStrategyDetail(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Lectura de parrilla</div>
      <div class="card-sub">Quién llega como referencia y cómo debería repartirse la parrilla.</div>
      <div id="predictGridRead">
        ${renderPredictGridRead(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Texto completo</div>
      <pre id="predictOutput" class="ai-output">${activePredictData ? escapeHtml(formatPredictResponse(activePredictData)) : "Preparando predicción avanzada..."}</pre>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">Historial de predicciones</div>
          <div class="card-sub">Las últimas predicciones generadas se guardan localmente en este dispositivo.</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="clearPredictionHistory()">Vaciar</button>
        </div>
      </div>
      <div id="predictionHistoryBox">${renderPredictionHistory()}</div>
    </div>
  `;

  if (needFreshPredict) {
    setTimeout(() => runPredict(), 80);
  }
}

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

function renderFavoritoTechnicalCard(favorite, teamName, teamData, accent) {
  return `
    <div class="card highlight-card">
      <div class="mini-pill">PANEL TÉCNICO</div>
      <div class="card-title" style="color: var(--${accent});">${escapeHtml(teamName.toUpperCase())}</div>
      <div class="card-sub">Lectura rápida del rendimiento actual del favorito y de su entorno competitivo.</div>

      <div class="stat">Ritmo de carrera <span>${teamData.racePace}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.racePace}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Ritmo a una vuelta <span>${teamData.qualyPace}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.qualyPace}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Fiabilidad <span>${teamData.reliability}%</span></div>
      <div class="bar"><div class="bar-fill ferrari" style="width:${teamData.reliability}%;"></div></div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Aero</div>
          <div class="meta-value">${teamData.aero}%</div>
          <div class="meta-caption">Carga y apoyo</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Tracción</div>
          <div class="meta-value">${teamData.traction}%</div>
          <div class="meta-caption">Salida de curva</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Velocidad punta</div>
          <div class="meta-value">${teamData.topSpeed}%</div>
          <div class="meta-caption">Recta y eficiencia</div>
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
      <div class="card-sub">Lectura rápida de tendencia para no mirar solo un número aislado.</div>

      <div class="trend-pill ${trendInfo.className}" style="margin-bottom:12px;">${trendInfo.label}</div>
      <div class="info-line">${trendInfo.description}</div>

      <div class="grid-stats" style="margin-top:14px;">
        <div class="stat-tile">
          <div class="stat-kicker">Ventana esperada</div>
          <div class="stat-value">${metrics.expectedWindow}</div>
          <div class="stat-caption">Rango competitivo actual</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Puntos</div>
          <div class="stat-value">${metrics.pointsProbability}%</div>
          <div class="stat-caption">Opción estimada de puntuar</div>
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

function renderFavoritoInsightsCard(favorite) {
  const insights = getFavoriteInsights(favorite, getSelectedRace());
  return `
    <div class="card">
      <div class="card-title">Lectura rápida</div>
      <div class="card-sub">Tres ideas útiles para entender el favorito sin perderse en demasiados datos.</div>
      <div class="insight-list">
        ${insights.map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
      </div>
    </div>
  `;
}

function showFavorito() {
  setActiveNav("nav-favorito");
  updateSubtitle();

  const favorite = getFavorite();
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const accent = favorite.colorClass;
  const teamData = getTeamData(teamName);

  contentEl().innerHTML = `
    ${renderFavoriteCard()}
    ${renderFavoritoTechnicalCard(favorite, teamName, teamData, accent)}
    ${renderFavoritoTrendCard(favorite, teamName)}
    ${renderFavoritoComparisonCard(favorite, teamName, teamData, accent)}
    ${renderFavoritoInsightsCard(favorite)}
  `;
}

function buildNewsFilterPresets() {
  const favorite = getFavorite();
  return [
    { key: "favorite", label: favorite.name, favoritePayload: favorite },
    { key: "aston", label: "Aston", favoritePayload: { type: "team", name: "Aston Martin", colorClass: "aston" } },
    { key: "alonso", label: "Alonso", favoritePayload: getDefaultFavorite() },
    { key: "grid", label: "Parrilla", favoritePayload: { type: "team", name: "Formula 1", colorClass: "ferrari" } }
  ];
}

function getActiveNewsFilter() {
  const filters = buildNewsFilterPresets();
  return filters.find(filter => filter.key === state.currentNewsFilterKey) || filters[0];
}

function switchNewsFilter(key) {
  state.currentNewsFilterKey = key;
  showNews();
}

function categorizeNewsItem(item) {
  const text = `${item?.title || ""} ${item?.source || ""}`.toLowerCase();

  if (text.includes("upgrade") || text.includes("mejora") || text.includes("aerodin") || text.includes("suelo") || text.includes("floor") || text.includes("package")) {
    return { key: "technical", label: "Técnica" };
  }

  if (text.includes("reliability") || text.includes("fiabilidad") || text.includes("engine") || text.includes("power unit") || text.includes("gearbox") || text.includes("avería") || text.includes("problema")) {
    return { key: "reliability", label: "Fiabilidad" };
  }

  if (text.includes("contract") || text.includes("mercado") || text.includes("seat") || text.includes("driver market") || text.includes("fich") || text.includes("replace")) {
    return { key: "market", label: "Mercado" };
  }

  if (text.includes("said") || text.includes("dice") || text.includes("claims") || text.includes("cree") || text.includes("declara") || text.includes("speaks")) {
    return { key: "statement", label: "Declaración" };
  }

  if (text.includes("pace") || text.includes("ritmo") || text.includes("qualy") || text.includes("qualifying") || text.includes("podium") || text.includes("race result") || text.includes("rendimiento")) {
    return { key: "general", label: "Rendimiento" };
  }

  return { key: "general", label: "General" };
}

function getNewsFilterTerms(filter) {
  const payload = filter?.favoritePayload || {};
  const base = [];

  if (payload.name) {
    base.push(normalizeText(payload.name));
    base.push(...normalizeText(payload.name).split(" ").filter(part => part.length > 2));
  }

  if (payload.type === "driver" && payload.team) {
    base.push(normalizeText(payload.team));
    base.push(...normalizeText(payload.team).split(" ").filter(part => part.length > 2));
  }

  if (filter?.key === "alonso") {
    base.push("alonso", "fernando", "aston martin");
  }

  if (filter?.key === "aston") {
    base.push("aston martin", "aston", "alonso", "stroll");
  }

  if (filter?.key === "grid") {
    base.push(
      "formula 1",
      "f1",
      "mercedes",
      "ferrari",
      "mclaren",
      "red bull",
      "verstappen",
      "norris",
      "piastri",
      "leclerc",
      "hamilton",
      "russell"
    );
  }

  return unique(base);
}

function getNewsRecencyScore(pubDate) {
  if (!pubDate) return 0;
  const time = new Date(pubDate).getTime();
  if (Number.isNaN(time)) return 0;

  const ageDays = (Date.now() - time) / 86400000;

  if (ageDays <= 1) return 8;
  if (ageDays <= 3) return 6;
  if (ageDays <= 7) return 4;
  if (ageDays <= 14) return 2;
  return 0;
}

function getNewsCategoryWeight(categoryKey) {
  if (categoryKey === "technical") return 18;
  if (categoryKey === "reliability") return 17;
  if (categoryKey === "market") return 15;
  if (categoryKey === "statement") return 11;
  return 9;
}

function scoreNewsItem(item, filter) {
  const text = normalizeText(`${item?.title || ""} ${item?.source || ""}`);
  const category = categorizeNewsItem(item);
  const filterTerms = getNewsFilterTerms(filter);

  let score = getNewsCategoryWeight(category.key);

  const matchedTerms = filterTerms.filter(term => term && text.includes(term));
  score += Math.min(
    22,
    matchedTerms.reduce((acc, term) => acc + (term.includes(" ") ? 8 : 4), 0)
  );

  if (filter?.key === "favorite" && filter?.favoritePayload?.type === "driver" && filter.favoritePayload.team) {
    if (text.includes(normalizeText(filter.favoritePayload.team))) score += 6;
  }

  if (filter?.key === "grid" && containsAny(text, ["grand prix", "race", "qualifying", "championship", "pace", "podium", "win"])) {
    score += 6;
  }

  if (containsAny(text, ["official", "confirmed", "update", "breaking"])) {
    score += 3;
  }

  if (containsAny(text, ["gallery", "photos", "photo", "watch", "video", "live blog", "liveblog"])) {
    score -= 14;
  }

  if (containsAny(text, ["rumor", "rumour", "speculation"])) {
    score -= 3;
  }

  score += getNewsRecencyScore(item?.pubDate);

  return score;
}

function getNewsImportanceLabel(item, filter) {
  const score = scoreNewsItem(item, filter);

  if (score >= 30) return "Alta prioridad";
  if (score >= 22) return "Muy relevante";
  if (score >= 14) return "Seguimiento";
  return "Contexto";
}

function getNewsImportanceClass(item, filter) {
  const score = scoreNewsItem(item, filter);

  if (score >= 30) return "statement";
  if (score >= 22) return "market";
  if (score >= 14) return "general";
  return "general";
}

function getNewsImpactText(item, filter) {
  const category = categorizeNewsItem(item);
  const favorite = filter?.favoritePayload || getFavorite();
  const text = normalizeText(item?.title || "");
  const favoriteName = favorite?.name || "tu favorito";
  const favoriteTeam = favorite?.team || favorite?.name || "";

  if (category.key === "technical") {
    if (favoriteTeam && text.includes(normalizeText(favoriteTeam))) {
      return `Puede cambiar la lectura de ritmo del próximo GP para ${favoriteTeam}.`;
    }
    return "Puede cambiar la lectura de rendimiento del próximo GP si trae mejoras reales.";
  }

  if (category.key === "reliability") {
    return "Importa porque un problema mecánico puede alterar por completo el fin de semana.";
  }

  if (category.key === "market") {
    if (favorite.type === "driver") {
      return `Aporta contexto sobre el futuro del equipo y del entorno competitivo de ${favoriteName}.`;
    }
    return "Puede afectar al proyecto deportivo y al contexto futuro del equipo.";
  }

  if (category.key === "statement") {
    if (favoriteName && text.includes(normalizeText(favoriteName))) {
      return `Da pistas sobre sensaciones reales alrededor de ${favoriteName}, aunque conviene contrastarlo con el ritmo en pista.`;
    }
    return "Da pistas sobre sensaciones y narrativa interna, aunque no siempre se traduce en rendimiento real.";
  }

  if (containsAny(text, ["pace", "ritmo", "qualy", "qualifying", "race", "podium", "result"])) {
    return "Sirve para entender quién llega mejor y qué esperar del fin de semana.";
  }

  if (favoriteTeam && text.includes(normalizeText(favoriteTeam))) {
    return `Afecta directamente al seguimiento de ${favoriteTeam} en el próximo GP.`;
  }

  return "Aporta contexto general útil para no llegar a ciegas al próximo Gran Premio.";
}

function sortNewsItems(items, filter) {
  const list = Array.isArray(items) ? [...items] : [];

  return list.sort((a, b) => {
    const scoreDiff = scoreNewsItem(b, filter) - scoreNewsItem(a, filter);
    if (scoreDiff !== 0) return scoreDiff;

    const dateA = new Date(a?.pubDate || 0).getTime();
    const dateB = new Date(b?.pubDate || 0).getTime();
    return dateB - dateA;
  });
}

function renderNewsKeyLines(items, filter) {
  const top = sortNewsItems(items, filter).slice(0, 3);

  if (!top.length) {
    return `<div class="empty-line">No hay claves destacadas disponibles ahora mismo.</div>`;
  }

  return `
    <div class="insight-list">
      ${top.map(item => `
        <div class="insight-item">
          <strong>${escapeHtml(getNewsImportanceLabel(item, filter))}</strong> · ${escapeHtml(item.title)}<br>
          ${escapeHtml(getNewsImpactText(item, filter))}
        </div>
      `).join("")}
    </div>
  `;
}

function renderNewsFilters() {
  const filters = buildNewsFilterPresets();
  return `
    <div class="filters-row">
      ${filters.map(filter => `
        <button class="chip ${state.currentNewsFilterKey === filter.key ? "active" : ""}" onclick="switchNewsFilter('${filter.key}')">${escapeHtml(filter.label)}</button>
      `).join("")}
    </div>
  `;
}

function renderFeaturedNews(item, filter) {
  if (!item) return "";
  const category = categorizeNewsItem(item);
  const importance = getNewsImportanceLabel(item, filter);
  const importanceClass = getNewsImportanceClass(item, filter);
  const impactText = getNewsImpactText(item, filter);

  return `
    <div class="news-hero">
      <div class="mini-pill">DESTACADA</div>
      <div class="news-hero-title">${escapeHtml(item.title)}</div>
      <div class="news-hero-sub">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
      <div class="news-meta-row">
        <span class="tag ${category.key}">${escapeHtml(category.label)}</span>
        <span class="tag ${importanceClass}">${escapeHtml(importance)}</span>
        <a class="btn-secondary" href="${item.link}" target="_blank" rel="noopener noreferrer" style="width:auto; padding:10px 14px;">Abrir noticia</a>
      </div>
      <div class="info-line" style="margin-top:12px;">${escapeHtml(impactText)}</div>
    </div>
  `;
}

function renderNewsListItem(item, filter) {
  const category = categorizeNewsItem(item);
  const importance = getNewsImportanceLabel(item, filter);
  const importanceClass = getNewsImportanceClass(item, filter);
  const impactText = getNewsImpactText(item, filter);

  return `
    <div class="news-item">
      <div class="news-meta-row" style="margin-top:0; margin-bottom:8px;">
        <span class="tag ${category.key}">${escapeHtml(category.label)}</span>
        <span class="tag ${importanceClass}">${escapeHtml(importance)}</span>
      </div>
      <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
      <div class="news-source">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
      <div class="card-sub" style="margin-top:6px;">${escapeHtml(impactText)}</div>
    </div>
  `;
}

async function refreshCurrentNews() {
  const filter = getActiveNewsFilter();
  if (!filter) return;
  const key = getNewsCacheKey(filter.favoritePayload);
  delete state.homeNewsCache[key];
  showNews();
}

async function showNews() {
  setActiveNav("nav-news");
  updateSubtitle();

  const filter = getActiveNewsFilter();

  contentEl().innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">NOTICIAS</div>
          <div class="card-sub">Buscando noticias reales, priorizando utilidad y dándote contexto editorial.</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
        </div>
      </div>
      ${renderNewsFilters()}
    </div>
    ${renderLoadingCard(`Noticias · ${filter.label}`, "Priorizando noticias útiles, portada destacada y claves del día…")}
  `;

  try {
    const data = await fetchNewsDataForFavorite(filter.favoritePayload, false);
    const sortedItems = sortNewsItems(Array.isArray(data?.items) ? data.items : [], filter).slice(0, 10);
    const featured = sortedItems[0] || null;
    const rest = sortedItems.slice(1);

    contentEl().innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">NOTICIAS</div>
            <div class="card-sub">Portada más inteligente, claves editoriales y artículos ordenados por utilidad real.</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
          </div>
        </div>
        ${renderNewsFilters()}
      </div>

      <div class="card highlight-card">
        <div class="card-title">Portada · ${escapeHtml(filter.label)}</div>
        ${featured ? renderFeaturedNews(featured, filter) : `<div class="empty-line">No hay una noticia destacada disponible ahora mismo.</div>`}
      </div>

      <div class="card">
        <div class="card-title">3 claves del día</div>
        <div class="card-sub">Qué merece la pena mirar primero y por qué importa realmente.</div>
        ${renderNewsKeyLines(sortedItems, filter)}
      </div>

      <div class="card">
        <div class="card-title">Más noticias</div>
        <div class="card-sub">Artículos relacionados con el filtro activo, ya ordenados por relevancia y contexto.</div>

        ${rest.length
          ? rest.map(item => renderNewsListItem(item, filter)).join("")
          : `<div class="empty-line">No se han encontrado noticias adicionales ahora mismo.</div>`}
      </div>
    `;
  } catch (error) {
    contentEl().innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">NOTICIAS</div>
            <div class="card-sub">Error al cargar el panel de noticias.</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCurrentNews()">Reintentar</button>
          </div>
        </div>
        ${renderNewsFilters()}
        <pre class="ai-output">${escapeHtml(error.message)}</pre>
      </div>
    `;
  }
}

function showMore() {
  setActiveNav("nav-more");
  updateSubtitle();
  contentEl().innerHTML = `
    <div class="card">
      <div class="card-title">MÁS</div>
      <a href="#" class="menu-link" onclick="showStandings(); return false;">Clasificación</a>
      <a href="#" class="menu-link" onclick="showCalendar(); return false;">Calendario</a>
      <a href="#" class="menu-link" onclick="showRaceMode(); return false;">Modo carrera</a>
      <a href="#" class="menu-link" onclick="showSettingsPanel(); return false;">Ajustes</a>
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
  updateSubtitle();
  showStandings();
}

function setFavoriteTeam(name, drivers, points, colorClass, pos) {
  saveFavorite({ type: "team", name, drivers, points, colorClass, pos });
  updateSubtitle();
  showStandings();
}

async function refreshStandings() {
  await showStandings(true);
}

async function showStandings(force = false) {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = `
    ${renderFavoriteCard()}
    ${renderLoadingCard("Clasificación", "Cargando clasificación real, cambios y resaltados…", true)}
  `;

  try {
    await fetchStandingsData(force);

    contentEl().innerHTML = `
      ${renderFavoriteCard()}
      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Clasificación</div>
            <div class="card-sub">Vista premium con líder, favorito, compañero y variación de posición.</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshStandings()">Refrescar</button>
          </div>
        </div>

        <div class="standings-toggle">
          <button class="toggle-btn ${state.standingsViewType === "drivers" ? "active" : ""}" onclick="setStandingsView('drivers')">Pilotos</button>
          <button class="toggle-btn ${state.standingsViewType === "teams" ? "active" : ""}" onclick="setStandingsView('teams')">Equipos</button>
        </div>

        <div class="standings-toggle">
          <button class="toggle-btn ${state.standingsScope === "top10" ? "active" : ""}" onclick="setStandingsScope('top10')">Top 10</button>
          <button class="toggle-btn ${state.standingsScope === "all" ? "active" : ""}" onclick="setStandingsScope('all')">Todos</button>
        </div>
      </div>

      <div id="standingsContent"></div>
    `;

    if (state.standingsViewType === "teams") showTeamsStandings();
    else showDriversStandings();
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Clasificación", "Error al cargar la clasificación", error.message);
  }
}

function setStandingsView(type) {
  state.standingsViewType = type;
  if (type === "teams") showTeamsStandings();
  else showDriversStandings();
}

function setStandingsScope(scope) {
  state.standingsScope = scope;
  if (state.standingsViewType === "teams") showTeamsStandings();
  else showDriversStandings();
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

function renderCalendarEventCard(event) {
  const isTesting = event.type === "testing";
  const isRace = event.type === "race";
  const dateLabel = formatCalendarDateRange(event.start, event.end);

  return `
    <div class="calendar-event-card">
      <div class="calendar-event-top">
        <div>
          <div class="calendar-event-title">${isRace ? `R${event.round} · ${escapeHtml(event.title)}` : escapeHtml(event.title)}</div>
          <div class="calendar-event-sub">${escapeHtml(event.venue)} · ${escapeHtml(event.location)}</div>
        </div>
        <div class="calendar-event-right">${dateLabel}<br>${getCalendarStatusLabel(event.status, event.type)}</div>
      </div>

      <div class="calendar-event-tags">
        <span class="tag general">${isTesting ? "Testing" : "Carrera"}</span>
        ${event.sprint ? `<span class="tag market">Sprint</span>` : ""}
        ${event.type === "race" && event.status === "next" ? `<span class="tag statement">Siguiente GP</span>` : ""}
      </div>
    </div>
  `;
}

async function refreshCalendar() {
  await showCalendar(true);
}

async function showCalendar(force = false) {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Calendario", "Cargando calendario oficial 2026 y separando próximas y completadas…", true);

  try {
    const data = await fetchCalendarData(force);
    const events = Array.isArray(data?.events) ? data.events : [];
    const nextRace = getNextRaceFromCalendar(events);
    const upcoming = events.filter(event => event.status === "next" || event.status === "upcoming");
    const completed = events.filter(event => event.status === "completed");

    contentEl().innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Calendario</div>
            <div class="card-sub">Vista mejorada con siguiente carrera destacada y bloques separados.</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCalendar()">Refrescar</button>
          </div>
        </div>

        ${nextRace ? `
          <div class="news-hero" style="margin-bottom:12px;">
            <div class="mini-pill">SIGUIENTE CITA</div>
            <div class="news-hero-title">${escapeHtml(nextRace.title)}</div>
            <div class="news-hero-sub">${escapeHtml(nextRace.venue)} · ${escapeHtml(nextRace.location)} · ${formatCalendarDateRange(nextRace.start, nextRace.end)}</div>
            <div class="news-meta-row">
              <span class="tag statement">Siguiente GP</span>
              <span class="tag general">${escapeHtml(mapCalendarEventToPredictRace(nextRace) || "GP")}</span>
            </div>
          </div>
        ` : ""}

        <div class="calendar-group-title">Próximas citas</div>
        ${upcoming.length ? upcoming.map(renderCalendarEventCard).join("") : `<div class="empty-line">No hay próximas citas cargadas.</div>`}

        <div class="calendar-group-title" style="margin-top:14px;">Ya completadas</div>
        ${completed.length ? completed.map(renderCalendarEventCard).join("") : `<div class="empty-line">No hay citas completadas registradas.</div>`}
      </div>
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Calendario", "Error al cargar el calendario", error.message);
  }
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

async function showRaceMode() {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Modo carrera", "Preparando la lectura del próximo GP con predicción, top 10 y estrategia…", true);

  try {
    const favorite = getFavorite();
    const calendarData = await fetchCalendarData();
    const nextRaceEvent = getNextRaceFromCalendar(calendarData?.events || []);
    const raceName = mapCalendarEventToPredictRace(nextRaceEvent) || getSelectedRace();
    const heuristics = getRaceHeuristics(raceName);
    const predictData = await fetchPredictData(favorite, raceName);
    const favoritePrediction = formatFavoritePredictionText(predictData?.favoritePrediction);
    const top10 = Array.isArray(predictData?.raceOrder) ? predictData.raceOrder.slice(0, 10) : [];

    contentEl().innerHTML = `
      <div class="card highlight-card">
        <div class="mini-pill">MODO CARRERA</div>
        <div class="card-title">${escapeHtml(raceName)}</div>
        <div class="card-sub">Pantalla rápida para leer el fin de semana completo en una sola vista.</div>

        <div class="meta-grid">
          <div class="meta-tile">
            <div class="meta-kicker">Safety Car</div>
            <div class="meta-value">${heuristics.safetyCar}%</div>
            <div class="meta-caption">Probabilidad base</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Lluvia</div>
            <div class="meta-value">${heuristics.rain}%</div>
            <div class="meta-caption">Escenario previsto</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Circuito</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(heuristics.tag)}</div>
            <div class="meta-caption">Perfil del trazado</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Resumen del favorito</div>
        <div class="predict-grid">
          <div class="stat-tile">
            <div class="stat-kicker">Clasificación</div>
            <div class="stat-value">${favoritePrediction.qualy}</div>
            <div class="stat-caption">${escapeHtml(favorite.name)}</div>
          </div>
          <div class="stat-tile">
            <div class="stat-kicker">Carrera</div>
            <div class="stat-value">${favoritePrediction.race}</div>
            <div class="stat-caption">${escapeHtml(favorite.name)}</div>
          </div>
          <div class="stat-tile">
            <div class="stat-kicker">Puntos</div>
            <div class="stat-value">${favoritePrediction.points}</div>
            <div class="stat-caption">Probabilidad estimada</div>
          </div>
          <div class="stat-tile">
            <div class="stat-kicker">Abandono</div>
            <div class="stat-value">${favoritePrediction.dnf}</div>
            <div class="stat-caption">Riesgo aproximado</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Estrategia esperada</div>
        <div class="info-line">${escapeHtml(predictData?.summary?.strategy?.label || "Sin datos")}</div>
        <div class="meta-grid" style="margin-top:14px;">
          <div class="meta-tile">
            <div class="meta-kicker">Paradas</div>
            <div class="meta-value">${predictData?.summary?.strategy?.stops ?? "—"}</div>
            <div class="meta-caption">Plan base</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Ganador estimado</div>
            <div class="meta-value" style="font-size:17px;">${escapeHtml(predictData?.summary?.predictedWinner || "—")}</div>
            <div class="meta-caption">Favorito a la victoria</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Equipos top</div>
            <div class="meta-value" style="font-size:17px;">${escapeHtml(Array.isArray(predictData?.summary?.topTeams) ? predictData.summary.topTeams.join(", ") : "—")}</div>
            <div class="meta-caption">Ritmo esperado</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Top 10 estimado</div>
        <div class="mode-race-top10">
          ${top10.length ? top10.map(driver => `
            <div class="mode-race-line">
              <div class="mode-race-left">
                <div class="mode-race-pos">${driver.position}</div>
                <div class="row-stripe ${getTeamColorClass(driver.team)}"></div>
                <div>
                  <div class="mode-race-name">${escapeHtml(driver.name)}</div>
                  <div class="mode-race-team">${escapeHtml(driver.team)}</div>
                </div>
              </div>
              <div class="mode-race-team">${driver.pointsProbability != null ? `${driver.pointsProbability}% pts` : ""}</div>
            </div>
          `).join("") : `<div class="empty-line">No hay top 10 disponible.</div>`}
        </div>
      </div>
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Modo carrera", "Error al preparar esta pantalla", error.message);
  }
}

function resetFavoriteToDefault() {
  saveFavorite(getDefaultFavorite());
  updateSubtitle();
  showSettingsPanel();
}

function clearSelectedRaceSetting() {
  localStorage.removeItem("racecontrolSelectedRace");
  const settings = getSettings();
  saveSettings({ ...settings, autoSelectNextRace: true });
  showSettingsPanel();
}

function toggleAutoNextRace() {
  const settings = getSettings();
  saveSettings({ ...settings, autoSelectNextRace: !settings.autoSelectNextRace });
  showSettingsPanel();
}

function showSettingsPanel() {
  setActiveNav("nav-more");
  updateSubtitle();

  const settings = getSettings();
  const favorite = getFavorite();

  contentEl().innerHTML = `
    <div class="card">
      <div class="card-title">Ajustes</div>
      <div class="card-sub">Preferencias básicas de la app y limpieza rápida de datos locales.</div>

      <div class="settings-line" style="margin-bottom:10px;">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Idioma</div>
            <div class="settings-line-sub">Actualmente fijado para español de España.</div>
          </div>
        </div>
        <div class="tag general">es-ES</div>
      </div>

      <div class="settings-line" style="margin-bottom:10px;">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Favorito actual</div>
            <div class="settings-line-sub">${favorite.type === "driver" ? `${escapeHtml(favorite.name)} · ${escapeHtml(favorite.team)}` : escapeHtml(favorite.name)}</div>
          </div>
        </div>
        <div class="tag statement">${favorite.type === "driver" ? "Piloto" : "Equipo"}</div>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Circuito automático</div>
            <div class="settings-line-sub">Usar por defecto la siguiente carrera detectada en el calendario.</div>
          </div>
        </div>
        <button class="icon-btn" onclick="toggleAutoNextRace()">${settings.autoSelectNextRace ? "Activado" : "Desactivado"}</button>
      </div>

      <div class="settings-actions" style="margin-top:14px;">
        <button class="btn-secondary" onclick="clearPredictionHistory()">Vaciar historial</button>
        <button class="btn-secondary" onclick="clearSelectedRaceSetting()">Reset circuito</button>
        <button class="danger-btn" onclick="resetFavoriteToDefault()">Reset favorito</button>
      </div>
    </div>
  `;
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

function bootRaceControl() {
  try {
    const repairedFavorite = getFavorite();
    saveFavorite(repairedFavorite);

    updateSubtitle();
    fetchStandingsData().catch(() => {});
    fetchCalendarData().catch(() => {});
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