    let standingsCache = null;
    let calendarCache = null;
    let homeNewsCache = {};
    let lastPredictData = null;
    let lastPredictContext = null;
    let detectedNextRaceName = null;
    let standingsDelta = { drivers: {}, teams: {} };
    let standingsViewType = "drivers";
    let standingsScope = "top10";
    let currentNewsFilterKey = "favorite";
    let currentNewsFilters = [];

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

    function getSettings() {
      try {
        const saved = localStorage.getItem("racecontrolSettings");
        return saved ? { ...getDefaultSettings(), ...JSON.parse(saved) } : getDefaultSettings();
      } catch {
        return getDefaultSettings();
      }
    }

    function saveSettings(settings) {
      localStorage.setItem("racecontrolSettings", JSON.stringify(settings));
    }

    function getFavorite() {
      try {
        const saved = localStorage.getItem("racecontrolFavorite");
        return saved ? JSON.parse(saved) : getDefaultFavorite();
      } catch {
        return getDefaultFavorite();
      }
    }

    function saveFavorite(favorite) {
      localStorage.setItem("racecontrolFavorite", JSON.stringify(favorite));
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
      if (settings.autoSelectNextRace && detectedNextRaceName) return detectedNextRaceName;
      if (stored) return stored;
      return detectedNextRaceName || "GP Miami";
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

    function safeJsonParse(value, fallback) {
      try { return JSON.parse(value); } catch { return fallback; }
    }

    function escapeHtml(str) {
      return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

      standingsDelta = { drivers: driverDelta, teams: teamDelta };
      saveStandingsSnapshot(data);
    }

    async function fetchStandingsData(force = false) {
      if (standingsCache && !force) return standingsCache;
      const response = await fetch("/api/standings");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar la clasificación");
      standingsCache = data;
      computeStandingsDelta(data);
      refreshFavoriteFromStandings(data);
      return data;
    }

    async function fetchCalendarData(force = false) {
      if (calendarCache && !force) return calendarCache;
      const response = await fetch("/api/calendar");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar el calendario");
      calendarCache = data;
      const nextRace = getNextRaceFromCalendar((data?.events || []));
      const mappedRace = mapCalendarEventToPredictRace(nextRace);
      if (mappedRace) detectedNextRaceName = mappedRace;
      return data;
    }

    function getNewsCacheKey(favorite) {
      return `${favorite.type}:${favorite.name}`;
    }

    async function fetchNewsDataForFavorite(favorite, force = false) {
      const cacheKey = getNewsCacheKey(favorite);
      if (homeNewsCache[cacheKey] && !force) return homeNewsCache[cacheKey];

      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || data?.error || "No se pudieron cargar las noticias");
      homeNewsCache[cacheKey] = data;
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
        const driver = (data.drivers || []).find(d => d.name === favorite.name);
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
      } else {
        const team = (data.teams || []).find(t => t.team === favorite.name);
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

      if (score >= 2) return { label: "Al alza", className: "up", description: "Llega con señales positivas y mejor lectura del fin de semana." };
      if (score <= -1.5) return { label: "A la baja", className: "down", description: "Sigue necesitando un salto claro para estabilizar el rendimiento." };
      return { label: "Estable", className: "neutral", description: "Rendimiento bastante estable, sin un giro claro todavía." };
    }

    function getFavoriteStrengthWindow(favorite, teamData) {
      let composite = teamData.racePace * 0.62 + teamData.qualyPace * 0.18 + teamData.reliability * 0.20;
      if (favorite.type === "driver") {
        const comparison = getDriverComparison(favorite.team, favorite.name);
        composite += (comparison.primaryForm - 80) * 0.25;
      } else {
        composite += ((teamData.forms[0] + teamData.forms[1]) / 2 - 80) * 0.15;
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
        formBoost = ((teamData.forms[0] + teamData.forms[1]) / 2 - 80) * 0.3;
      }

      const pointsProbability = Math.round(Math.max(12, Math.min(92, (teamData.racePace - 50) * 1.8 + formBoost)));
      const dnfRisk = Math.round(Math.max(8, Math.min(45, 34 - teamData.reliability * 0.27 + (100 - teamData.racePace) * 0.06)));

      return { pointsProbability, dnfRisk, trendInfo, expectedWindow: window, teamData };
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

    function formatFavoritePredictionText(favoritePrediction) {
      if (!favoritePrediction) return { qualy: "Sin datos", race: "Sin datos", points: "Sin datos", dnf: "Sin datos" };
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

      return `PREDICCIÓN ${raceName.toUpperCase()}\n\nFavorito para la victoria: ${summary.predictedWinner || "Sin datos"}\nEquipos con más ritmo: ${Array.isArray(summary.topTeams) ? summary.topTeams.join(", ") : "Sin datos"}\nEquipos con peor ritmo: ${Array.isArray(summary.weakestTeams) ? summary.weakestTeams.join(", ") : "Sin datos"}\n\nPredicción del favorito en clasificación: ${favoritePrediction.qualy}\nPredicción del favorito en carrera: ${favoritePrediction.race}\nProbabilidad de puntos del favorito (%): ${favoritePrediction.points}\nProbabilidad de abandono del favorito (%): ${favoritePrediction.dnf}\n\nProbabilidad de lluvia (%): ${summary.rainProbability != null ? `${summary.rainProbability}%` : "Sin datos"}\nProbabilidad de Safety Car (%): ${summary.safetyCarProbability != null ? `${summary.safetyCarProbability}%` : "Sin datos"}\n\nEstrategia más probable: ${summary.strategy?.label || "Sin datos"}\nNúmero de paradas: ${summary.strategy?.stops ?? "Sin datos"}`;
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
            <div class="meta-value" style="font-size:18px;">${summary.predictedWinner || "—"}</div>
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

    function renderPredictMetaCards(data) {
      const summary = data?.summary || {};
      const topTeams = Array.isArray(summary.topTeams) ? summary.topTeams.join(", ") : "Sin datos";
      const weakTeams = Array.isArray(summary.weakestTeams) ? summary.weakestTeams.join(", ") : "Sin datos";

      return `
        <div class="meta-grid">
          <div class="meta-tile">
            <div class="meta-kicker">Equipos top</div>
            <div class="meta-value" style="font-size:17px; line-height:1.2;">${topTeams}</div>
            <div class="meta-caption">Los coches con más ritmo esperado</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Equipos más débiles</div>
            <div class="meta-value" style="font-size:17px; line-height:1.2;">${weakTeams}</div>
            <div class="meta-caption">Zona baja estimada</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Estrategia</div>
            <div class="meta-value" style="font-size:17px; line-height:1.2;">${summary.strategy?.label || "Sin datos"}</div>
            <div class="meta-caption">Paradas: ${summary.strategy?.stops ?? "—"}</div>
          </div>
        </div>
      `;
    }

    function getPredictionHistory() {
      return safeJsonParse(localStorage.getItem("racecontrolPredictionHistory"), []);
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

    function openDetailModal(html) {
      document.getElementById("detailModalContent").innerHTML = html;
      document.getElementById("detailModal").classList.add("open");
    }

    function closeDetailModal(evt) {
      if (evt && evt.target && evt.target.id !== "detailModal") return;
      document.getElementById("detailModal").classList.remove("open");
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
        : `${favorite.drivers} · P${favorite.pos}`;

      const avatar = favorite.type === "driver"
        ? `<img class="hero-avatar" src="${favorite.image}" alt="${favorite.name}" onerror="this.style.display='none'">`
        : `<div class="team-stripe" style="background: var(--${accent}); height: 56px;"></div>`;

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
                <div class="hero-name">${favorite.name}</div>
                <div class="hero-sub">${subtitle}</div>
              </div>
            </div>
            <div class="hero-points">
              <div class="hero-points-value">${favorite.points}</div>
              <div class="hero-points-label">pts</div>
            </div>
          </div>
        </div>
      `;
    }

    function renderHomeQuickSummary(nextRace) {
      const favorite = getFavorite();
      const metrics = getFavoriteHomeMetrics(favorite);
      const nextRaceName = mapCalendarEventToPredictRace(nextRace) || getSelectedRace();
      const heuristics = getRaceHeuristics(nextRaceName);

      return `
        <div class="card highlight-card">
          <div class="mini-pill">CENTRO DE CONTROL</div>
          <div class="card-title">Resumen rápido del favorito</div>
          <div class="card-sub">Lectura rápida para abrir la app y tener contexto en pocos segundos.</div>

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

          <div class="quick-row">
            <div class="meta-tile">
              <div class="meta-kicker">Safety Car</div>
              <div class="meta-value">${heuristics.safetyCar}%</div>
              <div class="meta-caption">${nextRaceName}</div>
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
              <div class="next-race-title">${nextRace.title}</div>
              <div class="next-race-sub">${nextRace.venue} · ${nextRace.location}</div>
              <div class="next-race-sub">${heuristics.tag} · ritmo y estrategia condicionados por el circuito</div>
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
              <div class="meta-value" style="font-size:18px;">${raceName}</div>
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
          <div class="card-title" style="color: var(--${accent});">${teamName.toUpperCase()} · ESTADO</div>
          <div class="stat">Ritmo de carrera <span>${teamData.racePace}%</span></div>
          <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.racePace}%;"></div></div>

          <div class="stat" style="margin-top:14px;">Ritmo a una vuelta <span>${teamData.qualyPace}%</span></div>
          <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.qualyPace}%;"></div></div>

          <div class="stat" style="margin-top:14px;">Fiabilidad <span>${teamData.reliability}%</span></div>
          <div class="bar"><div class="bar-fill mclaren" style="width:${teamData.reliability}%;"></div></div>

          <div class="stat" style="margin-top:14px;">Previsión del fin de semana <span>${teamData.outlook}</span></div>
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
              <span style="${row.name === favoriteTeam ? `color: var(--${row.color}); font-weight: 700;` : ''}">${row.name}</span>
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
          <div class="card-title">Noticias clave · ${favorite.name}</div>
          <div class="card-sub">Las 3 noticias más útiles para no ir a ciegas antes del próximo GP.</div>

          ${previewItems.length ? previewItems.map(item => `
            <div class="news-item">
              <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
              <div class="news-source">${item.source || "Noticias"}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
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

      document.getElementById("content").innerHTML = `
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
          if (mappedRace && getSettings().autoSelectNextRace) detectedNextRaceName = mappedRace;
        }

        document.getElementById("content").innerHTML = `
          ${renderHomeHero()}
          ${renderHomeQuickSummary(nextRace)}
          ${renderHomeNextRace(nextRace)}
          ${renderHomeTeamStatus()}
          ${renderHomeNewsPreview(newsData?.items || [], favorite)}
          ${renderHomeHierarchy()}
        `;
      } catch (error) {
        document.getElementById("content").innerHTML = `
          ${renderHomeHero()}
          <div class="card">
            <div class="card-title">Inicio</div>
            <div class="card-sub">Error al cargar el centro de control</div>
            <pre class="ai-output">${error.message}</pre>
          </div>
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
      <div class="stat-tile"><div class="stat-kicker">Clasificación</div><div class="stat-value">…</div><div class="stat-caption">Calculando</div></div>
      <div class="stat-tile"><div class="stat-kicker">Carrera</div><div class="stat-value">…</div><div class="stat-caption">Calculando</div></div>
      <div class="stat-tile"><div class="stat-kicker">Puntos</div><div class="stat-value">…</div><div class="stat-caption">Calculando</div></div>
      <div class="stat-tile"><div class="stat-kicker">Abandono</div><div class="stat-value">…</div><div class="stat-caption">Calculando</div></div>
    </div>
  `;
}

async function runPredict() {
  const output = document.getElementById("predictOutput");
  const favorite = getFavorite();
  const raceSelect = document.getElementById("predictRace");
  const raceName = raceSelect?.value || getSelectedRace();

  saveSelectedRace(raceName);

  if (output) {
    output.innerText = "Generando predicción...";
  }

  const summaryBox = document.getElementById("predictSummaryCards");
  const metaBox = document.getElementById("predictMetaCards");

  if (summaryBox) summaryBox.innerHTML = renderPredictLoadingState();
  if (metaBox) metaBox.innerHTML = `<div class="empty-line">Recalculando ritmo, estrategia y favoritos…</div>`;

  try {
    const data = await fetchPredictData(favorite, raceName);
    lastPredictData = data;
    lastPredictContext = { raceName, favoriteKey: `${favorite.type}:${favorite.name}` };
    pushPredictionHistory(data, favorite, raceName);

    if (summaryBox) summaryBox.innerHTML = renderPredictSummaryCards(data);
    if (metaBox) metaBox.innerHTML = renderPredictMetaCards(data);
    if (output) output.innerText = formatPredictResponse(data);

    const historyBox = document.getElementById("predictionHistoryBox");
    if (historyBox) historyBox.innerHTML = renderPredictionHistory();
  } catch (error) {
    if (output) output.innerText = `Error: ${error.message}`;
    if (summaryBox) summaryBox.innerHTML = `<div class="empty-line">No se ha podido generar el resumen predictivo.</div>`;
    if (metaBox) metaBox.innerHTML = "";
  }
}

function refreshPredict() {
  runPredict();
}

function shouldAutoGeneratePredict(favorite, raceName) {
  if (!lastPredictData || !lastPredictContext) return true;
  return lastPredictContext.raceName !== raceName || lastPredictContext.favoriteKey !== `${favorite.type}:${favorite.name}`;
}

function renderPredictPreviewCards(favorite, raceName) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);
  const heuristics = getRaceHeuristics(raceName);
  const metrics = getFavoriteHomeMetrics(favorite);

  const qualyRange =
    teamData.qualyPace >= 85 ? "P3-P6" :
    teamData.qualyPace >= 75 ? "P6-P10" :
    teamData.qualyPace >= 68 ? "P9-P13" :
    "P12-P16";

  const raceRange = metrics.expectedWindow || "P10-P14";

  return `
    <div class="predict-grid">
      <div class="stat-tile">
        <div class="stat-kicker">Clasificación</div>
        <div class="stat-value">${qualyRange}</div>
        <div class="stat-caption">Estimación rápida previa</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Carrera</div>
        <div class="stat-value">${raceRange}</div>
        <div class="stat-caption">Ventana competitiva esperada</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Puntos</div>
        <div class="stat-value">${metrics.pointsProbability}%</div>
        <div class="stat-caption">Probabilidad local aproximada</div>
      </div>
      <div class="stat-tile">
        <div class="stat-kicker">Safety Car</div>
        <div class="stat-value">${heuristics.safetyCar}%</div>
        <div class="stat-caption">Base histórica del circuito</div>
      </div>
    </div>
  `;
}

function showPredict() {
  setActiveNav("nav-predict");
  updateSubtitle();

  const predict = renderPredictContent();
  const selectedRace = getSelectedRace();
  const favorite = getFavorite();
  const needFreshPredict = shouldAutoGeneratePredict(favorite, selectedRace);

  document.getElementById("content").innerHTML = `
    <div class="card highlight-card">
      <div class="pill">IA · MOTOR + RESUMEN VISUAL</div>
      <div class="card-title" style="color: var(--${predict.accent});">${predict.title}</div>
      <div class="card-sub">${predict.sub}</div>

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
      <div class="card-title">Resumen de predicción</div>
      <div class="card-sub">Lo importante arriba, el desarrollo completo debajo.</div>
      <div id="predictSummaryCards">
        ${!needFreshPredict
          ? renderPredictSummaryCards(lastPredictData)
          : renderPredictPreviewCards(favorite, selectedRace)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Claves del fin de semana</div>
      <div id="predictMetaCards">
        ${!needFreshPredict
          ? renderPredictMetaCards(lastPredictData)
          : `<div class="empty-line">Cargando la predicción avanzada para ${selectedRace}…</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Texto completo</div>
      <pre id="predictOutput" class="ai-output">${!needFreshPredict ? formatPredictResponse(lastPredictData) : "Preparando predicción avanzada…"}</pre>
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

    function renderPredictPreviewCards(favorite, raceName) {
      const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
      const teamData = getTeamData(teamName);
      const heuristics = getRaceHeuristics(raceName);
      const metrics = getFavoriteHomeMetrics(favorite);
      const qualyRange = teamData.qualyPace >= 85 ? "P3-P6" : teamData.qualyPace >= 75 ? "P6-P10" : teamData.qualyPace >= 68 ? "P9-P13" : "P12-P16";
      const raceRange = metrics.expectedWindow || "P10-P14";

      return `
        <div class="predict-grid">
          <div class="stat-tile"><div class="stat-kicker">Clasificación</div><div class="stat-value">${qualyRange}</div><div class="stat-caption">Estimación rápida previa</div></div>
          <div class="stat-tile"><div class="stat-kicker">Carrera</div><div class="stat-value">${raceRange}</div><div class="stat-caption">Ventana competitiva esperada</div></div>
          <div class="stat-tile"><div class="stat-kicker">Puntos</div><div class="stat-value">${metrics.pointsProbability}%</div><div class="stat-caption">Probabilidad local aproximada</div></div>
          <div class="stat-tile"><div class="stat-kicker">Safety Car</div><div class="stat-value">${heuristics.safetyCar}%</div><div class="stat-caption">Base histórica del circuito</div></div>
        </div>
      `;
    }

    function showPredict() {

      setActiveNav("nav-predict");
      updateSubtitle();

      const predict = renderPredictContent();
      const selectedRace = getSelectedRace();

      document.getElementById("content").innerHTML = `
        <div class="card highlight-card">
          <div class="pill">IA · MOTOR + RESUMEN VISUAL</div>
          <div class="card-title" style="color: var(--${predict.accent});">${predict.title}</div>
          <div class="card-sub">${predict.sub}</div>

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
          <div class="card-title">Resumen de predicción</div>
          <div class="card-sub">Lo importante arriba, el desarrollo completo debajo.</div>
          <div id="predictSummaryCards">
            ${lastPredictData && !shouldAutoGeneratePredict(getFavorite(), selectedRace)
              ? renderPredictSummaryCards(lastPredictData)
              : renderPredictPreviewCards(getFavorite(), selectedRace)}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Claves del fin de semana</div>
          <div id="predictMetaCards">
            ${lastPredictData && !shouldAutoGeneratePredict(getFavorite(), selectedRace)
              ? renderPredictMetaCards(lastPredictData)
              : `<div class="empty-line">Cargando la predicción avanzada para ${selectedRace}…</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Texto completo</div>
          <pre id="predictOutput" class="ai-output">${lastPredictData && !shouldAutoGeneratePredict(getFavorite(), selectedRace) ? formatPredictResponse(lastPredictData) : "Preparando predicción avanzada…"}</pre>
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

      if (shouldAutoGeneratePredict(getFavorite(), selectedRace)) {
        setTimeout(() => runPredict(), 80);
      }
    }

    function renderFavoriteCard() {
      const favorite = getFavorite();
      const badge = favorite.type === "driver" ? favorite.number : "EQ";
      const subtitle = favorite.type === "driver"
        ? `${favorite.team} · P${favorite.pos}`
        : `${favorite.drivers} · P${favorite.pos}`;

      return `
        <div class="card favorite-card">
          <div class="favorite-label">Favorito</div>
          <div class="favorite-main">
            <div class="favorite-left">
              <div class="team-stripe" style="background: var(--${favorite.colorClass});"></div>
              <div class="driver-number" style="color: var(--${favorite.colorClass});">${badge}</div>
              <div>
                <div class="favorite-name">${favorite.name}</div>
                <div class="favorite-sub">${subtitle}</div>
              </div>
            </div>
            <div class="favorite-points">
              <div class="favorite-points-value">${favorite.points}</div>
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
          <div class="card-title" style="color: var(--${accent});">${teamName.toUpperCase()}</div>
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
      const metrics = getFavoriteHomeMetrics(favorite);

      return `
        <div class="card">
          <div class="card-title">Momento actual</div>
          <div class="card-sub">Lectura rápida de tendencia para no mirar solo un número aislado.</div>

          <div class="trend-pill ${trendInfo.className}" style="margin-bottom:12px;">${trendInfo.label}</div>
          <div class="info-line">${trendInfo.description}</div>

          <div class="grid-stats">
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
            <div class="card-title">${comparison.primaryName.toUpperCase()} vs ${comparison.secondaryName.toUpperCase()}</div>
            <div class="card-sub">Comparación más clara con su compañero para leer el contexto interno del equipo.</div>

            <div class="stat">Rendimiento de ${comparison.primaryName} <span>${comparison.primaryForm}%</span></div>
            <div class="bar"><div class="bar-fill ${accent}" style="width:${comparison.primaryForm}%;"></div></div>

            <div class="stat" style="margin-top:14px;">Rendimiento de ${comparison.secondaryName} <span>${comparison.secondaryForm}%</span></div>
            <div class="bar"><div class="bar-fill ${accent}" style="width:${comparison.secondaryForm}%; opacity:0.68;"></div></div>

            <div class="info-line" style="margin-top:14px;">
              ${gap >= 0
                ? `${comparison.primaryName} llega con una ventaja interna aproximada de ${gap} puntos de forma.`
                : `${comparison.primaryName} está por detrás en forma y necesita recortar ${Math.abs(gap)} puntos.`}
            </div>
          </div>
        `;
      }

      return `
        <div class="card">
          <div class="card-title">${teamName.toUpperCase()} · ALINEACIÓN</div>
          <div class="card-sub">Comparación directa entre los dos pilotos del equipo favorito.</div>

          <div class="stat">Estado de forma de ${teamData.drivers[0]} <span>${teamData.forms[0]}%</span></div>
          <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.forms[0]}%;"></div></div>

          <div class="stat" style="margin-top:14px;">Estado de forma de ${teamData.drivers[1]} <span>${teamData.forms[1]}%</span></div>
          <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.forms[1]}%; opacity:0.68;"></div></div>

          <div class="info-line" style="margin-top:14px;">
            ${teamData.forms[0] >= teamData.forms[1]
              ? `${teamData.drivers[0]} está liderando actualmente la referencia interna.`
              : `${teamData.drivers[1]} está sosteniendo mejor el nivel competitivo del equipo.`}
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
            ${insights.map(item => `<div class="insight-item">${item}</div>`).join("")}
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

      document.getElementById("content").innerHTML = `
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
      currentNewsFilters = buildNewsFilterPresets();
      return currentNewsFilters.find(filter => filter.key === currentNewsFilterKey) || currentNewsFilters[0];
    }

    function switchNewsFilter(key) {
      currentNewsFilterKey = key;
      showNews();
    }

    function categorizeNewsItem(item) {
      const text = `${item?.title || ""} ${item?.source || ""}`.toLowerCase();

      if (text.includes("upgrade") || text.includes("mejora") || text.includes("aerodin") || text.includes("suelo") || text.includes("floor") || text.includes("package")) return { key: "technical", label: "Técnica" };
      if (text.includes("reliability") || text.includes("fiabilidad") || text.includes("engine") || text.includes("power unit") || text.includes("gearbox") || text.includes("avería") || text.includes("problema")) return { key: "reliability", label: "Fiabilidad" };
      if (text.includes("contract") || text.includes("mercado") || text.includes("seat") || text.includes("driver market") || text.includes("fich") || text.includes("replace")) return { key: "market", label: "Mercado" };
      if (text.includes("said") || text.includes("dice") || text.includes("claims") || text.includes("cree") || text.includes("declara") || text.includes("speaks")) return { key: "statement", label: "Declaración" };
      return { key: "general", label: "General" };
    }

    function renderNewsFilters() {
      const filters = buildNewsFilterPresets();
      return `
        <div class="filters-row">
          ${filters.map(filter => `
            <button class="chip ${currentNewsFilterKey === filter.key ? "active" : ""}" onclick="switchNewsFilter('${filter.key}')">${filter.label}</button>
          `).join("")}
        </div>
      `;
    }

    function renderFeaturedNews(item) {
      if (!item) return "";
      const category = categorizeNewsItem(item);
      return `
        <div class="news-hero">
          <div class="mini-pill">DESTACADA</div>
          <div class="news-hero-title">${item.title}</div>
          <div class="news-hero-sub">${item.source || "Noticias"}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
          <div class="news-meta-row">
            <span class="tag ${category.key}">${category.label}</span>
            <a class="btn-secondary" href="${item.link}" target="_blank" rel="noopener noreferrer" style="width:auto; padding:10px 14px;">Abrir noticia</a>
          </div>
        </div>
      `;
    }

    async function refreshCurrentNews() {
      const filter = getActiveNewsFilter();
      if (!filter) return;
      const key = getNewsCacheKey(filter.favoritePayload);
      delete homeNewsCache[key];
      showNews();
    }

    async function showNews() {
      setActiveNav("nav-news");
      updateSubtitle();

      const filter = getActiveNewsFilter();

      document.getElementById("content").innerHTML = `
        <div class="card">
          <div class="card-head">
            <div class="card-head-left">
              <div class="card-title">NOTICIAS</div>
              <div class="card-sub">Buscando noticias reales y ordenándolas de forma más útil.</div>
            </div>
            <div class="card-head-actions">
              <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
            </div>
          </div>
          ${renderNewsFilters()}
        </div>
        ${renderLoadingCard(`Noticias · ${filter.label}`, "Cargando portada principal y artículos relacionados…")}
      `;

      try {
        const data = await fetchNewsDataForFavorite(filter.favoritePayload, false);
        const items = Array.isArray(data.items) ? data.items.slice(0, 10) : [];
        const featured = items[0] || null;
        const rest = items.slice(1);

        document.getElementById("content").innerHTML = `
          <div class="card">
            <div class="card-head">
              <div class="card-head-left">
                <div class="card-title">NOTICIAS</div>
                <div class="card-sub">Vista mejorada con filtros, noticia principal y etiquetas temáticas.</div>
              </div>
              <div class="card-head-actions">
                <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
              </div>
            </div>
            ${renderNewsFilters()}
          </div>

          <div class="card highlight-card">
            <div class="card-title">Portada · ${filter.label}</div>
            ${featured ? renderFeaturedNews(featured) : `<div class="empty-line">No hay una noticia destacada disponible ahora mismo.</div>`}
          </div>

          <div class="card">
            <div class="card-title">Más noticias</div>
            <div class="card-sub">Artículos relacionados con el filtro activo.</div>

            ${rest.length ? rest.map(item => {
              const category = categorizeNewsItem(item);
              return `
                <div class="news-item">
                  <div class="news-meta-row" style="margin-top:0; margin-bottom:8px;">
                    <span class="tag ${category.key}">${category.label}</span>
                  </div>
                  <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
                  <div class="news-source">${item.source || "Noticias"}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
                </div>
              `;
            }).join("") : `<div class="empty-line">No se han encontrado noticias adicionales ahora mismo.</div>`}
          </div>
        `;
      } catch (error) {
        document.getElementById("content").innerHTML = `
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
            <pre class="ai-output">${error.message}</pre>
          </div>
        `;
      }
    }

    function showMore() {
      setActiveNav("nav-more");
      updateSubtitle();
      document.getElementById("content").innerHTML = `
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
            ${isFav ? "Es tu favorito actual. La app adaptará Home, Predicción y Noticias a este piloto." : `${name} está siendo comparado dentro del equipo con ${comparison.secondaryName}.`}
          </div>

          <div class="stat">Forma frente a su compañero <span>${comparison.primaryForm}%</span></div>
          <div class="bar"><div class="bar-fill ${colorClass}" style="width:${comparison.primaryForm}%;"></div></div>

          <div class="stat" style="margin-top:14px;">Forma del compañero (${comparison.secondaryName}) <span>${comparison.secondaryForm}%</span></div>
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
            <img class="row-avatar" src="${image}" alt="${name}" onerror="this.style.display='none'">
            <div class="row-stripe ${colorClass}"></div>
            <div class="row-number" style="color: var(--${colorClass});">${number}</div>
            <div class="row-info">
              <div class="row-name">${name}</div>
              <div class="row-team">
                <span>${team}</span>
                <img class="team-logo" src="${getTeamLogo(team)}" alt="${team}" onerror="this.style.display='none'">
              </div>
            </div>
          </div>
          <div class="row-badges">
            ${getDriverContextBadges(name, pos, team)}
            <div class="row-points">${points}<small>pts</small></div>
            <button class="fav-btn ${isFav ? 'active' : ''}" onclick='event.stopPropagation(); setFavoriteDriver(${JSON.stringify(name)}, ${JSON.stringify(team)}, ${JSON.stringify(number)}, ${JSON.stringify(points)}, ${JSON.stringify(colorClass)}, ${JSON.stringify(image)}, ${JSON.stringify(pos)})'>★</button>
          </div>
        </div>
      `;
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
              <div class="row-name" style="color: var(--${colorClass});">${team}</div>
              <div class="row-team">
                <span>${drivers}</span>
                <img class="team-logo" src="${getTeamLogo(team)}" alt="${team}" onerror="this.style.display='none'">
              </div>
            </div>
          </div>
          <div class="row-badges">
            ${getTeamContextBadges(team, pos)}
            <div class="row-points">${points}<small>pts</small></div>
            <button class="fav-btn ${isFav ? 'active' : ''}" onclick='event.stopPropagation(); setFavoriteTeam(${JSON.stringify(team)}, ${JSON.stringify(drivers)}, ${JSON.stringify(points)}, ${JSON.stringify(colorClass)}, ${JSON.stringify(pos)})'>★</button>
          </div>
        </div>
      `;
    }

    function setFavoriteDriver(name, team, number, points, colorClass, image, pos) {
      saveFavorite({ type: "driver", name, team, number, points, colorClass, image, pos });
      showStandings();
    }

    function setFavoriteTeam(name, drivers, points, colorClass, pos) {
      saveFavorite({ type: "team", name, drivers, points, colorClass, pos });
      showStandings();
    }

    async function refreshStandings() {
      await showStandings(true);
    }

    async function showStandings(force = false) {
      setActiveNav("nav-more");
      updateSubtitle();

      document.getElementById("content").innerHTML = `
        ${renderFavoriteCard()}
        ${renderLoadingCard("Clasificación", "Cargando clasificación real, cambios y resaltados…", true)}
      `;

      try {
        await fetchStandingsData(force);
        document.getElementById("content").innerHTML = `
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
              <button class="toggle-btn ${standingsViewType === "drivers" ? "active" : ""}" onclick="setStandingsView('drivers')">Pilotos</button>
              <button class="toggle-btn ${standingsViewType === "teams" ? "active" : ""}" onclick="setStandingsView('teams')">Equipos</button>
            </div>

            <div class="standings-toggle">
              <button class="toggle-btn ${standingsScope === "top10" ? "active" : ""}" onclick="setStandingsScope('top10')">Top 10</button>
              <button class="toggle-btn ${standingsScope === "all" ? "active" : ""}" onclick="setStandingsScope('all')">Todos</button>
            </div>
          </div>

          <div id="standingsContent"></div>
        `;

        if (standingsViewType === "teams") showTeamsStandings();
        else showDriversStandings();
      } catch (error) {
        document.getElementById("content").innerHTML = `
          <div class="card">
            <div class="card-title">Clasificación</div>
            <div class="card-sub">Error al cargar la clasificación</div>
            <pre class="ai-output">${error.message}</pre>
          </div>
        `;
      }
    }

    function setStandingsView(type) {
      standingsViewType = type;
      if (type === "teams") showTeamsStandings();
      else showDriversStandings();
    }

    function setStandingsScope(scope) {
      standingsScope = scope;
      if (standingsViewType === "teams") showTeamsStandings();
      else showDriversStandings();
    }

    function showDriversStandings() {
      const drivers = standingsCache?.drivers || [];
      const visible = standingsScope === "top10" ? drivers.slice(0, 10) : drivers;
      document.getElementById("standingsContent").innerHTML = `
        <div class="card">
          ${visible.map(driver => driverRow(driver.pos, driver.number, driver.name, driver.team, String(driver.points), driver.colorClass, driver.image, standingsDelta.drivers?.[driver.name] || 0)).join("")}
        </div>
      `;
    }

    function showTeamsStandings() {
      const teams = standingsCache?.teams || [];
      const visible = standingsScope === "top10" ? teams.slice(0, 10) : teams;
      document.getElementById("standingsContent").innerHTML = `
        <div class="card">
          ${visible.map(team => teamRow(team.pos, team.team, team.drivers, String(team.points), team.colorClass, standingsDelta.teams?.[team.team] || 0)).join("")}
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
              <div class="calendar-event-title">${isRace ? `R${event.round} · ${event.title}` : event.title}</div>
              <div class="calendar-event-sub">${event.venue} · ${event.location}</div>
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
      document.getElementById("content").innerHTML = `
        ${renderLoadingCard("Calendario", "Cargando calendario oficial 2026 y separando próximas y completadas…", true)}
      `;

      try {
        const data = await fetchCalendarData(force);
        const events = Array.isArray(data.events) ? data.events : [];
        const nextRace = getNextRaceFromCalendar(events);
        const upcoming = events.filter(event => event.status === "next" || event.status === "upcoming");
        const completed = events.filter(event => event.status === "completed");

        document.getElementById("content").innerHTML = `
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
                <div class="news-hero-title">${nextRace.title}</div>
                <div class="news-hero-sub">${nextRace.venue} · ${nextRace.location} · ${formatCalendarDateRange(nextRace.start, nextRace.end)}</div>
                <div class="news-meta-row">
                  <span class="tag statement">Siguiente GP</span>
                  <span class="tag general">${mapCalendarEventToPredictRace(nextRace) || "GP"}</span>
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
        document.getElementById("content").innerHTML = `
          <div class="card">
            <div class="card-title">Calendario</div>
            <div class="card-sub">Error al cargar el calendario</div>
            <pre class="ai-output">${error.message}</pre>
          </div>
        `;
      }
    }

    async function showRaceMode() {
      setActiveNav("nav-more");
      updateSubtitle();

      document.getElementById("content").innerHTML = `
        ${renderLoadingCard("Modo carrera", "Preparando la lectura del próximo GP con predicción, top 10 y estrategia…", true)}
      `;

      try {
        const favorite = getFavorite();
        const calendarData = await fetchCalendarData();
        const nextRaceEvent = getNextRaceFromCalendar(calendarData?.events || []);
        const raceName = mapCalendarEventToPredictRace(nextRaceEvent) || getSelectedRace();
        const heuristics = getRaceHeuristics(raceName);
        const predictData = await fetchPredictData(favorite, raceName);
        const favoritePrediction = formatFavoritePredictionText(predictData?.favoritePrediction);
        const top10 = Array.isArray(predictData?.raceOrder) ? predictData.raceOrder.slice(0, 10) : [];

        document.getElementById("content").innerHTML = `
          <div class="card highlight-card">
            <div class="mini-pill">MODO CARRERA</div>
            <div class="card-title">${raceName}</div>
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
                <div class="meta-value" style="font-size:18px;">${heuristics.tag}</div>
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
                <div class="stat-caption">${favorite.name}</div>
              </div>
              <div class="stat-tile">
                <div class="stat-kicker">Carrera</div>
                <div class="stat-value">${favoritePrediction.race}</div>
                <div class="stat-caption">${favorite.name}</div>
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
            <div class="info-line">${predictData?.summary?.strategy?.label || "Sin datos"}</div>
            <div class="meta-grid">
              <div class="meta-tile">
                <div class="meta-kicker">Paradas</div>
                <div class="meta-value">${predictData?.summary?.strategy?.stops ?? "—"}</div>
                <div class="meta-caption">Plan base</div>
              </div>
              <div class="meta-tile">
                <div class="meta-kicker">Ganador estimado</div>
                <div class="meta-value" style="font-size:17px;">${predictData?.summary?.predictedWinner || "—"}</div>
                <div class="meta-caption">Favorito a la victoria</div>
              </div>
              <div class="meta-tile">
                <div class="meta-kicker">Equipos top</div>
                <div class="meta-value" style="font-size:17px;">${Array.isArray(predictData?.summary?.topTeams) ? predictData.summary.topTeams.join(", ") : "—"}</div>
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
                      <div class="mode-race-name">${driver.name}</div>
                      <div class="mode-race-team">${driver.team}</div>
                    </div>
                  </div>
                  <div class="mode-race-team">${driver.pointsProbability != null ? `${driver.pointsProbability}% pts` : ""}</div>
                </div>
              `).join("") : `<div class="empty-line">No hay top 10 disponible.</div>`}
            </div>
          </div>
        `;
      } catch (error) {
        document.getElementById("content").innerHTML = `
          <div class="card">
            <div class="card-title">Modo carrera</div>
            <div class="card-sub">Error al preparar esta pantalla</div>
            <pre class="ai-output">${error.message}</pre>
          </div>
        `;
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

      document.getElementById("content").innerHTML = `
        <div class="card">
          <div class="card-title">Ajustes</div>
          <div class="card-sub">Preferencias básicas de la app y limpieza rápida de datos locales.</div>

          <div class="settings-line" style="margin-bottom:10px;">
            <div class="settings-line-left">
              <div class="settings-line-title">Idioma</div>
              <div class="settings-line-sub">Actualmente fijado para español de España.</div>
            </div>
            <div class="tag general">es-ES</div>
          </div>

          <div class="settings-line" style="margin-bottom:10px;">
            <div class="settings-line-left">
              <div class="settings-line-title">Favorito actual</div>
              <div class="settings-line-sub">${favorite.type === "driver" ? `${favorite.name} · ${favorite.team}` : favorite.name}</div>
            </div>
            <div class="tag statement">${favorite.type === "driver" ? "Piloto" : "Equipo"}</div>
          </div>

          <div class="settings-line">
            <div class="settings-line-left">
              <div class="settings-line-title">Circuito automático</div>
              <div class="settings-line-sub">Usar por defecto la siguiente carrera detectada en el calendario.</div>
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDetailModal();
    });

    updateSubtitle();
    fetchStandingsData().catch(() => {});
    fetchCalendarData().catch(() => {});
    showHome();
  