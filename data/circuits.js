export const CIRCUITS_AS_OF = "2026-04-01";

export const circuitProfiles = {
  "GP de Australia": {
    round: 1,
    venue: "Melbourne",
    officialVenue: "Albert Park",
    start: "2026-03-06",
    end: "2026-03-08",
    type: "semiurbano",
    overtaking: 58,
    baseRainChance: 24,
    baseSafetyCarChance: 42,
    degradation: 58,
    weights: {
      qualyImportance: 0.58,
      racePaceImportance: 0.72,
      reliabilityStress: 0.48,
      tyreManagement: 0.55,
      traction: 0.58,
      aero: 0.62,
      topSpeed: 0.45,
      streetTrack: 0.40
    }
  },

  "GP de China": {
    round: 2,
    venue: "Shanghái",
    officialVenue: "Shanghai International Circuit",
    start: "2026-03-13",
    end: "2026-03-15",
    type: "permanente",
    overtaking: 67,
    baseRainChance: 20,
    baseSafetyCarChance: 28,
    degradation: 66,
    weights: {
      qualyImportance: 0.54,
      racePaceImportance: 0.77,
      reliabilityStress: 0.45,
      tyreManagement: 0.68,
      traction: 0.55,
      aero: 0.60,
      topSpeed: 0.71,
      streetTrack: 0.10
    }
  },

  "GP de Japón": {
    round: 3,
    venue: "Suzuka",
    officialVenue: "Suzuka Circuit",
    start: "2026-03-27",
    end: "2026-03-29",
    type: "permanente",
    overtaking: 44,
    baseRainChance: 26,
    baseSafetyCarChance: 24,
    degradation: 62,
    weights: {
      qualyImportance: 0.67,
      racePaceImportance: 0.73,
      reliabilityStress: 0.46,
      tyreManagement: 0.61,
      traction: 0.49,
      aero: 0.86,
      topSpeed: 0.38,
      streetTrack: 0.05
    }
  },

  "GP de Baréin": {
    round: 4,
    venue: "Baréin",
    officialVenue: "Sakhir",
    start: "2026-04-10",
    end: "2026-04-12",
    type: "permanente",
    overtaking: 72,
    baseRainChance: 1,
    baseSafetyCarChance: 26,
    degradation: 71,
    weights: {
      qualyImportance: 0.57,
      racePaceImportance: 0.79,
      reliabilityStress: 0.47,
      tyreManagement: 0.78,
      traction: 0.72,
      aero: 0.41,
      topSpeed: 0.70,
      streetTrack: 0.00
    }
  },

  "GP de Arabia Saudí": {
    round: 5,
    venue: "Yeda",
    officialVenue: "Jeddah Corniche Circuit",
    start: "2026-04-17",
    end: "2026-04-19",
    type: "urbano",
    overtaking: 64,
    baseRainChance: 1,
    baseSafetyCarChance: 47,
    degradation: 46,
    weights: {
      qualyImportance: 0.63,
      racePaceImportance: 0.65,
      reliabilityStress: 0.56,
      tyreManagement: 0.44,
      traction: 0.48,
      aero: 0.58,
      topSpeed: 0.77,
      streetTrack: 0.90
    }
  },

  "GP Miami": {
    round: 6,
    venue: "Miami",
    officialVenue: "Miami International Autodrome",
    start: "2026-05-01",
    end: "2026-05-03",
    type: "semiurbano",
    overtaking: 63,
    baseRainChance: 18,
    baseSafetyCarChance: 46,
    degradation: 57,
    weights: {
      qualyImportance: 0.56,
      racePaceImportance: 0.69,
      reliabilityStress: 0.52,
      tyreManagement: 0.58,
      traction: 0.66,
      aero: 0.57,
      topSpeed: 0.61,
      streetTrack: 0.52
    }
  },

  "GP de Canadá": {
    round: 7,
    venue: "Montreal",
    officialVenue: "Circuit Gilles Villeneuve",
    start: "2026-05-22",
    end: "2026-05-24",
    type: "semiurbano",
    overtaking: 66,
    baseRainChance: 21,
    baseSafetyCarChance: 50,
    degradation: 52,
    weights: {
      qualyImportance: 0.55,
      racePaceImportance: 0.66,
      reliabilityStress: 0.54,
      tyreManagement: 0.48,
      traction: 0.68,
      aero: 0.44,
      topSpeed: 0.72,
      streetTrack: 0.64
    }
  },

  "GP de Mónaco": {
    round: 8,
    venue: "Mónaco",
    officialVenue: "Montecarlo",
    start: "2026-06-05",
    end: "2026-06-07",
    type: "urbano",
    overtaking: 12,
    baseRainChance: 16,
    baseSafetyCarChance: 38,
    degradation: 40,
    weights: {
      qualyImportance: 0.92,
      racePaceImportance: 0.48,
      reliabilityStress: 0.47,
      tyreManagement: 0.36,
      traction: 0.78,
      aero: 0.67,
      topSpeed: 0.10,
      streetTrack: 0.95
    }
  },

  "GP de España": {
    round: 9,
    venue: "Barcelona-Catalunya",
    officialVenue: "Circuit de Barcelona-Catalunya",
    start: "2026-06-12",
    end: "2026-06-14",
    type: "permanente",
    overtaking: 46,
    baseRainChance: 11,
    baseSafetyCarChance: 20,
    degradation: 67,
    weights: {
      qualyImportance: 0.60,
      racePaceImportance: 0.79,
      reliabilityStress: 0.42,
      tyreManagement: 0.70,
      traction: 0.48,
      aero: 0.79,
      topSpeed: 0.34,
      streetTrack: 0.02
    }
  },

  "GP de Austria": {
    round: 10,
    venue: "Spielberg",
    officialVenue: "Red Bull Ring",
    start: "2026-06-26",
    end: "2026-06-28",
    type: "permanente",
    overtaking: 68,
    baseRainChance: 28,
    baseSafetyCarChance: 32,
    degradation: 54,
    weights: {
      qualyImportance: 0.62,
      racePaceImportance: 0.66,
      reliabilityStress: 0.40,
      tyreManagement: 0.50,
      traction: 0.76,
      aero: 0.42,
      topSpeed: 0.73,
      streetTrack: 0.03
    }
  },

  "GP de Gran Bretaña": {
    round: 11,
    venue: "Silverstone",
    officialVenue: "Silverstone",
    start: "2026-07-03",
    end: "2026-07-05",
    type: "permanente",
    overtaking: 59,
    baseRainChance: 29,
    baseSafetyCarChance: 24,
    degradation: 63,
    weights: {
      qualyImportance: 0.61,
      racePaceImportance: 0.76,
      reliabilityStress: 0.44,
      tyreManagement: 0.63,
      traction: 0.42,
      aero: 0.87,
      topSpeed: 0.40,
      streetTrack: 0.01
    }
  },

  "GP de Bélgica": {
    round: 12,
    venue: "Spa-Francorchamps",
    officialVenue: "Spa-Francorchamps",
    start: "2026-07-17",
    end: "2026-07-19",
    type: "permanente",
    overtaking: 64,
    baseRainChance: 36,
    baseSafetyCarChance: 33,
    degradation: 56,
    weights: {
      qualyImportance: 0.55,
      racePaceImportance: 0.70,
      reliabilityStress: 0.50,
      tyreManagement: 0.54,
      traction: 0.37,
      aero: 0.61,
      topSpeed: 0.74,
      streetTrack: 0.00
    }
  },

  "GP de Hungría": {
    round: 13,
    venue: "Budapest",
    officialVenue: "Hungaroring",
    start: "2026-07-24",
    end: "2026-07-26",
    type: "permanente",
    overtaking: 24,
    baseRainChance: 19,
    baseSafetyCarChance: 27,
    degradation: 64,
    weights: {
      qualyImportance: 0.82,
      racePaceImportance: 0.64,
      reliabilityStress: 0.38,
      tyreManagement: 0.63,
      traction: 0.71,
      aero: 0.67,
      topSpeed: 0.16,
      streetTrack: 0.04
    }
  },

  "GP de Países Bajos": {
    round: 14,
    venue: "Zandvoort",
    officialVenue: "Zandvoort",
    start: "2026-08-21",
    end: "2026-08-23",
    type: "permanente",
    overtaking: 22,
    baseRainChance: 23,
    baseSafetyCarChance: 25,
    degradation: 57,
    weights: {
      qualyImportance: 0.83,
      racePaceImportance: 0.63,
      reliabilityStress: 0.37,
      tyreManagement: 0.54,
      traction: 0.56,
      aero: 0.76,
      topSpeed: 0.22,
      streetTrack: 0.02
    }
  },

  "GP de Italia": {
    round: 15,
    venue: "Monza",
    officialVenue: "Monza",
    start: "2026-09-04",
    end: "2026-09-06",
    type: "permanente",
    overtaking: 71,
    baseRainChance: 18,
    baseSafetyCarChance: 26,
    degradation: 47,
    weights: {
      qualyImportance: 0.60,
      racePaceImportance: 0.65,
      reliabilityStress: 0.43,
      tyreManagement: 0.43,
      traction: 0.49,
      aero: 0.12,
      topSpeed: 0.94,
      streetTrack: 0.00
    }
  },

  "GP de España (Madrid)": {
    round: 16,
    venue: "Madrid",
    officialVenue: "Madrid",
    start: "2026-09-11",
    end: "2026-09-13",
    type: "urbano",
    overtaking: 36,
    baseRainChance: 10,
    baseSafetyCarChance: 41,
    degradation: 55,
    weights: {
      qualyImportance: 0.73,
      racePaceImportance: 0.63,
      reliabilityStress: 0.49,
      tyreManagement: 0.52,
      traction: 0.70,
      aero: 0.51,
      topSpeed: 0.46,
      streetTrack: 0.81
    }
  },

  "GP de Azerbaiyán": {
    round: 17,
    venue: "Bakú",
    officialVenue: "Bakú",
    start: "2026-09-24",
    end: "2026-09-26",
    type: "urbano",
    overtaking: 69,
    baseRainChance: 9,
    baseSafetyCarChance: 48,
    degradation: 44,
    weights: {
      qualyImportance: 0.60,
      racePaceImportance: 0.62,
      reliabilityStress: 0.54,
      tyreManagement: 0.40,
      traction: 0.58,
      aero: 0.27,
      topSpeed: 0.88,
      streetTrack: 0.89
    }
  },

  "GP de Singapur": {
    round: 18,
    venue: "Singapur",
    officialVenue: "Marina Bay",
    start: "2026-10-09",
    end: "2026-10-11",
    type: "urbano",
    overtaking: 31,
    baseRainChance: 33,
    baseSafetyCarChance: 57,
    degradation: 69,
    weights: {
      qualyImportance: 0.70,
      racePaceImportance: 0.71,
      reliabilityStress: 0.61,
      tyreManagement: 0.72,
      traction: 0.79,
      aero: 0.60,
      topSpeed: 0.20,
      streetTrack: 0.92
    }
  },

  "GP de Estados Unidos": {
    round: 19,
    venue: "Austin",
    officialVenue: "Austin",
    start: "2026-10-23",
    end: "2026-10-25",
    type: "permanente",
    overtaking: 57,
    baseRainChance: 17,
    baseSafetyCarChance: 27,
    degradation: 66,
    weights: {
      qualyImportance: 0.58,
      racePaceImportance: 0.76,
      reliabilityStress: 0.45,
      tyreManagement: 0.70,
      traction: 0.54,
      aero: 0.74,
      topSpeed: 0.42,
      streetTrack: 0.00
    }
  },

  "GP de México": {
    round: 20,
    venue: "Ciudad de México",
    officialVenue: "Hermanos Rodríguez",
    start: "2026-10-30",
    end: "2026-11-01",
    type: "permanente_altitud",
    overtaking: 72,
    baseRainChance: 8,
    baseSafetyCarChance: 29,
    degradation: 49,
    weights: {
      qualyImportance: 0.57,
      racePaceImportance: 0.67,
      reliabilityStress: 0.48,
      tyreManagement: 0.48,
      traction: 0.58,
      aero: 0.36,
      topSpeed: 0.75,
      streetTrack: 0.01
    }
  },

  "GP de São Paulo": {
    round: 21,
    venue: "São Paulo",
    officialVenue: "Interlagos",
    start: "2026-11-06",
    end: "2026-11-08",
    type: "permanente",
    overtaking: 65,
    baseRainChance: 31,
    baseSafetyCarChance: 35,
    degradation: 58,
    weights: {
      qualyImportance: 0.55,
      racePaceImportance: 0.71,
      reliabilityStress: 0.46,
      tyreManagement: 0.58,
      traction: 0.60,
      aero: 0.52,
      topSpeed: 0.47,
      streetTrack: 0.00
    }
  },

  "GP de Las Vegas": {
    round: 22,
    venue: "Las Vegas",
    officialVenue: "Las Vegas Strip Circuit",
    start: "2026-11-19",
    end: "2026-11-21",
    type: "urbano",
    overtaking: 74,
    baseRainChance: 4,
    baseSafetyCarChance: 39,
    degradation: 43,
    weights: {
      qualyImportance: 0.56,
      racePaceImportance: 0.62,
      reliabilityStress: 0.53,
      tyreManagement: 0.42,
      traction: 0.44,
      aero: 0.19,
      topSpeed: 0.91,
      streetTrack: 0.84
    }
  },

  "GP de Catar": {
    round: 23,
    venue: "Lusail",
    officialVenue: "Lusail",
    start: "2026-11-27",
    end: "2026-11-29",
    type: "permanente",
    overtaking: 49,
    baseRainChance: 2,
    baseSafetyCarChance: 22,
    degradation: 71,
    weights: {
      qualyImportance: 0.61,
      racePaceImportance: 0.77,
      reliabilityStress: 0.47,
      tyreManagement: 0.76,
      traction: 0.41,
      aero: 0.80,
      topSpeed: 0.29,
      streetTrack: 0.00
    }
  },

  "GP de Abu Dabi": {
    round: 24,
    venue: "Yas Marina",
    officialVenue: "Yas Marina",
    start: "2026-12-04",
    end: "2026-12-06",
    type: "permanente",
    overtaking: 53,
    baseRainChance: 1,
    baseSafetyCarChance: 23,
    degradation: 51,
    weights: {
      qualyImportance: 0.61,
      racePaceImportance: 0.69,
      reliabilityStress: 0.42,
      tyreManagement: 0.50,
      traction: 0.69,
      aero: 0.46,
      topSpeed: 0.52,
      streetTrack: 0.04
    }
  }
};

export const raceOptions = Object.keys(circuitProfiles);

export function getCircuitProfile(raceName) {
  return circuitProfiles[raceName] || null;
}

export function getRaceOptionLabels() {
  return raceOptions.map(raceName => ({
    value: raceName,
    label: raceName
  }));
}