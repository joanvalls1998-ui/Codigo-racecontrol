import { readState } from "./lib/state-manager.js";
import { drivers2026, driverByName, teamByName } from "../data/grid.js";
import { performanceState } from "../data/performance.js";
import { manualAdjustmentsState } from "../data/manual-adjustments.js";
import { getCircuitProfile, raceOptions } from "../data/circuits.js";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

async function getRuntimeAdjustmentsState() {
  try {
    const state = await readState();
    if (state && typeof state === "object" && !Array.isArray(state)) {
      return {
        meta: state.meta || manualAdjustmentsState.meta,
        limits: manualAdjustmentsState.limits,
        teams: state.teams || {},
        drivers: state.drivers || {},
        newsSignals: Array.isArray(state.newsSignals) ? state.newsSignals : [],
        weeklySnapshots: Array.isArray(state.weeklySnapshots) ? state.weeklySnapshots : []
      };
    }
    return manualAdjustmentsState;
  } catch { return manualAdjustmentsState; }
}

function mergeNumericObjects(base = {}, ...layers) {
  const result = { ...base };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (typeof value === "number" && !Number.isNaN(value)) {
        const previous = typeof result[key] === "number" ? result[key] : 0;
        result[key] = clamp(previous + value, 0, 100);
      } else if (!(key in result)) {
        result[key] = value;
      }
    }
  }
  return result;
}

function getEffectiveTeamPerformance(teamName, runtimeAdjustmentsState) {
  const base = performanceState?.teams?.[teamName];
  if (!base) return null;
  const internalAdjustments = performanceState?.manualAdjustments?.teams?.[teamName] || {};
  const externalAdjustments = runtimeAdjustmentsState?.teams?.[teamName] || {};
  return mergeNumericObjects(base, internalAdjustments, externalAdjustments);
}

function getEffectiveDriverPerformance(driverName, runtimeAdjustmentsState) {
  const base = performanceState?.drivers?.[driverName];
  if (!base) return null;
  const internalAdjustments = performanceState?.manualAdjustments?.drivers?.[driverName] || {};
  const externalAdjustments = runtimeAdjustmentsState?.drivers?.[driverName] || {};
  return mergeNumericObjects(base, internalAdjustments, externalAdjustments);
}

function getStreetFactor(type) {
  if (type === "urbano") return 1;
  if (type === "semiurbano") return 0.6;
  return 0;
}

function getWetFactor(rainChance) {
  if (rainChance >= 30) return 1;
  if (rainChance >= 18) return 0.55;
  return 0;
}

function getTeamFit(teamPerf, circuit) {
  const w = circuit.weights;
  const totalWeight = w.aero + w.topSpeed + w.traction + w.tyreManagement + w.streetTrack;
  if (!totalWeight) return 0;
  return (teamPerf.aero * w.aero + teamPerf.topSpeed * w.topSpeed + teamPerf.traction * w.traction + teamPerf.tyreManagement * w.tyreManagement + teamPerf.streetTrack * w.streetTrack) / totalWeight;
}

function computeQualyScore(driver, teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const wetFactor = getWetFactor(circuit.baseRainChance);
  const teamFit = getTeamFit(teamPerf, circuit);
  const streetAdj = streetFactor * ((teamPerf.streetTrack + driverPerf.streetCraft) / 2);
  const wetAdj = wetFactor * ((teamPerf.wetPerformance + driverPerf.wetWeather) / 2);
  return round(
    teamPerf.qualyPace * 0.46 + teamFit * 0.16 + driverPerf.qualySkill * 0.14 +
    driverPerf.form * 0.10 + driverPerf.confidence * 0.05 + streetAdj * 0.05 +
    wetAdj * 0.04 + teamPerf.upgradeMomentum * 0.35 + teamPerf.recentTrend * 0.45 + driverPerf.recentTrend * 0.55, 3);
}

function computeRaceScore(driver, teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const wetFactor = getWetFactor(circuit.baseRainChance);
  const teamFit = getTeamFit(teamPerf, circuit);
  const streetAdj = streetFactor * ((teamPerf.streetTrack + driverPerf.streetCraft) / 2);
  const wetAdj = wetFactor * ((teamPerf.wetPerformance + driverPerf.wetWeather) / 2);
  return round(
    teamPerf.racePace * 0.34 + teamFit * 0.12 + teamPerf.reliability * 0.14 +
    teamPerf.tyreManagement * 0.11 + driverPerf.raceSkill * 0.11 +
    driverPerf.form * 0.06 + driverPerf.consistency * 0.05 + driverPerf.tyreSaving * 0.03 +
    driverPerf.starts * 0.02 + streetAdj * 0.01 + wetAdj * 0.01 +
    teamPerf.upgradeMomentum * 0.40 + teamPerf.recentTrend * 0.50 + driverPerf.recentTrend * 0.50, 3);
}

function computeDnfProbability(teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const mechanicalRisk = 26 - teamPerf.reliability * 0.18;
  const circuitStress = circuit.weights.reliabilityStress * 7;
  const driverRisk = (driverPerf.risk - 20) * 0.45;
  const streetRisk = streetFactor === 1 ? 2.5 : streetFactor > 0 ? 1.2 : 0;
  const weatherRisk = circuit.baseRainChance * 0.03;
  const consistencyRelief = driverPerf.consistency > 70 ? (driverPerf.consistency - 70) * 0.12 : 0;
  return round(clamp(mechanicalRisk + circuitStress + driverRisk + streetRisk + weatherRisk - consistencyRelief, 6, 45), 1);
}

function computePointsProbability(predictedRacePosition, teamPerf, driverPerf, circuit, dnfProbability) {
  const baseByPosition = {1:99,2:98,3:96,4:93,5:89,6:84,7:78,8:72,9:65,10:56,11:44,12:34,13:26,14:20,15:15,16:11,17:8,18:6,19:5,20:4,21:3,22:2};
  let probability = baseByPosition[predictedRacePosition] ?? 2;
  probability -= dnfProbability * 0.35;
  probability += (teamPerf.reliability - 70) * 0.18;
  probability += (driverPerf.consistency - 75) * 0.12;
  if (predictedRacePosition >= 11 && predictedRacePosition <= 13) {
    probability += circuit.overtaking * 0.08;
    probability += circuit.baseSafetyCarChance * 0.10;
  }
  return round(clamp(probability, 1, 99), 1);
}

function computeStrategy(circuit) {
  const { degradation, overtaking, baseSafetyCarChance: safetyCar, baseRainChance: rain } = circuit;
  if (rain >= 40) return { label: "Estrategia abierta por posible lluvia", stops: "Variable" };
  if (degradation >= 67) return { label: safetyCar >= 40 ? "Dos paradas con ventana flexible por Safety Car" : "Dos paradas buscando proteger neumáticos", stops: 2 };
  if (degradation >= 58 && overtaking >= 45) return { label: "Dos paradas para aprovechar ritmo y aire limpio", stops: 2 };
  if (overtaking <= 25) return { label: "Una parada priorizando posición en pista", stops: 1 };
  return { label: safetyCar >= 45 ? "Una parada flexible con opción de reaccionar al Safety Car" : "Una parada como estrategia base", stops: 1 };
}

function buildDriverPredictions(circuit, runtimeAdjustmentsState) {
  return drivers2026.map((driver) => {
    const teamPerf = getEffectiveTeamPerformance(driver.team, runtimeAdjustmentsState);
    const driverPerf = getEffectiveDriverPerformance(driver.name, runtimeAdjustmentsState);
    return {
      name: driver.name, number: driver.number, shortCode: driver.shortCode, team: driver.team,
      teamKey: driver.teamKey, colorClass: driver.colorClass,
      qualyScore: computeQualyScore(driver, teamPerf, driverPerf, circuit),
      raceScore: computeRaceScore(driver, teamPerf, driverPerf, circuit),
      dnfProbability: computeDnfProbability(teamPerf, driverPerf, circuit),
      teamPerf, driverPerf
    };
  });
}

function assignPositions(list, scoreKey) {
  const sorted = [...list].sort((a, b) => b[scoreKey] !== a[scoreKey] ? b[scoreKey] - a[scoreKey] : a.name.localeCompare(a.name, "es"));
  return sorted.map((item, index) => ({ ...item, position: index + 1 }));
}

function buildRacePredictions(circuit, runtimeAdjustmentsState) {
  const base = buildDriverPredictions(circuit, runtimeAdjustmentsState);
  const qualyOrder = assignPositions(base, "qualyScore");
  const raceSeed = base.map((driver) => {
    const qualyReference = qualyOrder.find((q) => q.name === driver.name);
    const overtakingFactor = circuit.overtaking / 100;
    const qualyCarry = (23 - qualyReference.position) * 0.18 * (1 - overtakingFactor);
    return { ...driver, raceScoreAdjusted: round(driver.raceScore + qualyCarry, 3) };
  });
  const raceOrder = assignPositions(raceSeed, "raceScoreAdjusted").map((driver) => ({
    ...driver, pointsProbability: computePointsProbability(driver.position, driver.teamPerf, driver.driverPerf, circuit, driver.dnfProbability)
  }));
  return { qualyOrder, raceOrder };
}

function buildTeamSummary(raceOrder, qualyOrder) {
  const teamMap = new Map();
  for (const driver of raceOrder) {
    if (!teamMap.has(driver.team)) teamMap.set(driver.team, { team: driver.team, racePositions: [], qualyPositions: [], pointsProbabilities: [], dnfProbabilities: [], averageRaceScore: 0 });
    const team = teamMap.get(driver.team);
    const qualyDriver = qualyOrder.find((q) => q.name === driver.name);
    team.racePositions.push(driver.position);
    team.qualyPositions.push(qualyDriver?.position || 22);
    team.pointsProbabilities.push(driver.pointsProbability);
    team.dnfProbabilities.push(driver.dnfProbability);
    team.averageRaceScore += driver.raceScoreAdjusted;
  }
  const teams = [...teamMap.values()].map((team) => ({
    team: team.team, bestQualy: Math.min(...team.qualyPositions), bestRace: Math.min(...team.racePositions),
    averageQualy: round(team.qualyPositions.reduce((a, b) => a + b, 0) / team.qualyPositions.length, 2),
    averageRace: round(team.racePositions.reduce((a, b) => a + b, 0) / team.racePositions.length, 2),
    averagePointsProbability: round(team.pointsProbabilities.reduce((a, b) => a + b, 0) / team.pointsProbabilities.length, 1),
    atLeastOneDnfProbability: round(100 * (1 - team.dnfProbabilities.reduce((acc, p) => acc * (1 - p / 100), 1)), 1),
    averageRaceScore: round(team.averageRaceScore / team.racePositions.length, 3)
  }));
  return teams.sort((a, b) => b.averageRaceScore !== a.averageRaceScore ? b.averageRaceScore - a.averageRaceScore : a.team.localeCompare(b.team, "es"));
}

function resolveFavorite(bodyFavorite) {
  const fallbackDriver = driverByName["Fernando Alonso"];
  if (!bodyFavorite || typeof bodyFavorite !== "object") return { type: "driver", name: fallbackDriver.name, team: fallbackDriver.team };
  if (bodyFavorite.type === "team" && teamByName[bodyFavorite.name]) return { type: "team", name: bodyFavorite.name };
  if (bodyFavorite.name && driverByName[bodyFavorite.name]) {
    const d = driverByName[bodyFavorite.name];
    return { type: "driver", name: d.name, team: d.team };
  }
  return { type: "driver", name: fallbackDriver.name, team: fallbackDriver.team };
}

function buildFavoritePrediction(favorite, qualyOrder, raceOrder) {
  if (favorite.type === "driver") {
    const driverQualy = qualyOrder.find((q) => q.name === favorite.name);
    const driverRace = raceOrder.find((r) => r.name === favorite.name);
    return {
      type: "driver", name: favorite.name, team: favorite.team,
      predictedQualyPosition: driverQualy?.position ?? null,
      predictedRacePosition: driverRace?.position ?? null,
      pointsProbability: driverRace?.pointsProbability ?? 1,
      dnfProbability: driverRace?.dnfProbability ?? 0,
      qualyScore: driverQualy?.qualyScore ?? 0,
      raceScore: driverRace?.raceScoreAdjusted ?? 0
    };
  }
  const teamDrivers = raceOrder.filter((d) => d.team === favorite.name);
  const teamQualy = qualyOrder.filter((d) => d.team === favorite.name);
  const teamRace = raceOrder.filter((d) => d.team === favorite.name);
  const pointsAtLeastOneScores = teamRace.length ? 100 * (1 - teamRace.map((d) => 1 - (d.pointsProbability / 100)).reduce((a, b) => a * b, 1)) : 0;
  const dnfAtLeastOne = teamRace.length ? 100 * (1 - teamRace.map((d) => 1 - (d.dnfProbability / 100)).reduce((a, b) => a * b, 1)) : 0;
  return {
    type: "team", name: favorite.name,
    drivers: teamRace.map((d) => ({
      name: d.name, predictedQualyPosition: teamQualy.find((q) => q.name === d.name)?.position ?? null,
      predictedRacePosition: d.position, pointsProbability: d.pointsProbability, dnfProbability: d.dnfProbability
    })),
    bestQualyPosition: teamQualy.length ? Math.min(...teamQualy.map((d) => d.position)) : null,
    bestRacePosition: teamRace.length ? Math.min(...teamRace.map((d) => d.position)) : null,
    teamPointsProbability: round(pointsAtLeastOneScores, 1),
    teamAtLeastOneDnfProbability: round(dnfAtLeastOne, 1)
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const body = parseBody(req);
    const favorite = resolveFavorite(body.favorite);
    const raceName = body.raceName || "GP Miami";
    const circuit = getCircuitProfile(raceName);
    const runtimeAdjustmentsState = await getRuntimeAdjustmentsState();

    if (!circuit) return res.status(400).json({ error: "Carrera no reconocida", raceName, availableRaces: raceOptions });

    const { qualyOrder, raceOrder } = buildRacePredictions(circuit, runtimeAdjustmentsState);
    const teamSummary = buildTeamSummary(raceOrder, qualyOrder);
    const strategy = computeStrategy(circuit);
    const favoritePrediction = buildFavoritePrediction(favorite, qualyOrder, raceOrder);
    const topTeams = teamSummary.slice(0, 3).map((t) => t.team);
    const weakestTeams = teamSummary.slice(-3).map((t) => t.team);

    return res.status(200).json({
      mode: "semideterministic_v3_edge_config",
      generatedAt: new Date().toISOString(), raceName,
      circuit: { round: circuit.round, venue: circuit.venue, officialVenue: circuit.officialVenue, start: circuit.start, end: circuit.end, type: circuit.type, overtaking: circuit.overtaking, rainProbability: circuit.baseRainChance, safetyCarProbability: circuit.baseSafetyCarChance, degradation: circuit.degradation },
      favorite, favoritePrediction,
      adjustments: { teams: runtimeAdjustmentsState?.teams || {}, drivers: runtimeAdjustmentsState?.drivers || {}, newsSignalsCount: Array.isArray(runtimeAdjustmentsState?.newsSignals) ? runtimeAdjustmentsState.newsSignals.length : 0, updatedAt: runtimeAdjustmentsState?.meta?.updatedAt || null },
      summary: { predictedWinner: raceOrder[0]?.name || null, predictedPole: qualyOrder[0]?.name || null, topTeams, weakestTeams, rainProbability: circuit.baseRainChance, safetyCarProbability: circuit.baseSafetyCarChance, strategy },
      qualyOrder: qualyOrder.map((d) => ({ position: d.position, name: d.name, number: d.number, team: d.team, score: round(d.qualyScore, 2) })),
      raceOrder: raceOrder.map((d) => ({ position: d.position, name: d.name, number: d.number, team: d.team, score: round(d.raceScoreAdjusted, 2), pointsProbability: d.pointsProbability, dnfProbability: d.dnfProbability })),
      teamSummary: teamSummary.map((t) => ({ team: t.team, bestQualy: t.bestQualy, bestRace: t.bestRace, averageQualy: t.averageQualy, averageRace: t.averageRace, averagePointsProbability: t.averagePointsProbability, atLeastOneDnfProbability: t.atLeastOneDnfProbability }))
    });
  } catch (error) {
    return res.status(500).json({ error: "Error interno", message: error.message });
  }
}