import { readState, writeState } from "../lib/state-manager.js";

const DEFAULT_STATE = {
  meta: { updatedAt: null, version: 1 },
  teams: {},
  drivers: {},
  newsSignals: [],
  weeklySnapshots: []
};

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeDelta(deltaObject = {}, perUpdateLimits = {}) {
  const result = {};
  for (const [key, value] of Object.entries(deltaObject || {})) {
    if (!isNumber(value)) continue;
    const limit = isNumber(perUpdateLimits[key]) ? perUpdateLimits[key] : null;
    result[key] = limit == null ? value : clamp(value, -limit, limit);
  }
  return result;
}

function mergeWithAccumulatedLimits(current = {}, incoming = {}, accumulatedLimits = {}) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (!isNumber(value)) continue;
    const previous = isNumber(merged[key]) ? merged[key] : 0;
    const nextRaw = previous + value;
    const limit = isNumber(accumulatedLimits[key]) ? accumulatedLimits[key] : null;
    merged[key] = limit == null ? nextRaw : clamp(nextRaw, -limit, limit);
  }
  return merged;
}

function normalizePatch(rawPatch = {}) {
  const patch = rawPatch?.suggestedPatch && typeof rawPatch.suggestedPatch === "object"
    ? rawPatch.suggestedPatch
    : rawPatch?.patch && typeof rawPatch.patch === "object"
      ? rawPatch.patch
      : rawPatch;
  return {
    meta: patch?.meta || {},
    teams: patch?.teams || {},
    drivers: patch?.drivers || {},
    acceptedNewsSignals: Array.isArray(patch?.acceptedNewsSignals) ? patch.acceptedNewsSignals : []
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const body = parseBody(req);
    const dryRun = Boolean(body?.dryRun);
    const normalizedPatch = normalizePatch(body);
    const currentState = await readState();

    const nextTeams = { ...(currentState.teams || {}) };
    const nextDrivers = { ...(currentState.drivers || {}) };

    for (const [teamName, rawDelta] of Object.entries(normalizedPatch.teams || {})) {
      const sanitized = sanitizeDelta(rawDelta, {});
      const merged = mergeWithAccumulatedLimits(currentState.teams?.[teamName] || {}, sanitized, {});
      nextTeams[teamName] = merged;
    }

    for (const [driverName, rawDelta] of Object.entries(normalizedPatch.drivers || {})) {
      const sanitized = sanitizeDelta(rawDelta, {});
      const merged = mergeWithAccumulatedLimits(currentState.drivers?.[driverName] || {}, sanitized, {});
      nextDrivers[driverName] = merged;
    }

    const acceptedNewsSignals = Array.isArray(normalizedPatch.acceptedNewsSignals) ? normalizedPatch.acceptedNewsSignals : [];
    const nextNewsSignals = [...(currentState.newsSignals || []), ...acceptedNewsSignals].slice(-100);

    const nextState = {
      meta: {
        updatedAt: new Date().toISOString(),
        version: Number(currentState?.meta?.version || 1)
      },
      teams: nextTeams,
      drivers: nextDrivers,
      newsSignals: nextNewsSignals,
      weeklySnapshots: currentState.weeklySnapshots || []
    };

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        mode: "dry_run",
        currentState,
        nextState
      });
    }

    await writeState(nextState);

    return res.status(200).json({
      ok: true,
      mode: "apply_adjustments_v1",
      message: "Ajustes aplicados",
      state: nextState
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}