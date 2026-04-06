import { spawn } from "node:child_process";

const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const DEFAULT_YEAR = 2026;
const SUPPORTED_SESSION_TYPES = ["fp1", "fp2", "fp3", "qualy", "race", "sprint_qualy", "sprint_race"];

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 20,
  drivers: 1000 * 60 * 15,
  context: 1000 * 60 * 8,
  telemetry: 1000 * 60 * 6,
  fastf1: 1000 * 60 * 20
});

const SESSION_TYPES = Object.freeze([
  { key: "fp1", label: "FP1", aliases: ["Practice 1", "Free Practice 1", "FP1"] },
  { key: "fp2", label: "FP2", aliases: ["Practice 2", "Free Practice 2", "FP2"] },
  { key: "fp3", label: "FP3", aliases: ["Practice 3", "Free Practice 3", "FP3"] },
  { key: "qualy", label: "Qualy", aliases: ["Qualifying", "Q", "Qualy"] },
  { key: "race", label: "Race", aliases: ["Race", "Grand Prix", "R"] },
  { key: "sprint_qualy", label: "Sprint Qualy", aliases: ["Sprint Qualifying", "Sprint Shootout", "SQ"] },
  { key: "sprint_race", label: "Sprint Race", aliases: ["Sprint", "Sprint Race", "SR"] }
]);

const cache = {
  meetings: new Map(),
  sessionsByMeeting: new Map(),
  driversBySession: new Map(),
  context: new Map(),
  telemetry: new Map(),
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
    headers: { "User-Agent": "RaceControlEngineer/6.0" },
    cache: "no-store"
  });
  if (!response.ok) {
    const error = new Error(`OpenF1 ${endpoint} (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function parseMaybeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function average(values = []) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((acc, item) => acc + item, 0) / valid.length;
}

function median(values = []) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanLabel(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^FORMULA\s*1\b[^A-Z0-9]*?/i, "")
    .replace(/^FIA\s*FORMULA\s*ONE\b[^A-Z0-9]*?/i, "")
    .replace(/\b(ROLEX|QATAR AIRWAYS|AWS|ARAMCO|MSC CRUISES|HEINEKEN|LENOVO|P ZERO)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getYearFromRow(row = {}) {
  if (Number.isFinite(Number(row.year))) return Number(row.year);
  const dateLike = row.date_start || row.date || row.session_start || row.session_start_date || "";
  if (!dateLike) return null;
  const year = new Date(dateLike).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

function mapSessionType(name = "") {
  const lower = normalizeKey(name);
  const exact = SESSION_TYPES.find(item => item.aliases.some(alias => normalizeKey(alias) === lower));
  if (exact) return exact.key;
  if (lower.includes("practice 1") || lower === "fp1") return "fp1";
  if (lower.includes("practice 2") || lower === "fp2") return "fp2";
  if (lower.includes("practice 3") || lower === "fp3") return "fp3";
  if (lower.includes("sprint quali") || lower.includes("sprint shootout") || lower === "sq") return "sprint_qualy";
  if (lower === "sprint" || lower.includes("sprint race") || lower === "sr") return "sprint_race";
  if (lower.includes("qual")) return "qualy";
  if (lower.includes("race") || lower.includes("grand prix")) return "race";
  return "";
}

function sessionLabel(type) {
  return SESSION_TYPES.find(item => item.key === type)?.label || type;
}

function gpLabelFromMeeting(meeting = {}) {
  const candidates = [meeting.country_name, meeting.location, meeting.meeting_name, meeting.circuit_short_name]
    .map(cleanLabel)
    .filter(Boolean);
  const base = candidates[0] || "Grand Prix";
  return base.endsWith("2026") ? base : `${base} 2026`;
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
  return {
    id,
    name,
    team: String(row.team_name || row.team || "").trim(),
    headshot: String(row.headshot_url || "").trim()
  };
}

function buildLineFromSamples(rows = [], valueReader, points = 32) {
  const values = rows.map(valueReader).filter(Number.isFinite);
  if (!values.length) return [];
  const bucket = Math.max(1, Math.floor(values.length / points));
  const line = [];
  for (let i = 0; i < values.length; i += bucket) {
    line.push(average(values.slice(i, i + bucket)));
  }
  return line.slice(0, points).map(item => Number(item.toFixed(2)));
}

function simpleDegradation(laps = []) {
  const lapTimes = laps
    .map(item => ({ lap_number: parseMaybeNumber(item.lap_number), lap_duration: parseMaybeNumber(item.lap_duration) }))
    .filter(item => Number.isFinite(item.lap_number) && Number.isFinite(item.lap_duration))
    .sort((a, b) => a.lap_number - b.lap_number);
  if (lapTimes.length < 6) return null;
  const start = average(lapTimes.slice(0, 3).map(item => item.lap_duration));
  const end = average(lapTimes.slice(-3).map(item => item.lap_duration));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Number((end - start).toFixed(3));
}

async function getMeetings(year = DEFAULT_YEAR) {
  const key = `meetings:${year}`;
  const cached = getCached(cache.meetings, key, TTL.meetings);
  if (cached) return cached;

  const meetings = await fetchOpenF1("meetings", { year }).catch(() => []);
  const payload = meetings
    .filter(item => getYearFromRow(item) === year)
    .map(item => ({
      meeting_key: String(item.meeting_key || "").trim(),
      gp_label: gpLabelFromMeeting(item),
      meeting_name: cleanLabel(item.meeting_name || ""),
      country_name: cleanLabel(item.country_name || ""),
      location: cleanLabel(item.location || ""),
      year
    }))
    .filter(item => item.meeting_key)
    .sort((a, b) => a.gp_label.localeCompare(b.gp_label));

  return setCached(cache.meetings, key, payload);
}

async function getSessions(meetingKey, year = DEFAULT_YEAR) {
  const key = `sessions:${year}:${meetingKey}`;
  const cached = getCached(cache.sessionsByMeeting, key, TTL.sessions);
  if (cached) return cached;

  const rows = await fetchOpenF1("sessions", { meeting_key: meetingKey }).catch(() => []);
  const payload = rows
    .map(row => {
      const type_key = mapSessionType(row.session_name);
      return {
        session_key: String(row.session_key || "").trim(),
        meeting_key: String(row.meeting_key || "").trim(),
        session_name: String(row.session_name || "").trim(),
        type_key,
        type_label: sessionLabel(type_key),
        date_start: row.date_start || row.date || "",
        year: getYearFromRow(row)
      };
    })
    .filter(item => item.session_key && item.meeting_key === String(meetingKey) && item.year === year && SUPPORTED_SESSION_TYPES.includes(item.type_key))
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

  return setCached(cache.sessionsByMeeting, key, payload);
}

async function getDrivers(sessionKey) {
  const key = `drivers:${sessionKey}`;
  const cached = getCached(cache.driversBySession, key, TTL.drivers);
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
      current.name = current.name || driver.name;
      current.team = current.team || driver.team;
      current.headshot = current.headshot || driver.headshot;
      byDriver.set(driver.id, current);
    });
  });

  const drivers = [...byDriver.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => ({ id: item.id, name: item.name, team: item.team || "Equipo", headshot: item.headshot }));

  return setCached(cache.driversBySession, key, drivers);
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
    weatherState: weather.some(item => Number(item.rainfall) > 0) ? "Lluvia" : "Seco",
    raceControlMessages: raceControl.length,
    pitStops: pit.length,
    overtakes: overtakes.length,
    teamRadios: teamRadio.length
  };
}

async function getDriverMetricsOpenF1(sessionKey, driverNumber) {
  const [lapsRows, carDataRows, stintsRows, positionRows, resultRows] = await Promise.all([
    fetchOpenF1("laps", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("car_data", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("stints", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("position", { session_key: sessionKey, driver_number: driverNumber }).catch(() => []),
    fetchOpenF1("session_result", { session_key: sessionKey, driver_number: driverNumber }).catch(() => [])
  ]);

  const lapTimes = lapsRows.map(item => parseMaybeNumber(item.lap_duration)).filter(Number.isFinite);
  const sectors = {
    sector1: average(lapsRows.map(item => parseMaybeNumber(item.duration_sector_1))),
    sector2: average(lapsRows.map(item => parseMaybeNumber(item.duration_sector_2))),
    sector3: average(lapsRows.map(item => parseMaybeNumber(item.duration_sector_3)))
  };

  const topSpeedCandidates = [
    ...carDataRows.map(item => parseMaybeNumber(item.speed)),
    ...resultRows.map(item => parseMaybeNumber(item.top_speed))
  ].filter(Number.isFinite);

  const speedTrapCandidates = [
    ...lapsRows.map(item => parseMaybeNumber(item.st_speed)),
    ...resultRows.map(item => parseMaybeNumber(item.speed_trap))
  ].filter(Number.isFinite);

  const speedProfile = buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.speed), 36);
  const throttleProfile = buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.throttle), 36);
  const brakeProfile = buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.brake), 36);
  const gearProfile = buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.n_gear), 36);
  const rpmProfile = buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.rpm), 36);

  const stintRows = stintsRows
    .map(item => ({
      number: parseMaybeNumber(item.stint_number),
      compound: String(item.compound || "N/D"),
      lap_start: parseMaybeNumber(item.lap_start),
      lap_end: parseMaybeNumber(item.lap_end)
    }))
    .filter(item => Number.isFinite(item.number));

  const evolution = stintRows.map(item => {
    const lapsInStint = lapsRows
      .filter(lap => {
        const lapNumber = parseMaybeNumber(lap.lap_number);
        return Number.isFinite(lapNumber)
          && Number.isFinite(item.lap_start)
          && Number.isFinite(item.lap_end)
          && lapNumber >= item.lap_start
          && lapNumber <= item.lap_end;
      })
      .map(lap => parseMaybeNumber(lap.lap_duration))
      .filter(Number.isFinite);
    return {
      stint: item.number,
      compound: item.compound,
      laps: Number.isFinite(item.lap_start) && Number.isFinite(item.lap_end) ? item.lap_end - item.lap_start + 1 : null,
      averagePace: average(lapsInStint),
      refDelta: Number.isFinite(Math.min(...lapTimes)) && Number.isFinite(average(lapsInStint))
        ? average(lapsInStint) - Math.min(...lapTimes)
        : null
    };
  });

  return {
    source: "openf1",
    lapCount: lapTimes.length,
    referenceLap: lapTimes.length ? Math.min(...lapTimes) : null,
    averagePace: average(lapTimes),
    topSpeed: topSpeedCandidates.length ? Math.max(...topSpeedCandidates) : null,
    speedTrap: speedTrapCandidates.length ? Math.max(...speedTrapCandidates) : null,
    sectors,
    positionAverage: average(positionRows.map(item => parseMaybeNumber(item.position))),
    degradation: simpleDegradation(lapsRows),
    stints: stintRows.map(item => ({
      number: item.number,
      compound: item.compound,
      lapStart: item.lap_start,
      lapEnd: item.lap_end,
      laps: Number.isFinite(item.lap_start) && Number.isFinite(item.lap_end) ? item.lap_end - item.lap_start + 1 : null
    })),
    evolution,
    traces: {
      speed: speedProfile,
      throttle: throttleProfile,
      brake: brakeProfile,
      gear: gearProfile,
      rpm: rpmProfile
    },
    completeness: {
      speed: speedProfile.length > 0,
      throttle: throttleProfile.length > 0,
      brake: brakeProfile.length > 0,
      gear: gearProfile.length > 0,
      rpm: rpmProfile.length > 0
    }
  };
}

async function getFastF1DriverMetrics({ meetingName, sessionType, driverNumber }) {
  const key = `${meetingName}:${sessionType}:${driverNumber}`;
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

meeting_name = ${JSON.stringify(meetingName)}
session_type = ${JSON.stringify(sessionType)}
driver_number = ${JSON.stringify(String(driverNumber))}

session_map = {
    "fp1": "FP1",
    "fp2": "FP2",
    "fp3": "FP3",
    "qualy": "Q",
    "race": "R",
    "sprint_qualy": "SQ",
    "sprint_race": "S"
}

try:
    fastf1.Cache.enable_cache("/tmp/fastf1")
    session = fastf1.get_session(2026, meeting_name, session_map.get(session_type, "R"))
    session.load(laps=True, telemetry=True, weather=True, messages=False)
    laps = session.laps.pick_drivers([driver_number]).pick_quicklaps()
    if laps.empty:
        print(json.dumps({"ok": False, "reason": "NO_DRIVER_LAPS"}))
        sys.exit(0)

    lap_times = [float(item.total_seconds()) for item in laps["LapTime"].dropna().tolist()]
    if not lap_times:
        print(json.dumps({"ok": False, "reason": "NO_LAP_TIMES"}))
        sys.exit(0)

    fastest = laps.pick_fastest()
    telemetry = fastest.get_car_data().add_distance() if fastest is not None else None
    speed_line = []
    throttle_line = []
    brake_line = []
    gear_line = []
    rpm_line = []

    if telemetry is not None and not telemetry.empty:
        speed_line = [float(v) for v in telemetry["Speed"].dropna().tolist()[:400]]
        throttle_line = [float(v) for v in telemetry["Throttle"].dropna().tolist()[:400]]
        brake_line = [float(v) for v in telemetry["Brake"].dropna().astype(float).tolist()[:400]]
        gear_line = [float(v) for v in telemetry["nGear"].dropna().tolist()[:400]]
        rpm_line = [float(v) for v in telemetry["RPM"].dropna().tolist()[:400]]

    weather = session.weather_data if hasattr(session, "weather_data") else None
    weather_state = "Seco"
    avg_air = None
    avg_track = None
    if weather is not None and not weather.empty:
        if "AirTemp" in weather.columns:
            vals = weather["AirTemp"].dropna().tolist()
            avg_air = sum(vals)/len(vals) if vals else None
        if "TrackTemp" in weather.columns:
            vals = weather["TrackTemp"].dropna().tolist()
            avg_track = sum(vals)/len(vals) if vals else None
        if "Rainfall" in weather.columns and float(weather["Rainfall"].fillna(0).sum()) > 0:
            weather_state = "Lluvia"

    print(json.dumps({
        "ok": True,
        "source": "fastf1",
        "referenceLap": min(lap_times),
        "averagePace": sum(lap_times)/len(lap_times),
        "topSpeed": max(speed_line) if speed_line else None,
        "speedTrap": max(speed_line) if speed_line else None,
        "traces": {
            "speed": speed_line,
            "throttle": throttle_line,
            "brake": brake_line,
            "gear": gear_line,
            "rpm": rpm_line
        },
        "weather": {
            "avgAirTemp": avg_air,
            "avgTrackTemp": avg_track,
            "weatherState": weather_state
        }
    }))
except Exception as exc:
    print(json.dumps({"ok": False, "reason": "FASTF1_LOAD_FAIL", "detail": str(exc)[:140]}))
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
    }, 9000);
  });

  return setCached(cache.fastf1, key, result);
}

function mergeTelemetry(openf1, fastf1) {
  if (!fastf1?.ok) return { ...openf1, sources: ["openf1"] };

  const merged = {
    ...openf1,
    source: openf1.source,
    sources: ["openf1", "fastf1"],
    referenceLap: Number.isFinite(openf1.referenceLap) ? openf1.referenceLap : fastf1.referenceLap,
    averagePace: Number.isFinite(openf1.averagePace) ? openf1.averagePace : fastf1.averagePace,
    topSpeed: Number.isFinite(openf1.topSpeed) ? openf1.topSpeed : fastf1.topSpeed,
    speedTrap: Number.isFinite(openf1.speedTrap) ? openf1.speedTrap : fastf1.speedTrap,
    traces: {
      speed: openf1.traces.speed?.length ? openf1.traces.speed : buildLineFromSamples(fastf1.traces?.speed || [], item => parseMaybeNumber(item), 36),
      throttle: openf1.traces.throttle?.length ? openf1.traces.throttle : buildLineFromSamples(fastf1.traces?.throttle || [], item => parseMaybeNumber(item), 36),
      brake: openf1.traces.brake?.length ? openf1.traces.brake : buildLineFromSamples(fastf1.traces?.brake || [], item => parseMaybeNumber(item), 36),
      gear: openf1.traces.gear?.length ? openf1.traces.gear : buildLineFromSamples(fastf1.traces?.gear || [], item => parseMaybeNumber(item), 36),
      rpm: openf1.traces.rpm?.length ? openf1.traces.rpm : buildLineFromSamples(fastf1.traces?.rpm || [], item => parseMaybeNumber(item), 36)
    }
  };

  return merged;
}

async function resolveTelemetryContext({ year = DEFAULT_YEAR, meetingKey = "", sessionType = "", driver = "" }) {
  const cacheKey = `${year}:${meetingKey}:${sessionType}:${driver}`;
  const cached = getCached(cache.context, cacheKey, TTL.context);
  if (cached) return cached;

  const meetings = await getMeetings(year);
  const selectedMeeting = meetings.find(item => item.meeting_key === String(meetingKey)) || meetings[0] || null;
  const sessions = selectedMeeting ? await getSessions(selectedMeeting.meeting_key, year) : [];
  const selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[0] || null;
  const drivers = selectedSession ? await getDrivers(selectedSession.session_key) : [];
  const selectedDriver = drivers.find(item => item.id === String(driver)) || drivers[0] || null;

  return setCached(cache.context, cacheKey, {
    year,
    season_focus: DEFAULT_YEAR,
    selections: {
      meeting_key: selectedMeeting?.meeting_key || "",
      session_type: selectedSession?.type_key || "",
      session_key: selectedSession?.session_key || "",
      driver: selectedDriver?.id || ""
    },
    meetings,
    sessions,
    drivers
  });
}

async function buildDriverTelemetry({ year = DEFAULT_YEAR, meetingKey, sessionKey, driverNumber }) {
  const cacheKey = `${year}:${meetingKey}:${sessionKey}:${driverNumber}`;
  const cached = getCached(cache.telemetry, cacheKey, TTL.telemetry);
  if (cached) return cached;

  const meetings = await getMeetings(year);
  const meeting = meetings.find(item => item.meeting_key === String(meetingKey));
  if (!meeting) {
    const error = new Error("GP no válido para 2026");
    error.code = "MEETING_NOT_FOUND";
    throw error;
  }

  const sessions = await getSessions(meetingKey, year);
  const session = sessions.find(item => item.session_key === String(sessionKey));
  if (!session) {
    const error = new Error("Sesión no disponible para este GP");
    error.code = "SESSION_NOT_FOUND";
    throw error;
  }

  const drivers = await getDrivers(session.session_key);
  const driver = drivers.find(item => item.id === String(driverNumber));
  if (!driver) {
    const error = new Error("Piloto no disponible en esta sesión");
    error.code = "DRIVER_NOT_FOUND";
    throw error;
  }

  const openf1 = await getDriverMetricsOpenF1(session.session_key, driver.id);
  const fastf1 = await getFastF1DriverMetrics({
    meetingName: meeting.location || meeting.country_name || meeting.meeting_name,
    sessionType: session.type_key,
    driverNumber: driver.id
  }).catch(() => ({ ok: false, reason: "FASTF1_ERROR" }));

  const merged = mergeTelemetry(openf1, fastf1);
  const weather = await loadSessionContext(session.session_key);

  if (!Number.isFinite(merged.referenceLap) && !merged.traces.speed.length) {
    const error = new Error("No hay telemetría histórica disponible para este piloto en esta sesión.");
    error.code = "NO_TELEMETRY";
    throw error;
  }

  const payload = {
    year,
    season_focus: DEFAULT_YEAR,
    meeting_key: meetingKey,
    session_key: session.session_key,
    driver_number: driver.id,
    labels: {
      gp: meeting.gp_label,
      session: session.type_label,
      driver: driver.name
    },
    driver,
    source: {
      primary: "openf1",
      enrichment: fastf1?.ok ? "fastf1" : "none",
      fastf1_status: fastf1?.reason || "FASTF1_ACTIVE",
      active_sources: merged.sources
    },
    summary: {
      referenceLap: merged.referenceLap,
      averagePace: merged.averagePace,
      topSpeed: merged.topSpeed,
      speedTrap: merged.speedTrap,
      sector1: merged.sectors?.sector1 ?? null,
      sector2: merged.sectors?.sector2 ?? null,
      sector3: merged.sectors?.sector3 ?? null,
      degradation: merged.degradation,
      stintAveragePace: average(merged.evolution?.map(item => item.averagePace) || []),
      deltaToReference: Number.isFinite(merged.averagePace) && Number.isFinite(merged.referenceLap)
        ? merged.averagePace - merged.referenceLap
        : null,
      positionAverage: merged.positionAverage
    },
    stints: {
      basic: merged.stints || [],
      evolution: merged.evolution || []
    },
    traces: merged.traces,
    weather: {
      avgTrackTemp: Number.isFinite(weather.avgTrackTemp) ? weather.avgTrackTemp : fastf1?.weather?.avgTrackTemp ?? null,
      avgAirTemp: Number.isFinite(weather.avgAirTemp) ? weather.avgAirTemp : fastf1?.weather?.avgAirTemp ?? null,
      weatherState: weather.weatherState || fastf1?.weather?.weatherState || "N/D",
      raceControlMessages: weather.raceControlMessages,
      pitStops: weather.pitStops,
      overtakes: weather.overtakes,
      teamRadios: weather.teamRadios
    }
  };

  return setCached(cache.telemetry, cacheKey, payload);
}

function apiError(res, status, message, code = "ENGINEER_ERROR") {
  return res.status(status).json({ error: { code, message } });
}

function parseYear(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_YEAR;
}

async function buildComparison() {
  const error = new Error("Comparativas A/B retiradas de Telemetría v1");
  error.code = "COMPARE_RETIRED";
  throw error;
}

async function getEntities(sessionKey) {
  const drivers = await getDrivers(sessionKey);
  return { drivers, teams: [] };
}

export {
  DEFAULT_YEAR,
  SESSION_TYPES,
  apiError,
  buildComparison,
  buildDriverTelemetry,
  getDrivers,
  getEntities,
  getMeetings,
  getSessions,
  parseYear,
  resolveTelemetryContext
};
