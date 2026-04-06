import { spawn } from "node:child_process";

const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const DEFAULT_YEAR = 2026;
const SUPPORTED_SESSION_TYPES = ["fp1", "fp2", "fp3", "qualy", "race"];

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 20,
  entities: 1000 * 60 * 15,
  compare: 1000 * 60 * 8,
  context: 1000 * 60 * 10,
  fastf1: 1000 * 60 * 30
});

const SESSION_TYPES = Object.freeze([
  { key: "fp1", label: "FP1", aliases: ["Practice 1", "Free Practice 1"] },
  { key: "fp2", label: "FP2", aliases: ["Practice 2", "Free Practice 2"] },
  { key: "fp3", label: "FP3", aliases: ["Practice 3", "Free Practice 3"] },
  { key: "qualy", label: "Qualy", aliases: ["Qualifying", "Sprint Qualifying", "Sprint Shootout"] },
  { key: "race", label: "Carrera", aliases: ["Race", "Grand Prix", "Sprint"] }
]);

const cache = {
  meetings: new Map(),
  sessionsByMeeting: new Map(),
  entitiesBySession: new Map(),
  compare: new Map(),
  context: new Map(),
  fastf1: new Map()
};

function setCached(map, key, value) {
  map.set(key, { ts: Date.now(), value });
  return value;
}

function getCached(map, key, ttl) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) {
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
    headers: { "User-Agent": "RaceControlEngineer/4.0" },
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((acc, item) => acc + item, 0) / valid.length;
}

function median(values = []) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid] + valid[mid - 1]) / 2;
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanLabel(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^FORMULA\s*1\b[^A-Z0-9]*?/i, "")
    .replace(/^FIA\s*FORMULA\s*ONE\b[^A-Z0-9]*?/i, "")
    .replace(/\b(ROLEX|QATAR AIRWAYS|AWS|ARAMCO|MSC CRUISES|HEINEKEN|LENOVO)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sessionTypeLabel(typeKey = "") {
  return SESSION_TYPES.find(item => item.key === typeKey)?.label || typeKey;
}

function normalizeSessionType(name = "") {
  const lower = String(name || "").toLowerCase().trim();
  const exact = SESSION_TYPES.find(item => item.aliases.some(alias => alias.toLowerCase() === lower));
  if (exact) return exact.key;
  if (lower.includes("practice 1")) return "fp1";
  if (lower.includes("practice 2")) return "fp2";
  if (lower.includes("practice 3")) return "fp3";
  if (lower.includes("qual")) return "qualy";
  if (lower.includes("race") || lower.includes("grand prix") || lower.includes("sprint")) return "race";
  return "";
}

function getYearFromRow(row = {}) {
  if (Number.isFinite(Number(row.year))) return Number(row.year);
  const dateLike = row.date_start || row.date || row.session_start || row.session_start_date || "";
  if (!dateLike) return null;
  const parsed = new Date(dateLike).getUTCFullYear();
  return Number.isFinite(parsed) ? parsed : null;
}

function gpLabelFromMeeting(meeting = {}) {
  const candidates = [meeting.country_name, meeting.location, meeting.meeting_name, meeting.circuit_short_name]
    .map(cleanLabel)
    .filter(Boolean);
  const base = candidates[0] || "Grand Prix";
  return base.includes("2026") ? base : `${base} 2026`;
}

function pickWinner(lowerIsBetter, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "none";
  if (a === b) return "tie";
  if (lowerIsBetter) return a < b ? "a" : "b";
  return a > b ? "a" : "b";
}

function getDelta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function simpleDegradation(laps = []) {
  const clean = laps
    .filter(item => Number.isFinite(item.lap_duration) && Number.isFinite(item.lap_number))
    .sort((a, b) => a.lap_number - b.lap_number);
  if (clean.length < 6) return null;
  const first = average(clean.slice(0, 3).map(item => item.lap_duration));
  const last = average(clean.slice(-3).map(item => item.lap_duration));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return last - first;
}

async function getMeetings(year = DEFAULT_YEAR) {
  const key = `meetings:${year}`;
  const cached = getCached(cache.meetings, key, TTL.meetings);
  if (cached) return cached;

  const rows = await fetchOpenF1("meetings", { year }).catch(() => []);
  const meetings = rows
    .filter(row => getYearFromRow(row) === year)
    .map(row => ({
      meeting_key: String(row.meeting_key || "").trim(),
      gp_label: gpLabelFromMeeting(row),
      meeting_name: cleanLabel(row.meeting_name || ""),
      country_name: cleanLabel(row.country_name || ""),
      location: cleanLabel(row.location || ""),
      year
    }))
    .filter(item => item.meeting_key)
    .sort((a, b) => a.gp_label.localeCompare(b.gp_label));

  return setCached(cache.meetings, key, meetings);
}

async function getSessions(meetingKey, year = DEFAULT_YEAR) {
  const key = `sessions:${year}:${meetingKey}`;
  const cached = getCached(cache.sessionsByMeeting, key, TTL.sessions);
  if (cached) return cached;

  const rows = await fetchOpenF1("sessions", { meeting_key: meetingKey }).catch(() => []);
  const sessions = rows
    .map(row => {
      const type_key = normalizeSessionType(row.session_name);
      return {
        session_key: String(row.session_key || ""),
        meeting_key: String(row.meeting_key || ""),
        session_name: String(row.session_name || "").trim(),
        type_key,
        type_label: sessionTypeLabel(type_key),
        date_start: row.date_start || row.date || "",
        year: getYearFromRow(row)
      };
    })
    .filter(row => row.session_key && row.meeting_key === String(meetingKey) && row.year === year && SUPPORTED_SESSION_TYPES.includes(row.type_key))
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

  return setCached(cache.sessionsByMeeting, key, sessions);
}

function mapDriverRow(row = {}) {
  const id = String(row.driver_number || row.racing_number || row.number || "").trim();
  const name = String(
    row.full_name
      || `${row.first_name || ""} ${row.last_name || ""}`.trim()
      || row.driver_name
      || row.broadcast_name
      || row.name_acronym
      || (id ? `Driver #${id}` : "")
  ).trim();
  const team = String(row.team_name || row.team || row.team_id || "").trim();
  return {
    id,
    name,
    team,
    headshot: String(row.headshot_url || "").trim()
  };
}

function buildLineFromSamples(rows = [], valueReader, points = 24) {
  const values = rows.map(valueReader).filter(Number.isFinite);
  if (!values.length) return [];
  const bucketSize = Math.max(1, Math.floor(values.length / points));
  const series = [];
  for (let i = 0; i < values.length; i += bucketSize) {
    const chunk = values.slice(i, i + bucketSize);
    series.push(average(chunk));
  }
  return series.slice(0, points).map(v => Number.isFinite(v) ? Number(v.toFixed(2)) : null);
}

async function getEntities(sessionKey) {
  const cacheKey = `entities:${sessionKey}`;
  const cached = getCached(cache.entitiesBySession, cacheKey, TTL.entities);
  if (cached) return cached;

  const [driversRows, lapsRows, resultRows, positionRows] = await Promise.all([
    fetchOpenF1("drivers", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("laps", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("session_result", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("position", { session_key: sessionKey }).catch(() => [])
  ]);

  const byDriver = new Map();
  [driversRows, lapsRows, resultRows, positionRows].forEach(rows => {
    rows.forEach(row => {
      const driver = mapDriverRow(row);
      if (!driver.id || !driver.name) return;
      const current = byDriver.get(driver.id) || { id: driver.id, name: driver.name, team: "", headshot: "" };
      current.team = current.team || driver.team;
      current.headshot = current.headshot || driver.headshot;
      current.name = current.name || driver.name;
      byDriver.set(driver.id, current);
    });
  });

  const drivers = [...byDriver.values()]
    .map(driver => ({ ...driver, team: driver.team || "Equipo", entity_id: `driver:${driver.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamsMap = new Map();
  drivers.forEach(driver => {
    const key = normalizeKey(driver.team);
    if (!key) return;
    const current = teamsMap.get(key) || { entity_id: `team:${key}`, name: driver.team, drivers: [] };
    current.drivers.push(driver.name);
    teamsMap.set(key, current);
  });

  const teams = [...teamsMap.values()]
    .map(team => ({ ...team, drivers: team.drivers.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return setCached(cache.entitiesBySession, cacheKey, { drivers, teams });
}

async function getDriverMetricsOpenF1(sessionKey, driverNumber) {
  const [lapsRows, carDataRows, stintsRows, positionRows, resultRows] = await Promise.all([
    fetchOpenF1("laps", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("car_data", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("stints", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("position", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("session_result", { session_key: sessionKey, driver_number: driverNumber }).catch(() => [])
  ]);

  const laps = lapsRows
    .map(row => ({
      lap_number: parseMaybeNumber(row.lap_number),
      lap_duration: parseMaybeNumber(row.lap_duration),
      sector1: parseMaybeNumber(row.duration_sector_1),
      sector2: parseMaybeNumber(row.duration_sector_2),
      sector3: parseMaybeNumber(row.duration_sector_3),
      st_speed: parseMaybeNumber(row.st_speed)
    }))
    .filter(item => Number.isFinite(item.lap_duration));

  const lapDurations = laps.map(item => item.lap_duration).filter(Number.isFinite);
  const topSpeedCandidates = [
    ...carDataRows.map(row => parseMaybeNumber(row.speed)),
    ...resultRows.map(row => parseMaybeNumber(row.top_speed))
  ].filter(Number.isFinite);
  const topSpeed = topSpeedCandidates.length ? Math.max(...topSpeedCandidates) : Number.NEGATIVE_INFINITY;
  const speedTrapCandidates = [
    ...laps.map(lap => lap.st_speed),
    ...resultRows.map(row => parseMaybeNumber(row.speed_trap))
  ].filter(Number.isFinite);
  const speedTrap = speedTrapCandidates.length ? Math.max(...speedTrapCandidates) : Number.NEGATIVE_INFINITY;
  const speedProfile = buildLineFromSamples(carDataRows, row => parseMaybeNumber(row.speed), 28);
  const throttleProfile = buildLineFromSamples(carDataRows, row => parseMaybeNumber(row.throttle), 28);
  const brakeProfile = buildLineFromSamples(carDataRows, row => parseMaybeNumber(row.brake), 28);
  const completenessRaw = [
    lapDurations.length ? 1 : 0,
    Number.isFinite(topSpeed) ? 1 : 0,
    Number.isFinite(speedTrap) ? 1 : 0,
    Number.isFinite(average(laps.map(item => item.sector1))) ? 1 : 0,
    Number.isFinite(average(laps.map(item => item.sector2))) ? 1 : 0,
    Number.isFinite(average(laps.map(item => item.sector3))) ? 1 : 0,
    speedProfile.length ? 1 : 0
  ].reduce((sum, item) => sum + item, 0);

  return {
    engine: "openf1",
    lapCount: laps.length,
    referenceLap: lapDurations.length ? Math.min(...lapDurations) : null,
    averagePace: average(lapDurations),
    medianPace: median(lapDurations),
    topSpeed: Number.isFinite(topSpeed) ? topSpeed : null,
    speedTrap: Number.isFinite(speedTrap) ? speedTrap : null,
    avgPosition: average(positionRows.map(item => parseMaybeNumber(item.position))),
    sector1: average(laps.map(item => item.sector1)),
    sector2: average(laps.map(item => item.sector2)),
    sector3: average(laps.map(item => item.sector3)),
    degradation: simpleDegradation(laps),
    speedProfile,
    throttleProfile,
    brakeProfile,
    telemetrySamples: carDataRows.length,
    completeness: clamp((completenessRaw / 7) * 100, 0, 100),
    stints: stintsRows
      .map(row => ({
        number: parseMaybeNumber(row.stint_number),
        compound: String(row.compound || "N/D"),
        lapStart: parseMaybeNumber(row.lap_start),
        lapEnd: parseMaybeNumber(row.lap_end)
      }))
      .filter(item => Number.isFinite(item.number))
      .map(item => ({ ...item, laps: Number.isFinite(item.lapStart) && Number.isFinite(item.lapEnd) ? item.lapEnd - item.lapStart + 1 : null }))
  };
}

async function tryFastF1Comparison({ meetingLabel, sessionType, type, a, b }) {
  const key = `${meetingLabel}:${sessionType}:${type}:${a}:${b}`;
  const cached = getCached(cache.fastf1, key, TTL.fastf1);
  if (cached) return cached;

  const code = `
import json
import sys

try:
    import fastf1
except Exception:
    print(json.dumps({"ok": False, "reason": "FASTF1_UNAVAILABLE"}))
    sys.exit(0)

try:
    fastf1.Cache.enable_cache("/tmp/fastf1")
    year = 2026
    name = "${meetingLabel}".strip()
    session_type = "${sessionType}".strip().upper()
    mapped = {"FP1":"FP1","FP2":"FP2","FP3":"FP3","QUALY":"Q","RACE":"R"}.get(session_type, "R")
    if not name:
        print(json.dumps({"ok": False, "reason": "FASTF1_NO_MEETING"}))
        sys.exit(0)
    session = fastf1.get_session(year, name, mapped)
    session.load(laps=True, telemetry=False, weather=False, messages=False)
    print(json.dumps({"ok": True, "reason": "FASTF1_ACTIVE", "source": "fastf1"}))
except Exception as exc:
    print(json.dumps({"ok": False, "reason": "FASTF1_LOAD_FAIL", "detail": str(exc)[:120]}))
`;

  const result = await new Promise(resolve => {
    const proc = spawn("python3", ["-c", code], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", chunk => { out += String(chunk); });
    proc.on("close", () => {
      try {
        resolve(JSON.parse(out.trim() || "{}"));
      } catch {
        resolve({ ok: false, reason: "FASTF1_PARSE_ERROR" });
      }
    });
    setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ ok: false, reason: "FASTF1_TIMEOUT" });
    }, 5000);
  });

  return setCached(cache.fastf1, key, result);
}

function mergeTeamMetrics(metrics = []) {
  const valid = metrics.filter(Boolean);
  if (!valid.length) return null;
  const ref = valid.map(item => item.referenceLap).filter(Number.isFinite);
  const speed = valid.map(item => item.topSpeed).filter(Number.isFinite);
  const trap = valid.map(item => item.speedTrap).filter(Number.isFinite);

  const mergeLine = key => {
    const lines = valid.map(item => item[key]).filter(arr => Array.isArray(arr) && arr.length);
    if (!lines.length) return [];
    const points = Math.max(...lines.map(arr => arr.length));
    return Array.from({ length: points }, (_, index) =>
      average(lines.map(arr => arr[index]).filter(Number.isFinite))
    ).map(v => Number.isFinite(v) ? Number(v.toFixed(2)) : null);
  };

  return {
    engine: valid.find(item => item.engine)?.engine || "openf1",
    lapCount: valid.reduce((sum, item) => sum + Number(item.lapCount || 0), 0),
    referenceLap: ref.length ? Math.min(...ref) : null,
    averagePace: average(valid.map(item => item.averagePace)),
    medianPace: average(valid.map(item => item.medianPace)),
    topSpeed: speed.length ? Math.max(...speed) : null,
    speedTrap: trap.length ? Math.max(...trap) : null,
    avgPosition: average(valid.map(item => item.avgPosition)),
    sector1: average(valid.map(item => item.sector1)),
    sector2: average(valid.map(item => item.sector2)),
    sector3: average(valid.map(item => item.sector3)),
    degradation: average(valid.map(item => item.degradation)),
    speedProfile: mergeLine("speedProfile"),
    throttleProfile: mergeLine("throttleProfile"),
    brakeProfile: mergeLine("brakeProfile"),
    telemetrySamples: valid.reduce((sum, item) => sum + Number(item.telemetrySamples || 0), 0),
    completeness: average(valid.map(item => item.completeness)),
    stints: valid.flatMap(item => item.stints || []).slice(0, 12)
  };
}

function buildGraphBlock(a, b) {
  const maxPoints = Math.max(a.speedProfile?.length || 0, b.speedProfile?.length || 0, 0);
  const points = Array.from({ length: maxPoints }, (_, idx) => ({
    x: idx + 1,
    a: Number.isFinite(a.speedProfile?.[idx]) ? a.speedProfile[idx] : null,
    b: Number.isFinite(b.speedProfile?.[idx]) ? b.speedProfile[idx] : null,
    delta: getDelta(a.speedProfile?.[idx], b.speedProfile?.[idx]),
    throttleA: Number.isFinite(a.throttleProfile?.[idx]) ? a.throttleProfile[idx] : null,
    throttleB: Number.isFinite(b.throttleProfile?.[idx]) ? b.throttleProfile[idx] : null,
    brakeA: Number.isFinite(a.brakeProfile?.[idx]) ? a.brakeProfile[idx] : null,
    brakeB: Number.isFinite(b.brakeProfile?.[idx]) ? b.brakeProfile[idx] : null
  }));

  return {
    mode: "distance-normalized",
    points,
    valid: points.some(row => Number.isFinite(row.a) || Number.isFinite(row.b))
  };
}

function buildSummaryBlock(a, b) {
  const refDelta = getDelta(a.referenceLap, b.referenceLap);
  return {
    referenceLap: { a: a.referenceLap, b: b.referenceLap, delta: refDelta, winner: pickWinner(true, a.referenceLap, b.referenceLap) },
    averagePace: { a: a.averagePace, b: b.averagePace, delta: getDelta(a.averagePace, b.averagePace), winner: pickWinner(true, a.averagePace, b.averagePace) },
    topSpeed: { a: a.topSpeed, b: b.topSpeed, delta: getDelta(a.topSpeed, b.topSpeed), winner: pickWinner(false, a.topSpeed, b.topSpeed) },
    speedTrap: { a: a.speedTrap, b: b.speedTrap, delta: getDelta(a.speedTrap, b.speedTrap), winner: pickWinner(false, a.speedTrap, b.speedTrap) },
    leadMetric: {
      label: "Delta vuelta referencia",
      value: refDelta,
      advantage: Number.isFinite(refDelta) ? (refDelta < 0 ? "a" : refDelta > 0 ? "b" : "tie") : "none"
    }
  };
}

function buildSectorsBlock(a, b) {
  const sector = (av, bv) => ({ a: av, b: bv, delta: getDelta(av, bv), winner: pickWinner(true, av, bv) });
  return {
    sector1: sector(a.sector1, b.sector1),
    sector2: sector(a.sector2, b.sector2),
    sector3: sector(a.sector3, b.sector3)
  };
}

function buildStintsBlock(a, b) {
  return {
    degradation: { a: a.degradation, b: b.degradation, delta: getDelta(a.degradation, b.degradation), winner: pickWinner(true, a.degradation, b.degradation) },
    averagePace: { a: a.averagePace, b: b.averagePace, delta: getDelta(a.averagePace, b.averagePace), winner: pickWinner(true, a.averagePace, b.averagePace) },
    consistency: { a: a.medianPace, b: b.medianPace, delta: getDelta(a.medianPace, b.medianPace), winner: pickWinner(true, a.medianPace, b.medianPace) },
    stintsA: a.stints || [],
    stintsB: b.stints || []
  };
}

async function loadSessionContext(sessionKey) {
  const [weather, raceControl, pit, overtakes, teamRadio] = await Promise.all([
    fetchOpenF1("weather", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("race_control", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("pit", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("overtakes", { session_key: sessionKey }).catch(() => []),
    fetchOpenF1("team_radio", { session_key: sessionKey }).catch(() => [])
  ]);

  return {
    avgTrackTemp: average(weather.map(item => parseMaybeNumber(item.track_temperature))),
    avgAirTemp: average(weather.map(item => parseMaybeNumber(item.air_temperature))),
    weatherState: weather[weather.length - 1]?.rainfall ? "Lluvia" : "Seco",
    raceControlMessages: raceControl.length,
    pitStops: pit.length,
    overtakes: overtakes.length,
    teamRadios: teamRadio.length
  };
}

function resolveDriverEntity(drivers, value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return drivers.find(item => item.entity_id === raw || item.id === raw.replace(/^driver:/, "") || normalizeKey(item.name) === normalizeKey(raw)) || null;
}

function resolveTeamEntity(teams, value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return teams.find(item => item.entity_id === raw || normalizeKey(item.name) === normalizeKey(raw.replace(/^team:/, ""))) || null;
}

async function buildBaseComparison({ sessionKey, type, a, b }) {
  const entities = await getEntities(sessionKey);

  if (type === "team") {
    const teamA = resolveTeamEntity(entities.teams, a);
    const teamB = resolveTeamEntity(entities.teams, b);
    if (!teamA || !teamB) {
      const error = new Error("No hay equipos válidos para esta sesión");
      error.code = "NO_PARTICIPANTS";
      throw error;
    }

    const driversA = entities.drivers.filter(driver => normalizeKey(driver.team) === normalizeKey(teamA.name));
    const driversB = entities.drivers.filter(driver => normalizeKey(driver.team) === normalizeKey(teamB.name));
    if (!driversA.length || !driversB.length) {
      const error = new Error("No hay datos de comparación para esta combinación");
      error.code = "NO_COMPARISON";
      throw error;
    }

    const [metricsA, metricsB] = await Promise.all([
      Promise.all(driversA.map(driver => getDriverMetricsOpenF1(sessionKey, driver.id))),
      Promise.all(driversB.map(driver => getDriverMetricsOpenF1(sessionKey, driver.id)))
    ]);

    return {
      a: { label: teamA.name, team: teamA.name, image: "", drivers: driversA.map(item => item.name), metrics: mergeTeamMetrics(metricsA) },
      b: { label: teamB.name, team: teamB.name, image: "", drivers: driversB.map(item => item.name), metrics: mergeTeamMetrics(metricsB) }
    };
  }

  const driverA = resolveDriverEntity(entities.drivers, a);
  const driverB = resolveDriverEntity(entities.drivers, b);
  if (!driverA || !driverB) {
    const error = new Error("No hay participantes para esta sesión");
    error.code = "NO_PARTICIPANTS";
    throw error;
  }

  const [metricsA, metricsB] = await Promise.all([
    getDriverMetricsOpenF1(sessionKey, driverA.id),
    getDriverMetricsOpenF1(sessionKey, driverB.id)
  ]);

  return {
    a: { label: driverA.name, team: driverA.team, image: driverA.headshot, metrics: metricsA },
    b: { label: driverB.name, team: driverB.team, image: driverB.headshot, metrics: metricsB }
  };
}

async function buildComparison({ meetingKey, sessionKey, type, a, b, year = DEFAULT_YEAR }) {
  const cacheKey = `${year}:${meetingKey}:${sessionKey}:${type}:${a}:${b}`;
  const cached = getCached(cache.compare, cacheKey, TTL.compare);
  if (cached) return cached;

  const meetings = await getMeetings(year);
  const meeting = meetings.find(item => String(item.meeting_key) === String(meetingKey));
  const sessions = await getSessions(meetingKey, year);
  const selectedSession = sessions.find(item => String(item.session_key) === String(sessionKey)) || sessions[sessions.length - 1] || null;
  const safeSessionKey = selectedSession?.session_key || sessionKey;

  const base = await buildBaseComparison({ sessionKey: safeSessionKey, type, a, b });
  if (!base.a?.metrics?.lapCount && !base.b?.metrics?.lapCount) {
    const error = new Error("No hay datos de comparación para esta combinación");
    error.code = "NO_COMPARISON";
    throw error;
  }

  const context = await loadSessionContext(safeSessionKey);
  const fastf1Probe = await tryFastF1Comparison({
    meetingLabel: meeting?.gp_label || "",
      sessionType: selectedSession?.type_key || "",
    type,
    a,
    b
  }).catch(() => ({ ok: false, reason: "FASTF1_ERROR" }));

  const evolution = [];
  for (const session of sessions) {
    try {
      const row = await buildBaseComparison({ sessionKey: session.session_key, type, a, b });
      evolution.push({
        label: session.type_label,
        type_key: session.type_key,
        aPace: row.a?.metrics?.averagePace ?? null,
        bPace: row.b?.metrics?.averagePace ?? null,
        paceDelta: getDelta(row.a?.metrics?.averagePace, row.b?.metrics?.averagePace),
        aRef: row.a?.metrics?.referenceLap ?? null,
        bRef: row.b?.metrics?.referenceLap ?? null,
        refDelta: getDelta(row.a?.metrics?.referenceLap, row.b?.metrics?.referenceLap)
      });
    } catch {
      continue;
    }
  }

  const payload = {
    year,
    season_focus: DEFAULT_YEAR,
    meeting_key: String(meetingKey),
    session_key: String(safeSessionKey),
    type,
    labels: {
      gp: meeting?.gp_label || "2026",
      session: selectedSession?.type_label || "Sesión",
      mode: type === "team" ? "Equipo / Equipo" : "Piloto / Piloto"
    },
    source: {
      analytics: fastf1Probe?.ok ? "fastf1" : "openf1-derived",
      enrichment: "openf1",
      fastf1_status: fastf1Probe?.reason || "FASTF1_ACTIVE"
    },
    comparison: { a: base.a, b: base.b },
    blocks: {
      hero: buildSummaryBlock(base.a.metrics, base.b.metrics),
      summary: buildSummaryBlock(base.a.metrics, base.b.metrics),
      sectors: buildSectorsBlock(base.a.metrics, base.b.metrics),
      stints: buildStintsBlock(base.a.metrics, base.b.metrics),
      graph: buildGraphBlock(base.a.metrics, base.b.metrics),
      comparison: {
        a: base.a,
        b: base.b,
        conclusion: buildSummaryBlock(base.a.metrics, base.b.metrics).leadMetric
      },
      sessionContext: context,
      evolution
    }
  };

  return setCached(cache.compare, cacheKey, payload);
}

async function resolveTelemetryContext({ year = DEFAULT_YEAR, meetingKey = "", sessionType = "", type = "driver", a = "", b = "" }) {
  const cacheKey = `${year}:${meetingKey}:${sessionType}:${type}:${a}:${b}`;
  const cached = getCached(cache.context, cacheKey, TTL.context);
  if (cached) return cached;

  const meetings = await getMeetings(year);
  const selectedMeeting = meetings.find(item => String(item.meeting_key) === String(meetingKey)) || meetings[0] || null;
  const sessions = selectedMeeting ? await getSessions(selectedMeeting.meeting_key, year) : [];

  let selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[sessions.length - 1] || null;
  let entities = selectedSession ? await getEntities(selectedSession.session_key) : { drivers: [], teams: [] };

  const hasEnoughEntities = (entityRows, compareType) => compareType === "team" ? entityRows.teams.length >= 2 : entityRows.drivers.length >= 2;
  if (selectedSession && !hasEnoughEntities(entities, type)) {
    const fallback = [...sessions].reverse();
    for (const probe of fallback) {
      const probeEntities = await getEntities(probe.session_key);
      if (hasEnoughEntities(probeEntities, type)) {
        selectedSession = probe;
        entities = probeEntities;
        break;
      }
    }
  }

  const baseOptions = type === "team"
    ? entities.teams.map(item => ({ value: item.entity_id, label: item.name }))
    : entities.drivers.map(item => ({ value: item.entity_id, label: `${item.name} · ${item.team}` }));

  const poolA = baseOptions;
  const selectedA = poolA.find(item => item.value === a)?.value || poolA[0]?.value || "";
  const poolB = baseOptions.filter(item => item.value !== selectedA);
  const selectedB = poolB.find(item => item.value === b)?.value || poolB[0]?.value || "";

  const payload = {
    year,
    season_focus: DEFAULT_YEAR,
    selections: {
      meeting_key: selectedMeeting?.meeting_key || "",
      session_type: selectedSession?.type_key || "",
      session_key: selectedSession?.session_key || "",
      type,
      a: selectedA,
      b: selectedB
    },
    meetings,
    sessions,
    entities,
    options: { a: poolA, b: poolB }
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
