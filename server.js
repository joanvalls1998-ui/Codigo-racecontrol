import express from "express";
import cors from "cors";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

// ——— DATA HELPERS ———
function readJson(relPath) {
  const full = join(__dirname, relPath);
  if (!existsSync(full)) return null;
  try { return JSON.parse(readFileSync(full, "utf-8")); } catch { return null; }
}

function getBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

// ——— STATE MANAGER ———
const STATE_FILE = join(__dirname, "data", "state.json");
const SNAPSHOTS_DIR = join(__dirname, "data", "snapshots");
const INDEX_FILE = join(SNAPSHOTS_DIR, "index.json");
const SNAPSHOT_PREFIX = "engineer_telemetry_snapshot_v1";

const DEFAULT_STATE = {
  meta: { updatedAt: null, version: 1 },
  teams: {},
  drivers: {},
  newsSignals: [],
  weeklySnapshots: []
};

function readState() {
  try {
    if (!existsSync(STATE_FILE)) return DEFAULT_STATE;
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    return {
      meta: data.meta || DEFAULT_STATE.meta,
      teams: data.teams || {},
      drivers: data.drivers || {},
      newsSignals: Array.isArray(data.newsSignals) ? data.newsSignals : [],
      weeklySnapshots: Array.isArray(data.weeklySnapshots) ? data.weeklySnapshots : []
    };
  } catch { return DEFAULT_STATE; }
}

function writeState(state) {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return true;
}

// ——— SNAPSHOT HELPERS ———
function ensureSnapshotsDir() {
  if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

function getSnapshotIndex() {
  ensureSnapshotsDir();
  try {
    if (!existsSync(INDEX_FILE)) return { version: 1, updated_at: new Date().toISOString(), sessions: {}, latest_useful: null };
    const data = JSON.parse(readFileSync(INDEX_FILE, "utf-8"));
    return data && typeof data === "object" ? data : { version: 1, updated_at: new Date().toISOString(), sessions: {}, latest_useful: null };
  } catch { return { version: 1, updated_at: new Date().toISOString(), sessions: {}, latest_useful: null }; }
}

function writeSnapshotIndex(index) {
  ensureSnapshotsDir();
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

function sanitizeKey(v = "") { return String(v || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-"); }

function buildSnapshotId({ year, meetingKey, sessionKey, driverNumber, mode = "full" }) {
  return [year, sanitizeKey(meetingKey), sanitizeKey(sessionKey), sanitizeKey(driverNumber), mode].join("_");
}

function buildSnapshotFileName(snapshotId) { return `${SNAPSHOT_PREFIX}_${snapshotId}.json`; }

// ——— API ROUTES ———

// GET /api/calendar
app.get("/api/calendar", (req, res) => {
  import("./api/calendar.js").then(m => m.default(req, res)).catch(() => res.status(500).json({ error: "Error" }));
});

// GET /api/standings
app.get("/api/standings", (req, res) => {
  import("./api/standings.js").then(m => m.default(req, res)).catch(() => res.status(500).json({ error: "Error" }));
});

// POST /api/news
app.post("/api/news", (req, res) => {
  import("./api/news.js").then(m => m.default(req, res)).catch(() => res.status(500).json({ error: "Error" }));
});

// POST /api/predict
app.post("/api/predict", (req, res) => {
  import("./api/predict.js").then(m => m.default(req, res)).catch(() => res.status(500).json({ error: "Error" }));
});

// POST /api/update-adjustments
app.post("/api/update-adjustments", (req, res) => {
  import("./api/update-adjustments.js").then(m => m.default(req, res)).catch(() => res.status(500).json({ error: "Error" }));
});

// GET /api/get-edge-state
app.get("/api/get-edge-state", (req, res) => {
  res.json({ ok: true, source: "local", state: readState() });
});

// POST /api/init-edge-state
app.post("/api/init-edge-state", (req, res) => {
  try {
    const body = getBody(req);
    const current = readState();
    const incoming = body?.state && typeof body.state === "object" ? body.state : {};
    const next = {
      meta: { updatedAt: new Date().toISOString(), version: incoming?.meta?.version || 1 },
      teams: incoming?.teams || current.teams || {},
      drivers: incoming?.drivers || current.drivers || {},
      newsSignals: Array.isArray(incoming?.newsSignals) ? incoming.newsSignals : current.newsSignals || [],
      weeklySnapshots: Array.isArray(incoming?.weeklySnapshots) ? incoming.weeklySnapshots : current.weeklySnapshots || []
    };
    writeState(next);
    res.json({ ok: true, message: "state inicializado correctamente", state: next });
  } catch (e) { res.status(500).json({ error: "Error interno", message: e.message }); }
});

// POST /api/apply-adjustments
app.post("/api/apply-adjustments", (req, res) => {
  try {
    const body = getBody(req);
    const dryRun = Boolean(body?.dryRun);
    const patch = body?.suggestedPatch || body?.patch || body || {};
    const current = readState();

    const normalizeDelta = (d = {}) => {
      const r = {};
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === "number" && !Number.isNaN(v)) r[k] = Math.max(-100, Math.min(100, v));
      }
      return r;
    };

    const nextTeams = { ...current.teams };
    for (const [name, delta] of Object.entries(patch?.teams || {})) {
      const sanitized = normalizeDelta(delta);
      const prev = nextTeams[name] || {};
      const merged = {};
      for (const k of new Set([...Object.keys(prev), ...Object.keys(sanitized)])) {
        merged[k] = Math.max(-100, Math.min(100, (prev[k] || 0) + (sanitized[k] || 0)));
      }
      nextTeams[name] = merged;
    }

    const nextDrivers = { ...current.drivers };
    for (const [name, delta] of Object.entries(patch?.drivers || {})) {
      const sanitized = normalizeDelta(delta);
      const prev = nextDrivers[name] || {};
      const merged = {};
      for (const k of new Set([...Object.keys(prev), ...Object.keys(sanitized)])) {
        merged[k] = Math.max(-100, Math.min(100, (prev[k] || 0) + (sanitized[k] || 0)));
      }
      nextDrivers[name] = merged;
    }

    const acceptedSignals = Array.isArray(patch?.acceptedNewsSignals) ? patch.acceptedNewsSignals : [];
    const nextSignals = [...(current.newsSignals || []), ...acceptedSignals].slice(-100);

    const next = {
      meta: { updatedAt: new Date().toISOString(), version: Number(current.meta?.version || 1) },
      teams: nextTeams, drivers: nextDrivers, newsSignals: nextSignals,
      weeklySnapshots: current.weeklySnapshots || []
    };

    if (dryRun) return res.json({ ok: true, mode: "dry_run", currentState: current, nextState: next });
    writeState(next);
    res.json({ ok: true, mode: "apply_adjustments_v1", message: "Ajustes aplicados", state: next });
  } catch (e) { res.status(500).json({ error: "Error interno", message: e.message }); }
});

// GET|POST /api/reset-edge-state
app.use("/api/reset-edge-state", (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const next = { ...DEFAULT_STATE, meta: { updatedAt: new Date().toISOString(), version: 1 } };
    writeState(next);
    res.json({ ok: true, message: "state reseteado correctamente", state: next });
  } catch (e) { res.status(500).json({ error: "Error interno", message: e.message }); }
});

// ENGINEER routes
async function loadEngineer(name) {
  try { return await import(`./api/engineer/${name}.js`); } catch { return null; }
}

app.get("/api/engineer/snapshot-index", async (req, res) => {
  try { res.json(getSnapshotIndex()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/engineer/persist-snapshot", async (req, res) => {
  try {
    const { params, payload, source, status } = getBody(req);
    if (!params) return res.status(400).json({ error: "Faltan params" });
    const snapshotId = buildSnapshotId(params);
    const filePath = join(SNAPSHOTS_DIR, buildSnapshotFileName(snapshotId));
    ensureSnapshotsDir();
    const entry = {
      snapshot_id: snapshotId, status: status || "ready",
      freshness: { status: status || "ready", generated_at: new Date().toISOString(), source: source || "runtime", retries: 0, last_error: null },
      key: { year: params.year, meeting_key: params.meetingKey, session_key: params.sessionKey, driver_number: params.driverNumber, mode: params.mode || "full" },
      payload
    };
    writeFileSync(filePath, JSON.stringify(entry, null, 2));
    res.json({ ok: true, snapshotId, entry });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/engineer/read-snapshot", async (req, res) => {
  try {
    const { year, meetingKey, sessionKey, driverNumber, mode } = req.query;
    if (!year || !meetingKey || !sessionKey || !driverNumber) return res.status(400).json({ error: "Faltan parámetros" });
    const snapshotId = buildSnapshotId({ year, meetingKey, sessionKey, driverNumber, mode });
    const filePath = join(SNAPSHOTS_DIR, buildSnapshotFileName(snapshotId));
    if (!existsSync(filePath)) return res.status(404).json({ error: "Snapshot no encontrado" });
    res.json(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mount all engineer API handlers
const engineerHandlers = [
  ["entities", "GET"], ["meetings", "GET"], ["sessions", "GET"],
  ["telemetry", "GET"], ["context", "GET"], ["compare", "GET"],
  ["summary", "GET"], ["sectors", "GET"], ["stints", "GET"],
  ["evolution", "GET"], ["coverage", "GET"], ["snapshot-status", "GET"],
  ["debug", "GET"]
];

for (const [name, method] of engineerHandlers) {
  const mod = await loadEngineer(name);
  if (mod) {
    app[method.toLowerCase()](`/api/engineer/${name}`, (req, res) => mod.default(req, res));
  }
}

// POST /api/sim
app.post("/api/sim", (req, res) => {
  import("./api/sim.js").then(m => m.default(req, res)).catch(() => res.status(500).json({ error: "Error" }));
});

// Catch-all: serve index.html for any other GET
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`RaceControl running on http://localhost:${PORT}`);
});