const ENGINEER_SESSIONS = Object.freeze([
  { key: "fp1", label: "FP1", openf1: "Practice 1" },
  { key: "fp2", label: "FP2", openf1: "Practice 2" },
  { key: "fp3", label: "FP3", openf1: "Practice 3" },
  { key: "qualifying", label: "Qualy", openf1: "Qualifying" },
  { key: "race", label: "Carrera", openf1: "Race" }
]);

const ENGINEER_TABS = Object.freeze([
  { key: "resumen", label: "Resumen" },
  { key: "sectores", label: "Sectores" },
  { key: "stint", label: "Stint" },
  { key: "comparativas", label: "Comparativas" },
  { key: "evolucion", label: "Evolución" }
]);

const OPENF1_GP_ALIASES = Object.freeze({
  "GP de Australia": ["australia", "melbourne"],
  "GP de China": ["china", "shanghai"],
  "GP de Japón": ["japan", "suzuka"],
  "GP de Baréin": ["bahrain", "sakhir"],
  "GP de Arabia Saudí": ["saudi", "jeddah"],
  "GP Miami": ["miami"],
  "GP de Canadá": ["canada", "montreal"],
  "GP de Mónaco": ["monaco"],
  "GP de España": ["spain", "barcelona", "catalunya"],
  "GP de Austria": ["austria", "spielberg"],
  "GP de Gran Bretaña": ["british", "united kingdom", "silverstone"],
  "GP de Bélgica": ["belgium", "spa"],
  "GP de Hungría": ["hungary", "budapest"],
  "GP de Países Bajos": ["netherlands", "zandvoort", "dutch"],
  "GP de Italia": ["italy", "monza"],
  "GP de Azerbaiyán": ["azerbaijan", "baku"],
  "GP de Singapur": ["singapore", "marina bay"],
  "GP de Estados Unidos": ["united states", "austin", "cota"],
  "GP de México": ["mexico", "mexico city"],
  "GP de São Paulo": ["sao paulo", "brazil", "interlagos"],
  "GP de Las Vegas": ["las vegas"],
  "GP de Catar": ["qatar", "lusail"],
  "GP de Abu Dabi": ["abu dhabi", "yas marina"]
});

const OPENF1_TIMEOUT_MS = 9000;
const ENGINEER_DATASETS = Object.freeze(["sessions", "drivers", "laps", "car_data", "stints", "location"]);

const EngineerTelemetryProvider = {
  _cache: new Map(),
  _sessionValidity: new Map(),
  _metaPromise: null,

  getGrandPrixOptions() {
    return getPredictRaceOptions();
  },

  async ensureMetadata() {
    if (this._metaPromise) return this._metaPromise;
    const year = new Date().getUTCFullYear();
    const urls = [year, year - 1]
      .map(item => this.openF1Url("sessions", { year: item }));
    this._metaPromise = Promise.all(urls.map(url => this.fetchJson(url)))
      .then(chunks => this.normalizeSessions(chunks.flat()))
      .catch(() => ({ sessionsByGp: {}, latest: null }));
    return this._metaPromise;
  },

  openF1Url(dataset, params = {}) {
    const query = Object.entries(params)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    return `https://api.openf1.org/v1/${dataset}${query ? `?${query}` : ""}`;
  },

  normalizeSessions(rows) {
    const sessionsByGp = {};
    const all = Array.isArray(rows) ? rows : [];

    all.forEach(session => {
      const sessionKey = this.openf1SessionToKey(session?.session_name);
      if (!sessionKey) return;
      const gp = this.mapOpenF1SessionToGp(session);
      if (!gp) return;
      if (!sessionsByGp[gp]) sessionsByGp[gp] = {};
      const current = sessionsByGp[gp][sessionKey];
      const sessionDate = new Date(session?.date_end || session?.date_start || 0).getTime();
      if (!current || sessionDate > new Date(current?.date_end || current?.date_start || 0).getTime()) {
        sessionsByGp[gp][sessionKey] = session;
      }
    });

    const now = Date.now();
    let latest = null;
    Object.entries(sessionsByGp).forEach(([gp, bucket]) => {
      ENGINEER_SESSIONS.forEach(def => {
        const session = bucket[def.key];
        if (!session) return;
        const ts = new Date(session?.date_end || session?.date_start || 0).getTime();
        if (!Number.isFinite(ts) || ts > now) return;
        if (!latest || ts > latest.ts) {
          latest = { gp, session: def.key, ts };
        }
      });
    });

    return { sessionsByGp, latest };
  },

  mapOpenF1SessionToGp(session) {
    const text = [session?.meeting_name, session?.country_name, session?.location, session?.circuit_short_name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const options = this.getGrandPrixOptions();
    for (const gp of options) {
      const aliases = OPENF1_GP_ALIASES[gp] || [];
      if (aliases.some(alias => text.includes(alias))) return gp;
    }
    return null;
  },

  openf1SessionToKey(name) {
    if (!name) return null;
    const lower = String(name).toLowerCase();
    if (lower.includes("practice 1")) return "fp1";
    if (lower.includes("practice 2")) return "fp2";
    if (lower.includes("practice 3")) return "fp3";
    if (lower.includes("qualifying")) return "qualifying";
    if (lower === "race" || lower.includes("grand prix")) return "race";
    return null;
  },

  async resolveLatestSelection() {
    const meta = await this.ensureMetadata();
    const ranking = [];
    Object.entries(meta?.sessionsByGp || {}).forEach(([gp, bucket]) => {
      ENGINEER_SESSIONS.forEach(def => {
        const session = bucket[def.key];
        if (!session) return;
        const ts = new Date(session?.date_end || session?.date_start || 0).getTime();
        if (!Number.isFinite(ts) || ts > Date.now()) return;
        ranking.push({ gp, session: def.key, ref: session, ts });
      });
    });
    ranking.sort((a, b) => b.ts - a.ts);

    for (const candidate of ranking) {
      const valid = await this.sessionHasData(candidate.ref);
      if (valid.ok) return { gp: candidate.gp, session: candidate.session };
    }

    if (meta?.latest?.gp && meta?.latest?.session) {
      return { gp: meta.latest.gp, session: meta.latest.session };
    }

    const raceOptions = this.getGrandPrixOptions();
    return { gp: raceOptions[raceOptions.length - 1], session: "race" };
  },

  async buildTelemetry(engineer) {
    const meta = await this.ensureMetadata();
    const primaryRef = this.getSessionRef(meta, engineer.gpA, engineer.sessionA);
    const secondaryRef = engineer.compareMode === "between_gp"
      ? this.getSessionRef(meta, engineer.gpB, engineer.sessionB)
      : this.getSessionRef(meta, engineer.gpA, engineer.sessionA);

    const entityOptions = await this.resolveEntityOptions(engineer.compareType, primaryRef, secondaryRef);

    const currentA = entityOptions.includes(engineer.entityA) ? engineer.entityA : entityOptions[0] || "";
    const currentB = entityOptions.includes(engineer.entityB) && engineer.entityB !== currentA
      ? engineer.entityB
      : (entityOptions.find(item => item !== currentA) || entityOptions[0] || "");

    engineer.entityA = currentA;
    engineer.entityB = currentB;

    const targetA = { ref: primaryRef, compareType: engineer.compareType, entity: currentA };
    const targetB = { ref: secondaryRef, compareType: engineer.compareType, entity: currentB };

    const [dataA, dataB, evolution, availabilityA, availabilityB] = await Promise.all([
      this.buildEntitySnapshot(targetA),
      this.buildEntitySnapshot(targetB),
      this.buildEvolution(meta, engineer),
      this.sessionHasData(primaryRef),
      this.sessionHasData(secondaryRef)
    ]);

    const hasAnyData = dataA.available || dataB.available;
    return {
      entityOptions,
      meta,
      metrics: this.composeMetrics(dataA, dataB),
      dataA,
      dataB,
      evolution,
      hasAnyData,
      availabilityA,
      availabilityB,
      datasetCoverage: ENGINEER_DATASETS
    };
  },

  getSessionRef(meta, gp, sessionKey) {
    const byGp = meta?.sessionsByGp?.[gp] || {};
    return byGp[sessionKey] || null;
  },

  async resolveEntityOptions(compareType, refA, refB) {
    const options = [];
    const seen = new Set();
    const refs = [refA, refB].filter(Boolean);

    for (const ref of refs) {
      const drivers = await this.fetchSessionDrivers(ref?.session_key);
      drivers.forEach(driver => {
        const label = compareType === "driver" ? driver.full_name : driver.team_name;
        if (!label || seen.has(label)) return;
        seen.add(label);
        options.push(label);
      });
    }

    return options.sort((a, b) => a.localeCompare(b, "es"));
  },

  fallbackDrivers() {
    return this.getDriverOptionsFromStandings();
  },

  fallbackTeams() {
    return this.getTeamOptionsFromStandings();
  },

  getDriverOptionsFromStandings() {
    const names = [];
    const seen = new Set();
    (state.standingsCache?.drivers || []).forEach(driver => {
      if (!driver?.name || seen.has(driver.name)) return;
      seen.add(driver.name);
      names.push(driver.name);
    });
    return names;
  },

  getTeamOptionsFromStandings() {
    const names = [];
    const seen = new Set();
    (state.standingsCache?.teams || []).forEach(team => {
      const name = team?.team;
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
    return names;
  },

  async fetchSessionDrivers(sessionKey) {
    if (!sessionKey) return [];
    return this.fetchJson(this.openF1Url("drivers", { session_key: sessionKey }));
  },

  async sessionHasData(ref) {
    if (!ref?.session_key) return { ok: false, reason: "Sesión no disponible en OpenF1." };
    if (this._sessionValidity.has(ref.session_key)) return this._sessionValidity.get(ref.session_key);

    const probe = (async () => {
      const drivers = await this.fetchSessionDrivers(ref.session_key);
      if (!drivers.length) return { ok: false, reason: "La sesión no tiene pilotos en OpenF1." };
      const number = drivers.find(item => item?.driver_number !== undefined && item?.driver_number !== null)?.driver_number;
      if (number === undefined || number === null) return { ok: false, reason: "OpenF1 no publicó número de piloto para esta sesión." };

      const [laps, carData, stints, location] = await Promise.all([
        this.fetchPerDriver(ref.session_key, [String(number)], "laps"),
        this.fetchPerDriver(ref.session_key, [String(number)], "car_data"),
        this.fetchPerDriver(ref.session_key, [String(number)], "stints"),
        this.fetchPerDriver(ref.session_key, [String(number)], "location")
      ]);
      const lapRows = Object.values(laps).flat();
      const speedRows = Object.values(carData).flat();
      const stintRows = Object.values(stints).flat();
      const locRows = Object.values(location).flat();
      const ok = lapRows.length > 0 || speedRows.length > 0 || stintRows.length > 0 || locRows.length > 0;
      return ok
        ? { ok: true, reason: "" }
        : { ok: false, reason: "La sesión existe, pero OpenF1 no tiene vueltas/telemetría para esta combinación." };
    })();

    this._sessionValidity.set(ref.session_key, probe);
    return probe;
  },

  async buildEntitySnapshot({ ref, compareType, entity }) {
    if (!ref?.session_key || !entity) return this.emptySnapshot(entity);

    const drivers = await this.fetchSessionDrivers(ref.session_key);
    const matchingDrivers = compareType === "driver"
      ? drivers.filter(driver => driver.full_name === entity)
      : drivers.filter(driver => driver.team_name === entity);

    const driverNumbers = matchingDrivers
      .map(driver => driver.driver_number)
      .filter(number => number !== null && number !== undefined)
      .map(number => String(number));

    if (!driverNumbers.length) return this.emptySnapshot(entity);

    const [lapsByDriver, carDataByDriver, stintsByDriver, locationByDriver] = await Promise.all([
      this.fetchPerDriver(ref.session_key, driverNumbers, "laps"),
      this.fetchPerDriver(ref.session_key, driverNumbers, "car_data"),
      this.fetchPerDriver(ref.session_key, driverNumbers, "stints"),
      this.fetchPerDriver(ref.session_key, driverNumbers, "location")
    ]);

    const mergedLaps = Object.values(lapsByDriver).flat();
    const mergedCarData = Object.values(carDataByDriver).flat();
    const mergedStints = Object.values(stintsByDriver).flat();
    const mergedLocations = Object.values(locationByDriver).flat();

    return this.computeSnapshotFromRows({
      label: entity,
      laps: mergedLaps,
      carData: mergedCarData,
      stints: mergedStints,
      location: mergedLocations
    });
  },

  async fetchPerDriver(sessionKey, driverNumbers, dataset) {
    const entries = await Promise.all(driverNumbers.map(async number => {
      const url = this.openF1Url(dataset, { session_key: sessionKey, driver_number: number });
      const rows = await this.fetchJson(url).catch(() => []);
      return [number, Array.isArray(rows) ? rows : []];
    }));
    return Object.fromEntries(entries);
  },

  computeSnapshotFromRows({ label, laps, carData, stints, location }) {
    const validLaps = (Array.isArray(laps) ? laps : []).filter(lap => {
      const duration = Number(lap?.lap_duration);
      return Number.isFinite(duration) && duration > 40 && duration < 200 && !lap?.is_pit_out_lap;
    });

    const sortedByPace = [...validLaps].sort((a, b) => Number(a.lap_duration) - Number(b.lap_duration));
    const referenceLap = sortedByPace[0] ? Number(sortedByPace[0].lap_duration) : null;
    const rhythmSample = sortedByPace.slice(0, Math.min(sortedByPace.length, 8));
    const avgPace = rhythmSample.length
      ? rhythmSample.reduce((acc, lap) => acc + Number(lap.lap_duration), 0) / rhythmSample.length
      : null;

    const sectors = {
      s1: this.minimumOf(validLaps.map(lap => Number(lap?.duration_sector_1))),
      s2: this.minimumOf(validLaps.map(lap => Number(lap?.duration_sector_2))),
      s3: this.minimumOf(validLaps.map(lap => Number(lap?.duration_sector_3)))
    };

    const speeds = (Array.isArray(carData) ? carData : [])
      .map(row => Number(row?.speed))
      .filter(value => Number.isFinite(value) && value > 100 && value < 400)
      .sort((a, b) => a - b);

    const topSpeed = speeds.length ? speeds[Math.floor(speeds.length * 0.95)] : null;
    const speedTrap = speeds.length ? speeds[speeds.length - 1] : null;

    const lapSeries = validLaps
      .slice(0, 20)
      .map((lap, index) => ({
        x: index + 1,
        y: Number(lap.lap_duration)
      }));

    const degradation = this.computeDegradation(validLaps, stints);

    const dataPresence = {
      laps: validLaps.length,
      carData: Array.isArray(carData) ? carData.length : 0,
      stints: Array.isArray(stints) ? stints.length : 0,
      location: Array.isArray(location) ? location.length : 0
    };

    return {
      label,
      available: Object.values(dataPresence).some(count => count > 0),
      dataPresence,
      referenceLap,
      avgPace,
      sectors,
      topSpeed,
      speedTrap,
      lapSeries,
      degradation,
      fastSlow: this.computeFastSlow(validLaps)
    };
  },

  computeFastSlow(laps) {
    const values = (laps || []).map(lap => ({
      s1: Number(lap?.duration_sector_1),
      s2: Number(lap?.duration_sector_2),
      s3: Number(lap?.duration_sector_3)
    })).filter(row => Number.isFinite(row.s1) && Number.isFinite(row.s2) && Number.isFinite(row.s3));

    if (!values.length) return { fast: null, slow: null };

    const fast = values.reduce((acc, row) => acc + ((row.s1 + row.s3) / 2), 0) / values.length;
    const slow = values.reduce((acc, row) => acc + row.s2, 0) / values.length;

    return { fast, slow };
  },

  computeDegradation(laps, stints) {
    const validLaps = (laps || [])
      .map(lap => ({ lap: Number(lap?.lap_number), time: Number(lap?.lap_duration) }))
      .filter(row => Number.isFinite(row.lap) && Number.isFinite(row.time))
      .sort((a, b) => a.lap - b.lap);

    if (validLaps.length < 6) return { slope: null, points: [] };

    const points = validLaps.map(row => ({ x: row.lap, y: row.time }));
    const slope = this.linearRegressionSlope(points);

    const stintRows = (stints || [])
      .map(stint => ({ start: Number(stint?.lap_start), end: Number(stint?.lap_end), stint: stint?.stint_number }))
      .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end))
      .slice(0, 4)
      .map(row => ({
        label: `Stint ${row.stint}`,
        x1: row.start,
        x2: row.end
      }));

    return { slope, points, stintRows };
  },

  linearRegressionSlope(points) {
    const n = points.length;
    if (!n) return null;
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
    const sumX2 = points.reduce((acc, p) => acc + p.x * p.x, 0);
    const denominator = (n * sumX2) - (sumX * sumX);
    if (!denominator) return null;
    return ((n * sumXY) - (sumX * sumY)) / denominator;
  },

  minimumOf(values) {
    const valid = values.filter(value => Number.isFinite(value) && value > 5 && value < 90);
    if (!valid.length) return null;
    return Math.min(...valid);
  },

  emptySnapshot(label = "") {
    return {
      label,
      available: false,
      dataPresence: { laps: 0, carData: 0, stints: 0, location: 0 },
      referenceLap: null,
      avgPace: null,
      sectors: { s1: null, s2: null, s3: null },
      topSpeed: null,
      speedTrap: null,
      lapSeries: [],
      degradation: { slope: null, points: [], stintRows: [] },
      fastSlow: { fast: null, slow: null }
    };
  },

  composeMetrics(dataA, dataB) {
    return {
      refLapA: dataA.referenceLap,
      refLapB: dataB.referenceLap,
      avgPaceA: dataA.avgPace,
      avgPaceB: dataB.avgPace,
      topSpeedA: dataA.topSpeed,
      topSpeedB: dataB.topSpeed,
      speedTrapA: dataA.speedTrap,
      speedTrapB: dataB.speedTrap,
      deltaLap: this.safeDelta(dataA.referenceLap, dataB.referenceLap),
      sectorsA: dataA.sectors,
      sectorsB: dataB.sectors,
      fastSlowA: dataA.fastSlow,
      fastSlowB: dataB.fastSlow,
      stintA: dataA.degradation,
      stintB: dataB.degradation,
      lapSeriesA: dataA.lapSeries,
      lapSeriesB: dataB.lapSeries
    };
  },

  async buildEvolution(meta, engineer) {
    const refs = ENGINEER_SESSIONS.map(session => ({
      key: session.key,
      refA: this.getSessionRef(meta, engineer.gpA, session.key),
      refB: engineer.compareMode === "between_gp"
        ? this.getSessionRef(meta, engineer.gpB, session.key)
        : this.getSessionRef(meta, engineer.gpA, session.key)
    }));

    const rows = await Promise.all(refs.map(async row => {
      const [snapA, snapB] = await Promise.all([
        this.buildEntitySnapshot({ ref: row.refA, compareType: engineer.compareType, entity: engineer.entityA }),
        this.buildEntitySnapshot({ ref: row.refB, compareType: engineer.compareType, entity: engineer.entityB })
      ]);
      return {
        key: row.key,
        label: ENGINEER_SESSIONS.find(item => item.key === row.key)?.label || row.key,
        a: snapA.referenceLap,
        b: snapB.referenceLap
      };
    }));

    return rows.filter(row => Number.isFinite(row.a) || Number.isFinite(row.b));
  },

  safeDelta(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return b - a;
  },

  async fetchJson(url) {
    if (this._cache.has(url)) return this._cache.get(url);

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPENF1_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return [];
        return response.json();
      } finally {
        clearTimeout(timer);
      }
    })();

    this._cache.set(url, promise);
    return promise;
  }
};

function getEngineerState() {
  if (!window.__engineerModeState) {
    window.__engineerModeState = {
      gpA: getPredictRaceOptions()[0],
      sessionA: "race",
      gpB: getPredictRaceOptions()[0],
      sessionB: "race",
      compareMode: "same_gp",
      compareType: "driver",
      entityA: "",
      entityB: "",
      tab: "resumen",
      loading: true,
      status: "loading",
      statusMessage: "Cargando telemetría histórica OpenF1…",
      error: "",
      entityOptions: [],
      telemetry: null,
      requestId: 0
    };
  }
  return window.__engineerModeState;
}

function openEngineerMode() {
  setExperienceMode("engineer");
}

async function showEngineerHub() {
  setActiveNav("");
  rememberScreen("engineer");
  updateSubtitle();

  if (!state.calendarCache) {
    try { await fetchCalendarData(); } catch {}
  }
  if (!state.standingsCache) {
    try { await fetchStandingsData(); } catch {}
  }

  const mode = getExperienceMode();
  if (mode !== "engineer") {
    setExperienceMode("engineer");
    return;
  }

  const engineer = getEngineerState();
  if (!engineer._hydrated) {
    const latest = await EngineerTelemetryProvider.resolveLatestSelection();
    engineer.gpA = latest.gp;
    engineer.sessionA = latest.session;
    engineer.gpB = latest.gp;
    engineer.sessionB = latest.session;
    engineer._hydrated = true;
  }

  renderEngineerHub();
  refreshEngineerTelemetry();
}

function renderEngineerSelect(label, value, options, onChange, { compact = false } = {}) {
  const cls = compact ? "engineer-field compact" : "engineer-field";
  const safeOptions = Array.isArray(options) ? options : [];
  const hasOptions = safeOptions.length > 0;
  return `
    <label class="${cls}">
      <span>${escapeHtml(label)}</span>
      <select onchange="${onChange}(this.value)" ${hasOptions ? "" : "disabled"}>
        ${hasOptions
          ? safeOptions.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")
          : '<option value="">Sin opciones</option>'
        }
      </select>
    </label>
  `;
}

function renderEngineerHub() {
  const engineer = getEngineerState();
  const raceOptions = EngineerTelemetryProvider.getGrandPrixOptions().map(gp => ({ value: gp, label: gp }));
  const sessionOptions = ENGINEER_SESSIONS.map(session => ({ value: session.key, label: session.label }));
  const comparisonModeOptions = [
    { value: "same_gp", label: "Mismo GP" },
    { value: "between_gp", label: "Entre GP" }
  ];
  const comparisonTypeOptions = [
    { value: "driver", label: "Piloto / Piloto" },
    { value: "team", label: "Equipo / Equipo" }
  ];

  const sourceOptions = engineer.entityOptions;

  const metrics = engineer.telemetry?.metrics;
  const availabilityA = engineer.telemetry?.availabilityA;
  const availabilityB = engineer.telemetry?.availabilityB;
  const statusBanner = engineer.loading
    ? '<div class="engineer-loading">Cargando telemetría histórica OpenF1…</div>'
    : engineer.error
      ? `<div class="engineer-error">${escapeHtml(engineer.error)}</div>`
      : engineer.status === "empty"
        ? `<div class="engineer-empty-state">${escapeHtml(engineer.statusMessage || "Sin datos para la selección actual.")}</div>`
        : `<div class="engineer-status">Datos reales OpenF1 cargados · endpoints: ${ENGINEER_DATASETS.join(", ")}</div>`;

  contentEl().innerHTML = `
    <section class="engineer-shell">
      <header class="engineer-header">
        <div class="engineer-header-bar">
          <button class="engineer-back" onclick="exitEngineerMode()" aria-label="Salir del modo Ingeniero">
            <span aria-hidden="true">←</span>
            <span>Salir</span>
          </button>
          <div class="engineer-header-title-wrap">
            <p class="engineer-header-kicker">RaceControl</p>
            <h1 class="engineer-header-title">Modo Ingeniero</h1>
          </div>
        </div>
        <div class="engineer-controls">
          ${renderEngineerSelect("GP A", engineer.gpA, raceOptions, "setEngineerGpA")}
          ${renderEngineerSelect("Sesión A", engineer.sessionA, sessionOptions, "setEngineerSessionA")}
          ${renderEngineerSelect("Modo", engineer.compareMode, comparisonModeOptions, "setEngineerCompareMode")}
          ${renderEngineerSelect("Tipo", engineer.compareType, comparisonTypeOptions, "setEngineerCompareType")}
          ${engineer.compareMode === "between_gp"
            ? `${renderEngineerSelect("GP B", engineer.gpB, raceOptions, "setEngineerGpB")}${renderEngineerSelect("Sesión B", engineer.sessionB, sessionOptions, "setEngineerSessionB")}`
            : ""
          }
          ${renderEngineerSelect("A", engineer.entityA, sourceOptions.map(item => ({ value: item, label: item })), "setEngineerEntityA", { compact: true })}
          ${renderEngineerSelect("B", engineer.entityB, sourceOptions.map(item => ({ value: item, label: item })), "setEngineerEntityB", { compact: true })}
        </div>
      </header>

      ${statusBanner}
      ${!engineer.loading && !engineer.error ? `
        <div class="engineer-availability">
          <span>A: ${escapeHtml(availabilityA?.ok ? "Con datos" : (availabilityA?.reason || "Sin datos"))}</span>
          <span>B: ${escapeHtml(availabilityB?.ok ? "Con datos" : (availabilityB?.reason || "Sin datos"))}</span>
        </div>
      ` : ""}

      <section class="engineer-quick-summary">
        ${renderEngineerSummaryKpi("REFERENCIA", formatMetric(metrics?.refLapA, 3, "s"), `${engineer.entityA || "A"}`)}
        ${renderEngineerSummaryKpi("RITMO MEDIO", formatMetric(metrics?.avgPaceA, 3, "s"), `${engineer.entityA || "A"}`)}
        ${renderEngineerSummaryKpi("VELOCIDAD PUNTA", formatMetric(metrics?.topSpeedA, 1, "km/h"), `${engineer.entityA || "A"}`)}
        ${renderEngineerSummaryKpi("DELTA", formatSignedMetric(metrics?.deltaLap, 3, "s"), `${engineer.entityB || "B"} vs ${engineer.entityA || "A"}`, Number(metrics?.deltaLap) <= 0 ? "good" : "bad")}
      </section>

      <nav class="engineer-tabs">
        ${ENGINEER_TABS.map(tab => `<button class="engineer-tab ${engineer.tab === tab.key ? "active" : ""}" onclick="setEngineerTab('${tab.key}')">${tab.label}</button>`).join("")}
      </nav>

      <section class="engineer-content">
        ${renderEngineerTabContent(engineer, metrics)}
      </section>
    </section>
  `;
}

function formatMetric(value, decimals, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  return `${Number(value).toFixed(decimals)}${suffix ? ` ${suffix}` : ""}`;
}

function formatSignedMetric(value, decimals, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  const fixed = Number(value).toFixed(decimals);
  return `${value >= 0 ? "+" : ""}${fixed}${suffix ? ` ${suffix}` : ""}`;
}

function renderEngineerSummaryKpi(label, value, sub, tone = "") {
  return `
    <article class="engineer-kpi ${tone}">
      <div class="engineer-kpi-label">${escapeHtml(label)}</div>
      <div class="engineer-kpi-value">${escapeHtml(value)}</div>
      <div class="engineer-kpi-sub">${escapeHtml(sub)}</div>
    </article>
  `;
}

function renderEngineerMetricRow(label, valueA, valueB, { suffix = "", highlight = "" } = {}) {
  return `
    <div class="engineer-row ${highlight}">
      <span>${escapeHtml(label)}</span>
      <span class="a">${escapeHtml(formatRowValue(valueA, suffix))}</span>
      <span class="b">${escapeHtml(formatRowValue(valueB, suffix))}</span>
    </div>
  `;
}

function formatRowValue(value, suffix) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(suffix.includes("km") ? 1 : 3)}${suffix}`;
}

function hasComparableData(valueA, valueB) {
  return Number.isFinite(valueA) || Number.isFinite(valueB);
}

function renderLineChart(seriesA, seriesB, { height = 130 } = {}) {
  const pointsA = Array.isArray(seriesA) ? seriesA : [];
  const pointsB = Array.isArray(seriesB) ? seriesB : [];
  const all = [...pointsA, ...pointsB];
  if (!all.length) return '<div class="engineer-empty">Sin datos suficientes</div>';

  const minX = Math.min(...all.map(p => p.x));
  const maxX = Math.max(...all.map(p => p.x));
  const minY = Math.min(...all.map(p => p.y));
  const maxY = Math.max(...all.map(p => p.y));

  const norm = point => {
    const x = maxX === minX ? 0 : ((point.x - minX) / (maxX - minX)) * 100;
    const y = maxY === minY ? 50 : 100 - ((point.y - minY) / (maxY - minY)) * 100;
    return `${x},${y}`;
  };

  return `
    <svg class="engineer-linechart" viewBox="0 0 100 100" style="height:${height}px">
      <polyline points="${pointsA.map(norm).join(" ")}" class="a"/>
      <polyline points="${pointsB.map(norm).join(" ")}" class="b"/>
    </svg>
  `;
}

function renderDeltaBars(metrics) {
  const deltas = [
    { label: "S1", value: safeSub(metrics?.sectorsB?.s1, metrics?.sectorsA?.s1) },
    { label: "S2", value: safeSub(metrics?.sectorsB?.s2, metrics?.sectorsA?.s2) },
    { label: "S3", value: safeSub(metrics?.sectorsB?.s3, metrics?.sectorsA?.s3) }
  ];

  const absMax = Math.max(0.05, ...deltas.map(item => Math.abs(item.value || 0)));

  return `
    <div class="engineer-delta-bars">
      ${deltas.map(item => {
        const pct = Math.min(100, (Math.abs(item.value || 0) / absMax) * 100);
        const side = (item.value || 0) >= 0 ? "right" : "left";
        return `
          <div class="bar-row">
            <span>${item.label}</span>
            <div class="bar-track ${side}"><i style="width:${pct}%"></i></div>
            <strong>${Number.isFinite(item.value) ? `${item.value >= 0 ? "+" : ""}${item.value.toFixed(3)}s` : "—"}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function safeSub(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function renderEvolutionChart(rows) {
  if (!Array.isArray(rows) || !rows.length) return '<div class="engineer-empty">Sin evolución disponible</div>';
  const seriesA = rows.map((row, index) => ({ x: index + 1, y: row.a })).filter(p => Number.isFinite(p.y));
  const seriesB = rows.map((row, index) => ({ x: index + 1, y: row.b })).filter(p => Number.isFinite(p.y));

  return `
    <div class="engineer-evo-wrap">
      ${renderLineChart(seriesA, seriesB, { height: 150 })}
      <div class="engineer-evo-legend">${rows.map(row => `<span>${escapeHtml(row.label)}</span>`).join("")}</div>
    </div>
  `;
}

function renderEngineerTabContent(engineer, metrics) {
  const telemetry = engineer.telemetry || {};
  if (engineer.tab === "resumen") {
    const speedRows = [
      hasComparableData(metrics?.topSpeedA, metrics?.topSpeedB)
        ? renderEngineerMetricRow("Top Speed", metrics?.topSpeedA, metrics?.topSpeedB, { suffix: " km/h" })
        : "",
      hasComparableData(metrics?.speedTrapA, metrics?.speedTrapB)
        ? renderEngineerMetricRow("Speed Trap", metrics?.speedTrapA, metrics?.speedTrapB, { suffix: " km/h" })
        : ""
    ].filter(Boolean).join("");
    const paceRows = [
      hasComparableData(metrics?.refLapA, metrics?.refLapB)
        ? renderEngineerMetricRow("Vuelta referencia", metrics?.refLapA, metrics?.refLapB, { suffix: " s" })
        : "",
      hasComparableData(metrics?.avgPaceA, metrics?.avgPaceB)
        ? renderEngineerMetricRow("Ritmo medio", metrics?.avgPaceA, metrics?.avgPaceB, { suffix: " s" })
        : "",
      hasComparableData(metrics?.deltaLap, Number.isFinite(metrics?.deltaLap) ? -metrics.deltaLap : null)
        ? renderEngineerMetricRow("Delta principal", metrics?.deltaLap, Number.isFinite(metrics?.deltaLap) ? -metrics.deltaLap : null, { suffix: " s", highlight: Number(metrics?.deltaLap) <= 0 ? "good" : "bad" })
        : ""
    ].filter(Boolean).join("");
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>VELOCIDAD · SPEED TRAP</h3>
          ${speedRows || '<div class="engineer-empty">Sin datos de velocidad para esta selección</div>'}
          ${renderLineChart(metrics?.lapSeriesA, metrics?.lapSeriesB)}
        </article>
        <article class="engineer-panel">
          <h3>REFERENCIA · RITMO</h3>
          ${paceRows || '<div class="engineer-empty">Sin vueltas válidas para construir referencia o ritmo</div>'}
        </article>
      </div>
    `;
  }

  if (engineer.tab === "sectores") {
    const sectorRows = [
      hasComparableData(metrics?.sectorsA?.s1, metrics?.sectorsB?.s1)
        ? renderEngineerMetricRow("Sector 1", metrics?.sectorsA?.s1, metrics?.sectorsB?.s1, { suffix: " s" })
        : "",
      hasComparableData(metrics?.sectorsA?.s2, metrics?.sectorsB?.s2)
        ? renderEngineerMetricRow("Sector 2", metrics?.sectorsA?.s2, metrics?.sectorsB?.s2, { suffix: " s" })
        : "",
      hasComparableData(metrics?.sectorsA?.s3, metrics?.sectorsB?.s3)
        ? renderEngineerMetricRow("Sector 3", metrics?.sectorsA?.s3, metrics?.sectorsB?.s3, { suffix: " s" })
        : ""
    ].filter(Boolean).join("");
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>SECTORES Y DELTA</h3>
          ${sectorRows || '<div class="engineer-empty">Sin sectores válidos en OpenF1 para esta selección</div>'}
          ${sectorRows ? renderDeltaBars(metrics) : ""}
        </article>
      </div>
    `;
  }

  if (engineer.tab === "stint") {
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>STINT · DEGRADACIÓN</h3>
          ${renderEngineerMetricRow("Pendiente deg/vuelta", metrics?.stintA?.slope, metrics?.stintB?.slope, { suffix: " s" })}
          ${renderLineChart(metrics?.stintA?.points, metrics?.stintB?.points)}
          <div class="engineer-footnote">La pendiente sale de regresión lineal sobre vueltas válidas.</div>
        </article>
      </div>
    `;
  }

  if (engineer.tab === "comparativas") {
    const badgeA = engineer.compareType === "driver" ? renderDriverAvatar(engineer.entityA, getDriverImageByName(engineer.entityA), "row-avatar") : "";
    const badgeB = engineer.compareType === "driver" ? renderDriverAvatar(engineer.entityB, getDriverImageByName(engineer.entityB), "row-avatar") : "";
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>${engineer.compareType === "driver" ? "PILOTO / PILOTO" : "EQUIPO / EQUIPO"}</h3>
          <div class="engineer-compare-head">
            <div>${badgeA}<strong>${escapeHtml(engineer.entityA || "A")}</strong></div>
            <div>${badgeB}<strong>${escapeHtml(engineer.entityB || "B")}</strong></div>
          </div>
          ${renderEngineerMetricRow("Referencia", metrics?.refLapA, metrics?.refLapB, { suffix: " s" })}
          ${renderEngineerMetricRow("Ritmo", metrics?.avgPaceA, metrics?.avgPaceB, { suffix: " s" })}
          ${renderEngineerMetricRow("Speed Trap", metrics?.speedTrapA, metrics?.speedTrapB, { suffix: " km/h" })}
          ${renderLineChart(metrics?.lapSeriesA, metrics?.lapSeriesB)}
        </article>
      </div>
    `;
  }

  return `
    <div class="engineer-grid">
      <article class="engineer-panel">
        <h3>EVOLUCIÓN FP / QUALY / CARRERA</h3>
        ${renderEvolutionChart(telemetry.evolution)}
      </article>
    </div>
  `;
}

async function refreshEngineerTelemetry() {
  const engineer = getEngineerState();
  engineer.requestId += 1;
  const requestId = engineer.requestId;
  engineer.loading = true;
  engineer.status = "loading";
  engineer.statusMessage = "Cargando telemetría histórica OpenF1…";
  engineer.error = "";
  renderEngineerHub();

  try {
    const telemetry = await EngineerTelemetryProvider.buildTelemetry(engineer);
    if (requestId !== engineer.requestId) return;
    engineer.telemetry = telemetry;
    engineer.entityOptions = telemetry.entityOptions;
    engineer.loading = false;
    engineer.status = telemetry.hasAnyData ? "ready" : "empty";
    const missingSelectors = [];
    if (!telemetry.availabilityA?.ok) missingSelectors.push(`A (${engineer.gpA} · ${engineer.sessionA}): ${telemetry.availabilityA?.reason || "sin datos"}`);
    if (!telemetry.availabilityB?.ok) {
      const gpLabel = engineer.compareMode === "between_gp" ? engineer.gpB : engineer.gpA;
      const sessionLabel = engineer.compareMode === "between_gp" ? engineer.sessionB : engineer.sessionA;
      missingSelectors.push(`B (${gpLabel} · ${sessionLabel}): ${telemetry.availabilityB?.reason || "sin datos"}`);
    }
    if (!telemetry.entityOptions?.length) {
      missingSelectors.push(`Tipo ${engineer.compareType === "driver" ? "Piloto/Piloto" : "Equipo/Equipo"} sin entidades reales para la sesión seleccionada`);
    }
    engineer.statusMessage = telemetry.hasAnyData
      ? ""
      : `Sin datos útiles en OpenF1 para la combinación actual. ${missingSelectors.join(" · ")}`;
    engineer.error = "";
    renderEngineerHub();
  } catch {
    if (requestId !== engineer.requestId) return;
    engineer.loading = false;
    engineer.status = "error";
    engineer.error = "Error de carga OpenF1. Verifica red o cambia GP/sesión.";
    engineer.telemetry = {
      metrics: EngineerTelemetryProvider.composeMetrics(EngineerTelemetryProvider.emptySnapshot(), EngineerTelemetryProvider.emptySnapshot()),
      evolution: [],
      availabilityA: { ok: false, reason: "No se pudo evaluar la sesión A." },
      availabilityB: { ok: false, reason: "No se pudo evaluar la sesión B." }
    };
    renderEngineerHub();
  }
}

function setEngineerTab(tabKey) {
  const engineer = getEngineerState();
  engineer.tab = ENGINEER_TABS.some(tab => tab.key === tabKey) ? tabKey : "resumen";
  renderEngineerHub();
}

function setEngineerGpA(value) {
  const engineer = getEngineerState();
  engineer.gpA = value;
  if (engineer.compareMode === "same_gp") engineer.gpB = value;
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerSessionA(value) {
  const engineer = getEngineerState();
  engineer.sessionA = value;
  if (engineer.compareMode === "same_gp") engineer.sessionB = value;
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerCompareMode(value) {
  const engineer = getEngineerState();
  engineer.compareMode = value === "between_gp" ? "between_gp" : "same_gp";
  if (engineer.compareMode === "same_gp") {
    engineer.gpB = engineer.gpA;
    engineer.sessionB = engineer.sessionA;
  }
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerGpB(value) {
  const engineer = getEngineerState();
  engineer.gpB = value;
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerSessionB(value) {
  const engineer = getEngineerState();
  engineer.sessionB = value;
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerCompareType(value) {
  const engineer = getEngineerState();
  engineer.compareType = value === "team" ? "team" : "driver";
  engineer.entityA = "";
  engineer.entityB = "";
  engineer.entityOptions = [];
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerEntityA(value) {
  const engineer = getEngineerState();
  engineer.entityA = value;
  if (engineer.entityA === engineer.entityB) {
    engineer.entityB = engineer.entityOptions.find(item => item !== value) || "";
  }
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function setEngineerEntityB(value) {
  const engineer = getEngineerState();
  engineer.entityB = value;
  if (engineer.entityA === engineer.entityB) {
    engineer.entityA = engineer.entityOptions.find(item => item !== value) || "";
  }
  renderEngineerHub();
  refreshEngineerTelemetry();
}

function exitEngineerMode() {
  const fallback = state.lastNonEngineerMode === "expert" ? "expert" : "casual";
  setExperienceMode(fallback);
  setActiveNav("nav-home");
  showHome();
}

window.openEngineerMode = openEngineerMode;
window.showEngineerHub = showEngineerHub;
window.exitEngineerMode = exitEngineerMode;
window.setEngineerTab = setEngineerTab;
window.setEngineerGpA = setEngineerGpA;
window.setEngineerSessionA = setEngineerSessionA;
window.setEngineerCompareMode = setEngineerCompareMode;
window.setEngineerGpB = setEngineerGpB;
window.setEngineerSessionB = setEngineerSessionB;
window.setEngineerCompareType = setEngineerCompareType;
window.setEngineerEntityA = setEngineerEntityA;
window.setEngineerEntityB = setEngineerEntityB;
