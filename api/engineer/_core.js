import { spawn } from "node:child_process";

const DEFAULT_YEAR = 2026;
const SESSION_TYPES = Object.freeze([
  { key: "fp1", label: "FP1" },
  { key: "fp2", label: "FP2" },
  { key: "fp3", label: "FP3" },
  { key: "qualy", label: "Qualy" },
  { key: "sprint_qualy", label: "Sprint Qualy" },
  { key: "sprint_race", label: "Sprint" },
  { key: "race", label: "Race" }
]);

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 15,
  drivers: 1000 * 60 * 8,
  laptimes: 1000 * 60 * 6,
  telemetry: 1000 * 60 * 4,
  context: 1000 * 60 * 5
});

const cache = {
  meetings: new Map(),
  sessions: new Map(),
  drivers: new Map(),
  laptimes: new Map(),
  telemetry: new Map(),
  context: new Map()
};

function apiError(res, status, message, code = "ENGINEER_ERROR") {
  return res.status(status).json({ error: { code, message } });
}

function parseYear(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_YEAR;
}

function setCached(map, key, value) {
  map.set(key, { ts: Date.now(), value });
  return value;
}

function getCached(map, key, ttlMs) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function runCurl(url) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["-sS", "--fail", "--connect-timeout", "12", "--max-time", "35", url], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        const error = new Error(`CURL_FAILED_${code}`);
        error.code = "CURL_FAILED";
        error.details = stderr.trim();
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function fetchJson(url) {
  const raw = await runCurl(url);
  try {
    return JSON.parse(raw || "null");
  } catch {
    const error = new Error("INVALID_JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function normalizeSessionType(folder = "") {
  const clean = String(folder || "").trim().toLowerCase();
  if (["practice 1", "fp1", "p1"].includes(clean)) return { key: "fp1", label: "FP1" };
  if (["practice 2", "fp2", "p2"].includes(clean)) return { key: "fp2", label: "FP2" };
  if (["practice 3", "fp3", "p3"].includes(clean)) return { key: "fp3", label: "FP3" };
  if (["qualifying", "q", "qualy"].includes(clean)) return { key: "qualy", label: "Qualy" };
  if (["sprint qualifying", "sprint shootout", "sq"].includes(clean)) return { key: "sprint_qualy", label: "Sprint Qualy" };
  if (["sprint", "sprint race", "sr"].includes(clean)) return { key: "sprint_race", label: "Sprint" };
  if (["race", "grand prix", "r"].includes(clean)) return { key: "race", label: "Race" };
  return { key: clean.replace(/\s+/g, "_"), label: folder || "Sesión" };
}

function sessionPriority(typeKey = "") {
  const order = ["fp1", "fp2", "fp3", "sprint_qualy", "qualy", "sprint_race", "race"];
  const index = order.indexOf(typeKey);
  return index === -1 ? 999 : index;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (value === "None") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDriverName(item = {}) {
  const fn = String(item.fn || "").trim();
  const ln = String(item.ln || "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return String(item.driver || item.dn || "").trim();
}

function buildLapCatalog(laptimes = {}) {
  const lapNumbers = Array.isArray(laptimes.lap) ? laptimes.lap : [];
  const lapTimes = Array.isArray(laptimes.time) ? laptimes.time : [];
  const compounds = Array.isArray(laptimes.compound) ? laptimes.compound : [];
  const stints = Array.isArray(laptimes.stint) ? laptimes.stint : [];
  const s1 = Array.isArray(laptimes.s1) ? laptimes.s1 : [];
  const s2 = Array.isArray(laptimes.s2) ? laptimes.s2 : [];
  const s3 = Array.isArray(laptimes.s3) ? laptimes.s3 : [];

  const catalog = lapNumbers.map((rawLap, index) => {
    const lapNumber = parseNumber(rawLap);
    const lapTime = parseNumber(lapTimes[index]);
    const sector1 = parseNumber(s1[index]);
    const sector2 = parseNumber(s2[index]);
    const sector3 = parseNumber(s3[index]);
    const status = Number.isFinite(lapTime) ? "valid" : "invalid";
    return {
      lapNumber,
      lapTime,
      compound: String(compounds[index] || "").trim() || null,
      stint: parseNumber(stints[index]),
      sector1,
      sector2,
      sector3,
      status,
      hasTiming: Number.isFinite(lapTime)
    };
  }).filter(item => Number.isFinite(item.lapNumber));

  const validLaps = catalog.filter(item => Number.isFinite(item.lapTime));
  const bestLap = validLaps.slice().sort((a, b) => a.lapTime - b.lapTime)[0] || null;
  const latestLap = validLaps.slice().sort((a, b) => a.lapNumber - b.lapNumber).pop() || null;

  return {
    catalog,
    bestLapNumber: bestLap?.lapNumber ?? null,
    latestLapNumber: latestLap?.lapNumber ?? null
  };
}

async function fetchRepoContents(path = "") {
  const encoded = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
  const url = `https://api.github.com/repos/TracingInsights/2026/contents${encoded ? `/${encoded}` : ""}?ref=main`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

async function fetchRawJson(path = "") {
  const encoded = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
  const url = `https://raw.githubusercontent.com/TracingInsights/2026/main/${encoded}`;
  return fetchJson(url);
}

async function getMeetings() {
  const key = `${DEFAULT_YEAR}`;
  const cached = getCached(cache.meetings, key, TTL.meetings);
  if (cached) return cached;

  const root = await fetchRepoContents("");
  const meetings = root
    .filter(item => item?.type === "dir")
    .map(item => String(item.name || "").trim())
    .filter(name => name && !name.startsWith(".") && !name.toLowerCase().includes("cache"))
    .filter(name => /grand prix/i.test(name))
    .map(name => ({
      meeting_key: name,
      gp_label: name,
      meeting_name: name
    }))
    .sort((a, b) => a.gp_label.localeCompare(b.gp_label));

  return setCached(cache.meetings, key, meetings);
}

async function getSessions(meetingKey) {
  const cleanMeeting = String(meetingKey || "").trim();
  if (!cleanMeeting) return [];
  const key = `${DEFAULT_YEAR}:${cleanMeeting}`;
  const cached = getCached(cache.sessions, key, TTL.sessions);
  if (cached) return cached;

  const entries = await fetchRepoContents(cleanMeeting);
  const sessions = entries
    .filter(item => item?.type === "dir")
    .map(item => {
      const normalized = normalizeSessionType(item.name);
      return {
        session_key: `${cleanMeeting}__${item.name}`,
        folder: item.name,
        type_key: normalized.key,
        type_label: normalized.label
      };
    })
    .sort((a, b) => sessionPriority(a.type_key) - sessionPriority(b.type_key) || a.folder.localeCompare(b.folder));

  return setCached(cache.sessions, key, sessions);
}

async function getDrivers(sessionKey) {
  const cleanSession = String(sessionKey || "").trim();
  if (!cleanSession || !cleanSession.includes("__")) return [];
  const key = `${DEFAULT_YEAR}:${cleanSession}`;
  const cached = getCached(cache.drivers, key, TTL.drivers);
  if (cached) return cached;

  const [meetingKey, sessionFolder] = cleanSession.split("__");
  const payload = await fetchRawJson(`${meetingKey}/${sessionFolder}/drivers.json`);
  const drivers = (Array.isArray(payload?.drivers) ? payload.drivers : [])
    .map(item => ({
      id: String(item?.dn || "").trim() || String(item?.driver || "").trim(),
      code: String(item?.driver || "").trim(),
      name: formatDriverName(item),
      team: String(item?.team || "").trim(),
      number: String(item?.dn || "").trim()
    }))
    .filter(item => item.id && item.code)
    .sort((a, b) => a.name.localeCompare(b.name));

  return setCached(cache.drivers, key, drivers);
}

async function resolveTelemetryContext({ year = DEFAULT_YEAR, meetingKey = "", sessionType = "", driver = "" }) {
  if (year !== DEFAULT_YEAR) {
    const error = new Error("INVALID_YEAR");
    error.code = "INVALID_YEAR";
    throw error;
  }

  const cacheKey = `${year}:${meetingKey || "auto"}:${sessionType || "auto"}:${driver || "auto"}`;
  const hit = getCached(cache.context, cacheKey, TTL.context);
  if (hit) return hit;

  const meetings = await getMeetings();
  if (!meetings.length) {
    const error = new Error("MEETINGS_UNAVAILABLE");
    error.code = "MEETINGS_UNAVAILABLE";
    throw error;
  }

  const selectedMeeting = meetings.find(item => item.meeting_key === meetingKey) || meetings[0];
  const sessions = await getSessions(selectedMeeting.meeting_key);
  const selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[0] || null;
  const drivers = selectedSession ? await getDrivers(selectedSession.session_key) : [];
  const selectedDriver = drivers.find(item => String(item.id) === String(driver) || String(item.code) === String(driver)) || drivers[0] || null;

  return setCached(cache.context, cacheKey, {
    year,
    source: "tracinginsights/2026",
    meetings,
    sessions,
    drivers,
    selections: {
      meeting_key: selectedMeeting.meeting_key,
      session_key: selectedSession?.session_key || "",
      session_type: selectedSession?.type_key || "",
      driver: selectedDriver?.id || ""
    }
  });
}

async function loadLaptimes({ meetingKey, sessionFolder, driverCode }) {
  const key = `${meetingKey}:${sessionFolder}:${driverCode}`;
  const cached = getCached(cache.laptimes, key, TTL.laptimes);
  if (cached) return cached;
  const data = await fetchRawJson(`${meetingKey}/${sessionFolder}/${driverCode}/laptimes.json`);
  return setCached(cache.laptimes, key, data || {});
}

async function loadLapTelemetry({ meetingKey, sessionFolder, driverCode, lapNumber }) {
  const key = `${meetingKey}:${sessionFolder}:${driverCode}:${lapNumber}`;
  const cached = getCached(cache.telemetry, key, TTL.telemetry);
  if (cached) return cached;
  const data = await fetchRawJson(`${meetingKey}/${sessionFolder}/${driverCode}/${lapNumber}_tel.json`);
  return setCached(cache.telemetry, key, data || {});
}

function safeArray(values, parser = parseNumber) {
  if (!Array.isArray(values)) return [];
  return values.map(item => parser(item)).filter(Number.isFinite);
}

function buildStints(catalog = []) {
  const byStint = new Map();
  catalog.forEach(lap => {
    if (!Number.isFinite(lap.stint)) return;
    if (!byStint.has(lap.stint)) byStint.set(lap.stint, []);
    byStint.get(lap.stint).push(lap);
  });
  return [...byStint.entries()].map(([number, laps]) => {
    const valid = laps.filter(item => Number.isFinite(item.lapTime));
    const ordered = laps.slice().sort((a, b) => a.lapNumber - b.lapNumber);
    const avgLap = valid.length ? valid.reduce((acc, item) => acc + item.lapTime, 0) / valid.length : null;
    const bestLap = valid.length ? Math.min(...valid.map(item => item.lapTime)) : null;
    const first = valid[0]?.lapTime ?? null;
    const last = valid[valid.length - 1]?.lapTime ?? null;
    return {
      number,
      compound: ordered.find(item => item.compound)?.compound || null,
      lapStart: ordered[0]?.lapNumber ?? null,
      lapEnd: ordered[ordered.length - 1]?.lapNumber ?? null,
      lapCount: valid.length,
      avgLap,
      bestLap,
      degradation: Number.isFinite(first) && Number.isFinite(last) ? last - first : null
    };
  }).sort((a, b) => a.number - b.number);
}

async function buildDriverTelemetry({ year = DEFAULT_YEAR, meetingKey, sessionKey, driverNumber, lapMode = "reference", manualLap = "" }) {
  if (year !== DEFAULT_YEAR) {
    const error = new Error("INVALID_YEAR");
    error.code = "INVALID_YEAR";
    throw error;
  }

  const context = await resolveTelemetryContext({ year, meetingKey, driver: driverNumber });
  const selectedMeeting = context.meetings.find(item => item.meeting_key === meetingKey);
  if (!selectedMeeting) {
    const error = new Error("MEETING_NOT_FOUND");
    error.code = "MEETING_NOT_FOUND";
    throw error;
  }

  const sessions = await getSessions(meetingKey);
  const selectedSession = sessions.find(item => item.session_key === sessionKey);
  if (!selectedSession) {
    const error = new Error("SESSION_NOT_FOUND");
    error.code = "SESSION_NOT_FOUND";
    throw error;
  }

  const drivers = await getDrivers(selectedSession.session_key);
  const selectedDriver = drivers.find(item => String(item.id) === String(driverNumber) || String(item.code) === String(driverNumber));
  if (!selectedDriver) {
    const error = new Error("DRIVER_NOT_FOUND");
    error.code = "DRIVER_NOT_FOUND";
    throw error;
  }

  const laptimes = await loadLaptimes({ meetingKey, sessionFolder: selectedSession.folder, driverCode: selectedDriver.code });
  const built = buildLapCatalog(laptimes);
  const validLaps = built.catalog.filter(item => Number.isFinite(item.lapTime));
  if (!validLaps.length) {
    const error = new Error("NO_TELEMETRY");
    error.code = "NO_TELEMETRY";
    throw error;
  }

  const targetByMode = () => {
    if (lapMode === "manual") {
      const lap = Number(manualLap);
      if (Number.isFinite(lap)) return lap;
    }
    if (lapMode === "latest") return built.latestLapNumber;
    return built.bestLapNumber;
  };

  const orderedCandidates = [
    targetByMode(),
    built.bestLapNumber,
    built.latestLapNumber,
    ...validLaps.map(item => item.lapNumber)
  ].filter((value, idx, arr) => Number.isFinite(value) && arr.indexOf(value) === idx);

  let selectedLapTelemetry = null;
  let selectedLapNumber = null;
  for (const lapNumber of orderedCandidates) {
    try {
      const candidate = await loadLapTelemetry({ meetingKey, sessionFolder: selectedSession.folder, driverCode: selectedDriver.code, lapNumber });
      if (candidate?.tel && Array.isArray(candidate.tel.speed) && candidate.tel.speed.length) {
        selectedLapTelemetry = candidate.tel;
        selectedLapNumber = lapNumber;
        break;
      }
    } catch {
      // try next lap candidate
    }
  }

  if (!selectedLapTelemetry || !Number.isFinite(selectedLapNumber)) {
    const error = new Error("NO_TELEMETRY");
    error.code = "NO_TELEMETRY";
    throw error;
  }

  const selectedLapMeta = built.catalog.find(item => item.lapNumber === selectedLapNumber) || null;
  const speed = safeArray(selectedLapTelemetry.speed);
  const throttle = safeArray(selectedLapTelemetry.throttle, value => Math.max(0, Math.min(100, parseNumber(value) ?? -1)));
  const brake = safeArray(selectedLapTelemetry.brake, value => Math.max(0, Math.min(100, parseNumber(value) ?? -1)));
  const sectors = selectedLapMeta
    ? { s1: selectedLapMeta.sector1, s2: selectedLapMeta.sector2, s3: selectedLapMeta.sector3 }
    : { s1: null, s2: null, s3: null };

  const lapsForSelector = built.catalog.map(item => ({
    lapNumber: item.lapNumber,
    lapTime: item.lapTime,
    compound: item.compound,
    stint: item.stint,
    status: item.status,
    isBest: Number.isFinite(built.bestLapNumber) && item.lapNumber === built.bestLapNumber,
    hasTelemetry: validLaps.some(valid => valid.lapNumber === item.lapNumber)
  }));

  const averagePace = validLaps.length ? validLaps.reduce((acc, item) => acc + item.lapTime, 0) / validLaps.length : null;

  return {
    source: { primary: "tracinginsights/2026" },
    labels: {
      gp: selectedMeeting.gp_label,
      session: selectedSession.type_label,
      driver: selectedDriver.name
    },
    summary: {
      referenceLap: selectedLapMeta?.lapTime ?? null,
      averagePace,
      topSpeed: speed.length ? Math.max(...speed) : null,
      speedTrap: speed.length ? speed[speed.length - 1] : null,
      sector1: sectors.s1,
      sector2: sectors.s2,
      sector3: sectors.s3
    },
    lap_selector: {
      mode: lapMode,
      selectedLapNumber,
      referenceLapNumber: built.bestLapNumber,
      latestLapNumber: built.latestLapNumber,
      laps: lapsForSelector
    },
    traces: {
      speed,
      throttle,
      brake,
      gear: safeArray(selectedLapTelemetry.gear),
      rpm: safeArray(selectedLapTelemetry.rpm),
      drs: safeArray(selectedLapTelemetry.drs),
      distance: safeArray(selectedLapTelemetry.distance),
      relativeDistance: safeArray(selectedLapTelemetry.rel_distance)
    },
    stints: buildStints(built.catalog)
  };
}

async function buildTelemetryDebugReport({ year = DEFAULT_YEAR, gp = "", session = "", driver = "" }) {
  try {
    const context = await resolveTelemetryContext({ year, meetingKey: gp, sessionType: session, driver });
    return {
      ok: true,
      source: "tracinginsights/2026",
      selections: context.selections,
      counts: {
        meetings: context.meetings.length,
        sessions: context.sessions.length,
        drivers: context.drivers.length
      }
    };
  } catch (error) {
    return { ok: false, code: error?.code || "DEBUG_FAILED", message: String(error?.message || "") };
  }
}

async function buildRaceOptiCoverageReport({ year = DEFAULT_YEAR } = {}) {
  const meetings = await getMeetings();
  return {
    year,
    source: "tracinginsights/2026",
    meetings: meetings.length,
    note: "Cobertura basada en estructura del repositorio TracingInsights/2026"
  };
}

async function buildComparison() {
  const error = new Error("Comparativas retiradas en Telemetría reconstruida");
  error.code = "COMPARE_RETIRED";
  throw error;
}

async function getEntities(sessionKey) {
  return { drivers: await getDrivers(sessionKey), teams: [] };
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
