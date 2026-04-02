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
    const raw = previous + value;
    const limit = isNumber(accumulatedLimits[key]) ? accumulatedLimits[key] : null;

    merged[key] = limit == null ? raw : clamp(raw, -limit, limit);
  }

  return merged;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const token = process.env.VERCEL_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "Falta VERCEL_API_TOKEN"
      });
    }

    const currentState = await getCurrentState();

    const testPatch = {
      teams: {
        "Aston Martin": {
          qualyPace: 1,
          racePace: 1,
          upgradeMomentum: 1
        }
      },
      drivers: {
        "Fernando Alonso": {
          form: 1,
          confidence: 1,
          raceSkill: 1
        }
      },
      acceptedNewsSignals: [
        {
          id: `test-aston-${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          entityType: "team",
          entityName: "Aston Martin",
          signalType: "upgrade",
          direction: "positive",
          strength: 1,
          confidence: 0.99,
          source: "test-endpoint",
          headline: "Prueba manual de mejora para Aston Martin"
        }
      ]
    };

    const teamPerUpdateLimits = manualAdjustmentsState?.limits?.teams?.perUpdate || {};
    const teamAccumulatedLimits = manualAdjustmentsState?.limits?.teams?.accumulated || {};
    const driverPerUpdateLimits = manualAdjustmentsState?.limits?.drivers?.perUpdate || {};
    const driverAccumulatedLimits = manualAdjustmentsState?.limits?.drivers?.accumulated || {};

    const nextTeams = { ...(currentState.teams || {}) };
    const nextDrivers = { ...(currentState.drivers || {}) };

    for (const [teamName, rawDelta] of Object.entries(testPatch.teams)) {
      if (!teamByName[teamName]) continue;

      const sanitized = sanitizeDelta(rawDelta, teamPerUpdateLimits);
      nextTeams[teamName] = mergeWithAccumulatedLimits(
        currentState.teams?.[teamName] || {},
        sanitized,
        teamAccumulatedLimits
      );
    }

    for (const [driverName, rawDelta] of Object.entries(testPatch.drivers)) {
      if (!driverByName[driverName]) continue;

      const sanitized = sanitizeDelta(rawDelta, driverPerUpdateLimits);
      nextDrivers[driverName] = mergeWithAccumulatedLimits(
        currentState.drivers?.[driverName] || {},
        sanitized,
        driverAccumulatedLimits
      );
    }

    const nextState = {
      meta: {
        updatedAt: new Date().toISOString(),
        version: Number(currentState?.meta?.version || 1)
      },
      teams: nextTeams,
      drivers: nextDrivers,
      newsSignals: [
        ...(currentState.newsSignals || []),
        ...testPatch.acceptedNewsSignals
      ].slice(-100),
      weeklySnapshots: [
        ...(currentState.weeklySnapshots || []),
        {
          weekId: "TEST",
          createdAt: new Date().toISOString(),
          raceContext: "Prueba manual",
          summary: "Test de escritura en Edge Config",
          teamChanges: testPatch.teams,
          driverChanges: testPatch.drivers,
          acceptedNewsSignalsCount: testPatch.acceptedNewsSignals.length
        }
      ].slice(-20)
    };

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
        error: "No se pudo escribir el test en Edge Config",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Test de ajustes aplicado correctamente",
      state: nextState
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}