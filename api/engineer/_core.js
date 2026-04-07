import { spawn } from "node:child_process";
import { setDefaultResultOrder } from "node:dns";
import { getSnapshotIndex, summarizeMeetingReadiness } from "./_snapshots.js";

setDefaultResultOrder("ipv4first");

const OPENF1_BASE_URL = "https://api.openf1.org/v1";
const RACEOPTIDATA_BASE_URL = "https://api.raceoptidata.com";
const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";
const DEFAULT_YEAR = 2026;
const SUPPORTED_SESSION_TYPES = ["fp1", "fp2", "fp3", "qualy", "race", "sprint_qualy", "sprint_race"];

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 20,
  drivers: 1000 * 60 * 15,
  context: 1000 * 60 * 8,
  telemetry: 1000 * 60 * 6,
  fastf1: 1000 * 60 * 20,
  raceoptidata: 1000 * 60 * 30,
  jolpica: 1000 * 60 * 60
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
  raceoptidata: new Map(),
  jolpica: new Map()
};
const sourceHealth = {
  raceoptidata: { ok: true, last_error: null, last_success_ts: null },
  jolpica: { ok: true, last_error: null, last_success_ts: null },
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

function shouldUseCurlFallback(error) {
  const code = String(error?.code || error?.cause?.code || "").trim().toUpperCase();
  return ["ENETUNREACH", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].includes(code);
}

async function fetchJsonViaCurl(url, headers = {}) {
  const args = ["-sS", "--fail", "--connect-timeout", "10", "--max-time", "30"];
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (!key || value === undefined || value === null || value === "") return;
    args.push("-H", `${key}: ${value}`);
  });
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", error => reject(error));
    child.on("close", code => {
      if (code !== 0) {
        const error = new Error(`CURL_HTTP_FAILED_${code}`);
        error.code = "CURL_HTTP_FAILED";
        error.details = stderr.trim();
        reject(error);
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "null");
        resolve(parsed);
      } catch (error) {
        const parseError = new Error("CURL_JSON_PARSE_FAILED");
        parseError.code = "CURL_JSON_PARSE_FAILED";
        parseError.details = String(error?.message || "");
        reject(parseError);
      }
    });
  });
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
  const requestUrl = `${OPENF1_BASE_URL}/${endpoint}?${query.toString()}`;
  const headers = { "User-Agent": "RaceControlEngineer/6.0" };
  try {
    response = await fetch(requestUrl, {
      headers,
      cache: "no-store"
    });
  } catch (error) {
    if (shouldUseCurlFallback(error)) {
      telemetryLog("warn", "openf1.fetch_failed_retrying_with_curl", { endpoint, reason: String(error?.cause?.code || error?.code || error?.message || "OPENF1_FETCH_ERROR") });
      const curlPayload = await fetchJsonViaCurl(requestUrl, headers);
      sourceHealth.openf1 = {
        ok: true,
        last_success_ts: Date.now(),
        last_error: null
      };
      return Array.isArray(curlPayload) ? curlPayload : [];
    }
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

async function fetchJolpica(pathname = "") {
  const trimmed = String(pathname || "").trim().replace(/^\/+/, "");
  const url = `${JOLPICA_BASE_URL}/${trimmed}`;
  let response;
  const headers = { "User-Agent": "RaceControlEngineer/8.0" };
  try {
    response = await fetch(url, {
      headers,
      cache: "no-store"
    });
  } catch (error) {
    if (shouldUseCurlFallback(error)) {
      telemetryLog("warn", "jolpica.fetch_failed_retrying_with_curl", { path: pathname, reason: String(error?.cause?.code || error?.code || error?.message || "JOLPICA_FETCH_ERROR") });
      const curlPayload = await fetchJsonViaCurl(url, headers);
      sourceHealth.jolpica = {
        ok: true,
        last_success_ts: Date.now(),
        last_error: null
      };
      return curlPayload || {};
    }
    sourceHealth.jolpica = {
      ok: false,
      last_success_ts: sourceHealth.jolpica.last_success_ts,
      last_error: {
        path: pathname,
        reason: String(error?.code || error?.message || "JOLPICA_FETCH_ERROR"),
        ts: Date.now()
      }
    };
    throw error;
  }
  if (!response.ok) {
    sourceHealth.jolpica = {
      ok: false,
      last_success_ts: sourceHealth.jolpica.last_success_ts,
      last_error: {
        path: pathname,
        reason: `HTTP_${response.status}`,
        ts: Date.now()
      }
    };
    const error = new Error(`Jolpica ${pathname} (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  sourceHealth.jolpica = {
    ok: true,
    last_success_ts: Date.now(),
    last_error: null
  };
  return payload || {};
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
  const headers = {
    "User-Agent": "RaceControlEngineer/7.0",
    "x-api-key": apiKey,
    accept: "application/json"
  };
  try {
    response = await fetch(url.toString(), {
      headers,
      cache: "no-store"
    });
  } catch (error) {
    if (shouldUseCurlFallback(error)) {
      telemetryLog("warn", "raceoptidata.fetch_failed_retrying_with_curl", { path: pathname, reason: String(error?.cause?.code || error?.code || error?.message || "RACEOPTIDATA_FETCH_FAILED") });
      const curlPayload = await fetchJsonViaCurl(url.toString(), headers);
      sourceHealth.raceoptidata = { ok: true, last_success_ts: Date.now(), last_error: null };
      return curlPayload;
    }
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

function normalizeSlug(value = "") {
  return normalizeKey(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
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

function buildMeetingSearchBag(meeting = {}) {
  const values = [
    meeting.gp_label,
    meeting.meeting_name,
    meeting.country_name,
    meeting.location,
    meeting.circuit_short_name
  ]
    .map(item => cleanLabel(item || ""))
    .filter(Boolean);
  return new Set(values.map(normalizeSlug).filter(Boolean));
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

function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function normalizeBooleanFlagOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (["true", "1", "yes", "y"].includes(raw)) return true;
  if (["false", "0", "no", "n"].includes(raw)) return false;
  return null;
}

function getLapReferenceSelection(lapsRows = []) {
  const candidates = lapsRows
    .map(item => {
      const lapNumber = parseMaybeNumber(item?.lap_number);
      const lapTime = parseMaybeNumber(item?.lap_duration);
      const sector1 = parseMaybeNumber(item?.duration_sector_1);
      const sector2 = parseMaybeNumber(item?.duration_sector_2);
      const sector3 = parseMaybeNumber(item?.duration_sector_3);
      const sectorValues = [sector1, sector2, sector3];
      const finiteSectors = sectorValues.filter(Number.isFinite);
      const hasAnySector = finiteSectors.length > 0;
      const hasFullSectors = finiteSectors.length === 3;
      const hasBrokenSectorValue = finiteSectors.some(value => value <= 0);
      const sectorsSum = hasFullSectors ? (sector1 + sector2 + sector3) : Number.NaN;
      const sectorsCoherent = hasFullSectors
        ? Number.isFinite(lapTime) && lapTime > 0 && Math.abs(sectorsSum - lapTime) <= 0.9
        : true;

      const isAccurate = normalizeBooleanFlagOrNull(item?.is_accurate)
        ?? normalizeBooleanFlagOrNull(item?.lap_is_accurate)
        ?? normalizeBooleanFlagOrNull(item?.accurate);
      const isDeleted = normalizeBooleanFlag(item?.is_deleted)
        || normalizeBooleanFlag(item?.deleted)
        || normalizeBooleanFlag(item?.is_lap_deleted);
      const invalidByFlags = (normalizeBooleanFlagOrNull(item?.is_valid) === false)
        || (normalizeBooleanFlagOrNull(item?.is_valid_lap) === false)
        || normalizeBooleanFlag(item?.is_invalid)
        || normalizeBooleanFlag(item?.invalid);
      const isPitIn = normalizeBooleanFlag(item?.is_pit_in_lap);
      const isPitOut = normalizeBooleanFlag(item?.is_pit_out_lap);
      const lapTimeValid = Number.isFinite(lapTime) && lapTime > 0;
      const hasConsistentTiming = lapTimeValid && !hasBrokenSectorValue && sectorsCoherent;

      return {
        raw: item,
        lapNumber,
        lapTime,
        isPitIn,
        isPitOut,
        isDeleted,
        invalidByFlags,
        isAccurate,
        lapTimeValid,
        hasConsistentTiming
      };
    })
    .filter(item => Number.isFinite(item.lapNumber));

  const afterBox = candidates.filter(item => !item.isPitIn && !item.isPitOut);
  const afterDeleted = afterBox.filter(item => !item.isDeleted && !item.invalidByFlags);
  const strictPool = afterDeleted.filter(item => item.hasConsistentTiming && (item.isAccurate !== false));
  const consistentPool = afterDeleted.filter(item => item.hasConsistentTiming);
  const timedPool = afterDeleted.filter(item => item.lapTimeValid);
  const deletedTimedPool = afterBox.filter(item => item.lapTimeValid && !item.invalidByFlags);

  const strictChosen = [...strictPool].sort((a, b) => a.lapTime - b.lapTime)[0] || null;
  const consistentChosen = [...consistentPool].sort((a, b) => a.lapTime - b.lapTime)[0] || null;
  const timedChosen = [...timedPool].sort((a, b) => a.lapTime - b.lapTime)[0] || null;
  const deletedChosen = [...deletedTimedPool].sort((a, b) => a.lapTime - b.lapTime)[0] || null;
  const chosen = strictChosen || consistentChosen || timedChosen || deletedChosen || null;
  const fallbackLevel = strictChosen ? 1 : (consistentChosen ? 2 : (timedChosen ? 3 : (deletedChosen ? 4 : 5)));
  const reasonIfNoReference = chosen
    ? null
    : afterBox.length === 0
      ? "ALL_LAPS_FILTERED_BY_PIT_IN_OUT"
      : afterDeleted.length === 0
        ? "ALL_LAPS_FILTERED_BY_INVALID_OR_DELETED"
        : timedPool.length === 0
          ? "NO_LAP_WITH_VALID_TIME"
          : "REFERENCE_NOT_AVAILABLE";

  return {
    candidates,
    chosen,
    fallbackLevel,
    reasonIfNoReference,
    stats: {
      total_laps_considered: candidates.length,
      laps_after_box_filter: afterBox.length,
      laps_after_deleted_filter: afterDeleted.length,
      laps_after_accuracy_filter: strictPool.length,
      laps_after_consistency_filter: consistentPool.length,
      laps_after_valid_time_filter: timedPool.length,
      chosen_reference_lap: chosen?.lapNumber ?? null,
      fallback_level_used: fallbackLevel,
      reason_if_no_reference: reasonIfNoReference
    }
  };
}

function buildOpenF1LapProfiles(lapsRows = [], carDataRows = []) {
  const referenceSelection = getLapReferenceSelection(lapsRows);
  const sortedLaps = lapsRows
    .map(item => {
      const lapNumber = parseMaybeNumber(item.lap_number);
      const lapTime = parseMaybeNumber(item.lap_duration);
      const startMs = parseDateMs(item.date_start);
      const endMs = Number.isFinite(startMs) && Number.isFinite(lapTime) ? startMs + (lapTime * 1000) : Number.NaN;
      return {
        lapNumber,
        lapTime,
        startMs,
        endMs,
        isPitIn: normalizeBooleanFlag(item.is_pit_in_lap),
        isPitOut: normalizeBooleanFlag(item.is_pit_out_lap),
        isDeleted: normalizeBooleanFlag(item.is_deleted) || normalizeBooleanFlag(item.deleted) || normalizeBooleanFlag(item.is_lap_deleted),
        isInvalid: normalizeBooleanFlag(item.is_invalid) || normalizeBooleanFlag(item.invalid),
        isAccurate: normalizeBooleanFlagOrNull(item.is_accurate) ?? normalizeBooleanFlagOrNull(item.lap_is_accurate) ?? normalizeBooleanFlagOrNull(item.accurate),
        isValid: Number.isFinite(lapTime) && lapTime > 0
      };
    })
    .filter(item => Number.isFinite(item.lapNumber))
    .sort((a, b) => a.lapNumber - b.lapNumber);

  const timedCarData = carDataRows
    .map(item => ({ ...item, __ms: parseDateMs(item.date) }))
    .filter(item => Number.isFinite(item.__ms))
    .sort((a, b) => a.__ms - b.__ms);

  const lapTraces = {};
  const lapCatalog = sortedLaps.map((lap, idx) => {
    const nextStartMs = Number.isFinite(sortedLaps[idx + 1]?.startMs) ? sortedLaps[idx + 1].startMs : Number.NaN;
    const effectiveStart = Number.isFinite(lap.startMs) ? lap.startMs : Number.NaN;
    const effectiveEnd = Number.isFinite(lap.endMs)
      ? lap.endMs
      : (Number.isFinite(nextStartMs) ? nextStartMs : Number.NaN);
    const lapSamples = timedCarData.filter(sample => {
      if (!Number.isFinite(effectiveStart) || !Number.isFinite(effectiveEnd)) return false;
      return sample.__ms >= effectiveStart && sample.__ms <= effectiveEnd;
    });

    const speed = buildLineFromSamples(lapSamples, item => parseMaybeNumber(item.speed), 36);
    const throttle = buildLineFromSamples(lapSamples, item => parseMaybeNumber(item.throttle), 36);
    const brake = buildLineFromSamples(lapSamples, item => parseMaybeNumber(item.brake), 36);
    const gear = buildLineFromSamples(lapSamples, item => parseMaybeNumber(item.n_gear), 36);
    const rpm = buildLineFromSamples(lapSamples, item => parseMaybeNumber(item.rpm), 36);
    const drs = buildLineFromSamples(lapSamples, item => parseMaybeNumber(item.drs), 36);
    const relativeDistance = speed.length
      ? speed.map((_, pos, arr) => Number((arr.length <= 1 ? 0 : (pos / (arr.length - 1))).toFixed(4)))
      : [];

    const hasSpeedTrace = speed.length >= 6;
    const hasControlTrace = throttle.length >= 4 || brake.length >= 4;
    const hasPowerTrace = gear.length >= 6 || rpm.length >= 6;
    const hasTelemetry = hasSpeedTrace || hasControlTrace || hasPowerTrace;
    const matchingSelection = referenceSelection.candidates.find(item => item.lapNumber === lap.lapNumber) || null;
    const hasUsefulTiming = !!matchingSelection?.lapTimeValid && !lap.isPitIn && !lap.isPitOut && !lap.isInvalid;
    const hasCoreTrace = hasSpeedTrace && hasControlTrace;
    let status = "invalid";
    if (!hasTelemetry) status = "no_trace";
    else if (lap.isPitIn || lap.isPitOut) status = "pit";
    else if (lap.isDeleted) status = "deleted";
    else if (lap.isInvalid) status = "invalid";
    else if (!hasCoreTrace) status = "partial_trace";
    else if (lap.isValid) status = "valid";

    lapTraces[String(lap.lapNumber)] = {
      speed,
      throttle,
      brake,
      gear,
      rpm,
      drs,
      distance: [],
      relativeDistance
    };

    return {
      lapNumber: lap.lapNumber,
      lapTime: lap.lapTime,
      isValid: lap.isValid,
      isPitIn: lap.isPitIn,
      isPitOut: lap.isPitOut,
      isDeleted: lap.isDeleted,
      isInvalid: lap.isInvalid,
      isAccurate: lap.isAccurate,
      hasTelemetry,
      hasCoreTrace,
      telemetryChannels: {
        speed: hasSpeedTrace,
        controls: hasControlTrace,
        powerUnit: hasPowerTrace
      },
      hasUsefulTiming,
      status
    };
  });

  const reference = referenceSelection.chosen
    ? lapCatalog.find(item => item.lapNumber === referenceSelection.chosen.lapNumber && item.hasTelemetry)
      || lapCatalog.find(item => item.lapNumber === referenceSelection.chosen.lapNumber)
      || null
    : null;
  const latest = [...lapCatalog]
    .reverse()
    .find(item => item.hasTelemetry && item.hasUsefulTiming)
    || [...lapCatalog].reverse().find(item => item.hasTelemetry)
    || null;

  return {
    lapCatalog,
    lapTraces,
    selection: {
      referenceLapNumber: reference?.lapNumber ?? null,
      latestLapNumber: latest?.lapNumber ?? null,
      fallbackLevel: referenceSelection.fallbackLevel,
      reasonIfNoReference: referenceSelection.reasonIfNoReference
    },
    diagnostics: referenceSelection.stats
  };
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

async function getJolpicaCalendar(year = DEFAULT_YEAR) {
  const key = `jolpica:calendar:${year}`;
  const cached = getCached(cache.jolpica, key, TTL.jolpica);
  if (cached) return cached;
  const payload = await fetchJolpica(`${year}/races.json`).catch(() => ({}));
  const rows = Array.isArray(payload?.MRData?.RaceTable?.Races) ? payload.MRData.RaceTable.Races : [];
  const calendar = rows.map(row => {
    const round = parseMaybeNumber(row.round);
    const raceName = cleanLabel(row.raceName || "");
    const country = cleanLabel(row?.Circuit?.Location?.country || "");
    const locality = cleanLabel(row?.Circuit?.Location?.locality || "");
    const circuitName = cleanLabel(row?.Circuit?.circuitName || "");
    return {
      round,
      raceName,
      country,
      locality,
      circuitName,
      date: row.date || "",
      time: row.time || "",
      sort_ts: parseDateMs(`${row.date || ""}T${row.time || "00:00:00Z"}`)
    };
  }).filter(item => Number.isFinite(item.round));
  return setCached(cache.jolpica, key, calendar);
}

function normalizeJolpicaDriver(entry = {}) {
  const first = cleanLabel(entry?.Driver?.givenName || entry?.givenName || "");
  const last = cleanLabel(entry?.Driver?.familyName || entry?.familyName || "");
  const fullName = normalizeDriverDisplayName(`${first} ${last}`.trim() || cleanLabel(entry.fullName || ""));
  const constructor = cleanLabel(entry?.Constructor?.name || entry?.constructor || "");
  return {
    number: String(entry?.Driver?.permanentNumber || entry?.number || "").trim(),
    code: String(entry?.Driver?.code || entry?.code || "").trim().toUpperCase(),
    driverId: String(entry?.Driver?.driverId || entry?.driverId || "").trim().toLowerCase(),
    fullName,
    constructor
  };
}

async function getJolpicaDriversByRound(year = DEFAULT_YEAR, round) {
  const roundNumber = Number(round);
  if (!Number.isFinite(roundNumber)) return [];
  const key = `jolpica:drivers:${year}:round:${roundNumber}`;
  const cached = getCached(cache.jolpica, key, TTL.jolpica);
  if (cached) return cached;

  const [resultsPayload, qualyPayload, sprintPayload] = await Promise.all([
    fetchJolpica(`${year}/${roundNumber}/results.json`).catch(() => ({})),
    fetchJolpica(`${year}/${roundNumber}/qualifying.json`).catch(() => ({})),
    fetchJolpica(`${year}/${roundNumber}/sprint.json`).catch(() => ({}))
  ]);

  const collect = [];
  const race = resultsPayload?.MRData?.RaceTable?.Races?.[0];
  if (Array.isArray(race?.Results)) collect.push(...race.Results.map(normalizeJolpicaDriver));
  const qualy = qualyPayload?.MRData?.RaceTable?.Races?.[0];
  if (Array.isArray(qualy?.QualifyingResults)) collect.push(...qualy.QualifyingResults.map(normalizeJolpicaDriver));
  const sprint = sprintPayload?.MRData?.RaceTable?.Races?.[0];
  if (Array.isArray(sprint?.SprintResults)) collect.push(...sprint.SprintResults.map(normalizeJolpicaDriver));

  const byId = new Map();
  collect.forEach(item => {
    const keyByNumber = item.number ? `num:${item.number}` : "";
    const keyByDriverId = item.driverId ? `id:${item.driverId}` : "";
    const keyByCode = item.code ? `code:${item.code}` : "";
    const key = keyByNumber || keyByDriverId || keyByCode;
    if (!key) return;
    const current = byId.get(key) || { ...item };
    current.fullName = pickBetterDriverName(current.fullName, item.fullName);
    current.constructor = current.constructor || item.constructor;
    byId.set(key, current);
  });
  return setCached(cache.jolpica, key, [...byId.values()]);
}

async function getJolpicaWeekendProfile(year = DEFAULT_YEAR, round) {
  const roundNumber = Number(round);
  if (!Number.isFinite(roundNumber)) return { sprintWeekend: false, expectedSessionTypes: ["fp1", "fp2", "fp3", "qualy", "race"] };
  const key = `jolpica:weekend:${year}:${roundNumber}`;
  const cached = getCached(cache.jolpica, key, TTL.jolpica);
  if (cached) return cached;
  const sprintPayload = await fetchJolpica(`${year}/${roundNumber}/sprint.json`).catch(() => ({}));
  const sprintRace = sprintPayload?.MRData?.RaceTable?.Races?.[0];
  const sprintWeekend = Array.isArray(sprintRace?.SprintResults) && sprintRace.SprintResults.length > 0;
  const profile = {
    sprintWeekend,
    expectedSessionTypes: sprintWeekend
      ? ["fp1", "sprint_qualy", "sprint_race", "qualy", "race"]
      : ["fp1", "fp2", "fp3", "qualy", "race"]
  };
  return setCached(cache.jolpica, key, profile);
}

async function getMeetings(year = DEFAULT_YEAR) {
  const key = `meetings:${year}`;
  const cached = getCached(cache.meetings, key, TTL.meetings);
  if (cached) return cached;

  const [meetings, jolpicaCalendar] = await Promise.all([
    fetchOpenF1WithRetry("meetings", { year }).catch(() => []),
    getJolpicaCalendar(year).catch(() => [])
  ]);
  if (!meetings.length) {
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
      const bag = buildMeetingSearchBag({ ...item, gp_label: preferredBase });
      const jolpicaMatch = jolpicaCalendar.find(jol => {
        const options = [jol.raceName, jol.country, jol.locality, jol.circuitName]
          .map(normalizeSlug)
          .filter(Boolean);
        return options.some(opt => bag.has(opt));
      });
      const canonicalGpName = cleanLabel(jolpicaMatch?.raceName || preferredBase);
      return {
        ...item,
        gp_label: gpLabelFromMeeting({ ...item, location: canonicalGpName, country_name: canonicalGpName }),
        canonical_gp_name: canonicalGpName,
        round_from_jolpica: Number.isFinite(jolpicaMatch?.round) ? jolpicaMatch.round : null,
        calendar_date: jolpicaMatch?.date || item.date_start || ""
      };
    })
    .sort((a, b) => {
      const aRound = Number.isFinite(a.round_from_jolpica) ? a.round_from_jolpica : Number.MAX_SAFE_INTEGER;
      const bRound = Number.isFinite(b.round_from_jolpica) ? b.round_from_jolpica : Number.MAX_SAFE_INTEGER;
      if (aRound !== bRound) return aRound - bRound;
      const aTs = Number.isFinite(a.sort_ts) ? a.sort_ts : parseDateMs(a.calendar_date || "");
      const bTs = Number.isFinite(b.sort_ts) ? b.sort_ts : parseDateMs(b.calendar_date || "");
      if (aTs !== bTs) return aTs - bTs;
      return a.gp_label.localeCompare(b.gp_label);
    });
  const payload = payloadBase.map((item, idx) => ({
    ...item,
    round: Number.isFinite(item.round_from_jolpica) ? item.round_from_jolpica : idx + 1
  }));

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
  const meetings = await getMeetings(year).catch(() => []);
  const selectedMeeting = meetings.find(item => item.meeting_key === String(meetingKey));
  const weekendProfile = await getJolpicaWeekendProfile(year, selectedMeeting?.round).catch(() => ({
    sprintWeekend: false,
    expectedSessionTypes: ["fp1", "fp2", "fp3", "qualy", "race"]
  }));
  const sessionOrder = new Map(weekendProfile.expectedSessionTypes.map((type, index) => [type, index]));
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
        date_end: row.date_end || row.session_end_date || "",
        year: getYearFromRow(row)
      };
    })
    .filter(item => item.session_key && item.meeting_key === String(meetingKey) && item.year === year && SUPPORTED_SESSION_TYPES.includes(item.type_key))
    .sort((a, b) => {
      const aOrder = sessionOrder.has(a.type_key) ? sessionOrder.get(a.type_key) : Number.MAX_SAFE_INTEGER;
      const bOrder = sessionOrder.has(b.type_key) ? sessionOrder.get(b.type_key) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(a.date_start).getTime() - new Date(b.date_start).getTime();
    });

  return setCached(cache.sessionsByMeeting, key, payload);
}

async function getDrivers(sessionKey, year = DEFAULT_YEAR) {
  const key = `drivers:${year}:${sessionKey}`;
  const cached = getCached(cache.driversBySession, key, TTL.drivers);
  if (cached) return cached;

  const [sessionRows, driversRows, lapsRows, resultRows, positionRows, stintsRows, carDataRows] = await Promise.all([
    fetchOpenF1WithRetry("sessions", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("drivers", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("laps", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("session_result", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("position", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("stints", { session_key: sessionKey }, { retries: 1 }).catch(() => []),
    fetchOpenF1WithRetry("car_data", { session_key: sessionKey }, { retries: 1 }).catch(() => [])
  ]);

  const byDriver = new Map();
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

  const meetingKey = String(sessionRows?.[0]?.meeting_key || "").trim();
  const meetings = meetingKey ? await getMeetings(year).catch(() => []) : [];
  const meeting = meetings.find(item => item.meeting_key === meetingKey);
  const jolpicaDrivers = meeting?.round ? await getJolpicaDriversByRound(year, meeting.round).catch(() => []) : [];
  const jolpicaByNumber = new Map(jolpicaDrivers.map(item => [String(item.number || "").trim(), item]));

  const enriched = [...byDriver.values()].map(item => {
    const jolpica = jolpicaByNumber.get(String(item.id || "").trim());
    const name = pickBetterDriverName(item.name, jolpica?.fullName || "");
    const team = cleanLabel(item.team || jolpica?.constructor || "");
    return {
      id: item.id,
      name,
      team,
      headshot: item.headshot,
      source: jolpica ? "openf1+jolpica" : (item.source || "openf1")
    };
  });

  if (!enriched.length && jolpicaDrivers.length) {
    jolpicaDrivers.forEach(item => {
      if (!item.number || !item.fullName) return;
      enriched.push({
        id: item.number,
        name: item.fullName,
        team: item.constructor || "",
        headshot: "",
        source: "jolpica"
      });
    });
  }

  const drivers = enriched
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

  const hasWeatherRows = Array.isArray(weather) && weather.length > 0;
  return {
    avgTrackTemp: average(weather.map(item => parseMaybeNumber(item.track_temperature))),
    avgAirTemp: average(weather.map(item => parseMaybeNumber(item.air_temperature))),
    weatherState: hasWeatherRows
      ? (weather.some(item => Number(item.rainfall) > 0) ? "Lluvia" : "Seco")
      : null,
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

async function getDriverMetricsOpenF1(sessionKey, driverNumber, options = {}) {
  const includeTraces = options.includeTraces !== false;
  const [lapsRows, carDataRows, stintsRows, positionRows, resultRows] = await Promise.all([
    fetchOpenF1WithRetry("laps", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    includeTraces
      ? fetchOpenF1WithRetry("car_data", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => [])
      : Promise.resolve([]),
    fetchOpenF1WithRetry("stints", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    fetchOpenF1WithRetry("position", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => []),
    fetchOpenF1WithRetry("session_result", { session_key: sessionKey, driver_number: driverNumber }, { retries: 2 }).catch(() => [])
  ]);

  const lapTimes = lapsRows.map(item => parseMaybeNumber(item.lap_duration)).filter(Number.isFinite);
  const referenceSelection = getLapReferenceSelection(lapsRows);
  const sectors = {
    sector1: average(lapsRows.map(item => parseMaybeNumber(item.duration_sector_1))),
    sector2: average(lapsRows.map(item => parseMaybeNumber(item.duration_sector_2))),
    sector3: average(lapsRows.map(item => parseMaybeNumber(item.duration_sector_3)))
  };

  const topSpeedCandidates = includeTraces
    ? [...carDataRows.map(item => parseMaybeNumber(item.speed)), ...resultRows.map(item => parseMaybeNumber(item.top_speed))].filter(Number.isFinite)
    : resultRows.map(item => parseMaybeNumber(item.top_speed)).filter(Number.isFinite);

  const speedTrapCandidates = [
    ...lapsRows.map(item => parseMaybeNumber(item.st_speed)),
    ...resultRows.map(item => parseMaybeNumber(item.speed_trap))
  ].filter(Number.isFinite);

  const speedProfile = includeTraces ? buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.speed), 36) : [];
  const throttleProfile = includeTraces ? buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.throttle), 36) : [];
  const brakeProfile = includeTraces ? buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.brake), 36) : [];
  const gearProfile = includeTraces ? buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.n_gear), 36) : [];
  const rpmProfile = includeTraces ? buildLineFromSamples(carDataRows, item => parseMaybeNumber(item.rpm), 36) : [];
  const openF1LapProfiles = includeTraces ? buildOpenF1LapProfiles(lapsRows, carDataRows) : { lapCatalog: [], lapTraces: {}, selection: { referenceLapNumber: null, latestLapNumber: null } };
  const selectedReferenceLap = Number.isFinite(openF1LapProfiles.selection?.referenceLapNumber)
    ? openF1LapProfiles.lapTraces[String(openF1LapProfiles.selection.referenceLapNumber)]
    : null;

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
    referenceLap: Number.isFinite(referenceSelection?.chosen?.lapTime) ? referenceSelection.chosen.lapTime : null,
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
      speed: selectedReferenceLap?.speed?.length ? selectedReferenceLap.speed : speedProfile,
      throttle: selectedReferenceLap?.throttle?.length ? selectedReferenceLap.throttle : throttleProfile,
      brake: selectedReferenceLap?.brake?.length ? selectedReferenceLap.brake : brakeProfile,
      gear: selectedReferenceLap?.gear?.length ? selectedReferenceLap.gear : gearProfile,
      rpm: selectedReferenceLap?.rpm?.length ? selectedReferenceLap.rpm : rpmProfile,
      drs: selectedReferenceLap?.drs || [],
      distance: selectedReferenceLap?.distance || [],
      relativeDistance: selectedReferenceLap?.relativeDistance || []
    },
    lapCatalog: openF1LapProfiles.lapCatalog,
    lapTraces: openF1LapProfiles.lapTraces,
    lapSelection: openF1LapProfiles.selection,
    referenceSelection: referenceSelection.stats,
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
      },
      reference_selection: referenceSelection.stats
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
  const referenceSelection = getLapReferenceSelection(lapsRows);
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
    referenceLap: Number.isFinite(referenceSelection?.chosen?.lapTime) ? referenceSelection.chosen.lapTime : null,
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
      },
      reference_selection: referenceSelection.stats
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
    import pandas as pd
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
    schedule = fastf1.get_event_schedule(2026, include_testing=False)
    event = fastf1.get_event(2026, meeting_name)
    session_code = session_map.get(session_type, "R")
    session = fastf1.get_session(2026, meeting_name, session_code)
    session.load(laps=True, telemetry=True, weather=True, messages=True)

    driver_laps_all = session.laps.pick_drivers([driver_number])
    laps = driver_laps_all.pick_quicklaps()
    if laps.empty:
        laps = driver_laps_all
    if laps.empty:
        print(json.dumps({"ok": False, "reason": "NO_DRIVER_LAPS"}))
        sys.exit(0)

    lap_times = [float(item.total_seconds()) for item in laps["LapTime"].dropna().tolist()]
    if not lap_times:
        print(json.dumps({"ok": False, "reason": "NO_LAP_TIMES"}))
        sys.exit(0)

    fastest = laps.pick_fastest()
    telemetry = None
    position_data = None
    merged_tel = None

    if fastest is not None:
        try:
            telemetry = fastest.get_car_data()
        except Exception:
            telemetry = None
        try:
            position_data = fastest.get_pos_data()
        except Exception:
            position_data = None

    if telemetry is not None and not telemetry.empty:
        try:
            telemetry = telemetry.add_distance()
        except Exception:
            pass
        try:
            telemetry = telemetry.add_relative_distance()
        except Exception:
            pass

    if telemetry is not None and not telemetry.empty and position_data is not None and not position_data.empty:
        try:
            merged_tel = telemetry.merge_channels(position_data)
        except Exception:
            merged_tel = telemetry
    else:
        merged_tel = telemetry

    if merged_tel is not None and not merged_tel.empty:
        try:
            merged_tel = merged_tel.resample_channels(rule="100ms")
        except Exception:
            pass
        try:
            merged_tel = merged_tel.fill_missing()
        except Exception:
            pass

    def sample_line(values, limit=220):
        if not values:
            return []
        if len(values) <= limit:
            return values
        stride = max(1, int(len(values) / limit))
        return values[::stride][:limit]

    def to_line(frame, col, limit=220):
        if frame is None or frame.empty or col not in frame.columns:
            return []
        vals = [float(v) for v in frame[col].dropna().tolist()]
        return sample_line(vals, limit)

    def build_trace_for_lap(lap):
        try:
            car = lap.get_car_data()
        except Exception:
            car = None
        try:
            pos = lap.get_pos_data()
        except Exception:
            pos = None
        if car is None or car.empty:
            return None
        try:
            car = car.add_distance()
        except Exception:
            pass
        try:
            car = car.add_relative_distance()
        except Exception:
            pass
        merged = car
        if pos is not None and not pos.empty:
            try:
                merged = car.merge_channels(pos)
            except Exception:
                merged = car
        try:
            merged = merged.resample_channels(rule="100ms")
        except Exception:
            pass
        try:
            merged = merged.fill_missing()
        except Exception:
            pass
        if merged is None or merged.empty:
            return None
        return {
            "speed": to_line(merged, "Speed"),
            "throttle": to_line(merged, "Throttle"),
            "brake": to_line(merged, "Brake"),
            "gear": to_line(merged, "nGear"),
            "rpm": to_line(merged, "RPM"),
            "drs": to_line(merged, "DRS"),
            "distance": to_line(merged, "Distance"),
            "relativeDistance": to_line(merged, "RelativeDistance"),
            "x": to_line(merged, "X"),
            "y": to_line(merged, "Y")
        }

    traces_by_lap = {}
    lap_catalog = []
    reference_lap_number = None
    latest_lap_number = None
    best_lap_time = None
    ordered_laps = driver_laps_all.dropna(subset=["LapNumber"]).sort_values("LapNumber")
    for _, lap in ordered_laps.tail(35).iterrows():
        lap_no = int(lap["LapNumber"]) if pd.notna(lap["LapNumber"]) else None
        if lap_no is None:
            continue
        lap_time = float(lap["LapTime"].total_seconds()) if pd.notna(lap.get("LapTime", None)) else None
        has_useful_timing = lap_time is not None and lap_time > 0
        is_pit = pd.notna(lap.get("PitInTime", None)) or pd.notna(lap.get("PitOutTime", None))
        status = "pit" if is_pit else ("valid" if has_useful_timing else "invalid")
        latest_lap_number = lap_no

        trace_payload = build_trace_for_lap(lap)
        has_trace = isinstance(trace_payload, dict) and len(trace_payload.get("speed", [])) > 0
        if has_trace:
            traces_by_lap[str(lap_no)] = trace_payload

        if has_useful_timing and (best_lap_time is None or lap_time < best_lap_time):
            best_lap_time = lap_time
            reference_lap_number = lap_no

        lap_catalog.append({
            "lapNumber": lap_no,
            "lapTime": lap_time,
            "status": status,
            "hasTelemetry": has_trace,
            "hasUsefulTiming": has_useful_timing
        })

    if reference_lap_number is None and lap_catalog:
        reference_lap_number = lap_catalog[0].get("lapNumber", None)
    primary_traces = traces_by_lap.get(str(reference_lap_number), {}) if reference_lap_number is not None else {}
    speed_line = sample_line(primary_traces.get("speed", []), 220)
    throttle_line = sample_line(primary_traces.get("throttle", []), 220)
    brake_line = sample_line(primary_traces.get("brake", []), 220)
    gear_line = sample_line(primary_traces.get("gear", []), 220)
    rpm_line = sample_line(primary_traces.get("rpm", []), 220)
    distance_line = sample_line(primary_traces.get("distance", []), 220)
    relative_distance_line = sample_line(primary_traces.get("relativeDistance", []), 220)
    x_line = sample_line(primary_traces.get("x", []), 220)
    y_line = sample_line(primary_traces.get("y", []), 220)
    drs_line = sample_line(primary_traces.get("drs", []), 220)

    sector1 = None
    sector2 = None
    sector3 = None
    if "Sector1Time" in laps.columns:
        vals = [float(item.total_seconds()) for item in laps["Sector1Time"].dropna().tolist()]
        sector1 = sum(vals)/len(vals) if vals else None
    if "Sector2Time" in laps.columns:
        vals = [float(item.total_seconds()) for item in laps["Sector2Time"].dropna().tolist()]
        sector2 = sum(vals)/len(vals) if vals else None
    if "Sector3Time" in laps.columns:
        vals = [float(item.total_seconds()) for item in laps["Sector3Time"].dropna().tolist()]
        sector3 = sum(vals)/len(vals) if vals else None

    stint_rows = []
    try:
        if "Stint" in driver_laps_all.columns:
            grouped = driver_laps_all.dropna(subset=["LapNumber"]).groupby("Stint")
            for stint_id, frame in grouped:
                lap_numbers = [int(v) for v in frame["LapNumber"].dropna().tolist()]
                compounds = [str(v) for v in frame.get("Compound", pd.Series(dtype="object")).dropna().tolist()]
                stint_rows.append({
                    "number": int(stint_id) if pd.notna(stint_id) else None,
                    "compound": compounds[0] if compounds else "N/D",
                    "lapStart": min(lap_numbers) if lap_numbers else None,
                    "lapEnd": max(lap_numbers) if lap_numbers else None,
                    "laps": len(lap_numbers) if lap_numbers else None
                })
    except Exception:
        stint_rows = []

    degradation = None
    try:
        ordered = driver_laps_all.dropna(subset=["LapNumber", "LapTime"]).sort_values("LapNumber")
        laps_secs = [float(v.total_seconds()) for v in ordered["LapTime"].tolist()]
        if len(laps_secs) >= 6:
            degradation = (sum(laps_secs[-3:]) / 3) - (sum(laps_secs[:3]) / 3)
    except Exception:
        degradation = None

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

    session_status = session.session_status if hasattr(session, "session_status") else None
    track_status = session.track_status if hasattr(session, "track_status") else None
    race_control_messages = session.race_control_messages if hasattr(session, "race_control_messages") else None
    results_rows = session.results if hasattr(session, "results") else None

    driver_meta = {}
    try:
        driver_meta = session.get_driver(driver_number) or {}
    except Exception:
        driver_meta = {}

    circuit_payload = {
        "corners": 0,
        "marshalLights": 0,
        "marshalSectors": 0,
        "rotation": None
    }
    try:
        circuit = session.get_circuit_info()
        if circuit is not None:
            corners = getattr(circuit, "corners", None)
            marshal_lights = getattr(circuit, "marshal_lights", None)
            marshal_sectors = getattr(circuit, "marshal_sectors", None)
            rotation = getattr(circuit, "rotation", None)
            circuit_payload = {
                "corners": int(len(corners.index)) if corners is not None and hasattr(corners, "index") else 0,
                "marshalLights": int(len(marshal_lights.index)) if marshal_lights is not None and hasattr(marshal_lights, "index") else 0,
                "marshalSectors": int(len(marshal_sectors.index)) if marshal_sectors is not None and hasattr(marshal_sectors, "index") else 0,
                "rotation": float(rotation) if rotation is not None else None
            }
    except Exception:
        pass

    driver_position_avg = None
    try:
        if results_rows is not None and not results_rows.empty:
            filtered = results_rows[results_rows["DriverNumber"].astype(str) == str(driver_number)]
            if not filtered.empty and "Position" in filtered.columns:
                vals = [float(v) for v in filtered["Position"].dropna().tolist()]
                driver_position_avg = sum(vals)/len(vals) if vals else None
    except Exception:
        driver_position_avg = None

    evolution = []
    try:
        for maybe_code in ["FP1", "FP2", "FP3", "SQ", "S", "Q", "R"]:
            try:
                evo = fastf1.get_session(2026, meeting_name, maybe_code)
                evo.load(laps=True, telemetry=False, weather=False, messages=False)
                evo_laps = evo.laps.pick_drivers([driver_number]).pick_quicklaps()
                if evo_laps.empty:
                    evo_laps = evo.laps.pick_drivers([driver_number])
                if evo_laps.empty or "LapTime" not in evo_laps.columns:
                    continue
                evo_secs = [float(v.total_seconds()) for v in evo_laps["LapTime"].dropna().tolist()]
                if not evo_secs:
                    continue
                evo_ref = min(evo_secs)
                evo_avg = sum(evo_secs)/len(evo_secs)
                evolution.append({
                    "session_code": maybe_code,
                    "referenceLap": evo_ref,
                    "averagePace": evo_avg,
                    "deltaToReference": evo_avg - evo_ref
                })
            except Exception:
                continue
    except Exception:
        evolution = []

    print(json.dumps({
        "ok": True,
        "source": "fastf1",
        "referenceLap": min(lap_times),
        "averagePace": sum(lap_times)/len(lap_times),
        "topSpeed": max(speed_line) if speed_line else None,
        "speedTrap": max(speed_line) if speed_line else None,
        "positionAverage": driver_position_avg,
        "degradation": degradation,
        "sectors": {
            "sector1": sector1,
            "sector2": sector2,
            "sector3": sector3
        },
        "lapCount": len(lap_times),
        "totalLaps": int(session.total_laps) if hasattr(session, "total_laps") and session.total_laps is not None else None,
        "stints": stint_rows,
        "evolution": evolution,
        "traces": {
            "speed": speed_line,
            "throttle": throttle_line,
            "brake": brake_line,
            "gear": gear_line,
            "rpm": rpm_line,
            "drs": drs_line,
            "distance": distance_line,
            "relativeDistance": relative_distance_line,
            "x": x_line,
            "y": y_line
        },
        "lapContext": {
            "selection": {
                "referenceLapNumber": reference_lap_number,
                "latestLapNumber": latest_lap_number
            },
            "catalog": lap_catalog,
            "tracesByLap": traces_by_lap
        },
        "weather": {
            "avgAirTemp": avg_air,
            "avgTrackTemp": avg_track,
            "weatherState": weather_state
        },
        "context": {
            "sessionStatusCount": int(len(session_status.index)) if session_status is not None and hasattr(session_status, "index") else 0,
            "trackStatusCount": int(len(track_status.index)) if track_status is not None and hasattr(track_status, "index") else 0,
            "raceControlMessages": int(len(race_control_messages.index)) if race_control_messages is not None and hasattr(race_control_messages, "index") else 0
        },
        "event": {
            "eventName": str(event.get("EventName", "")) if hasattr(event, "get") else "",
            "eventRound": int(event.get("RoundNumber", 0)) if hasattr(event, "get") else 0,
            "scheduleRows": int(len(schedule.index)) if schedule is not None and hasattr(schedule, "index") else 0
        },
        "driverMeta": {
            "abbreviation": str(driver_meta.get("Abbreviation", "")) if hasattr(driver_meta, "get") else "",
            "teamName": str(driver_meta.get("TeamName", "")) if hasattr(driver_meta, "get") else "",
            "fullName": str(driver_meta.get("FullName", "")) if hasattr(driver_meta, "get") else ""
        },
        "circuit": circuit_payload,
        "used_public_api": [
            "get_event_schedule", "get_event", "get_session", "Session", "Session.load",
            "drivers", "results", "laps", "total_laps", "weather_data", "car_data", "pos_data",
            "session_status", "track_status", "race_control_messages", "get_driver", "get_circuit_info",
            "Telemetry", "merge_channels", "add_distance", "add_relative_distance",
            "resample_channels", "fill_missing", "CircuitInfo", "Cache.enable_cache"
        ],
        "pipeline": ["resolve_gp", "resolve_session", "resolve_driver", "fastf1_session_load", "driver_laps", "driver_telemetry", "fallback_fill"]
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
  if (!fastf1?.ok) return { ...baseTelemetry, primarySource: baseTelemetry?.source || "openf1", sources: [baseTelemetry?.source || "openf1"] };

  const merged = {
    ...baseTelemetry,
    source: "fastf1",
    primarySource: "fastf1",
    sources: ["fastf1", baseTelemetry.source || "openf1"],
    referenceLap: Number.isFinite(fastf1.referenceLap) ? fastf1.referenceLap : baseTelemetry.referenceLap,
    averagePace: Number.isFinite(fastf1.averagePace) ? fastf1.averagePace : baseTelemetry.averagePace,
    topSpeed: Number.isFinite(fastf1.topSpeed) ? fastf1.topSpeed : baseTelemetry.topSpeed,
    speedTrap: Number.isFinite(fastf1.speedTrap) ? fastf1.speedTrap : baseTelemetry.speedTrap,
    sectors: {
      sector1: Number.isFinite(fastf1?.sectors?.sector1) ? fastf1.sectors.sector1 : baseTelemetry?.sectors?.sector1 ?? null,
      sector2: Number.isFinite(fastf1?.sectors?.sector2) ? fastf1.sectors.sector2 : baseTelemetry?.sectors?.sector2 ?? null,
      sector3: Number.isFinite(fastf1?.sectors?.sector3) ? fastf1.sectors.sector3 : baseTelemetry?.sectors?.sector3 ?? null
    },
    positionAverage: Number.isFinite(fastf1.positionAverage) ? fastf1.positionAverage : baseTelemetry.positionAverage,
    degradation: Number.isFinite(fastf1.degradation) ? fastf1.degradation : baseTelemetry.degradation,
    stints: Array.isArray(fastf1.stints) && fastf1.stints.length ? fastf1.stints : (baseTelemetry.stints || []),
    evolution: Array.isArray(fastf1.evolution) && fastf1.evolution.length ? fastf1.evolution : (baseTelemetry.evolution || []),
    traces: {
      speed: (fastf1.traces?.speed || []).length ? buildLineFromSamples(fastf1.traces.speed, item => parseMaybeNumber(item), 36) : (baseTelemetry.traces?.speed || []),
      throttle: (fastf1.traces?.throttle || []).length ? buildLineFromSamples(fastf1.traces.throttle, item => parseMaybeNumber(item), 36) : (baseTelemetry.traces?.throttle || []),
      brake: (fastf1.traces?.brake || []).length ? buildLineFromSamples(fastf1.traces.brake, item => parseMaybeNumber(item), 36) : (baseTelemetry.traces?.brake || []),
      gear: (fastf1.traces?.gear || []).length ? buildLineFromSamples(fastf1.traces.gear, item => parseMaybeNumber(item), 36) : (baseTelemetry.traces?.gear || []),
      rpm: (fastf1.traces?.rpm || []).length ? buildLineFromSamples(fastf1.traces.rpm, item => parseMaybeNumber(item), 36) : (baseTelemetry.traces?.rpm || []),
      distance: (fastf1.traces?.distance || []).length ? buildLineFromSamples(fastf1.traces.distance, item => parseMaybeNumber(item), 36) : [],
      relativeDistance: (fastf1.traces?.relativeDistance || []).length ? buildLineFromSamples(fastf1.traces.relativeDistance, item => parseMaybeNumber(item), 36) : [],
      x: (fastf1.traces?.x || []).length ? buildLineFromSamples(fastf1.traces.x, item => parseMaybeNumber(item), 36) : [],
      y: (fastf1.traces?.y || []).length ? buildLineFromSamples(fastf1.traces.y, item => parseMaybeNumber(item), 36) : []
    },
    lapCatalog: Array.isArray(baseTelemetry.lapCatalog) ? baseTelemetry.lapCatalog : [],
    lapTraces: baseTelemetry.lapTraces || {},
    lapSelection: baseTelemetry.lapSelection || { referenceLapNumber: null, latestLapNumber: null },
    fastf1Context: fastf1.context || {},
    fastf1Circuit: fastf1.circuit || {},
    fastf1Event: fastf1.event || {},
    fastf1UsedPublicApi: fastf1.used_public_api || []
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
      rpm: base?.traces?.rpm?.length ? base.traces.rpm : (enrich?.traces?.rpm || []),
      drs: base?.traces?.drs?.length ? base.traces.drs : (enrich?.traces?.drs || []),
      distance: base?.traces?.distance?.length ? base.traces.distance : (enrich?.traces?.distance || []),
      relativeDistance: base?.traces?.relativeDistance?.length ? base.traces.relativeDistance : (enrich?.traces?.relativeDistance || [])
    },
    lapCatalog: Array.isArray(base?.lapCatalog) && base.lapCatalog.length ? base.lapCatalog : (enrich?.lapCatalog || []),
    lapTraces: (base?.lapTraces && Object.keys(base.lapTraces).length) ? base.lapTraces : (enrich?.lapTraces || {}),
    lapSelection: base?.lapSelection?.referenceLapNumber || base?.lapSelection?.latestLapNumber
      ? base.lapSelection
      : (enrich?.lapSelection || { referenceLapNumber: null, latestLapNumber: null })
  };
}

async function buildSessionEvolutionSummary({ meetingKey, currentSessionKey, driverNumber, year = DEFAULT_YEAR }) {
  const sessions = await getSessions(meetingKey, year);
  const evolution = [];
  for (const session of sessions) {
    if (session.session_key === currentSessionKey) continue;
    const laps = await fetchOpenF1WithRetry("laps", { session_key: session.session_key, driver_number: driverNumber }, { retries: 1 }).catch(() => []);
    const lapTimes = laps.map(item => parseMaybeNumber(item.lap_duration)).filter(Number.isFinite);
    const referenceSelection = getLapReferenceSelection(laps);
    const refLap = Number.isFinite(referenceSelection?.chosen?.lapTime) ? referenceSelection.chosen.lapTime : null;
    if (!Number.isFinite(refLap) && !lapTimes.length) continue;
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
  const snapshotIndex = await getSnapshotIndex().catch(() => null);
  const latestUsefulMeetingKey = String(snapshotIndex?.latest_useful?.meeting_key || "");
  const selectedMeeting = meetings.find(item => item.meeting_key === String(meetingKey))
    || meetings.find(item => item.meeting_key === latestUsefulMeetingKey)
    || meetings[0]
    || null;
  const sessions = selectedMeeting ? await getSessions(selectedMeeting.meeting_key, year) : [];
  const selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[0] || null;
  const drivers = selectedSession ? await getDrivers(selectedSession.session_key, year) : [];
  const selectedDriver = drivers.find(item => item.id === String(driver)) || drivers[0] || null;

  const snapshotState = snapshotIndex ? summarizeMeetingReadiness(snapshotIndex, meetings) : { latest_useful: null, readiness: [] };

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
    drivers,
    snapshot_state: snapshotState
  });
}

async function buildDriverTelemetry({ year = DEFAULT_YEAR, meetingKey, sessionKey, driverNumber, includeHeavy = true }) {
  const modeKey = includeHeavy ? "full" : "core";
  const cacheKey = `${year}:${meetingKey}:${sessionKey}:${driverNumber}:${modeKey}`;
  const cached = getCached(cache.telemetry, cacheKey, TTL.telemetry);
  if (cached) {
    telemetryLog("info", "cache_hit", { layer: "telemetry", year, meeting_key: meetingKey, session_key: sessionKey, driver_number: driverNumber, mode: modeKey });
    return cached;
  }
  telemetryLog("info", "cache_miss", { layer: "telemetry", year, meeting_key: meetingKey, session_key: sessionKey, driver_number: driverNumber, mode: modeKey });

  telemetryLog("info", "telemetry.request", { year, meeting_key: meetingKey, session_key: sessionKey, driver_number: driverNumber });

  const meetings = await getMeetings(year);
  const meeting = meetings.find(item => item.meeting_key === String(meetingKey));
  if (!meeting) {
    telemetryLog("warn", "telemetry.meeting_not_found", { year, meeting_key: meetingKey });
    const error = new Error("GP no válido para 2026");
    error.code = "MEETING_NOT_FOUND";
    throw error;
  }
  telemetryLog("info", "gp_resolved", { year, meeting_key: meeting.meeting_key, gp_label: meeting.gp_label || meeting.meeting_name || "" });

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
  telemetryLog("info", "session_resolved", {
    year,
    meeting_key: meeting.meeting_key,
    session_key: session.session_key,
    session_type: session.type_key
  });

  const drivers = await getDrivers(session.session_key, year);
  const driver = drivers.find(item => item.id === String(driverNumber));
  if (!driver) {
    telemetryLog("warn", "telemetry.driver_not_found", { year, meeting_key: meetingKey, session_key: session.session_key, driver_number: driverNumber });
    const error = new Error("Piloto no disponible en esta sesión");
    error.code = "DRIVER_NOT_FOUND";
    throw error;
  }
  telemetryLog("info", "driver_resolved", {
    year,
    meeting_key: meeting.meeting_key,
    session_key: session.session_key,
    driver_number: driver.id,
    driver_name: driver.name || ""
  });

  const fastf1 = await (async () => {
    telemetryLog("info", "session_load_started", {
      source: "fastf1",
      meeting_key: meeting.meeting_key,
      session_key: session.session_key,
      session_type: session.type_key,
      driver_number: driver.id
    });
    const result = await getFastF1DriverMetrics({
      meetingName: meeting.meeting_name || meeting.location || meeting.country_name,
      sessionType: session.type_key,
      driverNumber: driver.id
    }).catch(() => ({ ok: false, reason: "FASTF1_ERROR" }));
    if (result?.ok) {
      telemetryLog("info", "session_load_completed", {
        source: "fastf1",
        meeting_key: meeting.meeting_key,
        session_key: session.session_key,
        driver_number: driver.id,
        lap_count: result?.lapCount || null
      });
    } else {
      telemetryLog("warn", "session_load_failed", {
        source: "fastf1",
        meeting_key: meeting.meeting_key,
        session_key: session.session_key,
        driver_number: driver.id,
        reason: result?.reason || "FASTF1_ERROR"
      });
    }
    return result;
  })();

  const openf1Fallback = await getDriverMetricsOpenF1(session.session_key, driver.id, { includeTraces: includeHeavy }).catch(() => ({
    source: "openf1",
    traces: { speed: [], throttle: [], brake: [], gear: [], rpm: [], drs: [], distance: [], relativeDistance: [] },
    stints: [],
    evolution: [],
    lapCatalog: [],
    lapTraces: {},
    lapSelection: { referenceLapNumber: null, latestLapNumber: null }
  }));
  const weatherFallback = includeHeavy ? await loadSessionContext(session.session_key).catch(() => ({})) : {};

  const merged = fastf1?.ok
    ? {
      source: "fastf1",
      primarySource: "fastf1",
      sources: ["fastf1"].concat(hasAnyTelemetryData(openf1Fallback) ? ["openf1"] : []),
      referenceLap: Number.isFinite(fastf1.referenceLap) ? fastf1.referenceLap : openf1Fallback.referenceLap,
      averagePace: Number.isFinite(fastf1.averagePace) ? fastf1.averagePace : openf1Fallback.averagePace,
      topSpeed: Number.isFinite(fastf1.topSpeed) ? fastf1.topSpeed : openf1Fallback.topSpeed,
      speedTrap: Number.isFinite(fastf1.speedTrap) ? fastf1.speedTrap : openf1Fallback.speedTrap,
      sectors: {
        sector1: Number.isFinite(fastf1?.sectors?.sector1) ? fastf1.sectors.sector1 : openf1Fallback?.sectors?.sector1 ?? null,
        sector2: Number.isFinite(fastf1?.sectors?.sector2) ? fastf1.sectors.sector2 : openf1Fallback?.sectors?.sector2 ?? null,
        sector3: Number.isFinite(fastf1?.sectors?.sector3) ? fastf1.sectors.sector3 : openf1Fallback?.sectors?.sector3 ?? null
      },
      positionAverage: Number.isFinite(fastf1.positionAverage) ? fastf1.positionAverage : openf1Fallback.positionAverage,
      degradation: Number.isFinite(fastf1.degradation) ? fastf1.degradation : openf1Fallback.degradation,
      stints: Array.isArray(fastf1.stints) && fastf1.stints.length ? fastf1.stints : (openf1Fallback.stints || []),
      evolution: Array.isArray(fastf1.stints) && fastf1.stints.length
        ? fastf1.stints.map((item, idx) => ({ stint: item.number || idx + 1, averagePace: null, laps: item.laps || null }))
        : (openf1Fallback.evolution || []),
      traces: {
        speed: (fastf1?.traces?.speed || []).length ? fastf1.traces.speed : (openf1Fallback?.traces?.speed || []),
        throttle: (fastf1?.traces?.throttle || []).length ? fastf1.traces.throttle : (openf1Fallback?.traces?.throttle || []),
        brake: (fastf1?.traces?.brake || []).length ? fastf1.traces.brake : (openf1Fallback?.traces?.brake || []),
        gear: (fastf1?.traces?.gear || []).length ? fastf1.traces.gear : (openf1Fallback?.traces?.gear || []),
        rpm: (fastf1?.traces?.rpm || []).length ? fastf1.traces.rpm : (openf1Fallback?.traces?.rpm || []),
        drs: (fastf1?.traces?.drs || []).length ? fastf1.traces.drs : (openf1Fallback?.traces?.drs || []),
        distance: (fastf1?.traces?.distance || []).length ? fastf1.traces.distance : (openf1Fallback?.traces?.distance || []),
        relativeDistance: (fastf1?.traces?.relativeDistance || []).length ? fastf1.traces.relativeDistance : (openf1Fallback?.traces?.relativeDistance || [])
      },
      lapCatalog: Array.isArray(fastf1?.lapContext?.catalog) && fastf1.lapContext.catalog.length ? fastf1.lapContext.catalog : (openf1Fallback.lapCatalog || []),
      lapTraces: (fastf1?.lapContext?.tracesByLap && Object.keys(fastf1.lapContext.tracesByLap).length) ? fastf1.lapContext.tracesByLap : (openf1Fallback.lapTraces || {}),
      lapSelection: fastf1?.lapContext?.selection || openf1Fallback.lapSelection || { referenceLapNumber: null, latestLapNumber: null },
      fastf1Context: fastf1.context || {},
      fastf1Circuit: fastf1.circuit || {},
      fastf1Event: fastf1.event || {},
      fastf1UsedPublicApi: fastf1.used_public_api || [],
      pipeline: fastf1.pipeline || []
    }
    : mergeTelemetryBlock(openf1Fallback, {});

  const sessionEvolution = Array.isArray(fastf1?.evolution) && fastf1.evolution.length
    ? fastf1.evolution.map(item => ({
      session_key: item.session_code || "",
      session_type: item.session_code || "",
      session_label: item.session_code || "",
      referenceLap: Number.isFinite(item.referenceLap) ? item.referenceLap : null,
      averagePace: Number.isFinite(item.averagePace) ? item.averagePace : null,
      deltaToReference: Number.isFinite(item.deltaToReference) ? item.deltaToReference : null
    }))
    : (includeHeavy ? await buildSessionEvolutionSummary({
      meetingKey,
      currentSessionKey: session.session_key,
      driverNumber: driver.id,
      year
    }).catch(() => []) : []);

  telemetryLog("info", "telemetry.sources_evaluated", {
    year, meeting_key: meetingKey, session_key: session.session_key, session_type: session.type_key, driver_number: driver.id,
    fastf1_ok: !!fastf1?.ok, fastf1_reason: fastf1?.reason || "FASTF1_ACTIVE",
    openf1_fallback_used: !fastf1?.ok || !Array.isArray(fastf1?.traces?.speed) || !fastf1.traces.speed.length,
    merged_primary: fastf1?.ok ? "fastf1" : "openf1"
  });

  if (!hasAnyTelemetryData(merged)) {
    telemetryLog("warn", "telemetry.no_data", {
      year,
      meeting_key: meetingKey,
      session_key: session.session_key,
      driver_number: driver.id,
      fastf1_ok: !!fastf1?.ok,
      fastf1_reason: fastf1?.reason || "FASTF1_ACTIVE"
    });
    const error = new Error("No hay telemetría histórica disponible para este piloto en esta sesión.");
    error.code = "NO_TELEMETRY";
    throw error;
  }
  telemetryLog("info", "payload_ready", {
    meeting_key: meeting.meeting_key,
    session_key: session.session_key,
    driver_number: driver.id,
    source_primary: merged.primarySource || (fastf1?.ok ? "fastf1" : "openf1")
  });

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
      primary: fastf1?.ok ? "fastf1" : "openf1",
      structural: "minimal",
      enrichment: hasAnyTelemetryData(openf1Fallback) ? "openf1_fallback" : "none",
      fastf1_status: fastf1?.reason || "FASTF1_ACTIVE",
      active_sources: [...new Set(merged.sources || [fastf1?.ok ? "fastf1" : "openf1"])].filter(Boolean),
      fallback_chain: [
        { provider: "fastf1", ok: !!fastf1?.ok, reason: fastf1?.reason || "FASTF1_ACTIVE" },
        { provider: "openf1", ok: hasAnyTelemetryData(openf1Fallback), reason: hasAnyTelemetryData(openf1Fallback) ? "PARTIAL_FILL" : "NOT_NEEDED_OR_EMPTY" }
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
    lap_context: {
      selection: merged.lapSelection || { referenceLapNumber: null, latestLapNumber: null },
      catalog: includeHeavy ? (merged.lapCatalog || []) : [],
      traces_by_lap: includeHeavy ? (merged.lapTraces || {}) : {}
    },
    traces: includeHeavy
      ? {
        ...merged.traces,
        trackPosition: []
      }
      : { speed: [], throttle: [], brake: [], gear: [], rpm: [], trackPosition: [] },
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
      avgTrackTemp: Number.isFinite(fastf1?.weather?.avgTrackTemp) ? fastf1.weather.avgTrackTemp : weatherFallback.avgTrackTemp ?? null,
      avgAirTemp: Number.isFinite(fastf1?.weather?.avgAirTemp) ? fastf1.weather.avgAirTemp : weatherFallback.avgAirTemp ?? null,
      weatherState: fastf1?.weather?.weatherState || weatherFallback.weatherState || "N/D",
      raceControlMessages: Number.isFinite(fastf1?.context?.raceControlMessages) ? fastf1.context.raceControlMessages : weatherFallback.raceControlMessages,
      pitStops: weatherFallback.pitStops,
      overtakes: weatherFallback.overtakes,
      teamRadios: weatherFallback.teamRadios
    },
    session_context: {
      sessionStatusCount: Number.isFinite(merged?.fastf1Context?.sessionStatusCount) ? merged.fastf1Context.sessionStatusCount : null,
      trackStatusCount: Number.isFinite(merged?.fastf1Context?.trackStatusCount) ? merged.fastf1Context.trackStatusCount : null,
      raceControlMessages: Number.isFinite(merged?.fastf1Context?.raceControlMessages) ? merged.fastf1Context.raceControlMessages : null,
      totalLaps: Number.isFinite(fastf1?.totalLaps) ? fastf1.totalLaps : null
    },
    circuit: {
      corners: Number.isFinite(merged?.fastf1Circuit?.corners) ? merged.fastf1Circuit.corners : null,
      marshalLights: Number.isFinite(merged?.fastf1Circuit?.marshalLights) ? merged.fastf1Circuit.marshalLights : null,
      marshalSectors: Number.isFinite(merged?.fastf1Circuit?.marshalSectors) ? merged.fastf1Circuit.marshalSectors : null,
      rotation: Number.isFinite(merged?.fastf1Circuit?.rotation) ? merged.fastf1Circuit.rotation : null
    },
    session_evolution: sessionEvolution,
    diagnostics: includeHeavy
      ? {
        fastf1_used_public_api: merged.fastf1UsedPublicApi || [],
        fastf1_event: merged.fastf1Event || {},
        pipeline: merged.pipeline || ["resolve_gp", "resolve_session", "resolve_driver", "fastf1_session_load", "driver_laps", "driver_telemetry", "fallback_fill"]
      }
      : {
        mode: "core",
        fastf1_skipped: true,
        heavy_blocks: ["traces", "session_evolution", "context"]
      }
  };

  telemetryLog("info", "telemetry.success", {
    year,
    meeting_key: meetingKey,
    session_key: session.session_key,
    driver_number: driver.id,
    source_primary: payload.source.primary,
    source_enrichment: payload.source.enrichment
  });
  const tracesReady = Array.isArray(payload?.traces?.speed) && payload.traces.speed.length > 0;
  if (tracesReady) {
    telemetryLog("info", "traces_ready", {
      meeting_key: meeting.meeting_key,
      session_key: session.session_key,
      driver_number: driver.id,
      points: payload.traces.speed.length
    });
  } else {
    telemetryLog("info", "traces_skipped_reason", {
      meeting_key: meeting.meeting_key,
      session_key: session.session_key,
      driver_number: driver.id,
      reason: includeHeavy ? "NO_TRACE_DATA" : "CORE_MODE"
    });
  }

  return setCached(cache.telemetry, cacheKey, payload);
}

async function buildTelemetryDebugReport({ year = DEFAULT_YEAR, gp = "", session = "", driver = "" }) {
  const refreshHealth = report => {
    report.sources.health = {
      jolpica: sourceHealth.jolpica,
      openf1: sourceHealth.openf1,
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
      consulted: ["fastf1", "openf1"],
      health: {
        jolpica: sourceHealth.jolpica,
        openf1: sourceHealth.openf1,
        openf1_aggregate: sourceHealth.openf1_aggregate,
        fastf1: sourceHealth.fastf1
      },
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

    const openf1 = await getDriverMetricsOpenF1(selectedSession.session_key, selectedDriver.id);
    const aggregate = await getDriverMetricsOpenF1Aggregate(selectedSession.session_key, selectedDriver.id).catch(() => null);
    report.sources.openf1 = { ok: hasAnyTelemetryData(openf1), counts: openf1?.diagnostics?.counts || {}, blocks: openf1?.diagnostics?.blocks || {} };
    report.sources.openf1_aggregate = { ok: false, counts: {}, blocks: {} };

    const fastf1 = await getFastF1DriverMetrics({
      meetingName: meeting.meeting_name || meeting.location || meeting.country_name,
      sessionType: selectedSession.type_key,
      driverNumber: selectedDriver.id
    }).catch(() => ({ ok: false, reason: "FASTF1_ERROR" }));
    report.sources.fastf1 = { ok: !!fastf1?.ok, reason: fastf1?.reason || "FASTF1_ACTIVE" };

    const weather = await loadSessionContext(selectedSession.session_key).catch(() => ({}));
    report.chain.weather = {
      ok: Number.isFinite(fastf1?.weather?.avgTrackTemp) || Number.isFinite(fastf1?.weather?.avgAirTemp) || Number.isFinite(weather.raceControlMessages),
      reason: (Number.isFinite(fastf1?.weather?.avgTrackTemp) || Number.isFinite(fastf1?.weather?.avgAirTemp) || Number.isFinite(weather.raceControlMessages)) ? "OK" : "WEATHER_CONTEXT_UNAVAILABLE"
    };

    const merged = fastf1?.ok ? mergeTelemetryBlock(fastf1, openf1 || {}) : mergeTelemetryBlock(openf1 || {}, {});
    report.chain.laps = { ok: Number.isFinite(merged?.lapCount) || Array.isArray(merged?.lapContext?.catalog), reason: fastf1?.ok ? "FASTF1_OK" : "FASTF1_FAIL_OPENF1_FALLBACK" };
    report.chain.telemetry_trace = { ok: Array.isArray(merged?.traces?.speed) && merged.traces.speed.length > 0, reason: Array.isArray(merged?.traces?.speed) && merged.traces.speed.length > 0 ? "OK" : "NO_TRACE" };
    report.chain.sectors = { ok: Object.values(merged?.sectors || {}).some(Number.isFinite), reason: Object.values(merged?.sectors || {}).some(Number.isFinite) ? "OK" : "NO_SECTORS" };
    report.chain.stints = { ok: Array.isArray(merged?.stints) && merged.stints.length > 0, reason: Array.isArray(merged?.stints) && merged.stints.length > 0 ? "OK" : "NO_STINTS" };
    report.chain.position = { ok: Number.isFinite(merged?.positionAverage), reason: Number.isFinite(merged?.positionAverage) ? "OK" : "NO_POSITION" };
    report.sources.merged = {
      ok: hasAnyTelemetryData(merged),
      primary: fastf1?.ok ? "fastf1" : "openf1",
      active: fastf1?.ok ? ["fastf1", ...(hasAnyTelemetryData(openf1) ? ["openf1"] : [])] : ["openf1"]
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
  const runtime = process.env.VERCEL ? "vercel/server" : "local/server";
  const report = {
    env_present: Boolean(getRaceOptiApiKey()),
    runtime,
    year,
    raceoptidata_health: { deprecated: true, role: "disabled_primary" },
    tested_gp: [],
    tested_sessions: [],
    tested_drivers: [],
    raceoptidata_success_count: 0,
    raceoptidata_fail_count: 0,
    blocks_covered: {
      gp_calendar: "openf1",
      pilots: "openf1",
      reference: "fastf1",
      ritmo_medio: "fastf1",
      sectores: "fastf1",
      speed_metrics: "fastf1",
      stint: "fastf1",
      degradacion: "fastf1",
      trazas: "fastf1",
      contexto_sesion: "fastf1+openf1_fallback"
    },
    fallback_needed: {
      openf1: ["weather/track context puntual", "relleno parcial si FastF1 no trae un bloque"],
      fastf1: []
    },
    unsupported_sessions: [],
    notes: [
      "RaceOptiData se retiró del flujo principal de Telemetría v1.",
      "FastF1 es la fuente principal; OpenF1 queda como fallback puntual."
    ]
  };
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
