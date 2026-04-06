const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const DEFAULT_YEAR = 2026;
const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 30,
  entities: 1000 * 60 * 10,
  compare: 1000 * 60 * 5,
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
  const item = map.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > ttlMs) {
    map.delete(key);
    return null;
  }
  return item.value;
}

async function fetchOpenF1(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const response = await fetch(`${OPENF1_BASE_URL}/${endpoint}?${query.toString()}`, {
    headers: { "User-Agent": "RaceControlEngineer/2.0" },
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

function getYearFromRow(row = {}) {
  if (Number.isFinite(Number(row.year))) return Number(row.year);
  const dateLike = row.date_start || row.date || row.session_start || "";
  const parsed = dateLike ? new Date(dateLike).getUTCFullYear() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSessionType(name = "") {
  const normalized = String(name || "").toLowerCase();
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
  return SESSION_TYPES.find(type => type.key === typeKey)?.label || typeKey;
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

function average(values = []) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

function simpleDegradation(laps = []) {
  const valid = laps
    .filter(lap => Number.isFinite(lap.lap_duration))
    .sort((a, b) => Number(a.lap_number) - Number(b.lap_number));
  if (valid.length < 4) return null;
  const first = average(valid.slice(0, 3).map(l => Number(l.lap_duration)));
  const last = average(valid.slice(-3).map(l => Number(l.lap_duration)));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return last - first;
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

async function getMeetings(year = DEFAULT_YEAR) {
  const cacheKey = `year:${year}`;
  const cached = getCached(cache.meetings, cacheKey, TTL.meetings);
  if (cached) return cached;

  const rows = await fetchOpenF1("meetings", { year });
  const meetings = rows
    .filter(row => Number(row.year) === Number(year))
    .map(row => ({
      meeting_key: row.meeting_key,
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
        session_key: row.session_key,
        meeting_key: row.meeting_key,
        session_name: row.session_name || "",
        type_key,
        type_label: sessionTypeLabel(type_key),
        date_start: row.date_start || row.date || ""
      };
    })
    .filter(row => row.session_key && row.type_key)
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

  try {
    collect(await fetchOpenF1("drivers", { session_key: sessionKey }));
  } catch {
    // no-op
  }

  if (!byDriverId.size) {
    try {
      collect(await fetchOpenF1("laps", { session_key: sessionKey }));
    } catch {
      // no-op
    }
  }

  if (!byDriverId.size) {
    try {
      collect(await fetchOpenF1("position", { session_key: sessionKey }));
    } catch {
      // no-op
    }
  }

  const drivers = [...byDriverId.values()]
    .map(driver => ({
      ...driver,
      team: driver.team || "Equipo"
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamsMap = new Map();
  drivers.forEach(driver => {
    const name = String(driver.team || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const entry = teamsMap.get(key) || { id: name, name, drivers: [] };
    entry.drivers.push(driver.name);
    teamsMap.set(key, entry);
  });

  const teams = [...teamsMap.values()]
    .map(team => ({ ...team, drivers: team.drivers.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = { drivers, teams };
  return setCached(cache.entitiesBySession, String(sessionKey), payload);
}

async function getDriverMetrics(sessionKey, driverNumber) {
  const [lapsRows, carDataRows, stintsRows] = await Promise.all([
    fetchOpenF1("laps", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("car_data", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("stints", { session_key: sessionKey, driver_number: driverNumber }).catch(() => [])
  ]);

  const lapRows = lapsRows.filter(lap => Number.isFinite(Number(lap.lap_duration)));
  const lapDurations = lapRows.map(lap => Number(lap.lap_duration)).filter(Number.isFinite);
  const bestLap = lapDurations.length ? Math.min(...lapDurations) : null;
  const avgPace = average(lapDurations);

  const speeds = carDataRows.map(row => Number(row.speed)).filter(Number.isFinite);
  const topSpeed = speeds.length ? Math.max(...speeds) : null;

  const trapSpeeds = lapRows.map(lap => Number(lap.st_speed)).filter(Number.isFinite);
  const speedTrap = trapSpeeds.length ? Math.max(...trapSpeeds) : null;

  const metrics = {
    lapCount: lapRows.length,
    referenceLap: bestLap,
    averagePace: avgPace,
    topSpeed,
    speedTrap,
    sector1: average(lapRows.map(lap => Number(lap.duration_sector_1))),
    sector2: average(lapRows.map(lap => Number(lap.duration_sector_2))),
    sector3: average(lapRows.map(lap => Number(lap.duration_sector_3))),
    degradation: simpleDegradation(lapRows),
    stints: stintsRows.map(stint => ({
      number: stint.stint_number,
      compound: stint.compound || "N/D",
      laps: Number.isFinite(Number(stint.lap_start)) && Number.isFinite(Number(stint.lap_end))
        ? Number(stint.lap_end) - Number(stint.lap_start) + 1
        : null,
      tyreAgeStart: Number.isFinite(Number(stint.tyre_age_at_start)) ? Number(stint.tyre_age_at_start) : null
    }))
  };

  return metrics;
}

function aggregateTeamMetrics(list = []) {
  const valid = list.filter(Boolean);
  if (!valid.length) return null;

  const referenceCandidates = valid.map(item => item.referenceLap).filter(Number.isFinite);
  const topCandidates = valid.map(item => item.topSpeed).filter(Number.isFinite);
  const trapCandidates = valid.map(item => item.speedTrap).filter(Number.isFinite);

  return {
    lapCount: valid.reduce((acc, item) => acc + Number(item.lapCount || 0), 0),
    referenceLap: referenceCandidates.length ? Math.min(...referenceCandidates) : null,
    averagePace: average(valid.map(item => item.averagePace)),
    topSpeed: topCandidates.length ? Math.max(...topCandidates) : null,
    speedTrap: trapCandidates.length ? Math.max(...trapCandidates) : null,
    sector1: average(valid.map(item => item.sector1)),
    sector2: average(valid.map(item => item.sector2)),
    sector3: average(valid.map(item => item.sector3)),
    degradation: average(valid.map(item => item.degradation)),
    stints: valid.flatMap(item => item.stints || []).slice(0, 8)
  };
}

function summarizeContext(payload = {}) {
  const weather = payload.weather || [];
  return {
    avgTrackTemp: average(weather.map(item => Number(item.track_temperature))),
    avgAirTemp: average(weather.map(item => Number(item.air_temperature))),
    raceControlMessages: (payload.race_control || []).length,
    pitStops: (payload.pit || []).length,
    overtakes: (payload.overtakes || []).length,
    teamRadios: (payload.team_radio || []).length,
    locationSamples: (payload.location || []).length,
    intervalSamples: (payload.intervals || []).length,
    sessionResultRows: (payload.session_result || []).length,
    startingGridRows: (payload.starting_grid || []).length,
    championshipDriverRows: (payload.championship_drivers || []).length,
    championshipTeamRows: (payload.championship_teams || []).length
  };
}

async function loadContext(sessionKey, meetingKey, year = DEFAULT_YEAR) {
  const [
    weather,
    race_control,
    pit,
    overtakes,
    team_radio,
    location,
    intervals,
    session_result,
    starting_grid,
    championship_drivers,
    championship_teams
  ] = await Promise.all([
    fetchOpenF1("weather", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("race_control", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("pit", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("overtakes", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("team_radio", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("location", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("intervals", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("session_result", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("starting_grid", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("championship_drivers", { meeting_key: meetingKey, year }).catch(() => []),
    fetchOpenF1("championship_teams", { meeting_key: meetingKey, year }).catch(() => [])
  ]);

  const payload = {
    weather,
    race_control,
    pit,
    overtakes,
    team_radio,
    location,
    intervals,
    session_result,
    starting_grid,
    championship_drivers,
    championship_teams
  };

  return {
    ...payload,
    summary: summarizeContext(payload)
  };
}

async function buildBaseComparison({ sessionKey, type, a, b }) {
  const entities = await getEntities(sessionKey);
  let entityA = null;
  let entityB = null;

  if (type === "team") {
    const aDrivers = entities.drivers.filter(driver => driver.team === a);
    const bDrivers = entities.drivers.filter(driver => driver.team === b);

    if (!aDrivers.length || !bDrivers.length) {
      const error = new Error("No hay datos de comparación para esta combinación");
      error.code = "NO_COMPARISON";
      throw error;
    }

    const [aMetrics, bMetrics] = await Promise.all([
      Promise.all(aDrivers.map(driver => getDriverMetrics(sessionKey, driver.id))),
      Promise.all(bDrivers.map(driver => getDriverMetrics(sessionKey, driver.id)))
    ]);

    entityA = { label: a, team: a, image: "", metrics: aggregateTeamMetrics(aMetrics) };
    entityB = { label: b, team: b, image: "", metrics: aggregateTeamMetrics(bMetrics) };
  } else {
    const aDriver = entities.drivers.find(driver => driver.name === a);
    const bDriver = entities.drivers.find(driver => driver.name === b);

    if (!aDriver || !bDriver) {
      const error = new Error("No hay participantes para esta sesión");
      error.code = "NO_PARTICIPANTS";
      throw error;
    }

    const [aMetrics, bMetrics] = await Promise.all([
      getDriverMetrics(sessionKey, aDriver.id),
      getDriverMetrics(sessionKey, bDriver.id)
    ]);

    entityA = { label: aDriver.name, team: aDriver.team, image: aDriver.headshot, metrics: aMetrics };
    entityB = { label: bDriver.name, team: bDriver.team, image: bDriver.headshot, metrics: bMetrics };
  }

  return { a: entityA, b: entityB };
}

function buildDashboardBlocks(baseComparison = {}) {
  const aMetrics = baseComparison.a?.metrics || {};
  const bMetrics = baseComparison.b?.metrics || {};
  return {
    summary: {
      referenceLap: { a: aMetrics.referenceLap ?? null, b: bMetrics.referenceLap ?? null },
      averagePace: { a: aMetrics.averagePace ?? null, b: bMetrics.averagePace ?? null },
      topSpeed: { a: aMetrics.topSpeed ?? null, b: bMetrics.topSpeed ?? null },
      speedTrap: { a: aMetrics.speedTrap ?? null, b: bMetrics.speedTrap ?? null }
    },
    sectors: {
      sector1: { a: aMetrics.sector1 ?? null, b: bMetrics.sector1 ?? null },
      sector2: { a: aMetrics.sector2 ?? null, b: bMetrics.sector2 ?? null },
      sector3: { a: aMetrics.sector3 ?? null, b: bMetrics.sector3 ?? null }
    },
    stint: {
      degradation: { a: aMetrics.degradation ?? null, b: bMetrics.degradation ?? null },
      averagePace: { a: aMetrics.averagePace ?? null, b: bMetrics.averagePace ?? null },
      stintsA: aMetrics.stints || [],
      stintsB: bMetrics.stints || []
    }
  };
}

async function buildComparison({ meetingKey, sessionKey, type, a, b, year = DEFAULT_YEAR }) {
  const cacheKey = `${year}:${meetingKey}:${sessionKey}:${type}:${a}:${b}`;
  const cached = getCached(cache.compare, cacheKey, TTL.compare);
  if (cached) return cached;

  const baseComparison = await buildBaseComparison({ sessionKey, type, a, b });

  const sessions = await getSessions(meetingKey, year);
  const ordered = sessions.filter(session => ["fp1", "fp2", "fp3", "qualy", "race"].includes(session.type_key));

  const evolution = [];
  for (const session of ordered) {
    try {
      const perSession = await buildBaseComparison({
        sessionKey: session.session_key,
        type,
        a,
        b
      });

      evolution.push({
        label: session.type_label,
        type_key: session.type_key,
        aPace: perSession.a?.metrics?.averagePace ?? null,
        bPace: perSession.b?.metrics?.averagePace ?? null,
        aRef: perSession.a?.metrics?.referenceLap ?? null,
        bRef: perSession.b?.metrics?.referenceLap ?? null
      });
    } catch {
      continue;
    }
  }

  const context = await loadContext(sessionKey, meetingKey, year);
  const payload = {
    year,
    meeting_key: meetingKey,
    session_key: sessionKey,
    type,
    comparison: {
      a: baseComparison.a,
      b: baseComparison.b,
      context
    },
    dashboard: buildDashboardBlocks(baseComparison),
    evolution
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
      selections: { meeting_key: "", session_type: "", session_key: "", type, a: "", b: "" },
      meetings: [],
      sessions: [],
      entities: { drivers: [], teams: [] },
      options: { a: [], b: [] }
    });
  }

  const selectedMeeting = meetings.find(item => String(item.meeting_key) === String(meetingKey)) || meetings[0];
  const sessions = await getSessions(selectedMeeting.meeting_key, year);
  const sessionPool = sessions.filter(item => ["fp1", "fp2", "fp3", "qualy", "race"].includes(item.type_key));

  const selectedSession = sessionPool.find(item => item.type_key === sessionType) || sessionPool[sessionPool.length - 1] || null;
  const entities = selectedSession ? await getEntities(selectedSession.session_key) : { drivers: [], teams: [] };

  const sourceOptions = type === "team"
    ? entities.teams.map(item => item.name)
    : entities.drivers.map(item => item.name);

  const selectedA = sourceOptions.includes(a) ? a : (sourceOptions[0] || "");
  const bPool = sourceOptions.filter(name => name !== selectedA);
  const selectedB = bPool.includes(b) ? b : (bPool[0] || "");

  const payload = {
    year,
    selections: {
      meeting_key: String(selectedMeeting.meeting_key),
      session_type: selectedSession?.type_key || "",
      session_key: selectedSession?.session_key || "",
      type,
      a: selectedA,
      b: selectedB
    },
    meetings,
    sessions: sessionPool,
    entities,
    options: {
      a: sourceOptions,
      b: bPool
    }
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
