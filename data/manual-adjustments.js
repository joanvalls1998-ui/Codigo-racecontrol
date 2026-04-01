export const MANUAL_ADJUSTMENTS_AS_OF = "2026-04-01";

export const manualAdjustmentsState = {
  meta: {
    updatedAt: "2026-04-01T00:00:00.000Z",
    source: "initial_empty_state",
    version: 1,
    notes: [
      "Aquí se guardan SOLO ajustes semanales o puntuales",
      "No sustituye la base de performance.js",
      "La idea es aplicar estos deltas encima de la base"
    ]
  },

  limits: {
    teams: {
      perUpdate: {
        qualyPace: 2,
        racePace: 2,
        reliability: 2,
        upgradeMomentum: 1,
        recentTrend: 1,
        aero: 1,
        topSpeed: 1,
        traction: 1,
        tyreManagement: 1,
        streetTrack: 1,
        wetPerformance: 1
      },
      accumulated: {
        qualyPace: 8,
        racePace: 8,
        reliability: 8,
        upgradeMomentum: 4,
        recentTrend: 4,
        aero: 5,
        topSpeed: 5,
        traction: 5,
        tyreManagement: 5,
        streetTrack: 4,
        wetPerformance: 4
      }
    },

    drivers: {
      perUpdate: {
        form: 2,
        confidence: 2,
        qualySkill: 1,
        raceSkill: 1,
        consistency: 1,
        risk: 1,
        starts: 1,
        streetCraft: 1,
        wetWeather: 1,
        tyreSaving: 1
      },
      accumulated: {
        form: 6,
        confidence: 6,
        qualySkill: 4,
        raceSkill: 4,
        consistency: 4,
        risk: 4,
        starts: 3,
        streetCraft: 3,
        wetWeather: 3,
        tyreSaving: 3
      }
    }
  },

  teams: {
    // Ejemplo:
    // "Aston Martin": {
    //   qualyPace: 1,
    //   racePace: 2,
    //   reliability: 0,
    //   upgradeMomentum: 1,
    //   recentTrend: 1
    // }
  },

  drivers: {
    // Ejemplo:
    // "Fernando Alonso": {
    //   form: 1,
    //   confidence: 1,
    //   raceSkill: 1,
    //   risk: 0
    // }
  },

  newsSignals: [
    // Ejemplo:
    // {
    //   id: "news-aston-2026-04-01-1",
    //   date: "2026-04-01",
    //   entityType: "team",
    //   entityName: "Aston Martin",
    //   signalType: "upgrade",
    //   direction: "positive",
    //   strength: 1,
    //   confidence: 0.78,
    //   source: "news",
    //   headline: "Aston Martin introduce mejoras aerodinámicas",
    //   effect: {
    //     upgradeMomentum: 1,
    //     aero: 1
    //   }
    // }
  ],

  weeklySnapshots: [
    // Ejemplo:
    // {
    //   weekId: "2026-W14",
    //   createdAt: "2026-04-06T18:00:00.000Z",
    //   raceContext: "GP de Japón",
    //   summary: "Ajustes tras resultados y noticias",
    //   teamChanges: {
    //     "Mercedes": { racePace: 1 },
    //     "Aston Martin": { qualyPace: 1 }
    //   },
    //   driverChanges: {
    //     "Kimi Antonelli": { form: 1, confidence: 1 },
    //     "Fernando Alonso": { raceSkill: 1 }
    //   }
    // }
  ]
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

export function getTeamAdjustments(teamName) {
  return manualAdjustmentsState.teams[teamName] || {};
}

export function getDriverAdjustments(driverName) {
  return manualAdjustmentsState.drivers[driverName] || {};
}

export function getAllTeamAdjustments() {
  return manualAdjustmentsState.teams;
}

export function getAllDriverAdjustments() {
  return manualAdjustmentsState.drivers;
}

export function getNewsSignals() {
  return manualAdjustmentsState.newsSignals || [];
}

export function applyBoundedAdjustments(baseObject, deltaObject, limitObject) {
  const result = { ...baseObject };

  for (const [key, delta] of Object.entries(deltaObject || {})) {
    if (!isNumber(delta)) continue;

    const limit = isNumber(limitObject?.[key]) ? limitObject[key] : null;
    result[key] = limit == null ? delta : clamp(delta, -limit, limit);
  }

  return result;
}

export function sanitizeTeamDelta(deltaObject = {}) {
  return applyBoundedAdjustments(
    {},
    deltaObject,
    manualAdjustmentsState.limits.teams.perUpdate
  );
}

export function sanitizeDriverDelta(deltaObject = {}) {
  return applyBoundedAdjustments(
    {},
    deltaObject,
    manualAdjustmentsState.limits.drivers.perUpdate
  );
}

export function mergeAdjustmentObjects(current = {}, incoming = {}, accumulatedLimits = {}) {
  const merged = { ...current };

  for (const [key, value] of Object.entries(incoming || {})) {
    if (!isNumber(value)) continue;

    const previous = isNumber(merged[key]) ? merged[key] : 0;
    const raw = previous + value;
    const limit = isNumber(accumulatedLimits?.[key]) ? accumulatedLimits[key] : null;

    merged[key] = limit == null ? raw : clamp(raw, -limit, limit);
  }

  return merged;
}

export function previewMergedTeamAdjustments(teamName, newDelta = {}) {
  const current = getTeamAdjustments(teamName);
  const sanitized = sanitizeTeamDelta(newDelta);

  return mergeAdjustmentObjects(
    current,
    sanitized,
    manualAdjustmentsState.limits.teams.accumulated
  );
}

export function previewMergedDriverAdjustments(driverName, newDelta = {}) {
  const current = getDriverAdjustments(driverName);
  const sanitized = sanitizeDriverDelta(newDelta);

  return mergeAdjustmentObjects(
    current,
    sanitized,
    manualAdjustmentsState.limits.drivers.accumulated
  );
}