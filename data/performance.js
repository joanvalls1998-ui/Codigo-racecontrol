export const PERFORMANCE_AS_OF = "2026-04-01";

export const performanceState = {
  meta: {
    sourceDate: "2026-04-01",
    seededFrom: "official_grid_and_current_2026_form_snapshot",
    modelVersion: 1,
    notes: [
      "Base editable para predicción semideterminista",
      "Los valores NO son oficiales: son una foto de rendimiento modelada",
      "La parrilla oficial vive en data/grid.js",
      "Este archivo está pensado para actualizarse tras cada GP"
    ]
  },

  teams: {
    Mercedes: {
      qualyPace: 93,
      racePace: 92,
      reliability: 85,
      aero: 90,
      topSpeed: 85,
      traction: 88,
      tyreManagement: 84,
      streetTrack: 83,
      wetPerformance: 84,
      upgradeMomentum: 3,
      recentTrend: 4,
      baseVariance: 5
    },

    Ferrari: {
      qualyPace: 89,
      racePace: 88,
      reliability: 79,
      aero: 86,
      topSpeed: 90,
      traction: 84,
      tyreManagement: 80,
      streetTrack: 82,
      wetPerformance: 80,
      upgradeMomentum: 2,
      recentTrend: 2,
      baseVariance: 6
    },

    McLaren: {
      qualyPace: 86,
      racePace: 85,
      reliability: 80,
      aero: 87,
      topSpeed: 82,
      traction: 85,
      tyreManagement: 84,
      streetTrack: 79,
      wetPerformance: 81,
      upgradeMomentum: 1,
      recentTrend: 1,
      baseVariance: 6
    },

    "Red Bull": {
      qualyPace: 79,
      racePace: 78,
      reliability: 68,
      aero: 88,
      topSpeed: 84,
      traction: 81,
      tyreManagement: 75,
      streetTrack: 77,
      wetPerformance: 83,
      upgradeMomentum: 0,
      recentTrend: -2,
      baseVariance: 8
    },

    Haas: {
      qualyPace: 72,
      racePace: 72,
      reliability: 72,
      aero: 69,
      topSpeed: 73,
      traction: 70,
      tyreManagement: 69,
      streetTrack: 68,
      wetPerformance: 67,
      upgradeMomentum: 1,
      recentTrend: 2,
      baseVariance: 7
    },

    "Racing Bulls": {
      qualyPace: 71,
      racePace: 70,
      reliability: 70,
      aero: 72,
      topSpeed: 70,
      traction: 71,
      tyreManagement: 68,
      streetTrack: 72,
      wetPerformance: 69,
      upgradeMomentum: 1,
      recentTrend: 1,
      baseVariance: 7
    },

    Alpine: {
      qualyPace: 69,
      racePace: 68,
      reliability: 68,
      aero: 70,
      topSpeed: 67,
      traction: 69,
      tyreManagement: 67,
      streetTrack: 68,
      wetPerformance: 69,
      upgradeMomentum: 0,
      recentTrend: 1,
      baseVariance: 7
    },

    Audi: {
      qualyPace: 63,
      racePace: 63,
      reliability: 69,
      aero: 64,
      topSpeed: 64,
      traction: 63,
      tyreManagement: 65,
      streetTrack: 61,
      wetPerformance: 64,
      upgradeMomentum: 0,
      recentTrend: 0,
      baseVariance: 6
    },

    Williams: {
      qualyPace: 63,
      racePace: 62,
      reliability: 67,
      aero: 63,
      topSpeed: 68,
      traction: 61,
      tyreManagement: 63,
      streetTrack: 60,
      wetPerformance: 63,
      upgradeMomentum: 0,
      recentTrend: -1,
      baseVariance: 7
    },

    Cadillac: {
      qualyPace: 61,
      racePace: 61,
      reliability: 64,
      aero: 60,
      topSpeed: 66,
      traction: 60,
      tyreManagement: 62,
      streetTrack: 63,
      wetPerformance: 62,
      upgradeMomentum: 0,
      recentTrend: 0,
      baseVariance: 7
    },

    "Aston Martin": {
      qualyPace: 57,
      racePace: 58,
      reliability: 60,
      aero: 60,
      topSpeed: 56,
      traction: 58,
      tyreManagement: 60,
      streetTrack: 57,
      wetPerformance: 61,
      upgradeMomentum: -1,
      recentTrend: -2,
      baseVariance: 8
    }
  },

  drivers: {
    "George Russell": {
      form: 90,
      qualySkill: 89,
      raceSkill: 88,
      tyreSaving: 83,
      wetWeather: 84,
      streetCraft: 80,
      starts: 83,
      defence: 86,
      attack: 85,
      consistency: 89,
      aggression: 72,
      risk: 18,
      recentTrend: 2,
      confidence: 90
    },

    "Kimi Antonelli": {
      form: 94,
      qualySkill: 91,
      raceSkill: 88,
      tyreSaving: 82,
      wetWeather: 81,
      streetCraft: 77,
      starts: 87,
      defence: 81,
      attack: 86,
      consistency: 84,
      aggression: 78,
      risk: 24,
      recentTrend: 4,
      confidence: 93
    },

    "Charles Leclerc": {
      form: 88,
      qualySkill: 91,
      raceSkill: 86,
      tyreSaving: 80,
      wetWeather: 80,
      streetCraft: 85,
      starts: 80,
      defence: 84,
      attack: 88,
      consistency: 84,
      aggression: 76,
      risk: 22,
      recentTrend: 2,
      confidence: 87
    },

    "Lewis Hamilton": {
      form: 86,
      qualySkill: 85,
      raceSkill: 90,
      tyreSaving: 86,
      wetWeather: 90,
      streetCraft: 91,
      starts: 82,
      defence: 90,
      attack: 87,
      consistency: 88,
      aggression: 70,
      risk: 18,
      recentTrend: 1,
      confidence: 86
    },

    "Lando Norris": {
      form: 82,
      qualySkill: 86,
      raceSkill: 83,
      tyreSaving: 82,
      wetWeather: 78,
      streetCraft: 79,
      starts: 79,
      defence: 80,
      attack: 84,
      consistency: 80,
      aggression: 75,
      risk: 22,
      recentTrend: 0,
      confidence: 81
    },

    "Oscar Piastri": {
      form: 81,
      qualySkill: 84,
      raceSkill: 84,
      tyreSaving: 83,
      wetWeather: 77,
      streetCraft: 78,
      starts: 82,
      defence: 79,
      attack: 82,
      consistency: 82,
      aggression: 71,
      risk: 20,
      recentTrend: 1,
      confidence: 81
    },

    "Max Verstappen": {
      form: 85,
      qualySkill: 89,
      raceSkill: 92,
      tyreSaving: 84,
      wetWeather: 89,
      streetCraft: 88,
      starts: 88,
      defence: 91,
      attack: 94,
      consistency: 86,
      aggression: 82,
      risk: 19,
      recentTrend: -1,
      confidence: 84
    },

    "Isack Hadjar": {
      form: 73,
      qualySkill: 76,
      raceSkill: 71,
      tyreSaving: 70,
      wetWeather: 69,
      streetCraft: 71,
      starts: 74,
      defence: 68,
      attack: 73,
      consistency: 68,
      aggression: 79,
      risk: 28,
      recentTrend: 0,
      confidence: 72
    },

    "Esteban Ocon": {
      form: 70,
      qualySkill: 69,
      raceSkill: 74,
      tyreSaving: 72,
      wetWeather: 72,
      streetCraft: 72,
      starts: 71,
      defence: 77,
      attack: 71,
      consistency: 74,
      aggression: 68,
      risk: 22,
      recentTrend: -1,
      confidence: 70
    },

    "Oliver Bearman": {
      form: 82,
      qualySkill: 79,
      raceSkill: 80,
      tyreSaving: 75,
      wetWeather: 73,
      streetCraft: 76,
      starts: 78,
      defence: 76,
      attack: 80,
      consistency: 78,
      aggression: 77,
      risk: 25,
      recentTrend: 3,
      confidence: 81
    },

    "Liam Lawson": {
      form: 76,
      qualySkill: 75,
      raceSkill: 74,
      tyreSaving: 72,
      wetWeather: 71,
      streetCraft: 74,
      starts: 75,
      defence: 72,
      attack: 75,
      consistency: 73,
      aggression: 74,
      risk: 24,
      recentTrend: 1,
      confidence: 75
    },

    "Arvid Lindblad": {
      form: 74,
      qualySkill: 76,
      raceSkill: 70,
      tyreSaving: 70,
      wetWeather: 68,
      streetCraft: 72,
      starts: 76,
      defence: 67,
      attack: 75,
      consistency: 67,
      aggression: 80,
      risk: 30,
      recentTrend: 2,
      confidence: 74
    },

    "Pierre Gasly": {
      form: 79,
      qualySkill: 78,
      raceSkill: 79,
      tyreSaving: 76,
      wetWeather: 77,
      streetCraft: 78,
      starts: 75,
      defence: 78,
      attack: 79,
      consistency: 80,
      aggression: 71,
      risk: 20,
      recentTrend: 2,
      confidence: 79
    },

    "Franco Colapinto": {
      form: 71,
      qualySkill: 70,
      raceSkill: 70,
      tyreSaving: 69,
      wetWeather: 68,
      streetCraft: 70,
      starts: 72,
      defence: 67,
      attack: 72,
      consistency: 68,
      aggression: 78,
      risk: 28,
      recentTrend: 0,
      confidence: 70
    },

    "Nico Hulkenberg": {
      form: 73,
      qualySkill: 72,
      raceSkill: 78,
      tyreSaving: 74,
      wetWeather: 72,
      streetCraft: 73,
      starts: 71,
      defence: 77,
      attack: 72,
      consistency: 79,
      aggression: 63,
      risk: 18,
      recentTrend: 0,
      confidence: 73
    },

    "Gabriel Bortoleto": {
      form: 72,
      qualySkill: 71,
      raceSkill: 70,
      tyreSaving: 71,
      wetWeather: 69,
      streetCraft: 69,
      starts: 73,
      defence: 68,
      attack: 71,
      consistency: 69,
      aggression: 74,
      risk: 24,
      recentTrend: 1,
      confidence: 71
    },

    "Carlos Sainz": {
      form: 76,
      qualySkill: 75,
      raceSkill: 81,
      tyreSaving: 80,
      wetWeather: 78,
      streetCraft: 80,
      starts: 74,
      defence: 80,
      attack: 78,
      consistency: 82,
      aggression: 66,
      risk: 18,
      recentTrend: 0,
      confidence: 76
    },

    "Alexander Albon": {
      form: 73,
      qualySkill: 74,
      raceSkill: 75,
      tyreSaving: 73,
      wetWeather: 72,
      streetCraft: 73,
      starts: 73,
      defence: 74,
      attack: 75,
      consistency: 74,
      aggression: 70,
      risk: 21,
      recentTrend: -1,
      confidence: 72
    },

    "Sergio Perez": {
      form: 73,
      qualySkill: 71,
      raceSkill: 77,
      tyreSaving: 76,
      wetWeather: 74,
      streetCraft: 76,
      starts: 77,
      defence: 73,
      attack: 76,
      consistency: 74,
      aggression: 69,
      risk: 21,
      recentTrend: 0,
      confidence: 72
    },

    "Valtteri Bottas": {
      form: 72,
      qualySkill: 74,
      raceSkill: 75,
      tyreSaving: 75,
      wetWeather: 74,
      streetCraft: 71,
      starts: 72,
      defence: 74,
      attack: 71,
      consistency: 77,
      aggression: 60,
      risk: 17,
      recentTrend: 0,
      confidence: 72
    },

    "Fernando Alonso": {
      form: 84,
      qualySkill: 82,
      raceSkill: 91,
      tyreSaving: 88,
      wetWeather: 89,
      streetCraft: 90,
      starts: 79,
      defence: 90,
      attack: 88,
      consistency: 87,
      aggression: 67,
      risk: 18,
      recentTrend: 0,
      confidence: 83
    },

    "Lance Stroll": {
      form: 69,
      qualySkill: 68,
      raceSkill: 68,
      tyreSaving: 69,
      wetWeather: 70,
      streetCraft: 70,
      starts: 70,
      defence: 67,
      attack: 68,
      consistency: 67,
      aggression: 66,
      risk: 24,
      recentTrend: -1,
      confidence: 68
    }
  },

  manualAdjustments: {
    teams: {
      // Ejemplo:
      // "Aston Martin": {
      //   qualyPace: +2,
      //   racePace: +3,
      //   reliability: -1
      // }
    },

    drivers: {
      // Ejemplo:
      // "Fernando Alonso": {
      //   form: +1,
      //   raceSkill: +1
      // }
    }
  },

  weeklyUpdateTemplate: {
    teams: {
      // ejemplo de estructura que luego podrá rellenar la IA
      // "Ferrari": {
      //   reason: "mejora de suelo en Miami",
      //   changes: { racePace: +2, tyreManagement: +1 }
      // }
    },
    drivers: {
      // "Kimi Antonelli": {
      //   reason: "muy buen último triplete",
      //   changes: { confidence: +2, form: +2 }
      // }
    }
  }
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function applyNumericAdjustments(base, adjustments = {}) {
  const result = {};

  for (const [key, value] of Object.entries(base)) {
    if (typeof value === "number") {
      result[key] = clamp(value + (adjustments[key] || 0));
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function getEffectiveTeamPerformance(teamName) {
  const base = performanceState.teams[teamName];
  if (!base) return null;

  const adjustments = performanceState.manualAdjustments.teams[teamName] || {};
  return applyNumericAdjustments(base, adjustments);
}

export function getEffectiveDriverPerformance(driverName) {
  const base = performanceState.drivers[driverName];
  if (!base) return null;

  const adjustments = performanceState.manualAdjustments.drivers[driverName] || {};
  return applyNumericAdjustments(base, adjustments);
}

export function getAllEffectiveTeamPerformance() {
  return Object.fromEntries(
    Object.keys(performanceState.teams).map(teamName => [
      teamName,
      getEffectiveTeamPerformance(teamName)
    ])
  );
}

export function getAllEffectiveDriverPerformance() {
  return Object.fromEntries(
    Object.keys(performanceState.drivers).map(driverName => [
      driverName,
      getEffectiveDriverPerformance(driverName)
    ])
  );
}