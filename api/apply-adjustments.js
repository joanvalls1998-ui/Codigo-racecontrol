import { get } from "@vercel/edge-config";
import { teamByName, driverByName } from "../data/grid.js";
import { manualAdjustmentsState } from "../data/manual-adjustments.js";

const DEFAULT_STATE = {
  meta: {
    updatedAt: "2026-04-01T00:00:00.000Z",
    version: 1
  },
  teams: {},
  drivers: {},
  newsSignals: [],
  weeklySnapshots: []
};

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildEdgeConfigUrl() {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!edgeConfigId) {
    throw new Error("Falta EDGE_CONFIG_ID");
  }

  const url = new URL(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`);

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  return url.toString();
}

async function getCurrentState() {
  try {
    const edgeState = await get("state");

    if (
      edgeState &&
      typeof edgeState === "object" &&
      !Array.isArray(edgeState)
    ) {
      return {
        meta: edgeState.meta || DEFAULT_STATE.meta,
        teams: edgeState.teams || {},
        drivers: edgeState.drivers || {},
        newsSignals: Array.isArray(edgeState.newsSignals) ? edgeState.newsSignals : [],
        weeklySnapshots: Array.isArray(edgeState.weeklySnapshots)
          ? edgeState.weeklySnapshots
          : []
      };
    }

    return DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
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
  const patch =
    rawPatch?.suggestedPatch && typeof rawPatch.suggestedPatch === "object"
      ? rawPatch.suggestedPatch
      : rawPatch?.patch && typeof rawPatch.patch === "object"
        ? rawPatch.patch
        : rawPatch;

  return {
    meta: patch?.meta || {},
    teams: patch?.teams || {},
    drivers: patch?.drivers || {},
    acceptedNewsSignals: Array.isArray(patch?.acceptedNewsSignals)
      ? patch.acceptedNewsSignals
      : Array.isArray(patch?.newsSignals)
        ? patch.newsSignals
        : []
  };
}

function filterKnownEntities(objectMap = {}, type = "team") {
  const result = {};

  for (const [name, delta] of Object.entries(objectMap || {})) {
    const exists = type === "team" ? Boolean(teamByName[name]) : Boolean(driverByName[name]);
    if (!exists) continue;
    result[name] = delta;
  }

  return result;
}

function buildWeeklySnapshot({ patchMeta, appliedTeams, appliedDrivers, acceptedNewsSignals }) {
  const now = new Date().toISOString();

  return {
    weekId: patchMeta?.weekId || null,
    createdAt: now,
    raceContext: patchMeta?.raceName || null,
    summary: patchMeta?.summary || "Ajustes aplicados automáticamente",
    teamChanges: appliedTeams,
    driverChanges: appliedDrivers,
    acceptedNewsSignalsCount: acceptedNewsSignals.length
  };
}

function dedupeNewsSignals(existingSignals = [], newSignals = []) {
  const all = [...existingSignals];
  const seen = new Set(
    existingSignals.map((signal) => {
      return signal.id || `${signal.entityType}|${signal.entityName}|${signal.signalType}|${signal.headline || ""}|${signal.date || ""}`;
    })
  );

  for (const signal of newSignals) {
    const key =
      signal.id ||
      `${signal.entityType}|${signal.entityName}|${signal.signalType}|${signal.headline || ""}|${signal.date || ""}`;

    if (seen.has(key)) continue;
    seen.add(key);
    all.push(signal);
  }

  return all;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const token = process.env.VERCEL_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "Falta VERCEL_API_TOKEN"
      });
    }

    const body = parseBody(req);
    const dryRun = Boolean(body?.dryRun);
    const normalizedPatch = normalizePatch(body);

    const filteredTeams = filterKnownEntities(normalizedPatch.teams, "team");
    const filteredDrivers = filterKnownEntities(normalizedPatch.drivers, "driver");

    const currentState = await getCurrentState();

    const teamPerUpdateLimits = manualAdjustmentsState?.limits?.teams?.perUpdate || {};
    const teamAccumulatedLimits = manualAdjustmentsState?.limits?.teams?.accumulated || {};
    const driverPerUpdateLimits = manualAdjustmentsState?.limits?.drivers?.perUpdate || {};
    const driverAccumulatedLimits = manualAdjustmentsState?.limits?.drivers?.accumulated || {};

    const appliedTeams = {};
    const appliedDrivers = {};

    const nextTeams = { ...(currentState.teams || {}) };
    const nextDrivers = { ...(currentState.drivers || {}) };

    for (const [teamName, rawDelta] of Object.entries(filteredTeams)) {
      const sanitized = sanitizeDelta(rawDelta, teamPerUpdateLimits);
      const merged = mergeWithAccumulatedLimits(
        currentState.teams?.[teamName] || {},
        sanitized,
        teamAccumulatedLimits
      );

      nextTeams[teamName] = merged;
      appliedTeams[teamName] = {
        incoming: rawDelta,
        sanitized,
        previous: currentState.teams?.[teamName] || {},
        next: merged
      };
    }

    for (const [driverName, rawDelta] of Object.entries(filteredDrivers)) {
      const sanitized = sanitizeDelta(rawDelta, driverPerUpdateLimits);
      const merged = mergeWithAccumulatedLimits(
        currentState.drivers?.[driverName] || {},
        sanitized,
        driverAccumulatedLimits
      );

      nextDrivers[driverName] = merged;
      appliedDrivers[driverName] = {
        incoming: rawDelta,
        sanitized,
        previous: currentState.drivers?.[driverName] || {},
        next: merged
      };
    }

    const acceptedNewsSignals = Array.isArray(normalizedPatch.acceptedNewsSignals)
      ? normalizedPatch.acceptedNewsSignals
      : [];

    const nextWeeklySnapshots = [
      ...(currentState.weeklySnapshots || []),
      buildWeeklySnapshot({
        patchMeta: normalizedPatch.meta,
        appliedTeams,
        appliedDrivers,
        acceptedNewsSignals
      })
    ].slice(-20);

    const nextNewsSignals = dedupeNewsSignals(
      currentState.newsSignals || [],
      acceptedNewsSignals
    ).slice(-100);

    const nextState = {
      meta: {
        updatedAt: new Date().toISOString(),
        version: Number(currentState?.meta?.version || 1)
      },
      teams: nextTeams,
      drivers: nextDrivers,
      newsSignals: nextNewsSignals,
      weeklySnapshots: nextWeeklySnapshots
    };

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        mode: "dry_run",
        message: "Preview generada sin guardar cambios",
        currentState,
        nextState,
        appliedTeams,
        appliedDrivers,
        acceptedNewsSignalsCount: acceptedNewsSignals.length
      });
    }

    const response = await fetch(buildEdgeConfigUrl(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [
          {
            operation: "upsert",
            key: "state",
            value: nextState
          }
        ]
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "No se pudieron aplicar los ajustes en Edge Config",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      mode: "apply_adjustments_v1",
      message: "Ajustes aplicados correctamente",
      appliedTeams,
      appliedDrivers,
      acceptedNewsSignalsCount: acceptedNewsSignals.length,
      state: nextState
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}