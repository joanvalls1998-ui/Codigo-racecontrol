import { drivers2026, driverByName, teamByName } from "../data/grid.js";
import { performanceState } from "../data/performance.js";
import {
  manualAdjustmentsState,
  sanitizeTeamDelta,
  sanitizeDriverDelta,
  previewMergedTeamAdjustments,
  previewMergedDriverAdjustments
} from "../data/manual-adjustments.js";
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
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
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

function getEffectiveTeamPerformance(teamName) {
  const base = performanceState?.teams?.[teamName];
  if (!base) return null;

  const internalAdjustments =
    performanceState?.manualAdjustments?.teams?.[teamName] || {};

  const externalAdjustments =
    manualAdjustmentsState?.teams?.[teamName] || {};

  return mergeNumericObjects(base, internalAdjustments, externalAdjustments);
}

function getEffectiveDriverPerformance(driverName) {
  const base = performanceState?.drivers?.[driverName];
  if (!base) return null;

  const internalAdjustments =
    performanceState?.manualAdjustments?.drivers?.[driverName] || {};

  const externalAdjustments =
    manualAdjustmentsState?.drivers?.[driverName] || {};

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
  const totalWeight =
    w.aero +
    w.topSpeed +
    w.traction +
    w.tyreManagement +
    w.streetTrack;

  if (!totalWeight) return 0;

  const weighted =
    teamPerf.aero * w.aero +
    teamPerf.topSpeed * w.topSpeed +
    teamPerf.traction * w.traction +
    teamPerf.tyreManagement * w.tyreManagement +
    teamPerf.streetTrack * w.streetTrack;

  return weighted / totalWeight;
}

function computeQualyScore(driver, teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const wetFactor = getWetFactor(circuit.baseRainChance);
  const teamFit = getTeamFit(teamPerf, circuit);

  const streetAdj =
    streetFactor * ((teamPerf.streetTrack + driverPerf.streetCraft) / 2);

  const wetAdj =
    wetFactor * ((teamPerf.wetPerformance + driverPerf.wetWeather) / 2);

  const score =
    teamPerf.qualyPace * 0.46 +
    teamFit * 0.16 +
    driverPerf.qualySkill * 0.14 +
    driverPerf.form * 0.10 +
    driverPerf.confidence * 0.05 +
    streetAdj * 0.05 +
    wetAdj * 0.04 +
    teamPerf.upgradeMomentum * 0.35 +
    teamPerf.recentTrend * 0.45 +
    driverPerf.recentTrend * 0.55;

  return round(score, 3);
}

function computeRaceScore(driver, teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const wetFactor = getWetFactor(circuit.baseRainChance);
  const teamFit = getTeamFit(teamPerf, circuit);

  const streetAdj =
    streetFactor * ((teamPerf.streetTrack + driverPerf.streetCraft) / 2);

  const wetAdj =
    wetFactor * ((teamPerf.wetPerformance + driverPerf.wetWeather) / 2);

  const score =
    teamPerf.racePace * 0.34 +
    teamFit * 0.12 +
    teamPerf.reliability * 0.14 +
    teamPerf.tyreManagement * 0.11 +
    driverPerf.raceSkill * 0.11 +
    driverPerf.form * 0.06 +
    driverPerf.consistency * 0.05 +
    driverPerf.tyreSaving * 0.03 +
    driverPerf.starts * 0.02 +
    streetAdj * 0.01 +
    wetAdj * 0.01 +
    teamPerf.upgradeMomentum * 0.40 +
    teamPerf.recentTrend * 0.50 +
    driverPerf.recentTrend * 0.50;

  return round(score, 3);
}

function assignPositions(list, scoreKey) {
  const sorted = [...list].sort((a, b) => {
    if (b[scoreKey] !== a[scoreKey]) return b[scoreKey] - a[scoreKey];
    return a.name.localeCompare(b.name, "es");
  });

  return sorted.map((item, index) => ({
    ...item,
    position: index + 1
  }));
}

function buildBaselinePredictions(circuit) {
  const base = drivers2026.map((driver) => {
    const teamPerf = getEffectiveTeamPerformance(driver.team);
    const driverPerf = getEffectiveDriverPerformance(driver.name);

    return {
      name: driver.name,
      number: driver.number,
      shortCode: driver.shortCode,
      team: driver.team,
      teamKey: driver.teamKey,
      colorClass: driver.colorClass,
      teamPerf,
      driverPerf,
      qualyScore: computeQualyScore(driver, teamPerf, driverPerf, circuit),
      raceScore: computeRaceScore(driver, teamPerf, driverPerf, circuit)
    };
  });

  const qualyOrder = assignPositions(base, "qualyScore");

  const raceSeed = base.map((driver) => {
    const qualyReference = qualyOrder.find((q) => q.name === driver.name);
    const overtakingFactor = circuit.overtaking / 100;
    const qualyCarry =
      (23 - qualyReference.position) * 0.18 * (1 - overtakingFactor);

    return {
      ...driver,
      raceScoreAdjusted: round(driver.raceScore + qualyCarry, 3)
    };
  });

  const raceOrder = assignPositions(raceSeed, "raceScoreAdjusted");

  return { qualyOrder, raceOrder };
}

function bandBig(value) {
  if (value >= 2.5) return 2;
  if (value >= 1.0) return 1;
  if (value <= -2.5) return -2;
  if (value <= -1.0) return -1;
  return 0;
}

function bandSmall(value) {
  if (value >= 2.5) return 1;
  if (value <= -2.5) return -1;
  return 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function normalizeStatus(status) {
  const value = String(status || "finished").toLowerCase();

  if (value.includes("mechanical")) return "mechanical_dnf";
  if (value.includes("crash")) return "crash_dnf";
  if (value.includes("collision")) return "collision_dnf";
  if (value.includes("spin")) return "spin";
  if (value.includes("penalty")) return "penalty";
  if (value.includes("dns")) return "dns";
  if (value.includes("dnf")) return "dnf";
  return "finished";
}

function normalizeResultEntry(entry, fallbackPosition = 22) {
  const position =
    typeof entry?.position === "number"
      ? entry.position
      : Number(entry?.position) || fallbackPosition;

  const status = normalizeStatus(entry?.status);
  const notes = entry?.notes || "";
  const penalty = Boolean(entry?.penalty) || status === "penalty";
  const mechanical =
    Boolean(entry?.mechanicalIssue) || status === "mechanical_dnf";
  const crash =
    Boolean(entry?.crash) ||
    status === "crash_dnf" ||
    status === "collision_dnf";
  const spin = Boolean(entry?.spin) || status === "spin";
  const dnf =
    status === "mechanical_dnf" ||
    status === "crash_dnf" ||
    status === "collision_dnf" ||
    status === "dnf";

  return {
    position,
    status,
    notes,
    penalty,
    mechanical,
    crash,
    spin,
    dnf,
    finished: !dnf && status !== "dns"
  };
}

function buildActualMap(results = [], fallbackPosition = 22) {
  const map = new Map();

  for (const entry of results) {
    if (!entry?.name) continue;
    map.set(entry.name, normalizeResultEntry(entry, fallbackPosition));
  }

  return map;
}

function getTeammateName(driverName) {
  const driver = driverByName[driverName];
  if (!driver) return null;

  const team = teamByName[driver.team];
  if (!team) return null;

  return team.drivers.find((name) => name !== driverName) || null;
}

function getNewsDeltaFromSignal(signal) {
  const entityType = signal.entityType;
  const direction = signal.direction === "negative" ? -1 : 1;
  const strength = signal.strength >= 2 ? 1 : 1;
  const signed = direction * strength;

  if (entityType === "team") {
    switch (signal.signalType) {
      case "upgrade":
        return {
          upgradeMomentum: signed,
          recentTrend: signed
        };
      case "reliability":
        return {
          reliability: signed,
          recentTrend: signed
        };
      case "aero":
        return { aero: signed };
      case "topSpeed":
        return { topSpeed: signed };
      case "traction":
        return { traction: signed };
      case "tyreManagement":
        return { tyreManagement: signed };
      case "streetTrack":
        return { streetTrack: signed };
      case "wetPerformance":
        return { wetPerformance: signed };
      default:
        return {};
    }
  }

  if (entityType === "driver") {
    switch (signal.signalType) {
      case "form":
        return { form: signed };
      case "confidence":
        return { confidence: signed };
      case "risk":
        return { risk: signed };
      case "qualy":
        return { qualySkill: signed };
      case "race":
        return { raceSkill: signed };
      case "consistency":
        return { consistency: signed };
      default:
        return {};
    }
  }

  return {};
}

function processNewsSignals(newsSignals = []) {
  const teamNews = {};
  const driverNews = {};
  const accepted = [];
  const rejected = [];

  for (const raw of newsSignals) {
    const signal = {
      entityType: raw?.entityType,
      entityName: raw?.entityName,
      signalType: raw?.signalType,
      direction: raw?.direction || "positive",
      strength: Number(raw?.strength) || 1,
      confidence: Number(raw?.confidence) || 0,
      headline: raw?.headline || "",
      source: raw?.source || "news"
    };

    const validEntity =
      (signal.entityType === "team" && teamByName[signal.entityName]) ||
      (signal.entityType === "driver" && driverByName[signal.entityName]);

    if (!validEntity) {
      rejected.push({
        ...signal,
        reason: "Entidad no reconocida"
      });
      continue;
    }

    if (signal.confidence < 0.65) {
      rejected.push({
        ...signal,
        reason: "Confianza insuficiente"
      });
      continue;
    }

    const delta = getNewsDeltaFromSignal(signal);

    if (!Object.keys(delta).length) {
      rejected.push({
        ...signal,
        reason: "Tipo de señal no usable"
      });
      continue;
    }

    accepted.push({
      ...signal,
      delta
    });

    if (signal.entityType === "team") {
      const previous = teamNews[signal.entityName] || {};
      const merged = {};

      for (const key of new Set([...Object.keys(previous), ...Object.keys(delta)])) {
        merged[key] = (previous[key] || 0) + (delta[key] || 0);
      }

      teamNews[signal.entityName] = sanitizeTeamDelta(merged);
    } else {
      const previous = driverNews[signal.entityName] || {};
      const merged = {};

      for (const key of new Set([...Object.keys(previous), ...Object.keys(delta)])) {
        merged[key] = (previous[key] || 0) + (delta[key] || 0);
      }

      driverNews[signal.entityName] = sanitizeDriverDelta(merged);
    }
  }

  return {
    teamNews,
    driverNews,
    accepted,
    rejected
  };
}

function buildDriverSuggestedDelta({
  driverName,
  expectedQualyPos,
  expectedRacePos,
  actualQualy,
  actualRace,
  teammateExpectedQualyPos,
  teammateExpectedRacePos,
  teammateActualQualy,
  teammateActualRace
}) {
  const delta = {};
  const reasons = [];

  const qualyGap = expectedQualyPos - actualQualy.position;
  const raceGap = expectedRacePos - actualRace.position;

  const actualQualyVsMate = teammateActualQualy.position - actualQualy.position;
  const expectedQualyVsMate = teammateExpectedQualyPos - expectedQualyPos;
  const relativeQualyGap = actualQualyVsMate - expectedQualyVsMate;

  const actualRaceVsMate = teammateActualRace.position - actualRace.position;
  const expectedRaceVsMate = teammateExpectedRacePos - expectedRacePos;
  const relativeRaceGap = actualRaceVsMate - expectedRaceVsMate;

  const qualyComposite = qualyGap + relativeQualyGap * 0.6;
  const raceComposite = raceGap + relativeRaceGap * 0.6;
  const formComposite = raceComposite * 0.65 + qualyComposite * 0.35;

  const qualySkillDelta = bandSmall(qualyComposite);
  if (qualySkillDelta !== 0) {
    delta.qualySkill = qualySkillDelta;
    reasons.push(
      qualySkillDelta > 0
        ? "rindió mejor de lo esperado en clasificación"
        : "rindió peor de lo esperado en clasificación"
    );
  }

  const raceSkillDelta = bandSmall(raceComposite);
  if (raceSkillDelta !== 0) {
    delta.raceSkill = raceSkillDelta;
    reasons.push(
      raceSkillDelta > 0
        ? "rindió mejor de lo esperado en carrera"
        : "rindió peor de lo esperado en carrera"
    );
  }

  const formDelta = bandBig(formComposite);
  if (formDelta !== 0) {
    delta.form = formDelta;
    reasons.push(
      formDelta > 0
        ? "batió la expectativa global del fin de semana"
        : "quedó por debajo de la expectativa global del fin de semana"
    );
  }

  let confidenceScore = 0;
  if (formComposite >= 1.5) confidenceScore += 1.5;
  if (formComposite <= -1.5) confidenceScore -= 1.5;
  if (actualRace.finished && !actualRace.penalty && !actualRace.crash) confidenceScore += 0.7;
  if (actualRace.dnf && !actualRace.mechanical) confidenceScore -= 1.2;
  if (actualRace.mechanical) confidenceScore -= 0.4;

  const confidenceDelta = bandBig(confidenceScore);
  if (confidenceDelta !== 0) {
    delta.confidence = confidenceDelta;
    reasons.push(
      confidenceDelta > 0
        ? "sale reforzado del fin de semana"
        : "sale tocado del fin de semana"
    );
  }

  let consistencyScore = 0;
  if (actualRace.finished) consistencyScore += 1.2;
  if (formComposite >= 1) consistencyScore += 1.0;
  if (actualRace.crash || actualRace.spin || actualRace.penalty) consistencyScore -= 2.0;
  if (actualRace.dnf && !actualRace.mechanical) consistencyScore -= 1.6;

  const consistencyDelta = bandSmall(consistencyScore);
  if (consistencyDelta !== 0) {
    delta.consistency = consistencyDelta;
    reasons.push(
      consistencyDelta > 0
        ? "fin de semana limpio y consistente"
        : "fin de semana irregular"
    );
  }

  let riskDelta = 0;
  if (actualRace.crash || actualRace.spin || actualRace.penalty) riskDelta += 1;
  if (actualRace.finished && !actualRace.crash && !actualRace.spin && !actualRace.penalty && formComposite >= 1.5) riskDelta -= 1;

  if (riskDelta !== 0) {
    delta.risk = clamp(riskDelta, -1, 1);
    reasons.push(
      riskDelta > 0
        ? "aparecieron errores o incidentes"
        : "pilotó con limpieza y control"
    );
  }

  return {
    delta: sanitizeDriverDelta(delta),
    reasons,
    metrics: {
      qualyGap: round(qualyGap, 2),
      raceGap: round(raceGap, 2),
      relativeQualyGap: round(relativeQualyGap, 2),
      relativeRaceGap: round(relativeRaceGap, 2),
      qualyComposite: round(qualyComposite, 2),
      raceComposite: round(raceComposite, 2),
      formComposite: round(formComposite, 2)
    }
  };
}

function buildTeamSuggestedDelta({
  teamName,
  expectedDrivers,
  actualDrivers
}) {
  const delta = {};
  const reasons = [];

  const qualyGaps = expectedDrivers.map((driver) => driver.expectedQualyPos - driver.actualQualy.position);
  const raceGaps = expectedDrivers.map((driver) => driver.expectedRacePos - driver.actualRace.position);

  const qualyComposite = average(qualyGaps);
  const raceComposite = average(raceGaps);

  const qualyPaceDelta = bandBig(qualyComposite);
  if (qualyPaceDelta !== 0) {
    delta.qualyPace = qualyPaceDelta;
    reasons.push(
      qualyPaceDelta > 0
        ? "los dos coches tendieron a clasificar por encima de lo esperado"
        : "los dos coches tendieron a clasificar por debajo de lo esperado"
    );
  }

  const racePaceDelta = bandBig(raceComposite);
  if (racePaceDelta !== 0) {
    delta.racePace = racePaceDelta;
    reasons.push(
      racePaceDelta > 0
        ? "el ritmo de carrera superó la expectativa"
        : "el ritmo de carrera quedó por debajo de la expectativa"
    );
  }

  const mechanicalIssues = actualDrivers.filter((d) => d.actualRace.mechanical).length;
  const nonMechanicalDNFs = actualDrivers.filter((d) => d.actualRace.dnf && !d.actualRace.mechanical).length;
  const cleanFinishes = actualDrivers.filter((d) => d.actualRace.finished).length;

  let reliabilityDelta = 0;
  if (mechanicalIssues >= 2) reliabilityDelta = -2;
  else if (mechanicalIssues === 1) reliabilityDelta = -1;
  else if (cleanFinishes === 2 && raceComposite >= 1 && expectedDrivers.some((d) => d.teamPerf.reliability <= 70)) reliabilityDelta = 1;

  if (reliabilityDelta !== 0) {
    delta.reliability = reliabilityDelta;
    reasons.push(
      reliabilityDelta > 0
        ? "fin de semana limpio en fiabilidad"
        : "hubo señales de fragilidad mecánica"
    );
  }

  let trendScore = 0;
  trendScore += qualyComposite * 0.45;
  trendScore += raceComposite * 0.55;
  trendScore -= mechanicalIssues * 1.4;
  trendScore -= nonMechanicalDNFs * 0.6;

  const recentTrendDelta = bandSmall(trendScore);
  if (recentTrendDelta !== 0) {
    delta.recentTrend = recentTrendDelta;
    reasons.push(
      recentTrendDelta > 0
        ? "tendencia global positiva"
        : "tendencia global negativa"
    );
  }

  return {
    delta: sanitizeTeamDelta(delta),
    reasons,
    metrics: {
      qualyComposite: round(qualyComposite, 2),
      raceComposite: round(raceComposite, 2),
      mechanicalIssues,
      nonMechanicalDNFs,
      cleanFinishes
    }
  };
}

function mergeDeltas(a = {}, b = {}) {
  const result = { ...a };

  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    result[key] = (a[key] || 0) + (b[key] || 0);
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const body = parseBody(req);
    const raceName = body.raceName;
    const weekId = body.weekId || null;
    const qualifying = Array.isArray(body.qualifying) ? body.qualifying : [];
    const race = Array.isArray(body.race) ? body.race : [];
    const newsSignals = Array.isArray(body.newsSignals) ? body.newsSignals : [];

    if (!raceName) {
      return res.status(400).json({
        error: "Falta raceName"
      });
    }

    const circuit = getCircuitProfile(raceName);
    if (!circuit) {
      return res.status(400).json({
        error: "Carrera no reconocida",
        raceName,
        availableRaces: raceOptions
      });
    }

    if (!qualifying.length || !race.length) {
      return res.status(400).json({
        error: "Faltan resultados de clasificación o carrera",
        expectedBody: {
          raceName: "GP de Japón",
          weekId: "2026-W14",
          qualifying: [{ name: "Fernando Alonso", position: 12 }],
          race: [{ name: "Fernando Alonso", position: 10, status: "finished" }],
          newsSignals: []
        }
      });
    }

    const actualQualyMap = buildActualMap(qualifying, 22);
    const actualRaceMap = buildActualMap(race, 22);
    const { qualyOrder, raceOrder } = buildBaselinePredictions(circuit);

    const expectedQualyMap = new Map(qualyOrder.map((d) => [d.name, d]));
    const expectedRaceMap = new Map(raceOrder.map((d) => [d.name, d]));

    const { teamNews, driverNews, accepted, rejected } = processNewsSignals(newsSignals);

    const driverSuggested = {};
    const driverAudit = {};
    const teamDriverPackets = {};

    for (const driver of drivers2026) {
      const expectedQualy = expectedQualyMap.get(driver.name);
      const expectedRace = expectedRaceMap.get(driver.name);
      const actualQualy = actualQualyMap.get(driver.name) || normalizeResultEntry({}, 22);
      const actualRace = actualRaceMap.get(driver.name) || normalizeResultEntry({}, 22);
      const teammateName = getTeammateName(driver.name);

      const teammateExpectedQualy = expectedQualyMap.get(teammateName);
      const teammateExpectedRace = expectedRaceMap.get(teammateName);
      const teammateActualQualy = actualQualyMap.get(teammateName) || normalizeResultEntry({}, 22);
      const teammateActualRace = actualRaceMap.get(teammateName) || normalizeResultEntry({}, 22);

      const packet = {
        driverName: driver.name,
        teamName: driver.team,
        teamPerf: getEffectiveTeamPerformance(driver.team),
        driverPerf: getEffectiveDriverPerformance(driver.name),
        expectedQualyPos: expectedQualy.position,
        expectedRacePos: expectedRace.position,
        actualQualy,
        actualRace,
        teammateExpectedQualyPos: teammateExpectedQualy.position,
        teammateExpectedRacePos: teammateExpectedRace.position,
        teammateActualQualy,
        teammateActualRace
      };

      if (!teamDriverPackets[driver.team]) teamDriverPackets[driver.team] = [];
      teamDriverPackets[driver.team].push(packet);

      const trackResult = buildDriverSuggestedDelta(packet);
      const newsDelta = driverNews[driver.name] || {};
      const finalDelta = sanitizeDriverDelta(
        mergeDeltas(trackResult.delta, newsDelta)
      );

      driverSuggested[driver.name] = finalDelta;
      driverAudit[driver.name] = {
        reasons: trackResult.reasons,
        metrics: trackResult.metrics,
        trackDelta: trackResult.delta,
        newsDelta,
        finalDelta
      };
    }

    const teamSuggested = {};
    const teamAudit = {};

    for (const [teamName, packets] of Object.entries(teamDriverPackets)) {
      const trackResult = buildTeamSuggestedDelta({
        teamName,
        expectedDrivers: packets,
        actualDrivers: packets
      });

      const newsDelta = teamNews[teamName] || {};

      const reinforced = { ...trackResult.delta };

      // Refuerzo lógico: si hay upgrade positivo y la pista acompaña, empuja trend/momentum.
      if (newsDelta.upgradeMomentum > 0 && ((trackResult.delta.qualyPace || 0) > 0 || (trackResult.delta.racePace || 0) > 0)) {
        reinforced.upgradeMomentum = Math.max(reinforced.upgradeMomentum || 0, 1);
      }

      if (newsDelta.reliability < 0 && !("reliability" in reinforced)) {
        reinforced.reliability = -1;
      }

      const finalDelta = sanitizeTeamDelta(
        mergeDeltas(reinforced, newsDelta)
      );

      teamSuggested[teamName] = finalDelta;
      teamAudit[teamName] = {
        reasons: trackResult.reasons,
        metrics: trackResult.metrics,
        trackDelta: trackResult.delta,
        newsDelta,
        finalDelta
      };
    }

    const mergedPreview = {
      teams: {},
      drivers: {}
    };

    for (const [teamName, delta] of Object.entries(teamSuggested)) {
      mergedPreview.teams[teamName] = previewMergedTeamAdjustments(teamName, delta);
    }

    for (const [driverName, delta] of Object.entries(driverSuggested)) {
      mergedPreview.drivers[driverName] = previewMergedDriverAdjustments(driverName, delta);
    }

    return res.status(200).json({
      mode: "update_adjustments_v1_pro",
      generatedAt: new Date().toISOString(),
      raceName,
      weekId,
      circuit: {
        round: circuit.round,
        venue: circuit.venue,
        officialVenue: circuit.officialVenue,
        start: circuit.start,
        end: circuit.end,
        type: circuit.type
      },
      inputSummary: {
        qualifyingEntries: qualifying.length,
        raceEntries: race.length,
        newsSignalsReceived: newsSignals.length,
        newsSignalsAccepted: accepted.length,
        newsSignalsRejected: rejected.length
      },
      suggestedPatch: {
        meta: {
          updatedAt: new Date().toISOString(),
          source: "automatic_pipeline_preview",
          raceName,
          weekId
        },
        teams: teamSuggested,
        drivers: driverSuggested,
        acceptedNewsSignals: accepted
      },
      mergedPreview,
      audit: {
        teams: teamAudit,
        drivers: driverAudit,
        rejectedNewsSignals: rejected
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}