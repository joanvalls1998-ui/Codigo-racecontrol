import { spawn } from "node:child_process";

const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const RACEOPTIDATA_BASE_URL = "https://api.raceoptidata.com";
const DEFAULT_YEAR = 2026;
const SUPPORTED_SESSION_TYPES = ["fp1", "fp2", "fp3", "qualy", "race", "sprint_qualy", "sprint_race"];

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 20,
  drivers: 1000 * 60 * 15,
  context: 1000 * 60 * 8,
  telemetry: 1000 * 60 * 6,
  fastf1: 1000 * 60 * 20,
  raceoptidata: 1000 * 60 * 30
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
  fastf1: new Map(),
  raceoptidata: new Map()
};
const sourceHealth = {
  raceoptidata: { ok: true, last_error: null, last_success_ts: null },
  openf1: { ok: true, last_error: null, last_success_ts: null },
  fastf1: { ok: true, last_error: null, last_success_ts: null },
  openf1_aggregate: { ok: true, last_error: null, last_success_ts: null }
};

const TELEMETRY_LOG_LEVEL = String(process.env.ENGINEER_TELEMETRY_LOG_LEVEL || "info").toLowerCase();
const LOG_LEVEL_WEIGHT = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

function telemetryLog(level = "info", event = "event", details = {}) {
  const normalized = LOG_LEVEL_WEIGHT[level] !== undefined ? level : "info";
  const currentWeight = LOG_LEVEL_WEIGHT[TELEMETRY_LOG_LEVEL] ?? LOG_LEVEL_WEIGHT.info;
  if ((LOG_LEVEL_WEIGHT[normalized] ?? 2) > currentWeight) return;
  const line = JSON.stringify({ scope: "engineer.telemetry", event, ...details });
  if (normalized === "error") console.error(line);
  else if (normalized === "warn") console.warn(line);
  else console.log(line);
}

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

function getStaleCached(map, key) {
  const entry = map.get(key);
  return entry?.value ?? null;
}

async function fetchOpenF1(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  let response;
  try {
    response = await fetch(`${OPENF1_BASE_URL}/${endpoint}?${query.toString()}`, {
      headers: { "User-Agent": "RaceControlEngineer/6.0" },
      cache: "no-store"
    });
  } catch (error) {
    sourceHealth.openf1 = {
      ok: false,
      last_success_ts: sourceHealth.openf1.last_success_ts,
      last_error: {
        endpoint,
        reason: String(error?.code || error?.message || "OPENF1_FETCH_ERROR"),
        ts: Date.now()
      }
    };
    telemetryLog("warn", "openf1.fetch_failed", { endpoint, reason: String(error?.code || error?.message || "OPENF1_FETCH_ERROR") });
    throw error;
  }
  if (!response.ok) {
    sourceHealth.openf1 = {
      ok: false,
      last_success_ts: sourceHealth.openf1.last_success_ts,
      last_error: {
        endpoint,
        reason: `HTTP_${response.status}`,
        ts: Date.now()
      }
    };
    telemetryLog("warn", "openf1.http_error", { endpoint, status: response.status });
    const error = new Error(`OpenF1 ${endpoint} (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  sourceHealth.openf1 = {
    ok: true,
    last_success_ts: Date.now(),
    last_error: null
  };
  return Array.isArray(payload) ? payload : [];
}

async function fetchOpenF1WithRetry(endpoint, params = {}, options = {}) {
  const retries = Number.isFinite(options?.retries) ? Number(options.retries) : 2;
  const retryDelayMs = Number.isFinite(options?.retryDelayMs) ? Number(options.retryDelayMs) : 250;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchOpenF1(endpoint, params);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }
  throw lastError || new Error(`OpenF1 ${endpoint} failed`);
}

function getRaceOptiApiKey() {
  return String(process.env.RACEOPTIDATA_API_KEY || "").trim();
}

async function fetchRaceOpti(pathname, query = {}) {
  const apiKey = getRaceOptiApiKey();
  if (!apiKey) {
    const error = new Error("RACEOPTIDATA_KEY_MISSING");
    error.code = "RACEOPTIDATA_KEY_MISSING";
    throw error;
  }
  const url = new URL(`${RACEOPTIDATA_BASE_URL}${pathname}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  let response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "RaceControlEngineer/7.0",
        "x-api-key": apiKey,
        accept: "application/json"
      },
      cache: "no-store"
    });
  } catch (error) {
    sourceHealth.raceoptidata = {
      ok: false,
      last_success_ts: sourceHealth.raceoptidata.last_success_ts,
      last_error: { path: pathname, reason: String(error?.message || "RACEOPTIDATA_FETCH_FAILED"), ts: Date.now() }
    };
    throw error;
  }
  if (!response.ok) {
    sourceHealth.raceoptidata = {
      ok: false,
      last_success_ts: sourceHealth.raceoptidata.last_success_ts,
      last_error: { path: pathname, reason: `HTTP_${response.status}`, ts: Date.now() }
    };
    const error = new Error(`RaceOptiData ${pathname} (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  sourceHealth.raceoptidata = { ok: true, last_success_ts: Date.now(), last_error: null };
  return payload;
}

function parseMaybeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRaceOptiDurationToSeconds(value) {
  if (Number.isFinite(value)) return Number(value);
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".").replace(/\s+/g, "");
  const minuteMatch = normalized.match(/(?:(\d+)h)?(?:(\d+)mn)?(\d+(?:\.\d+)?)s/);
  if (minuteMatch) {
    const hours = Number(minuteMatch[1] || 0);
    const minutes = Number(minuteMatch[2] || 0);
    const seconds = Number(minuteMatch[3] || 0);
    if ([hours, minutes, seconds].every(Number.isFinite)) return hours * 3600 + minutes * 60 + seconds;
  }
  if (normalized.includes(":")) {
    const [left, right] = normalized.split(":");
    const minutes = Number(left);
    const seconds = Number(right);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
  }
  const plain = Number(normalized.replace(/[^\d.]/g, ""));
  return Number.isFinite(plain) ? plain : null;
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

function parseDateMs(value) {
  if (!value) return Number.NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
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
  if (lower.includes("sprint quali") || lower.includes("sprint shootout") || lower.includes("sprint qualifying") || lower === "sq") return "sprint_qualy";
  if (lower === "sprint" || lower.includes("sprint race") || (lower.includes("sprint") && lower.includes("session")) || lower === "sr") return "sprint_race";
  if (lower.includes("qual")) return "qualy";
  if (lower.includes("race") || lower.includes("grand prix")) return "race";
  return "";
}

function sessionLabel(type) {
  return SESSION_TYPES.find(item => item.key === type)?.label || type;
}

function toRaceOptiSessionCode(typeKey = "") {
  if (typeKey === "race") return "R";
  if (typeKey === "sprint_race") return "S";
  if (typeKey === "qualy") return "Q";
  return "";
}

function gpLabelFromMeeting(meeting = {}) {
  const candidates = [meeting.location, meeting.country_name, meeting.meeting_name, meeting.circuit_short_name]
    .map(cleanLabel)
    .filter(Boolean);
  const base = candidates[0] || "Grand Prix";
  return base.endsWith("2026") ? base : `${base} 2026`;
}

function isGenericDriverName(name = "") {
  const value = normalizeKey(name);
  if (!value) return true;
  return value.startsWith("driver #")
    || value.startsWith("driver ")
    || value.startsWith("piloto ")
    || value === "n/d";
}

function normalizeDriverDisplayName(name = "") {
  const clean = cleanLabel(name);
  if (!clean) return "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return clean;
  const surname = parts[parts.length - 1].toUpperCase();
  return `${parts.slice(0, -1).join(" ")} ${surname}`.trim();
}

function pickBetterDriverName(current = "", incoming = "") {
  const currentClean = cleanLabel(current);
  const incomingClean = cleanLabel(incoming);
  if (!incomingClean) return currentClean;
  if (!currentClean) return incomingClean;
  const currentGeneric = isGenericDriverName(currentClean);
  const incomingGeneric = isGenericDriverName(incomingClean);
  if (currentGeneric && !incomingGeneric) return incomingClean;
  if (!currentGeneric && incomingGeneric) return currentClean;
  return currentClean;
}

function mapDriverRow(row = {}) {
  const id = String(row.driver_number || row.racing_number || row.number || "").trim();
  const fromFirstLast = normalizeDriverDisplayName(`${row.first_name || ""} ${row.last_name || ""}`.trim());
  const fromFull = normalizeDriverDisplayName(row.full_name || "");
  const fromDriverName = normalizeDriverDisplayName(row.driver_name || "");
  const fromBroadcast = normalizeDriverDisplayName(row.broadcast_name || "");
  const fromAcronym = cleanLabel(row.name_acronym || "");
  const fallback = id ? `Piloto ${id}` : "";
  const name = [fromFirstLast, fromFull, fromDriverName, fromBroadcast, fromAcronym, fallback]
    .map(cleanLabel)
    .find(item => item && !isGenericDriverName(item))
    || fallback;
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

function toAvailability(value) {
  return Number.isFinite(value) ? "available" : "unavailable";
}

async function getRaceOptiCalendar(year = DEFAULT_YEAR) {
  const key = `raceoptidata:calendar:${year}`;
  const cached = getCached(cache.raceoptidata, key, TTL.raceoptidata);
  if (cached) return cached;
  const payload = await fetchRaceOpti(`/season/calendar/${year}`).catch(() => null);
  const rows = Array.isArray(payload?.calendar) ? payload.calendar : [];
  return setCached(cache.raceoptidata, key, rows.map(item => ({
    round: parseMaybeNumber(item.round),
    date: item.date || "",
    name: cleanLabel(item.name || ""),
    location: cleanLabel(item.location || "")
  })).filter(item => Number.isFinite(item.round)));
}

async function getRaceOptiDriversBySeason(year = DEFAULT_YEAR) {
  const key = `raceoptidata:drivers:${year}`;
  const cached = getCached(cache.raceoptidata, key, TTL.raceoptidata);
  if (cached) return cached;
  const payload = await fetchRaceOpti(`/drivers/list/${year}`).catch(() => null);
  const rows = Array.isArray(payload?.driversList) ? payload.driversList : [];
  return setCached(cache.raceoptidata, key, rows.map(item => ({
    driverRef: String(item.driverRef || "").trim().toLowerCase(),
    number: String(item.number || "").trim(),
    fullName: cleanLabel(item.fullName || ""),
    team: cleanLabel(item.team || "")
  })).filter(item => item.number || item.driverRef));
}

async function getRaceOptiDriverCodeByNumber(driverNumber) {
  const key = "raceoptidata:drivers-referential";
  const cached = getCached(cache.raceoptidata, key, TTL.raceoptidata);
  let rows = cached;
  if (!rows) {
    const payload = await fetchRaceOpti("/basicdata/driversReferential", { page: 1, pageSize: 1200 }).catch(() => null);
    rows = Array.isArray(payload?.drivers) ? payload.drivers : [];
    setCached(cache.raceoptidata, key, rows);
  }
  const match = rows.find(item => String(item.number || "").trim() === String(driverNumber || "").trim());
  return String(match?.fastF1Code || match?.code || "").trim().toUpperCase();
}

async function getMeetings(year = DEFAULT_YEAR) {
  const key = `meetings:${year}`;
  const cached = getCached(cache.meetings, key, TTL.meetings);
  if (cached) return cached;

  const [raceOptiCalendar, openf1Meetings] = await Promise.all([
    getRaceOptiCalendar(year).catch(() => []),
    fetchOpenF1WithRetry("meetings", { year }).catch(() => [])
  ]);
  const meetings = openf1Meetings.length ? openf1Meetings : [];
  if (!meetings.length && !raceOptiCalendar.length) {
    const stale = getStaleCached(cache.meetings, key);
    if (stale?.length) {
      telemetryLog("warn", "meetings.using_stale_cache", { year, count: stale.length });
      return stale;
    }
    return [];
  }
  const rows = meetings
    .filter(item => getYearFromRow(item) === year)
    .map(item => ({
      meeting_key: String(item.meeting_key || "").trim(),
      meeting_name: cleanLabel(item.meeting_name || ""),
      country_name: cleanLabel(item.country_name || ""),
      location: cleanLabel(item.location || ""),
      circuit_short_name: cleanLabel(item.circuit_short_name || ""),
      date_start: item.date_start || item.date || "",
      sort_ts: parseDateMs(item.date_start || item.date || ""),
      year
    }))
    .filter(item => item.meeting_key);

  const countryUsage = new Map();
  rows.forEach(item => {
    const countryKey = normalizeKey(item.country_name);
    if (!countryKey) return;
    countryUsage.set(countryKey, (countryUsage.get(countryKey) || 0) + 1);
  });

  const payloadBase = rows
    .map(item => {
      const countryKey = normalizeKey(item.country_name);
      const countryCount = countryUsage.get(countryKey) || 0;
      const preferredBase = countryCount > 1
        ? (item.location || item.meeting_name || item.country_name || item.circuit_short_name || "Grand Prix")
        : (item.country_name || item.location || item.meeting_name || item.circuit_short_name || "Grand Prix");
      return {
        ...item,
        gp_label: gpLabelFromMeeting({ ...item, location: preferredBase, country_name: preferredBase })
      };
    })
    .sort((a, b) => {
      const aTs = Number.isFinite(a.sort_ts) ? a.sort_ts : Number.MAX_SAFE_INTEGER;
      const bTs = Number.isFinite(b.sort_ts) ? b.sort_ts : Number.MAX_SAFE_INTEGER;
      if (aTs !== bTs) return aTs - bTs;
      return a.gp_label.localeCompare(b.gp_label);
    });

  const payload = raceOptiCalendar.length
    ? payloadBase.map((item, idx) => {
      const byRound = raceOptiCalendar.find(cal => String(cal.round) === String(idx + 1));
      const cal = byRound || raceOptiCalendar[idx] || null;
      if (!cal) return { ...item, round: idx + 1 };
      const cleanName = cleanLabel(cal.location || cal.name || item.location || item.meeting_name);
      return {
        ...item,
        round: cal.round || idx + 1,
        date_start: cal.date || item.date_start,
        location: cleanName || item.location,
        meeting_name: cleanLabel(cal.name || item.meeting_name),
        gp_label: gpLabelFromMeeting({ ...item, location: cleanName || item.location, country_name: cleanName || item.country_name })
      };
    }).sort((a, b) => (a.round || 99) - (b.round || 99))
    : payloadBase;

  return setCached(cache.meetings, key, payload);
}

async function getSessions(meetingKey, year = DEFAULT_YEAR) {
  const key = `sessions:${year}:${meetingKey}`;
  const cached = getCached(cache.sessionsByMeeting, key, TTL.sessions);
  if (cached) return cached;

  const rows = await fetchOpenF1WithRetry("sessions", { meeting_key: meetingKey }).catch(error => {
    const stale = getStaleCached(cache.sessionsByMeeting, key);
    if (stale?.length) {
      telemetryLog("warn", "sessions.using_stale_cache", { year, meeting_key: meetingKey, count: stale.length });
      return stale;
    }
    telemetryLog("warn", "sessions.fetch_unavailable", { year, meeting_key: meetingKey, reason: String(error?.message || "OPENF1_SESSIONS_FAIL") });
    return [];
  });
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

async function getDrivers(sessionKey, year = DEFAULT_YEAR) {
  const key = `drivers:${year}:${sessionKey}`;
  const cached = getCached(cache.driversBySession, key, TTL.drivers);
  if (cached) return cached;

  const [seasonDrivers, driversRows, lapsRows, resultRows, positionRows, stintsRows, carDataRows] = await Promise.all([
    getRaceOptiDriversBySeason(year).catch(() => []),
    fetchOpenF1WithRetry("drivers", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("laps", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("session_result", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("position", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("stints", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("car_data", { session_key: sessionKey }, { retries: 1 }).catch(() => [])
  ]);

  const byDriver = new Map();
  seasonDrivers.forEach(driver => {
    if (!driver.number) return;
    byDriver.set(driver.number, {
      id: driver.number,
      name: driver.fullName || `Piloto ${driver.number}`,
      team: driver.team || "",
      headshot: "",
      source: "raceoptidata"
    });
  });
  [driversRows, lapsRows, resultRows, positionRows, stintsRows, carDataRows].forEach(rows => {
    rows.forEach(row => {
      const driver = mapDriverRow(row);
      if (!driver.id || !driver.name) return;
      const current = byDriver.get(driver.id) || { id: driver.id, name: driver.name, team: "", headshot: "", source: "openf1" };
      current.name = pickBetterDriverName(current.name, driver.name);
      current.team = current.team || driver.team;
      current.headshot = current.headshot || driver.headshot;
      byDriver.set(driver.id, current);
    });
  });

  const drivers = [...byDriver.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => ({ id: item.id, name: item.name, team: item.team || "", headshot: item.headshot, source: item.source || "openf1" }));

  return setCached(cache.driversBySession, key, drivers);
}

function resolveMeetingSelection(meetings = [], meetingInput = "") {
  const raw = String(meetingInput || "").trim();
  if (!raw) return meetings[0] || null;
  const byKey = meetings.find(item => item.meeting_key === raw);
  if (byKey) return byKey;
  const normalized = normalizeKey(raw);
  return meetings.find(item => normalizeKey(item.gp_label) === normalized)
    || meetings.find(item => normalizeKey(item.meeting_name) === normalized)
    || meetings.find(item => normalizeKey(item.location) === normalized)
    || null;
}

function resolveSessionSelection(sessions = [], sessionInput = "") {
  const raw = String(sessionInput || "").trim();
  if (!raw) return sessions[0] || null;
  const byKey = sessions.find(item => item.session_key === raw);
  if (byKey) return byKey;
  const normalized = normalizeKey(raw);
  return sessions.find(item => normalizeKey(item.type_key) === normalized)
    || sessions.find(item => normalizeKey(item.type_label) === normalized)
    || sessions.find(item => normalizeKey(item.session_name) === normalized)
    || null;
}

function resolveDriverSelection(drivers = [], driverInput = "") {
  const raw = String(driverInput || "").trim();
  if (!raw) return drivers[0] || null;
  const byId = drivers.find(item => item.id === raw);
  if (byId) return byId;
  const normalized = normalizeKey(raw);
  return drivers.find(item => normalizeKey(item.name) === normalized) || null;
}

async function loadSessionContext(sessionKey) {
  const [weather, raceControl, pit, overtakes, teamRadio] = await Promise.all([
    fetchOpenF1WithRetry("weather", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("race_control", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("pit", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("overtakes", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("team_radio", { session_key: sessionKey }, { retries: 1 }).catch(() => [])
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

async function getDriverMetricsRaceOpti({ year = DEFAULT_YEAR, round, sessionType, driverCode }) {
  const sessionCode = toRaceOptiSessionCode(sessionType);
  if (!Number.isFinite(Number(round)) || !driverCode || !sessionCode) {
    return {
      source: "raceoptidata",
      traces: { speed: [], throttle: [], brake: [], gear: [], rpm: [] },
      stints: [],
      evolution: []
    };
  }
  const key = `raceoptidata:telemetry:${year}:${round}:${sessionCode}:${driverCode}`;
  const cached = getCached(cache.raceoptidata, key, TTL.telemetry);
  if (cached) return cached;

  const raceStatsPath = `/racestats/${year}/${round}/${sessionCode}/${driverCode}`;
  const qualifierPath = `/qualifstats/report/${year}/${round}/${driverCode}`;
  const [raceStats, tyreStrategy, bestLap] = await Promise.all([
    (sessionCode === "Q" ? fetchRaceOpti(qualifierPath) : fetchRaceOpti(raceStatsPath)).catch(() => null),
    (sessionCode === "R" || sessionCode === "S")
      ? fetchRaceOpti(`/racestats/tyre-strategy/${year}/${round}/${driverCode}`, { session: sessionCode }).catch(() => null)
      : Promise.resolve(null),
    fetchRaceOpti(`/bestlap/${year}/${round}`, { session: sessionCode }).catch(() => null)
  ]);

  const stintDetails = Array.isArray(tyreStrategy?.stintDetails) ? tyreStrategy.stintDetails : (Array.isArray(raceStats?.stints) ? raceStats.stints : []);
  const stints = stintDetails.map((item, idx) => ({
    number: parseMaybeNumber(item.stintNumber) ?? idx + 1,
    compound: String(item.compound || "N/D"),
    lapStart: parseMaybeNumber(item.startLap),
    lapEnd: parseMaybeNumber(item.endLap),
    laps: parseMaybeNumber(item.totalStintLaps)
  }));
  const referenceLap = parseRaceOptiDurationToSeconds(
    raceStats?.bestLapTime
      || raceStats?.bestLap?.lapTime
      || bestLap?.bestLap?.lapTime
      || bestLap?.lapTime
  );
  const averagePace = parseRaceOptiDurationToSeconds(raceStats?.averageLapTime);
  const topSpeed = parseMaybeNumber(raceStats?.topSpeed ?? raceStats?.speedMax ?? bestLap?.topSpeed);

  const payload = {
    source: "raceoptidata",
    lapCount: parseMaybeNumber(raceStats?.totalLaps),
    referenceLap,
    averagePace,
    topSpeed,
    speedTrap: parseMaybeNumber(bestLap?.speedTrap ?? raceStats?.speedTrap),
    sectors: {
      sector1: parseRaceOptiDurationToSeconds(bestLap?.bestLap?.sector1 ?? bestLap?.sector1),
      sector2: parseRaceOptiDurationToSeconds(bestLap?.bestLap?.sector2 ?? bestLap?.sector2),
      sector3: parseRaceOptiDurationToSeconds(bestLap?.bestLap?.sector3 ?? bestLap?.sector3)
    },
    positionAverage: null,
    degradation: null,
    stints,
    evolution: [],
    traces: { speed: [], throttle: [], brake: [], gear: [], rpm: [] },
    completeness: { speed: false, throttle: false, brake: false, gear: false, rpm: false },
    diagnostics: {
      counts: { raceStats: raceStats ? 1 : 0, tyreStrategy: tyreStrategy ? 1 : 0, bestLap: bestLap ? 1 : 0 },
      blocks: {
        laps: Number.isFinite(parseMaybeNumber(raceStats?.totalLaps)),
        telemetry_trace: false,
        sectors: Object.values({
          s1: parseRaceOptiDurationToSeconds(bestLap?.bestLap?.sector1 ?? bestLap?.sector1),
          s2: parseRaceOptiDurationToSeconds(bestLap?.bestLap?.sector2 ?? bestLap?.sector2),
          s3: parseRaceOptiDurationToSeconds(bestLap?.bestLap?.sector3 ?? bestLap?.sector3)
        }).some(Number.isFinite),
        stints: stints.length > 0,
        position: false
      }
    }
  };
  return setCached(cache.raceoptidata, key, payload);
}

async function getDriverMetricsOpenF1(sessionKey, driverNumber) {
  const [lapsRows, carDataRows, stintsRows, positionRows, resultRows] = await Promise.all([
    fetchOpenF1WithRetry("laps", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    fetchOpenF1WithRetry("car_data", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    fetchOpenF1WithRetry("stints", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    fetchOpenF1WithRetry("position", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    fetchOpenF1WithRetry("session_result", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => [])
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
    },
    diagnostics: {
      counts: {
        laps: lapsRows.length,
        carData: carDataRows.length,
        stints: stintsRows.length,
        position: positionRows.length,
        sessionResult: resultRows.length
      },
      blocks: {
        laps: lapTimes.length > 0,
        telemetry_trace: speedProfile.length > 0 || throttleProfile.length > 0 || brakeProfile.length > 0 || gearProfile.length > 0 || rpmProfile.length > 0,
        sectors: Object.values(sectors).some(Number.isFinite),
        stints: stintRows.length > 0,
        position: positionRows.some(item => Number.isFinite(parseMaybeNumber(item.position)))
      }
    }
  };
}

async function getDriverMetricsOpenF1Aggregate(sessionKey, driverNumber) {
  const [lapsRows, stintsRows, resultRows, positionRows] = await Promise.all([
    fetchOpenF1WithRetry("laps", { session_key: sessionKey, driver_number: driverNumber }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("stints", { session_key: sessionKey, driver_number: driverNumber }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("session_result", { session_key: sessionKey, driver_number: driverNumber }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("position", { session_key: sessionKey, driver_number: driverNumber }, { retries: 1 }).catch(() => [])
  ]);

  const lapTimes = lapsRows.map(item => parseMaybeNumber(item.lap_duration)).filter(Number.isFinite);
  const sectors = {
    sector1: median(lapsRows.map(item => parseMaybeNumber(item.duration_sector_1))),
    sector2: median(lapsRows.map(item => parseMaybeNumber(item.duration_sector_2))),
    sector3: median(lapsRows.map(item => parseMaybeNumber(item.duration_sector_3)))
  };

  const topSpeed = Math.max(
    ...resultRows.map(item => parseMaybeNumber(item.top_speed)).filter(Number.isFinite),
    ...lapsRows.map(item => parseMaybeNumber(item.i1_speed)).filter(Number.isFinite),
    0
  );
  const speedTrap = Math.max(
    ...resultRows.map(item => parseMaybeNumber(item.speed_trap)).filter(Number.isFinite),
    ...lapsRows.map(item => parseMaybeNumber(item.st_speed)).filter(Number.isFinite),
    0
  );

  sourceHealth.openf1_aggregate = {
    ok: lapTimes.length > 0 || Number.isFinite(topSpeed) || Number.isFinite(speedTrap),
    last_success_ts: Date.now(),
    last_error: null
  };

  return {
    source: "openf1_aggregate",
    lapCount: lapTimes.length,
    referenceLap: lapTimes.length ? Math.min(...lapTimes) : null,
    averagePace: lapTimes.length ? average(lapTimes) : null,
    topSpeed: Number.isFinite(topSpeed) && topSpeed > 0 ? topSpeed : null,
    speedTrap: Number.isFinite(speedTrap) && speedTrap > 0 ? speedTrap : null,
    sectors,
    positionAverage: average(positionRows.map(item => parseMaybeNumber(item.position))),
    degradation: simpleDegradation(lapsRows),
    stints: stintsRows.map(item => ({
      number: parseMaybeNumber(item.stint_number),
      compound: String(item.compound || "N/D"),
      lapStart: parseMaybeNumber(item.lap_start),
      lapEnd: parseMaybeNumber(item.lap_end),
      laps: Number.isFinite(parseMaybeNumber(item.lap_start)) && Number.isFinite(parseMaybeNumber(item.lap_end))
        ? parseMaybeNumber(item.lap_end) - parseMaybeNumber(item.lap_start) + 1
        : null
    })).filter(item => Number.isFinite(item.number)),
    evolution: [],
    traces: { speed: [], throttle: [], brake: [], gear: [], rpm: [] },
    completeness: { speed: false, throttle: false, brake: false, gear: false, rpm: false },
    diagnostics: {
      counts: {
        laps: lapsRows.length,
        stints: stintsRows.length,
        position: positionRows.length,
        sessionResult: resultRows.length
      },
      blocks: {
        laps: lapTimes.length > 0,
        telemetry_trace: false,
        sectors: Object.values(sectors).some(Number.isFinite),
        stints: stintsRows.length > 0,
        position: positionRows.some(item => Number.isFinite(parseMaybeNumber(item.position)))
      }
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

  sourceHealth.fastf1 = result?.ok
    ? { ok: true, last_success_ts: Date.now(), last_error: null }
    : {
      ok: false,
      last_success_ts: sourceHealth.fastf1.last_success_ts,
      last_error: { reason: result?.reason || "FASTF1_UNKNOWN", ts: Date.now() }
    };
  if (!result?.ok) telemetryLog("warn", "fastf1.fetch_failed", { reason: result?.reason || "FASTF1_UNKNOWN" });

  return setCached(cache.fastf1, key, result);
}

function mergeTelemetry(baseTelemetry, fastf1) {
  const baseHasCore = Number.isFinite(baseTelemetry?.referenceLap)
    || Number.isFinite(baseTelemetry?.averagePace)
    || Number.isFinite(baseTelemetry?.topSpeed)
    || Number.isFinite(baseTelemetry?.speedTrap)
    || Object.values(baseTelemetry?.traces || {}).some(trace => Array.isArray(trace) && trace.length > 0)
    || (Array.isArray(baseTelemetry?.stints) && baseTelemetry.stints.length > 0);

  if (!fastf1?.ok) return { ...baseTelemetry, primarySource: baseTelemetry?.source || "raceoptidata", sources: [baseTelemetry?.source || "raceoptidata"] };

  const merged = {
    ...baseTelemetry,
    source: baseHasCore ? baseTelemetry.source : "fastf1",
    primarySource: baseHasCore ? (baseTelemetry.source || "raceoptidata") : "fastf1",
    sources: [baseTelemetry.source || "raceoptidata", "fastf1"],
    referenceLap: Number.isFinite(baseTelemetry.referenceLap) ? baseTelemetry.referenceLap : fastf1.referenceLap,
    averagePace: Number.isFinite(baseTelemetry.averagePace) ? baseTelemetry.averagePace : fastf1.averagePace,
    topSpeed: Number.isFinite(baseTelemetry.topSpeed) ? baseTelemetry.topSpeed : fastf1.topSpeed,
    speedTrap: Number.isFinite(baseTelemetry.speedTrap) ? baseTelemetry.speedTrap : fastf1.speedTrap,
    traces: {
      speed: baseTelemetry.traces.speed?.length ? baseTelemetry.traces.speed : buildLineFromSamples(fastf1.traces?.speed || [], item => parseMaybeNumber(item), 36),
      throttle: baseTelemetry.traces.throttle?.length ? baseTelemetry.traces.throttle : buildLineFromSamples(fastf1.traces?.throttle || [], item => parseMaybeNumber(item), 36),
      brake: baseTelemetry.traces.brake?.length ? baseTelemetry.traces.brake : buildLineFromSamples(fastf1.traces?.brake || [], item => parseMaybeNumber(item), 36),
      gear: baseTelemetry.traces.gear?.length ? baseTelemetry.traces.gear : buildLineFromSamples(fastf1.traces?.gear || [], item => parseMaybeNumber(item), 36),
      rpm: baseTelemetry.traces.rpm?.length ? baseTelemetry.traces.rpm : buildLineFromSamples(fastf1.traces?.rpm || [], item => parseMaybeNumber(item), 36)
    }
  };

  return merged;
}

function hasAnyTelemetryData(payload = {}) {
  if (Number.isFinite(payload.referenceLap) || Number.isFinite(payload.averagePace)) return true;
  if (Number.isFinite(payload.topSpeed) || Number.isFinite(payload.speedTrap)) return true;
  if (Number.isFinite(payload.positionAverage) || Number.isFinite(payload.degradation)) return true;
  if (Array.isArray(payload.stints) && payload.stints.length > 0) return true;
  if (Array.isArray(payload.evolution) && payload.evolution.length > 0) return true;
  return Object.values(payload.traces || {}).some(values => Array.isArray(values) && values.length > 0);
}

function mergeTelemetryBlock(base = {}, enrich = {}) {
  return {
    ...base,
    referenceLap: Number.isFinite(base.referenceLap) ? base.referenceLap : enrich.referenceLap,
    averagePace: Number.isFinite(base.averagePace) ? base.averagePace : enrich.averagePace,
    topSpeed: Number.isFinite(base.topSpeed) ? base.topSpeed : enrich.topSpeed,
    speedTrap: Number.isFinite(base.speedTrap) ? base.speedTrap : enrich.speedTrap,
    sectors: {
      sector1: Number.isFinite(base?.sectors?.sector1) ? base.sectors.sector1 : enrich?.sectors?.sector1 ?? null,
      sector2: Number.isFinite(base?.sectors?.sector2) ? base.sectors.sector2 : enrich?.sectors?.sector2 ?? null,
      sector3: Number.isFinite(base?.sectors?.sector3) ? base.sectors.sector3 : enrich?.sectors?.sector3 ?? null
    },
    positionAverage: Number.isFinite(base.positionAverage) ? base.positionAverage : enrich.positionAverage,
    degradation: Number.isFinite(base.degradation) ? base.degradation : enrich.degradation,
    stints: Array.isArray(base.stints) && base.stints.length ? base.stints : (enrich.stints || []),
    evolution: Array.isArray(base.evolution) && base.evolution.length ? base.evolution : (enrich.evolution || []),
    traces: {
      speed: base?.traces?.speed?.length ? base.traces.speed : (enrich?.traces?.speed || []),
      throttle: base?.traces?.throttle?.length ? base.traces.throttle : (enrich?.traces?.throttle || []),
      brake: base?.traces?.brake?.length ? base.traces.brake : (enrich?.traces?.brake || []),
      gear: base?.traces?.gear?.length ? base.traces.gear : (enrich?.traces?.gear || []),
      rpm: base?.traces?.rpm?.length ? base.traces.rpm : (enrich?.traces?.rpm || [])
    }
  };
}

async function buildSessionEvolutionSummary({ meetingKey, currentSessionKey, driverNumber, year = DEFAULT_YEAR }) {
  const sessions = await getSessions(meetingKey, year);
  const evolution = [];
  for (const session of sessions) {
    if (session.session_key === currentSessionKey) continue;
    const laps = await fetchOpenF1WithRetry("laps", { session_key: session.session_key, driver_number: driverNumber }, { retries: 1 }).catch(() => []);
    const lapTimes = laps.map(item => parseMaybeNumber(item.lap_duration)).filter(Number.isFinite);
    if (!lapTimes.length) continue;
    const refLap = Math.min(...lapTimes);
    const avg = average(lapTimes);
    evolution.push({
      session_key: session.session_key,
      session_type: session.type_key,
      session_label: session.type_label,
      referenceLap: refLap,
      averagePace: avg,
      deltaToReference: Number.isFinite(refLap) && Number.isFinite(avg) ? avg - refLap : null
    });
  }
  return evolution;
}

async function resolveTelemetryContext({ year = DEFAULT_YEAR, meetingKey = "", sessionType = "", driver = "" }) {
  const cacheKey = `${year}:${meetingKey}:${sessionType}:${driver}`;
  const cached = getCached(cache.context, cacheKey, TTL.context);
  if (cached) return cached;

  const meetings = await getMeetings(year);
  const selectedMeeting = meetings.find(item => item.meeting_key === String(meetingKey)) || meetings[0] || null;
  const sessions = selectedMeeting ? await getSessions(selectedMeeting.meeting_key, year) : [];
  const selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[0] || null;
  const drivers = selectedSession ? await getDrivers(selectedSession.session_key, year) : [];
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
  if (cached) {
    telemetryLog("debug", "telemetry.cache_hit", { year, meeting_key: meetingKey, session_key: sessionKey, driver_number: driverNumber });
    return cached;
  }

  telemetryLog("info", "telemetry.request", { year, meeting_key: meetingKey, session_key: sessionKey, driver_number: driverNumber });

  const meetings = await getMeetings(year);
  const meeting = meetings.find(item => item.meeting_key === String(meetingKey));
  if (!meeting) {
    telemetryLog("warn", "telemetry.meeting_not_found", { year, meeting_key: meetingKey });
    const error = new Error("GP no válido para 2026");
    error.code = "MEETING_NOT_FOUND";
    throw error;
  }

  const sessions = await getSessions(meetingKey, year);
  const sessionInput = String(sessionKey || "").trim();
  const session = sessions.find(item => item.session_key === sessionInput)
    || sessions.find(item => item.type_key === mapSessionType(sessionInput))
    || sessions.find(item => normalizeKey(item.type_label) === normalizeKey(sessionInput));
  if (!session) {
    telemetryLog("warn", "telemetry.session_not_found", { year, meeting_key: meetingKey, session_key: sessionKey });
    const error = new Error("Sesión no disponible para este GP");
    error.code = "SESSION_NOT_FOUND";
    throw error;
  }

  const drivers = await getDrivers(session.session_key, year);
  const driver = drivers.find(item => item.id === String(driverNumber));
  if (!driver) {
    telemetryLog("warn", "telemetry.driver_not_found", { year, meeting_key: meetingKey, session_key: session.session_key, driver_number: driverNumber });
    const error = new Error("Piloto no disponible en esta sesión");
    error.code = "DRIVER_NOT_FOUND";
    throw error;
  }

  const driverCode = await getRaceOptiDriverCodeByNumber(driver.id).catch(() => "");
  const raceOpti = await getDriverMetricsRaceOpti({
    year,
    round: parseMaybeNumber(meeting.round),
    sessionType: session.type_key,
    driverCode
  }).catch(() => ({
    source: "raceoptidata",
    traces: { speed: [], throttle: [], brake: [], gear: [], rpm: [] },
    stints: [],
    evolution: []
  }));

  const openf1 = await getDriverMetricsOpenF1(session.session_key, driver.id).catch(error => {
    telemetryLog("warn", "telemetry.provider_failed", {
      provider: "openf1",
      reason: String(error?.message || "OPENF1_PROVIDER_ERROR"),
      meeting_key: meetingKey,
      session_key: session.session_key,
      driver_number: driver.id
    });
    return {
      source: "openf1",
      traces: { speed: [], throttle: [], brake: [], gear: [], rpm: [] },
      stints: [],
      evolution: []
    };
  });
  const aggregate = await getDriverMetricsOpenF1Aggregate(session.session_key, driver.id).catch(error => {
    sourceHealth.openf1_aggregate = {
      ok: false,
      last_success_ts: sourceHealth.openf1_aggregate.last_success_ts,
      last_error: { reason: String(error?.message || "OPENF1_AGGREGATE_FAIL"), ts: Date.now() }
    };
    telemetryLog("warn", "telemetry.provider_failed", {
      provider: "openf1_aggregate",
      reason: String(error?.message || "OPENF1_AGGREGATE_FAIL"),
      meeting_key: meetingKey,
      session_key: session.session_key,
      driver_number: driver.id
    });
    return null;
  });
  const fastf1 = await getFastF1DriverMetrics({
    meetingName: meeting.meeting_name || meeting.location || meeting.country_name,
    sessionType: session.type_key,
    driverNumber: driver.id
  }).catch(() => ({ ok: false, reason: "FASTF1_ERROR" }));
  const raceOptiBase = mergeTelemetryBlock(raceOpti, openf1);
  const openf1Base = mergeTelemetryBlock(raceOptiBase, aggregate || {});
  const merged = mergeTelemetry(openf1Base, fastf1);
  const weather = await loadSessionContext(session.session_key);
  const sessionEvolution = await buildSessionEvolutionSummary({
    meetingKey,
    currentSessionKey: session.session_key,
    driverNumber: driver.id,
    year
  }).catch(() => []);

  telemetryLog("info", "telemetry.sources_evaluated", {
    year,
    meeting_key: meetingKey,
    session_key: session.session_key,
    session_type: session.type_key,
    driver_number: driver.id,
    raceoptidata_counts: raceOpti?.diagnostics?.counts || {},
    raceoptidata_blocks: raceOpti?.diagnostics?.blocks || {},
    openf1_counts: openf1?.diagnostics?.counts || {},
    openf1_blocks: openf1?.diagnostics?.blocks || {},
    fastf1_ok: !!fastf1?.ok,
    fastf1_reason: fastf1?.reason || "FASTF1_ACTIVE",
    aggregate_counts: aggregate?.diagnostics?.counts || {},
    aggregate_blocks: aggregate?.diagnostics?.blocks || {},
    merged_primary: merged.primarySource || "raceoptidata",
    merged_sources: merged.sources || ["raceoptidata", "openf1", "openf1_aggregate"]
  });

  if (!hasAnyTelemetryData(merged)) {
    telemetryLog("warn", "telemetry.no_data", {
      year,
      meeting_key: meetingKey,
      session_key: session.session_key,
      driver_number: driver.id,
      openf1_blocks: openf1?.diagnostics?.blocks || {},
      fastf1_ok: !!fastf1?.ok,
      fastf1_reason: fastf1?.reason || "FASTF1_ACTIVE",
      aggregate_blocks: aggregate?.diagnostics?.blocks || {}
    });
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
      primary: merged.primarySource || "raceoptidata",
      enrichment: fastf1?.ok ? "fastf1" : "none",
      fastf1_status: fastf1?.reason || "FASTF1_ACTIVE",
      active_sources: [...new Set(["raceoptidata", ...(merged.sources || []), "openf1_aggregate"])].filter(Boolean),
      fallback_chain: [
        { provider: "raceoptidata", ok: hasAnyTelemetryData(raceOpti), reason: hasAnyTelemetryData(raceOpti) ? "OK" : "RACEOPTIDATA_PARTIAL_OR_EMPTY" },
        { provider: "openf1", ok: hasAnyTelemetryData(openf1), reason: hasAnyTelemetryData(openf1) ? "OK" : "OPENF1_PARTIAL_OR_EMPTY" },
        { provider: "openf1_aggregate", ok: hasAnyTelemetryData(aggregate || {}), reason: hasAnyTelemetryData(aggregate || {}) ? "OK" : "OPENF1_AGGREGATE_EMPTY" },
        { provider: "fastf1", ok: !!fastf1?.ok, reason: fastf1?.reason || "FASTF1_ACTIVE" }
      ]
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
    traces: {
      ...merged.traces,
      trackPosition: buildLineFromSamples(
        await fetchOpenF1WithRetry("position", { session_key: session.session_key, driver_number: driver.id }, { retries: 1 }).catch(() => []),
        item => parseMaybeNumber(item.position),
        36
      )
    },
    availability: {
      referenceLap: toAvailability(merged.referenceLap),
      averagePace: toAvailability(merged.averagePace),
      topSpeed: toAvailability(merged.topSpeed),
      speedTrap: toAvailability(merged.speedTrap),
      sector1: toAvailability(merged.sectors?.sector1),
      sector2: toAvailability(merged.sectors?.sector2),
      sector3: toAvailability(merged.sectors?.sector3),
      degradation: toAvailability(merged.degradation),
      stints: Array.isArray(merged.stints) && merged.stints.length ? "available" : "unavailable",
      evolution: Array.isArray(merged.evolution) && merged.evolution.length ? "available" : "unavailable",
      speedTrace: Array.isArray(merged?.traces?.speed) && merged.traces.speed.length ? "available" : "unavailable",
      throttleTrace: Array.isArray(merged?.traces?.throttle) && merged.traces.throttle.length ? "available" : "unavailable",
      brakeTrace: Array.isArray(merged?.traces?.brake) && merged.traces.brake.length ? "available" : "unavailable"
    },
    weather: {
      avgTrackTemp: Number.isFinite(weather.avgTrackTemp) ? weather.avgTrackTemp : fastf1?.weather?.avgTrackTemp ?? null,
      avgAirTemp: Number.isFinite(weather.avgAirTemp) ? weather.avgAirTemp : fastf1?.weather?.avgAirTemp ?? null,
      weatherState: weather.weatherState || fastf1?.weather?.weatherState || "N/D",
      raceControlMessages: weather.raceControlMessages,
      pitStops: weather.pitStops,
      overtakes: weather.overtakes,
      teamRadios: weather.teamRadios
    },
    session_evolution: sessionEvolution
  };

  telemetryLog("info", "telemetry.success", {
    year,
    meeting_key: meetingKey,
    session_key: session.session_key,
    driver_number: driver.id,
    source_primary: payload.source.primary,
    source_enrichment: payload.source.enrichment
  });

  return setCached(cache.telemetry, cacheKey, payload);
}

async function buildTelemetryDebugReport({ year = DEFAULT_YEAR, gp = "", session = "", driver = "" }) {
  const refreshHealth = report => {
    report.sources.health = {
      openf1: sourceHealth.openf1,
      raceoptidata: sourceHealth.raceoptidata,
      openf1_aggregate: sourceHealth.openf1_aggregate,
      fastf1: sourceHealth.fastf1
    };
  };

  const report = {
    input: { year, gp: String(gp || ""), session: String(session || ""), driver: String(driver || "") },
    resolved: {
      meeting: null,
      session: null,
      driver: null
    },
    sources: {
      consulted: ["raceoptidata", "openf1", "openf1_aggregate", "fastf1"],
      health: {
        raceoptidata: sourceHealth.raceoptidata,
        openf1: sourceHealth.openf1,
        openf1_aggregate: sourceHealth.openf1_aggregate,
        fastf1: sourceHealth.fastf1
      },
      raceoptidata: { ok: false, counts: {}, blocks: {} },
      openf1: { ok: false, counts: {}, blocks: {} },
      openf1_aggregate: { ok: false, counts: {}, blocks: {} },
      fastf1: { ok: false, reason: "NOT_RUN" },
      merged: { ok: false, primary: "none", active: [] }
    },
    chain: {
      meeting: { ok: false, reason: "NOT_RUN" },
      session: { ok: false, reason: "NOT_RUN" },
      driver_mapping: { ok: false, reason: "NOT_RUN" },
      laps: { ok: false, reason: "NOT_RUN" },
      telemetry_trace: { ok: false, reason: "NOT_RUN" },
      sectors: { ok: false, reason: "NOT_RUN" },
      stints: { ok: false, reason: "NOT_RUN" },
      weather: { ok: false, reason: "NOT_RUN" },
      position: { ok: false, reason: "NOT_RUN" }
    },
    final: {
      ok: false,
      reason: "NOT_RUN",
      message: "No ejecutado"
    }
  };

  try {
    const meetings = await getMeetings(year);
    const meeting = resolveMeetingSelection(meetings, gp);
    if (!meeting) {
      refreshHealth(report);
      report.chain.meeting = { ok: false, reason: "MEETING_NOT_FOUND" };
      report.final = { ok: false, reason: "MEETING_NOT_FOUND", message: "No se pudo resolver el GP seleccionado." };
      return report;
    }
    report.resolved.meeting = meeting;
    report.chain.meeting = { ok: true, reason: "OK" };

    const sessions = await getSessions(meeting.meeting_key, year);
    const selectedSession = resolveSessionSelection(sessions, session);
    if (!selectedSession) {
      refreshHealth(report);
      report.chain.session = { ok: false, reason: "SESSION_NOT_FOUND" };
      report.final = { ok: false, reason: "SESSION_NOT_FOUND", message: "No se pudo resolver la sesión seleccionada." };
      return report;
    }
    report.resolved.session = selectedSession;
    report.chain.session = { ok: true, reason: "OK" };

    const drivers = await getDrivers(selectedSession.session_key, year);
    const selectedDriver = resolveDriverSelection(drivers, driver);
    if (!selectedDriver) {
      refreshHealth(report);
      report.chain.driver_mapping = { ok: false, reason: "DRIVER_NOT_FOUND" };
      report.final = { ok: false, reason: "DRIVER_NOT_FOUND", message: "No se pudo resolver el piloto seleccionado." };
      return report;
    }
    report.resolved.driver = selectedDriver;
    report.chain.driver_mapping = { ok: true, reason: "OK" };

    const driverCode = await getRaceOptiDriverCodeByNumber(selectedDriver.id).catch(() => "");
    const raceoptidata = await getDriverMetricsRaceOpti({
      year,
      round: parseMaybeNumber(meeting.round),
      sessionType: selectedSession.type_key,
      driverCode
    }).catch(() => null);
    report.sources.raceoptidata = {
      ok: hasAnyTelemetryData(raceoptidata || {}),
      counts: raceoptidata?.diagnostics?.counts || {},
      blocks: raceoptidata?.diagnostics?.blocks || {}
    };
    const openf1 = await getDriverMetricsOpenF1(selectedSession.session_key, selectedDriver.id);
    const aggregate = await getDriverMetricsOpenF1Aggregate(selectedSession.session_key, selectedDriver.id).catch(() => null);
    report.sources.openf1 = {
      ok: hasAnyTelemetryData(openf1),
      counts: openf1?.diagnostics?.counts || {},
      blocks: openf1?.diagnostics?.blocks || {}
    };
    report.sources.openf1_aggregate = {
      ok: hasAnyTelemetryData(aggregate || {}),
      counts: aggregate?.diagnostics?.counts || {},
      blocks: aggregate?.diagnostics?.blocks || {}
    };
    report.chain.laps = { ok: !!openf1?.diagnostics?.blocks?.laps, reason: openf1?.diagnostics?.blocks?.laps ? "OK" : "OPENF1_NO_LAPS" };
    report.chain.telemetry_trace = { ok: !!openf1?.diagnostics?.blocks?.telemetry_trace, reason: openf1?.diagnostics?.blocks?.telemetry_trace ? "OK" : "OPENF1_NO_TRACE" };
    report.chain.sectors = { ok: !!openf1?.diagnostics?.blocks?.sectors, reason: openf1?.diagnostics?.blocks?.sectors ? "OK" : "OPENF1_NO_SECTORS" };
    report.chain.stints = { ok: !!openf1?.diagnostics?.blocks?.stints, reason: openf1?.diagnostics?.blocks?.stints ? "OK" : "OPENF1_NO_STINTS" };
    report.chain.position = { ok: !!openf1?.diagnostics?.blocks?.position, reason: openf1?.diagnostics?.blocks?.position ? "OK" : "OPENF1_NO_POSITION" };

    const fastf1 = await getFastF1DriverMetrics({
      meetingName: meeting.meeting_name || meeting.location || meeting.country_name,
      sessionType: selectedSession.type_key,
      driverNumber: selectedDriver.id
    }).catch(() => ({ ok: false, reason: "FASTF1_ERROR" }));
    report.sources.fastf1 = { ok: !!fastf1?.ok, reason: fastf1?.reason || "FASTF1_ACTIVE" };

    const weather = await loadSessionContext(selectedSession.session_key);
    report.chain.weather = {
      ok: Number.isFinite(weather.avgTrackTemp) || Number.isFinite(weather.avgAirTemp) || Number.isFinite(weather.raceControlMessages),
      reason: (Number.isFinite(weather.avgTrackTemp) || Number.isFinite(weather.avgAirTemp) || Number.isFinite(weather.raceControlMessages)) ? "OK" : "OPENF1_NO_WEATHER_CONTEXT"
    };

    const merged = mergeTelemetry(mergeTelemetryBlock(mergeTelemetryBlock(raceoptidata || {}, openf1), aggregate || {}), fastf1);
    report.sources.merged = {
      ok: hasAnyTelemetryData(merged),
      primary: merged.primarySource || "openf1",
      active: merged.sources || ["openf1"]
    };

    if (!hasAnyTelemetryData(merged)) {
      refreshHealth(report);
      report.final = {
        ok: false,
        reason: "NO_TELEMETRY",
        message: "No hay telemetría histórica disponible para este piloto en esta sesión."
      };
      return report;
    }

    report.final = {
      ok: true,
      reason: "OK",
      message: "Telemetría resuelta correctamente."
    };
    refreshHealth(report);
    return report;
  } catch (error) {
    telemetryLog("error", "telemetry.debug_failed", { reason: error?.code || "DEBUG_BUILD_FAILED", message: String(error?.message || "") });
    refreshHealth(report);
    report.final = {
      ok: false,
      reason: error?.code || "DEBUG_BUILD_FAILED",
      message: String(error?.message || "No se pudo construir el diagnóstico.")
    };
    return report;
  }
}

async function buildRaceOptiCoverageReport({ year = DEFAULT_YEAR } = {}) {
  const envKey = getRaceOptiApiKey();
  const runtime = process.env.VERCEL ? "vercel/server" : "local/server";
  const supportedByRaceOpti = new Set(["race", "sprint_race", "qualy"]);
  const sessionTypes = ["race", "sprint_race", "qualy", "fp1", "fp2", "fp3", "sprint_qualy"];
  const report = {
    env_present: Boolean(envKey),
    runtime,
    year,
    raceoptidata_health: {
      calendar: false,
      drivers: false,
      drivers_referential: false
    },
    tested_gp: [],
    tested_sessions: [],
    tested_drivers: [],
    raceoptidata_success_count: 0,
    raceoptidata_fail_count: 0,
    blocks_covered: {
      gp_calendar: "raceoptidata",
      pilots: "raceoptidata+openf1",
      reference: "raceoptidata",
      ritmo_medio: "raceoptidata",
      sectores: "raceoptidata",
      speed_metrics: "raceoptidata",
      stint: "raceoptidata",
      degradacion: "fallback_openf1",
      trazas: "fallback_openf1_fastf1",
      contexto_sesion: "fallback_openf1"
    },
    fallback_needed: {
      openf1: ["fp1", "fp2", "fp3", "sprint_qualy", "degradacion", "trazas", "contexto_sesion"],
      fastf1: ["trazas (si openf1 no entrega bloque)"]
    },
    unsupported_sessions: ["fp1", "fp2", "fp3", "sprint_qualy"],
    notes: []
  };

  if (!envKey) {
    report.notes.push("RACEOPTIDATA_API_KEY no está disponible en este runtime.");
    return report;
  }

  const [calendar, seasonDrivers, referential] = await Promise.all([
    fetchRaceOpti(`/season/calendar/${year}`).catch(() => null),
    fetchRaceOpti(`/drivers/list/${year}`).catch(() => null),
    fetchRaceOpti("/basicdata/driversReferential", { page: 1, pageSize: 1200 }).catch(() => null)
  ]);
  report.raceoptidata_health.calendar = Array.isArray(calendar?.calendar) && calendar.calendar.length > 0;
  report.raceoptidata_health.drivers = Array.isArray(seasonDrivers?.driversList) && seasonDrivers.driversList.length > 0;
  report.raceoptidata_health.drivers_referential = Array.isArray(referential?.drivers) && referential.drivers.length > 0;

  const meetings = (await getMeetings(year)).slice(0, 6);
  for (const meeting of meetings) {
    const sessions = await getSessions(meeting.meeting_key, year);
    const driverPool = sessions.length ? await getDrivers(sessions[0].session_key, year) : [];
    const driverNumber = driverPool[0]?.id || "";
    const driverCode = driverNumber ? await getRaceOptiDriverCodeByNumber(driverNumber).catch(() => "") : "";
    if (driverNumber) report.tested_drivers.push({ meeting_key: meeting.meeting_key, driver_number: driverNumber, driver_code: driverCode || "N/A" });
    report.tested_gp.push({
      meeting_key: meeting.meeting_key,
      gp_label: meeting.gp_label,
      round: meeting.round ?? null,
      sessions_available: sessions.map(item => item.type_key)
    });

    for (const sessionType of sessionTypes) {
      const sessionExists = sessions.some(item => item.type_key === sessionType);
      const row = {
        meeting_key: meeting.meeting_key,
        gp_label: meeting.gp_label,
        session_type: sessionType,
        session_exists: sessionExists,
        raceoptidata_direct: supportedByRaceOpti.has(sessionType),
        raceoptidata_ok: false,
        fallback: supportedByRaceOpti.has(sessionType) ? [] : ["openf1", "fastf1"]
      };
      if (sessionExists && supportedByRaceOpti.has(sessionType) && Number.isFinite(Number(meeting.round)) && driverCode) {
        const sessionCode = toRaceOptiSessionCode(sessionType);
        const checks = await Promise.all([
          fetchRaceOpti(`/bestlap/${year}/${meeting.round}`, { session: sessionCode }).catch(() => null),
          sessionType === "qualy"
            ? fetchRaceOpti(`/qualifstats/report/${year}/${meeting.round}/${driverCode}`).catch(() => null)
            : fetchRaceOpti(`/racestats/${year}/${meeting.round}/${sessionCode}/${driverCode}`).catch(() => null),
          sessionType === "qualy"
            ? Promise.resolve({ skip: true })
            : fetchRaceOpti(`/racestats/tyre-strategy/${year}/${meeting.round}/${driverCode}`, { session: sessionCode }).catch(() => null)
        ]);
        const okCount = checks.filter(Boolean).length;
        row.raceoptidata_ok = okCount >= 2;
        if (row.raceoptidata_ok) report.raceoptidata_success_count += 1;
        else {
          row.fallback = ["openf1", "fastf1"];
          report.raceoptidata_fail_count += 1;
        }
      } else if (sessionExists && supportedByRaceOpti.has(sessionType)) {
        report.raceoptidata_fail_count += 1;
        row.fallback = ["openf1", "fastf1"];
      }
      report.tested_sessions.push(row);
    }
  }

  report.tested_drivers = report.tested_drivers.slice(0, 12);
  return report;
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
  buildTelemetryDebugReport,
  buildRaceOptiCoverageReport,
  buildDriverTelemetry,
  getDrivers,
  getEntities,
  getMeetings,
  getSessions,
  parseYear,
  resolveTelemetryContext
};
