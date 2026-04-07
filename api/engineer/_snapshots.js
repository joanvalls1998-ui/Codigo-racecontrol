import { get } from "@vercel/edge-config";

const SNAPSHOT_PREFIX = "engineer_telemetry_snapshot_v1";
const SNAPSHOT_INDEX_KEY = "engineer_telemetry_snapshot_index_v1";
const GENERATION_MARGIN_MS = 20 * 60 * 1000;
const RETRY_DELAY_MS = 10 * 60 * 1000;
const MAX_RETRIES = 18;

function nowIso() {
  return new Date().toISOString();
}

function parseDateMs(value) {
  if (!value) return Number.NaN;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function snapshotLog(event = "event", details = {}) {
  console.log(JSON.stringify({ scope: "engineer.telemetry.snapshot", event, ...details }));
}

function sanitizeKey(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function buildSnapshotId({ year, meetingKey, sessionKey, driverNumber, mode = "full" }) {
  return [year, sanitizeKey(meetingKey), sanitizeKey(sessionKey), sanitizeKey(driverNumber), mode].join("_");
}

function buildSnapshotEdgeKey(snapshotId) {
  return `${SNAPSHOT_PREFIX}_${snapshotId}`;
}

function buildSessionRef({ year, meetingKey, sessionKey }) {
  return `${year}:${meetingKey}:${sessionKey}`;
}

function estimateSessionEndMs(session = {}) {
  const explicitEnd = parseDateMs(session?.date_end);
  if (Number.isFinite(explicitEnd)) return explicitEnd;
  const start = parseDateMs(session?.date_start);
  if (!Number.isFinite(start)) return Number.NaN;
  const type = String(session?.type_key || "").toLowerCase();
  const durationMin = type === "race" ? 120 : (type.includes("sprint") ? 60 : (type === "qualy" ? 80 : 70));
  return start + (durationMin * 60 * 1000);
}

function createDefaultIndex() {
  return {
    version: 1,
    updated_at: nowIso(),
    sessions: {},
    latest_useful: null
  };
}

async function buildEdgeConfigUrl() {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!edgeConfigId) throw new Error("EDGE_CONFIG_ID_MISSING");
  const url = new URL(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`);
  if (teamId) url.searchParams.set("teamId", teamId);
  return url.toString();
}

async function upsertEdgeItems(items = []) {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error("VERCEL_API_TOKEN_MISSING");
  const url = await buildEdgeConfigUrl();
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items })
  });
  if (!response.ok) {
    throw new Error(`EDGE_CONFIG_PATCH_${response.status}`);
  }
}

export async function getSnapshotIndex() {
  const data = await get(SNAPSHOT_INDEX_KEY).catch(() => null);
  if (!data || typeof data !== "object") return createDefaultIndex();
  return {
    version: 1,
    updated_at: String(data.updated_at || nowIso()),
    sessions: data.sessions && typeof data.sessions === "object" ? data.sessions : {},
    latest_useful: data.latest_useful || null
  };
}

async function writeSnapshotIndex(index) {
  await upsertEdgeItems([{ operation: "upsert", key: SNAPSHOT_INDEX_KEY, value: index }]);
}

export async function readTelemetrySnapshot(params) {
  const snapshotId = buildSnapshotId(params);
  const key = buildSnapshotEdgeKey(snapshotId);
  const snapshot = await get(key).catch(() => null);
  if (!snapshot || typeof snapshot !== "object") return null;
  return snapshot;
}

function buildSnapshotPayload({ snapshotId, params, payload, source = "runtime", status = "ready" }) {
  return {
    snapshot_id: snapshotId,
    status,
    freshness: {
      status,
      generated_at: nowIso(),
      source,
      retries: 0,
      last_error: null
    },
    key: {
      year: params.year,
      meeting_key: params.meetingKey,
      session_key: params.sessionKey,
      driver_number: params.driverNumber,
      mode: params.mode || "full"
    },
    payload
  };
}

export async function persistTelemetrySnapshot({ params, payload, source = "runtime", status = "ready" }) {
  const snapshotId = buildSnapshotId(params);
  const key = buildSnapshotEdgeKey(snapshotId);
  const entry = buildSnapshotPayload({ snapshotId, params, payload, source, status });
  await upsertEdgeItems([{ operation: "upsert", key, value: entry }]);
  return entry;
}

export function isSnapshotStale(snapshot = {}, options = {}) {
  const generatedTs = parseDateMs(snapshot?.freshness?.generated_at);
  if (!Number.isFinite(generatedTs)) return true;
  const ttlMs = Number.isFinite(options?.ttlMs) ? options.ttlMs : (6 * 60 * 60 * 1000);
  return (Date.now() - generatedTs) > ttlMs;
}

export async function markSessionSnapshotState({ year, meetingKey, session, status, reason = "", retries = 0, driversTotal = 0, driversReady = 0, nextRetryAt = null }) {
  const index = await getSnapshotIndex();
  const ref = buildSessionRef({ year, meetingKey, sessionKey: session.session_key });
  const sessionEndMs = estimateSessionEndMs(session);
  index.sessions[ref] = {
    year,
    meeting_key: meetingKey,
    session_key: session.session_key,
    session_type: session.type_key,
    session_label: session.type_label,
    date_start: session.date_start || "",
    date_end: session.date_end || "",
    status,
    reason,
    retries,
    drivers_total: driversTotal,
    drivers_ready: driversReady,
    session_end_ms: Number.isFinite(sessionEndMs) ? sessionEndMs : null,
    generated_at: nowIso(),
    next_retry_at: nextRetryAt
  };
  index.updated_at = nowIso();
  await writeSnapshotIndex(index);
  return index.sessions[ref];
}

export function evaluateSessionEligibility(session = {}, nowMs = Date.now()) {
  const sessionEndMs = estimateSessionEndMs(session);
  if (!Number.isFinite(sessionEndMs)) {
    return { eligible: false, reason: "SESSION_END_UNKNOWN", session_end_ms: null, ready_at_ms: null };
  }
  const readyAt = sessionEndMs + GENERATION_MARGIN_MS;
  if (nowMs < readyAt) {
    return { eligible: false, reason: "WAITING_TPLUS20", session_end_ms: sessionEndMs, ready_at_ms: readyAt };
  }
  return { eligible: true, reason: "ELIGIBLE", session_end_ms: sessionEndMs, ready_at_ms: readyAt };
}

export function getRetryPolicy() {
  return {
    delay_ms: RETRY_DELAY_MS,
    max_retries: MAX_RETRIES,
    generation_margin_ms: GENERATION_MARGIN_MS
  };
}

export async function registerLatestUsefulMeeting({ year, meeting, sessions = [] }) {
  const index = await getSnapshotIndex();
  index.latest_useful = {
    year,
    meeting_key: meeting.meeting_key,
    gp_label: meeting.gp_label,
    round: meeting.round,
    updated_at: nowIso(),
    sessions_ready: sessions.filter(item => item.status === "ready").map(item => item.session_key)
  };
  index.updated_at = nowIso();
  await writeSnapshotIndex(index);
}

export function summarizeMeetingReadiness(index = {}, meetings = []) {
  const sessionsMap = index?.sessions && typeof index.sessions === "object" ? index.sessions : {};
  const statusByMeeting = new Map();
  Object.values(sessionsMap).forEach(session => {
    const key = String(session?.meeting_key || "");
    if (!key) return;
    if (!statusByMeeting.has(key)) statusByMeeting.set(key, []);
    statusByMeeting.get(key).push(session);
  });
  const readiness = meetings.map(meeting => {
    const rows = statusByMeeting.get(String(meeting.meeting_key)) || [];
    const ready = rows.filter(row => row.status === "ready").length;
    return {
      meeting_key: meeting.meeting_key,
      gp_label: meeting.gp_label,
      total_sessions: rows.length,
      ready_sessions: ready,
      has_ready_snapshots: ready > 0
    };
  });
  const latestUseful = readiness
    .filter(item => item.has_ready_snapshots)
    .sort((a, b) => {
      const meetingA = meetings.find(m => m.meeting_key === a.meeting_key);
      const meetingB = meetings.find(m => m.meeting_key === b.meeting_key);
      return Number(meetingB?.round || 0) - Number(meetingA?.round || 0);
    })[0] || null;

  return {
    latest_useful: index?.latest_useful || latestUseful || null,
    readiness
  };
}

export { snapshotLog, SNAPSHOT_INDEX_KEY };
