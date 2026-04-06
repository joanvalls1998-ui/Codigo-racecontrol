const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const DEFAULT_YEAR = 2026;
const SUPPORTED_SESSION_TYPES = ["fp1", "fp2", "fp3", "qualy", "race"];

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 20,
  entities: 1000 * 60 * 15,
  compare: 1000 * 60 * 8,
  context: 1000 * 60 * 10
});

const cache = {
  meetings: new Map(),
  sessionsByMeeting: new Map(),
  entitiesBySession: new Map(),
  compare: new Map(),
  context: new Map()
};

const SESSION_TYPES = Object.freeze([
  { key: "fp1", label: "FP1", aliases: ["Practice 1", "Free Practice 1"] },
  { key: "fp2", label: "FP2", aliases: ["Practice 2", "Free Practice 2"] },
  { key: "fp3", label: "FP3", aliases: ["Practice 3", "Free Practice 3"] },
  { key: "qualy", label: "Qualy", aliases: ["Qualifying", "Sprint Qualifying", "Sprint Shootout"] },
  { key: "race", label: "Carrera", aliases: ["Race", "Grand Prix", "Sprint"] }
]);

function setCached(map, key, value) {
  map.set(key, { value, ts: Date.now() });
  return value;
}

function getCached(map, key, ttlMs) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

async function fetchOpenF1(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const response = await fetch(`${OPENF1_BASE_URL}/${endpoint}?${query.toString()}`, {
    headers: { "User-Agent": "RaceControlEngineer/3.0" },
    cache: "no-store"
  });

  if (!response.ok) {
    const error = new Error(`OpenF1 ${endpoint} (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function parseMaybeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function average(values = []) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((acc, n) => acc + n, 0) / valid.length;
}

function median(values = []) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2) return valid[middle];
  return (valid[middle - 1] + valid[middle]) / 2;
}

function cleanLabel(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text
    .replace(/^FORMULA\s*1\b[^A-Z0-9]*?/i, "")
    .replace(/^FIA\s*FORMULA\s*ONE\b[^A-Z0-9]*?/i, "")
    .replace(/\b(ROLEX|QATAR AIRWAYS|AWS|ARAMCO|MSC CRUISES|HEINEKEN)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeSessionType(name = "") {
  const normalized = String(name || "").toLowerCase().trim();
  const exact = SESSION_TYPES.find(type => type.aliases.some(alias => alias.toLowerCase() === normalized));
  if (exact) return exact.key;
  if (normalized.includes("practice 1")) return "fp1";
  if (normalized.includes("practice 2")) return "fp2";
  if (normalized.includes("practice 3")) return "fp3";
  if (normalized.includes("qual")) return "qualy";
  if (normalized.includes("race") || normalized.includes("grand prix") || normalized.includes("sprint")) return "race";
  return "";
}

function sessionTypeLabel(typeKey = "") {
  return SESSION_TYPES.find(item => item.key === typeKey)?.label || typeKey;
}

function getYearFromRow(row = {}) {
  if (Number.isFinite(Number(row.year))) return Number(row.year);
  const dateLike = row.date_start || row.date || row.session_start || "";
  const parsed = dateLike ? new Date(dateLike).getUTCFullYear() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function gpLabelFromMeeting(meeting = {}) {
  const year = Number(meeting.year) || DEFAULT_YEAR;
  const base = [
    cleanLabel(meeting.country_name),
    cleanLabel(meeting.meeting_name),
    cleanLabel(meeting.location),
    cleanLabel(meeting.circuit_short_name)
  ].find(Boolean) || "Gran Premio";
  return /\b\d{4}\b/.test(base) ? base : `${base} ${year}`;
}

function normalizeDriver(row = {}) {
  const id = String(row.driver_number || row.racing_number || row.number || "").trim();
  const name = String(
    row.full_name
      || `${row.first_name || ""} ${row.last_name || ""}`.trim()
      || row.driver_name
      || row.broadcast_name
      || row.name_acronym
      || ""
  ).trim();
  const team = String(row.team_name || row.team || "").trim();

  return {
    id,
    name,
    team,
    headshot: String(row.headshot_url || "").trim()
  };
}

function simpleDegradation(laps = []) {
  const valid = laps
    .filter(lap => Number.isFinite(Number(lap.lap_duration)))
    .sort((a, b) => Number(a.lap_number) - Number(b.lap_number));
  if (valid.length < 4) return null;
  const first = average(valid.slice(0, 3).map(lap => Number(lap.lap_duration)));
  const last = average(valid.slice(-3).map(lap => Number(lap.lap_duration)));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return last - first;
}

function countMentions(rows = [], pattern = "") {
  const re = new RegExp(pattern, "i");
  return rows.filter(row => re.test(String(row.message || row.category || row.flag || ""))).length;
}

async function getMeetings(year = DEFAULT_YEAR) {
  const cacheKey = `year:${year}`;
  const cached = getCached(cache.meetings, cacheKey, TTL.meetings);
  if (cached) return cached;

  const rows = await fetchOpenF1("meetings", { year });
  const meetings = rows
    .filter(row => Number(row.year) === Number(year))
    .map(row => ({
      meeting_key: String(row.meeting_key),
      year: Number(row.year),
      gp_label: gpLabelFromMeeting(row),
      country_name: row.country_name || "",
      meeting_name: row.meeting_name || "",
      location: row.location || "",
      circuit_short_name: row.circuit_short_name || ""
    }))
    .filter(row => row.meeting_key)
    .sort((a, b) => String(a.gp_label).localeCompare(String(b.gp_label)));

  return setCached(cache.meetings, cacheKey, meetings);
}

async function getSessions(meetingKey, year = DEFAULT_YEAR) {
  const cacheKey = `${meetingKey}:${year}`;
  const cached = getCached(cache.sessionsByMeeting, cacheKey, TTL.sessions);
  if (cached) return cached;

  const rows = await fetchOpenF1("sessions", { meeting_key: meetingKey });
  const sessions = rows
    .filter(row => getYearFromRow(row) === Number(year))
    .map(row => {
      const type_key = normalizeSessionType(row.session_name);
      return {
        session_key: String(row.session_key),
        meeting_key: String(row.meeting_key),
        session_name: row.session_name || "",
        type_key,
        type_label: sessionTypeLabel(type_key),
        date_start: row.date_start || row.date || ""
      };
    })
    .filter(row => row.session_key && SUPPORTED_SESSION_TYPES.includes(row.type_key))
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

  return setCached(cache.sessionsByMeeting, cacheKey, sessions);
}

async function getEntities(sessionKey) {
  const cached = getCached(cache.entitiesBySession, String(sessionKey), TTL.entities);
  if (cached) return cached;

  const byDriverId = new Map();
  const collect = (rows = []) => {
    rows.forEach(row => {
      const driver = normalizeDriver(row);
      if (!driver.id || !driver.name || byDriverId.has(driver.id)) return;
      byDriverId.set(driver.id, driver);
    });
  };

  collect(await fetchOpenF1("drivers", { session_key: sessionKey }).catch(() => []));
  if (!byDriverId.size) collect(await fetchOpenF1("laps", { session_key: sessionKey }).catch(() => []));
  if (!byDriverId.size) collect(await fetchOpenF1("position", { session_key: sessionKey }).catch(() => []));

  const drivers = [...byDriverId.values()]
    .map(driver => ({ ...driver, team: driver.team || "Equipo" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamsMap = new Map();
  drivers.forEach(driver => {
    const name = String(driver.team || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const current = teamsMap.get(key) || { id: name, name, drivers: [], color: "" };
    current.drivers.push(driver.name);
    teamsMap.set(key, current);
  });

  const teams = [...teamsMap.values()]
    .map(team => ({ ...team, drivers: team.drivers.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return setCached(cache.entitiesBySession, String(sessionKey), { drivers, teams });
}

async function getDriverMetrics(sessionKey, driverNumber) {
  const [lapsRows, carDataRows, stintsRows, positionRows] = await Promise.all([
    fetchOpenF1("laps", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("car_data", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("stints", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("position", { session_key: sessionKey, driver_number: driverNumber }).catch(() => [])
  ]);

  const cleanLaps = lapsRows
    .map(lap => ({
      lap_number: parseMaybeNumber(lap.lap_number),
      lap_duration: parseMaybeNumber(lap.lap_duration),
      sector1: parseMaybeNumber(lap.duration_sector_1),
      sector2: parseMaybeNumber(lap.duration_sector_2),
      sector3: parseMaybeNumber(lap.duration_sector_3),
      st_speed: parseMaybeNumber(lap.st_speed)
    }))
    .filter(lap => Number.isFinite(lap.lap_duration));

  const lapDurations = cleanLaps.map(lap => lap.lap_duration).filter(Number.isFinite);
  const bestLap = lapDurations.length ? Math.min(...lapDurations) : null;
  const avgPace = average(lapDurations);

  const topSpeed = (() => {
    const speeds = carDataRows.map(row => parseMaybeNumber(row.speed)).filter(Number.isFinite);
    return speeds.length ? Math.max(...speeds) : null;
  })();

  const speedTrap = (() => {
    const speeds = cleanLaps.map(lap => lap.st_speed).filter(Number.isFinite);
    return speeds.length ? Math.max(...speeds) : null;
  })();

  const positionSample = positionRows
    .map(item => parseMaybeNumber(item.position))
    .filter(Number.isFinite);

  const stintRows = stintsRows
    .map(stint => ({
      number: parseMaybeNumber(stint.stint_number),
      compound: String(stint.compound || "N/D"),
      lap_start: parseMaybeNumber(stint.lap_start),
      lap_end: parseMaybeNumber(stint.lap_end),
      tyre_age_start: parseMaybeNumber(stint.tyre_age_at_start)
    }))
    .filter(stint => Number.isFinite(stint.number));

  return {
    lapCount: cleanLaps.length,
    referenceLap: bestLap,
    averagePace: avgPace,
    medianPace: median(lapDurations),
    topSpeed,
    speedTrap,
    avgPosition: average(positionSample),
    sector1: average(cleanLaps.map(lap => lap.sector1)),
    sector2: average(cleanLaps.map(lap => lap.sector2)),
    sector3: average(cleanLaps.map(lap => lap.sector3)),
    degradation: simpleDegradation(cleanLaps),
    stints: stintRows.map(stint => ({
      number: stint.number,
      compound: stint.compound,
      laps: Number.isFinite(stint.lap_start) && Number.isFinite(stint.lap_end) ? stint.lap_end - stint.lap_start + 1 : null,
      tyreAgeStart: stint.tyre_age_start,
      lapStart: stint.lap_start,
      lapEnd: stint.lap_end
    }))
  };
}

function aggregateTeamMetrics(metricsList = []) {
  const valid = metricsList.filter(Boolean);
  if (!valid.length) return null;

  const referenceCandidates = valid.map(item => item.referenceLap).filter(Number.isFinite);
  const topCandidates = valid.map(item => item.topSpeed).filter(Number.isFinite);
  const trapCandidates = valid.map(item => item.speedTrap).filter(Number.isFinite);

  return {
    lapCount: valid.reduce((acc, item) => acc + Number(item.lapCount || 0), 0),
    referenceLap: referenceCandidates.length ? Math.min(...referenceCandidates) : null,
    averagePace: average(valid.map(item => item.averagePace)),
    medianPace: average(valid.map(item => item.medianPace)),
    topSpeed: topCandidates.length ? Math.max(...topCandidates) : null,
    speedTrap: trapCandidates.length ? Math.max(...trapCandidates) : null,
    avgPosition: average(valid.map(item => item.avgPosition)),
    sector1: average(valid.map(item => item.sector1)),
    sector2: average(valid.map(item => item.sector2)),
    sector3: average(valid.map(item => item.sector3)),
    degradation: average(valid.map(item => item.degradation)),
    stints: valid.flatMap(item => item.stints || []).slice(0, 10)
  };
}

function summarizeContext(payload = {}) {
  const weather = payload.weather || [];
  const raceControl = payload.race_control || [];
  return {
    avgTrackTemp: average(weather.map(item => parseMaybeNumber(item.track_temperature))),
    avgAirTemp: average(weather.map(item => parseMaybeNumber(item.air_temperature))),
    avgHumidity: average(weather.map(item => parseMaybeNumber(item.humidity))),
    raceControlMessages: raceControl.length,
    safetyCarFlags: countMentions(raceControl, "safety car|virtual safety car"),
    yellowFlags: countMentions(raceControl, "yellow"),
    pitStops: (payload.pit || []).length,
    overtakes: (payload.overtakes || []).length,
    teamRadios: (payload.team_radio || []).length
  };
}

async function loadContext(sessionKey, meetingKey, year = DEFAULT_YEAR) {
  const [weather, race_control, pit, overtakes, team_radio, session_result, starting_grid] = await Promise.all([
    fetchOpenF1("weather", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("race_control", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("pit", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("overtakes", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("team_radio", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("session_result", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("starting_grid", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("championship_drivers", { meeting_key: meetingKey, year }).catch(() => []),
    fetchOpenF1("championship_teams", { meeting_key: meetingKey, year }).catch(() => [])
  ]);

  const payload = { weather, race_control, pit, overtakes, team_radio, session_result, starting_grid };
  return { ...payload, summary: summarizeContext(payload) };
}

function pickWinner(lowerIsBetter, aValue, bValue) {
  if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) return "none";
  if (aValue === bValue) return "tie";
  if (lowerIsBetter) return aValue < bValue ? "a" : "b";
  return aValue > bValue ? "a" : "b";
}

async function buildBaseComparison({ sessionKey, type, a, b }) {
  const entities = await getEntities(sessionKey);

  if (type === "team") {
    const aDrivers = entities.drivers.filter(driver => driver.team === a);
    const bDrivers = entities.drivers.filter(driver => driver.team === b);
    if (!aDrivers.length || !bDrivers.length) {
      const error = new Error("No hay datos de comparación para esta combinación");
      error.code = "NO_COMPARISON";
      throw error;
    }

    const [aMetricsList, bMetricsList] = await Promise.all([
      Promise.all(aDrivers.map(driver => getDriverMetrics(sessionKey, driver.id))),
      Promise.all(bDrivers.map(driver => getDriverMetrics(sessionKey, driver.id)))
    ]);

    return {
      a: { label: a, team: a, image: "", drivers: aDrivers.map(item => item.name), metrics: aggregateTeamMetrics(aMetricsList) },
      b: { label: b, team: b, image: "", drivers: bDrivers.map(item => item.name), metrics: aggregateTeamMetrics(bMetricsList) }
    };
  }

  const driverA = entities.drivers.find(driver => driver.name === a);
  const driverB = entities.drivers.find(driver => driver.name === b);
  if (!driverA || !driverB) {
    const error = new Error("No hay participantes para esta sesión");
    error.code = "NO_PARTICIPANTS";
    throw error;
  }

  const [metricsA, metricsB] = await Promise.all([
    getDriverMetrics(sessionKey, driverA.id),
    getDriverMetrics(sessionKey, driverB.id)
  ]);

  return {
    a: { label: driverA.name, team: driverA.team, image: driverA.headshot, metrics: metricsA },
    b: { label: driverB.name, team: driverB.team, image: driverB.headshot, metrics: metricsB }
  };
}

function buildSummaryBlock(baseComparison = {}) {
  const a = baseComparison.a?.metrics || {};
  const b = baseComparison.b?.metrics || {};
  const deltaReference = Number.isFinite(a.referenceLap) && Number.isFinite(b.referenceLap) ? a.referenceLap - b.referenceLap : null;
  const deltaPace = Number.isFinite(a.averagePace) && Number.isFinite(b.averagePace) ? a.averagePace - b.averagePace : null;

  return {
    referenceLap: { a: a.referenceLap ?? null, b: b.referenceLap ?? null, winner: pickWinner(true, a.referenceLap, b.referenceLap), delta: deltaReference },
    averagePace: { a: a.averagePace ?? null, b: b.averagePace ?? null, winner: pickWinner(true, a.averagePace, b.averagePace), delta: deltaPace },
    topSpeed: { a: a.topSpeed ?? null, b: b.topSpeed ?? null, winner: pickWinner(false, a.topSpeed, b.topSpeed) },
    speedTrap: { a: a.speedTrap ?? null, b: b.speedTrap ?? null, winner: pickWinner(false, a.speedTrap, b.speedTrap) },
    avgPosition: { a: a.avgPosition ?? null, b: b.avgPosition ?? null, winner: pickWinner(true, a.avgPosition, b.avgPosition) },
    primaryDelta: {
      label: "Delta referencia",
      value: deltaReference,
      advantage: Number.isFinite(deltaReference) ? (deltaReference < 0 ? "a" : (deltaReference > 0 ? "b" : "tie")) : "none"
    }
  };
}

function buildSectorsBlock(baseComparison = {}) {
  const a = baseComparison.a?.metrics || {};
  const b = baseComparison.b?.metrics || {};

  const sector = (aValue, bValue) => ({
    a: aValue ?? null,
    b: bValue ?? null,
    delta: Number.isFinite(aValue) && Number.isFinite(bValue) ? aValue - bValue : null,
    winner: pickWinner(true, aValue, bValue)
  });

  return {
    sector1: sector(a.sector1, b.sector1),
    sector2: sector(a.sector2, b.sector2),
    sector3: sector(a.sector3, b.sector3)
  };
}

function buildStintsBlock(baseComparison = {}) {
  const a = baseComparison.a?.metrics || {};
  const b = baseComparison.b?.metrics || {};

  return {
    degradation: {
      a: a.degradation ?? null,
      b: b.degradation ?? null,
      delta: Number.isFinite(a.degradation) && Number.isFinite(b.degradation) ? a.degradation - b.degradation : null,
      winner: pickWinner(true, a.degradation, b.degradation)
    },
    averagePace: {
      a: a.averagePace ?? null,
      b: b.averagePace ?? null,
      delta: Number.isFinite(a.averagePace) && Number.isFinite(b.averagePace) ? a.averagePace - b.averagePace : null,
      winner: pickWinner(true, a.averagePace, b.averagePace)
    },
    stintsA: a.stints || [],
    stintsB: b.stints || []
  };
}

function buildEvolutionBlock(evolutionRows = []) {
  return evolutionRows.map(item => ({
    label: item.label,
    type_key: item.type_key,
    aPace: item.aPace,
    bPace: item.bPace,
    paceDelta: Number.isFinite(item.aPace) && Number.isFinite(item.bPace) ? item.aPace - item.bPace : null,
    aRef: item.aRef,
    bRef: item.bRef,
    refDelta: Number.isFinite(item.aRef) && Number.isFinite(item.bRef) ? item.aRef - item.bRef : null
  }));
}

async function buildComparison({ meetingKey, sessionKey, type, a, b, year = DEFAULT_YEAR }) {
  const cacheKey = `${year}:${meetingKey}:${sessionKey}:${type}:${a}:${b}`;
  const cached = getCached(cache.compare, cacheKey, TTL.compare);
  if (cached) return cached;

  const base = await buildBaseComparison({ sessionKey, type, a, b });
  const context = await loadContext(sessionKey, meetingKey, year);

  const sessions = await getSessions(meetingKey, year);
  const evolutionRows = [];
  for (const session of sessions) {
    if (!SUPPORTED_SESSION_TYPES.includes(session.type_key)) continue;
    try {
      const row = await buildBaseComparison({ sessionKey: session.session_key, type, a, b });
      evolutionRows.push({
        label: session.type_label,
        type_key: session.type_key,
        aPace: row.a?.metrics?.averagePace ?? null,
        bPace: row.b?.metrics?.averagePace ?? null,
        aRef: row.a?.metrics?.referenceLap ?? null,
        bRef: row.b?.metrics?.referenceLap ?? null
      });
    } catch {
      continue;
    }
  }

  const payload = {
    year,
    season_focus: DEFAULT_YEAR,
    source: {
      analytics: "fastf1-ready",
      enrichment: "openf1",
      active_engine: "openf1"
    },
    meeting_key: meetingKey,
    session_key: sessionKey,
    type,
    comparison: {
      a: base.a,
      b: base.b
    },
    blocks: {
      sessionContext: context.summary,
      summary: buildSummaryBlock(base),
      sectors: buildSectorsBlock(base),
      stints: buildStintsBlock(base),
      comparison: { a: base.a, b: base.b },
      evolution: buildEvolutionBlock(evolutionRows)
    }
  };

  return setCached(cache.compare, cacheKey, payload);
}

async function resolveTelemetryContext({ year = DEFAULT_YEAR, meetingKey = "", sessionType = "", type = "driver", a = "", b = "" }) {
  const cacheKey = `${year}:${meetingKey}:${sessionType}:${type}:${a}:${b}`;
  const cached = getCached(cache.context, cacheKey, TTL.context);
  if (cached) return cached;

  const meetings = await getMeetings(year);
  if (!meetings.length) {
    return setCached(cache.context, cacheKey, {
      year,
      season_focus: DEFAULT_YEAR,
      selections: { meeting_key: "", session_type: "", session_key: "", type, a: "", b: "" },
      meetings: [],
      sessions: [],
      entities: { drivers: [], teams: [] },
      options: { a: [], b: [] }
    });
  }

  const selectedMeeting = meetings.find(item => String(item.meeting_key) === String(meetingKey)) || meetings[0];
  const sessions = await getSessions(selectedMeeting.meeting_key, year);
  const selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[sessions.length - 1] || null;
  const entities = selectedSession ? await getEntities(selectedSession.session_key) : { drivers: [], teams: [] };

  const sourceOptions = type === "team" ? entities.teams.map(item => item.name) : entities.drivers.map(item => item.name);
  const selectedA = sourceOptions.includes(a) ? a : (sourceOptions[0] || "");
  const bPool = sourceOptions.filter(item => item !== selectedA);
  const selectedB = bPool.includes(b) ? b : (bPool[0] || "");

  const payload = {
    year,
    season_focus: DEFAULT_YEAR,
    selections: {
      meeting_key: String(selectedMeeting.meeting_key),
      session_type: selectedSession?.type_key || "",
      session_key: selectedSession?.session_key || "",
      type,
      a: selectedA,
      b: selectedB
    },
    meetings,
    sessions,
    entities,
    options: { a: sourceOptions, b: bPool }
  };

  return setCached(cache.context, cacheKey, payload);
}

function apiError(res, status, message, code = "ENGINEER_ERROR") {
  return res.status(status).json({ error: { code, message } });
}

function parseYear(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_YEAR;
}

export {
  DEFAULT_YEAR,
  SESSION_TYPES,
  apiError,
  buildComparison,
  getEntities,
  getMeetings,
  getSessions,
  parseYear,
  resolveTelemetryContext
};
