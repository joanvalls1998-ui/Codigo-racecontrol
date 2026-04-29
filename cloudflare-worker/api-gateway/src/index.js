// Cloudflare Worker - API Gateway para RaceControl
// Proxy a los archivos originales en GitHub + handlers nativos
//
// Deploy:
// 1. cd cloudflare-worker/api-gateway
// 2. wrangler deploy
//
// URL: https://racecontrol-api-gateway.joanvalls1998.workers.dev

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main';

// URLs de datos
const DATA_URLS = {
  grid: `${GITHUB_RAW_BASE}/data/grid.js`,
  performance: `${GITHUB_RAW_BASE}/data/performance.js`,
  manualAdjustments: `${GITHUB_RAW_BASE}/data/manual-adjustments.js`,
  circuits: `${GITHUB_RAW_BASE}/data/circuits.js`,
  calendarEvents: `${GITHUB_RAW_BASE}/data/calendar-events.js`,
  standings: `${GITHUB_RAW_BASE}/data/standings.json`
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [
      'https://joanvalls1998-ui.github.io',
      'http://localhost:3000'
    ];
    
    const origin = request.headers.get('Origin') || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Routing: /api/{endpoint} -> handler
      const path = url.pathname.replace('/api/', '');
      const query = url.searchParams;
      
      // Endpoints disponibles
      const routes = {
        // Engineer API
        'engineer/context': () => handleEngineerContext(query, corsHeaders),
        'engineer/telemetry': () => handleEngineerTelemetry(query, corsHeaders),
        'engineer/sessions': () => handleEngineerSessions(query, corsHeaders),
        'engineer/sectors': () => handleEngineerSectors(query, corsHeaders),
        'engineer/stints': () => handleEngineerStints(query, corsHeaders),
        'engineer/coverage': () => handleEngineerCoverage(query, corsHeaders),
        'engineer/evolution': () => handleEngineerEvolution(query, corsHeaders),
        'engineer/meetings': () => handleEngineerMeetings(query, corsHeaders),
        'engineer/entities': () => handleEngineerEntities(query, corsHeaders),
        
        // APIs migradas
        'predict': () => handlePredict(query, corsHeaders, request, env),
        'standings': () => handleStandings(query, corsHeaders),
        'calendar': () => handleCalendar(query, corsHeaders),
        'news': () => handleNews(query, corsHeaders, request),
        'sim': () => handleSim(query, corsHeaders, env),
        
        // Edge State
        'get-edge-state': () => handleGetEdgeState(query, corsHeaders, env),
        'init-edge-state': () => handleInitEdgeState(query, corsHeaders, env),
        'reset-edge-state': () => handleResetEdgeState(query, corsHeaders, env),
        'apply-adjustments': () => handleApplyAdjustments(query, corsHeaders, env),
        'update-adjustments': () => handleUpdateAdjustments(query, corsHeaders, env)
      };
      
      // Buscar handler
      const handler = routes[path];
      
      if (!handler) {
        return jsonResponse({ 
          error: 'Endpoint not found',
          path: path,
          hint: 'Usa /api/engineer/telemetry, /api/predict, /api/standings, etc.'
        }, corsHeaders, 404);
      }
      
      // Ejecutar handler
      return await handler();
      
    } catch (error) {
      console.error('API Gateway error:', error);
      
      return jsonResponse({ 
        error: 'Internal server error',
        message: error.message 
      }, corsHeaders, 500);
    }
  }
};

// ============== HANDLERS ==============

// Predict API - Lógica completa migrada a Cloudflare Workers
async function handlePredict(query, corsHeaders, request, env) {
  // Solo POST
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido, usa POST' }, corsHeaders, 405);
  }
  
  try {
    const body = await request.json().catch(() => ({}));
    const favorite = resolveFavorite(body.favorite);
    const raceName = body.raceName || 'GP Miami';
    
    // Cargar datos desde GitHub
    const [gridModule, performanceModule, adjustmentsModule, circuitsModule] = await Promise.all([
      fetchModule(DATA_URLS.grid),
      fetchModule(DATA_URLS.performance),
      fetchModule(DATA_URLS.manualAdjustments),
      fetchModule(DATA_URLS.circuits)
    ]);
    
    const { drivers2026, driverByName, teamByName } = gridModule;
    const { performanceState } = performanceModule;
    const { manualAdjustmentsState } = adjustmentsModule;
    const { getCircuitProfile, raceOptions } = circuitsModule;
    
    const circuit = getCircuitProfile(raceName);
    if (!circuit) {
      return jsonResponse({ 
        error: 'Carrera no reconocida', 
        raceName, 
        availableRaces: raceOptions 
      }, corsHeaders, 400);
    }
    
    // Obtener estado de ajustes runtime (desde KV si existe, o usar base)
    const runtimeAdjustmentsState = await getRuntimeAdjustmentsState(env, manualAdjustmentsState);
    
    // Construir predicciones
    const { qualyOrder, raceOrder } = buildRacePredictions(circuit, runtimeAdjustmentsState, drivers2026, performanceState, driverByName);
    const teamSummary = buildTeamSummary(raceOrder, qualyOrder);
    const strategy = computeStrategy(circuit);
    const favoritePrediction = buildFavoritePrediction(favorite, qualyOrder, raceOrder, driverByName);
    const topTeams = teamSummary.slice(0, 3).map(t => t.team);
    const weakestTeams = teamSummary.slice(-3).map(t => t.team);
    
    return jsonResponse({
      mode: 'semideterministic_v3_edge_config',
      generatedAt: new Date().toISOString(),
      raceName,
      circuit: {
        round: circuit.round,
        venue: circuit.venue,
        officialVenue: circuit.officialVenue,
        start: circuit.start,
        end: circuit.end,
        type: circuit.type,
        overtaking: circuit.overtaking,
        rainProbability: circuit.baseRainChance,
        safetyCarProbability: circuit.baseSafetyCarChance,
        degradation: circuit.degradation
      },
      favorite,
      favoritePrediction,
      adjustments: {
        teams: runtimeAdjustmentsState?.teams || {},
        drivers: runtimeAdjustmentsState?.drivers || {},
        newsSignalsCount: Array.isArray(runtimeAdjustmentsState?.newsSignals) ? runtimeAdjustmentsState.newsSignals.length : 0,
        updatedAt: runtimeAdjustmentsState?.meta?.updatedAt || null
      },
      summary: {
        predictedWinner: raceOrder[0]?.name || null,
        predictedPole: qualyOrder[0]?.name || null,
        topTeams,
        weakestTeams,
        rainProbability: circuit.baseRainChance,
        safetyCarProbability: circuit.baseSafetyCarChance,
        strategy
      },
      qualyOrder: qualyOrder.map(d => ({
        position: d.position,
        name: d.name,
        number: d.number,
        team: d.team,
        score: round(d.qualyScore, 2)
      })),
      raceOrder: raceOrder.map(d => ({
        position: d.position,
        name: d.name,
        number: d.number,
        team: d.team,
        score: round(d.raceScoreAdjusted, 2),
        pointsProbability: d.pointsProbability,
        dnfProbability: d.dnfProbability
      })),
      teamSummary: teamSummary.map(t => ({
        team: t.team,
        bestQualy: t.bestQualy,
        bestRace: t.bestRace,
        averageQualy: t.averageQualy,
        averageRace: t.averageRace,
        averagePointsProbability: t.averagePointsProbability,
        atLeastOneDnfProbability: t.atLeastOneDnfProbability
      }))
    }, corsHeaders);
    
  } catch (error) {
    console.error('Predict error:', error);
    return jsonResponse({ 
      error: 'Error interno', 
      message: error.message 
    }, corsHeaders, 500);
  }
}

// Standings API - Datos estáticos desde GitHub
async function handleStandings(query, corsHeaders) {
  try {
    const response = await fetch(DATA_URLS.standings, { cacheTtl: 300 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    return jsonResponse({
      updatedAt: new Date().toISOString(),
      source: 'github_static',
      isStaticSnapshot: true,
      ...data
    }, corsHeaders);
  } catch (error) {
    // Fallback a datos embebidos si falla fetch
    return jsonResponse({
      error: 'No se pudo cargar standings',
      message: error.message,
      fallback: true
    }, corsHeaders, 500);
  }
}

// Calendar API - Cargar desde GitHub
async function handleCalendar(query, corsHeaders) {
  try {
    const module = await fetchModule(DATA_URLS.calendarEvents);
    const { calendarEvents } = module;
    
    const now = new Date();
    let nextRaceAssigned = false;
    
    const enriched = calendarEvents.map(event => {
      const endDate = new Date(`${event.end}T23:59:59Z`);
      let status = 'upcoming';
      
      if (endDate < now) {
        status = 'completed';
      } else if (!nextRaceAssigned && event.type === 'race') {
        status = 'next';
        nextRaceAssigned = true;
      }
      
      return { ...event, status };
    });
    
    return jsonResponse({ events: enriched }, corsHeaders);
  } catch (error) {
    return jsonResponse({
      error: 'No se pudo cargar calendar',
      message: error.message
    }, corsHeaders, 500);
  }
}

// Sim API - OpenAI integration
async function handleSim(query, corsHeaders, env) {
  const apiKey = env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return jsonResponse({
      error: 'OPENAI_API_KEY no configurada',
      message: 'Configura la variable de entorno en wrangler.toml o Cloudflare dashboard'
    }, corsHeaders, 500);
  }
  
  const prompt = `
Actúa como ingeniero de estrategia de Fórmula 1 en 2026.

Quiero una simulación realista del próximo Gran Premio teniendo en cuenta:
- Rendimiento actual de los equipos
- Resultados de las últimas carreras
- Fiabilidad de cada equipo
- Ritmo de carrera vs clasificación
- Probabilidad de Safety Car
- Probabilidad de lluvia
- Estrategias reales usadas en ese circuito
- Reglamento 2026

Salida en este formato:

SIMULACIÓN GP JAPÓN

Ritmo equipos (%):
Mercedes:
Ferrari:
McLaren:
Red Bull:
Aston Martin:
Alpine:
Haas:
Racing Bulls:
Williams:
Audi:
Cadillac:

Predicción clasificación Alonso:
Predicción carrera Alonso:
Probabilidad puntos Alonso (%):
Probabilidad DNF Alonso (%):
Estrategia más probable Alonso:
Vuelta parada:

Probabilidad Safety Car (%):
Probabilidad lluvia (%):

Top 10 estimado carrera:
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: prompt
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return jsonResponse({
        error: 'OpenAI error',
        details: data,
        status: response.status
      }, corsHeaders, response.status);
    }
    
    const text = data.output?.[0]?.content?.[0]?.text || 'No se pudo generar la simulación.';
    
    return jsonResponse({ result: text }, corsHeaders);
  } catch (error) {
    return jsonResponse({
      error: 'Server error',
      message: error.message
    }, corsHeaders, 500);
  }
}

// News API (proxy a Google News RSS)
async function handleNews(query, corsHeaders, request) {
  const rssUrl = query.get('url');
  if (!rssUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, corsHeaders, 400);
  }
  
  if (!rssUrl.includes('news.google.com')) {
    return jsonResponse({ error: 'Only Google News RSS allowed' }, corsHeaders, 400);
  }
  
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'RaceControl/1.0',
        'Accept': 'application/xml'
      },
      cacheTtl: 3600
    });
    
    const xml = await response.text();
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        ...corsHeaders
      }
    });
  } catch (error) {
    return jsonResponse({
      error: 'Failed to fetch RSS',
      message: error.message
    }, corsHeaders, 500);
  }
}

// Edge State Handlers - Usar Cloudflare KV
async function handleGetEdgeState(query, corsHeaders, env) {
  if (!env.EDGE_STATE) {
    return jsonResponse({
      error: 'KV no configurado',
      message: 'Bind un KV namespace llamado EDGE_STATE en wrangler.toml'
    }, corsHeaders, 500);
  }
  
  try {
    const state = await env.EDGE_STATE.get('state', { type: 'json' });
    return jsonResponse({ status: 'ok', data: state || {} }, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: error.message }, corsHeaders, 500);
  }
}

async function handleInitEdgeState(query, corsHeaders, env) {
  if (!env.EDGE_STATE) {
    return jsonResponse({ error: 'KV no configurado' }, corsHeaders, 500);
  }
  
  try {
    const initialState = {
      meta: { createdAt: new Date().toISOString(), version: 1 },
      teams: {},
      drivers: {},
      newsSignals: [],
      weeklySnapshots: []
    };
    
    await env.EDGE_STATE.put('state', JSON.stringify(initialState));
    return jsonResponse({ status: 'ok', data: initialState }, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: error.message }, corsHeaders, 500);
  }
}

async function handleResetEdgeState(query, corsHeaders, env) {
  if (!env.EDGE_STATE) {
    return jsonResponse({ error: 'KV no configurado' }, corsHeaders, 500);
  }
  
  try {
    await env.EDGE_STATE.delete('state');
    return jsonResponse({ status: 'ok', message: 'Estado reseteado' }, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: error.message }, corsHeaders, 500);
  }
}

async function handleApplyAdjustments(query, corsHeaders, env) {
  if (!env.EDGE_STATE) {
    return jsonResponse({ error: 'KV no configurado' }, corsHeaders, 500);
  }
  
  // Implementar lógica de apply adjustments
  return jsonResponse({ status: 'ok', message: 'Apply adjustments - implementar' }, corsHeaders);
}

async function handleUpdateAdjustments(query, corsHeaders, env) {
  if (!env.EDGE_STATE) {
    return jsonResponse({ error: 'KV no configurado' }, corsHeaders, 500);
  }
  
  // Implementar lógica de update adjustments
  return jsonResponse({ status: 'ok', message: 'Update adjustments - implementar' }, corsHeaders);
}

// Engineer API handlers (placeholders)
async function handleEngineerTelemetry(query, corsHeaders) {
  return jsonResponse({
    error: 'Telemetría en implementación',
    message: 'La API de telemetría requiere migrar la lógica de _core.js al Worker',
    status: 'pending'
  }, corsHeaders, 501);
}

async function handleEngineerContext(query, corsHeaders) {
  const year = query.get('year') || '2026';
  const meeting_key = query.get('meeting_key');
  const session_type = query.get('session_type');
  
  if (!meeting_key || !session_type) {
    return jsonResponse({
      error: 'Faltan parámetros',
      required: ['meeting_key', 'session_type']
    }, corsHeaders, 400);
  }
  
  return jsonResponse({
    status: 'ok',
    data: { year, meeting_key, session_type, message: 'Contexto de ingeniero' }
  }, corsHeaders);
}

async function handleEngineerSessions(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Sessions - implementar' } }, corsHeaders);
}

async function handleEngineerSectors(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Sectors - implementar' } }, corsHeaders);
}

async function handleEngineerStints(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Stints - implementar' } }, corsHeaders);
}

async function handleEngineerCoverage(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Coverage - implementar' } }, corsHeaders);
}

async function handleEngineerEvolution(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Evolution - implementar' } }, corsHeaders);
}

async function handleEngineerMeetings(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Meetings - implementar' } }, corsHeaders);
}

async function handleEngineerEntities(query, corsHeaders) {
  return jsonResponse({ status: 'ok', data: { message: 'Entities - implementar' } }, corsHeaders);
}

// ============== UTILIDADES PREDICT ==============

// Fetch y parse de módulos ES desde GitHub
async function fetchModule(url) {
  const response = await fetch(url, { cacheTtl: 3600 });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const code = await response.text();
  
  // Parse simple de exports - extraer lo que necesitamos
  const module = {};
  
  // Extraer export const
  const constMatches = code.matchAll(/export const (\w+) = ({[\s\S]*?}|[\s\S]*?);/g);
  for (const match of constMatches) {
    const [, name, value] = match;
    try {
      // Para objetos, evaluar con Function (sandbox limitado)
      if (value.trim().startsWith('{')) {
        module[name] = new Function(`return ${value}`)();
      } else {
        // Para arrays y otros, intentar JSON parse o eval seguro
        module[name] = JSON.parse(value);
      }
    } catch {
      // Fallback: intentar eval controlado
      try {
        module[name] = eval(`(${value})`);
      } catch {
        console.warn(`Failed to parse export const ${name}`);
      }
    }
  }
  
  // Extraer export function
  const funcMatches = code.matchAll(/export function (\w+)\(([\s\S]*?)\)\s*{([\s\S]*?)}/g);
  for (const match of funcMatches) {
    const [, name, params, body] = match;
    try {
      module[name] = new Function(params, body);
    } catch {
      console.warn(`Failed to parse export function ${name}`);
    }
  }
  
  return module;
}

// Obtener estado de ajustes desde KV o usar base
async function getRuntimeAdjustmentsState(env, baseState) {
  if (env?.EDGE_STATE) {
    try {
      const stored = await env.EDGE_STATE.get('state', { type: 'json' });
      if (stored && typeof stored === 'object') {
        return {
          meta: stored.meta || baseState.meta,
          limits: baseState.limits,
          teams: stored.teams || {},
          drivers: stored.drivers || {},
          newsSignals: Array.isArray(stored.newsSignals) ? stored.newsSignals : [],
          weeklySnapshots: Array.isArray(stored.weeklySnapshots) ? stored.weeklySnapshots : []
        };
      }
    } catch (e) {
      console.warn('Failed to load state from KV:', e);
    }
  }
  return baseState;
}

// Utilidades de predict
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mergeNumericObjects(base = {}, ...layers) {
  const result = { ...base };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        const previous = typeof result[key] === 'number' ? result[key] : 0;
        result[key] = clamp(previous + value, 0, 100);
      } else if (!(key in result)) {
        result[key] = value;
      }
    }
  }
  return result;
}

function getEffectiveTeamPerformance(teamName, runtimeAdjustmentsState, performanceState) {
  const base = performanceState?.teams?.[teamName];
  if (!base) return null;
  const internalAdjustments = performanceState?.manualAdjustments?.teams?.[teamName] || {};
  const externalAdjustments = runtimeAdjustmentsState?.teams?.[teamName] || {};
  return mergeNumericObjects(base, internalAdjustments, externalAdjustments);
}

function getEffectiveDriverPerformance(driverName, runtimeAdjustmentsState, performanceState) {
  const base = performanceState?.drivers?.[driverName];
  if (!base) return null;
  const internalAdjustments = performanceState?.manualAdjustments?.drivers?.[driverName] || {};
  const externalAdjustments = runtimeAdjustmentsState?.drivers?.[driverName] || {};
  return mergeNumericObjects(base, internalAdjustments, externalAdjustments);
}

function getStreetFactor(type) {
  if (type === 'urbano') return 1;
  if (type === 'semiurbano') return 0.6;
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
  return (
    teamPerf.aero * w.aero +
    teamPerf.topSpeed * w.topSpeed +
    teamPerf.traction * w.traction +
    teamPerf.tyreManagement * w.tyreManagement +
    teamPerf.streetTrack * w.streetTrack
  ) / totalWeight;
}

function computeQualyScore(driver, teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const wetFactor = getWetFactor(circuit.baseRainChance);
  const teamFit = getTeamFit(teamPerf, circuit);
  const streetAdj = streetFactor * ((teamPerf.streetTrack + driverPerf.streetCraft) / 2);
  const wetAdj = wetFactor * ((teamPerf.wetPerformance + driverPerf.wetWeather) / 2);
  
  return round(
    teamPerf.qualyPace * 0.46 +
    teamFit * 0.16 +
    driverPerf.qualySkill * 0.14 +
    driverPerf.form * 0.10 +
    driverPerf.confidence * 0.05 +
    streetAdj * 0.05 +
    wetAdj * 0.04 +
    teamPerf.upgradeMomentum * 0.35 +
    teamPerf.recentTrend * 0.45 +
    driverPerf.recentTrend * 0.55,
    3
  );
}

function computeRaceScore(driver, teamPerf, driverPerf, circuit) {
  const streetFactor = getStreetFactor(circuit.type);
  const wetFactor = getWetFactor(circuit.baseRainChance);
  const teamFit = getTeamFit(teamPerf, circuit);
  const streetAdj = streetFactor * ((teamPerf.streetTrack + driverPerf.streetCraft) / 2);
  const wetAdj = wetFactor * ((teamPerf.wetPerformance + driverPerf.wetWeather) / 2);
  
  return round(
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
    driverPerf.recentTrend * 0.50,
    3
  );
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
  
  if (rain >= 40) return { label: 'Estrategia abierta por posible lluvia', stops: 'Variable' };
  if (degradation >= 67) return { 
    label: safetyCar >= 40 
      ? 'Dos paradas con ventana flexible por Safety Car' 
      : 'Dos paradas buscando proteger neumáticos', 
    stops: 2 
  };
  if (degradation >= 58 && overtaking >= 45) return { 
    label: 'Dos paradas para aprovechar ritmo y aire limpio', 
    stops: 2 
  };
  if (overtaking <= 25) return { 
    label: 'Una parada priorizando posición en pista', 
    stops: 1 
  };
  return { 
    label: safetyCar >= 45 
      ? 'Una parada flexible con opción de reaccionar al Safety Car' 
      : 'Una parada como estrategia base', 
    stops: 1 
  };
}

function buildDriverPredictions(circuit, runtimeAdjustmentsState, drivers2026, performanceState, driverByName) {
  return drivers2026.map(driver => {
    const teamPerf = getEffectiveTeamPerformance(driver.team, runtimeAdjustmentsState, performanceState);
    const driverPerf = getEffectiveDriverPerformance(driver.name, runtimeAdjustmentsState, performanceState);
    
    return {
      name: driver.name,
      number: driver.number,
      shortCode: driver.shortCode,
      team: driver.team,
      teamKey: driver.teamKey,
      colorClass: driver.colorClass,
      qualyScore: computeQualyScore(driver, teamPerf, driverPerf, circuit),
      raceScore: computeRaceScore(driver, teamPerf, driverPerf, circuit),
      dnfProbability: computeDnfProbability(teamPerf, driverPerf, circuit),
      teamPerf,
      driverPerf
    };
  });
}

function assignPositions(list, scoreKey) {
  const sorted = [...list].sort((a, b) => 
    b[scoreKey] !== a[scoreKey] ? b[scoreKey] - a[scoreKey] : a.name.localeCompare(a.name, 'es')
  );
  return sorted.map((item, index) => ({ ...item, position: index + 1 }));
}

function buildRacePredictions(circuit, runtimeAdjustmentsState, drivers2026, performanceState, driverByName) {
  const base = buildDriverPredictions(circuit, runtimeAdjustmentsState, drivers2026, performanceState, driverByName);
  const qualyOrder = assignPositions(base, 'qualyScore');
  
  const raceSeed = base.map(driver => {
    const qualyReference = qualyOrder.find(q => q.name === driver.name);
    const overtakingFactor = circuit.overtaking / 100;
    const qualyCarry = (23 - qualyReference.position) * 0.18 * (1 - overtakingFactor);
    return { ...driver, raceScoreAdjusted: round(driver.raceScore + qualyCarry, 3) };
  });
  
  const raceOrder = assignPositions(raceSeed, 'raceScoreAdjusted').map(driver => ({
    ...driver,
    pointsProbability: computePointsProbability(
      driver.position,
      driver.teamPerf,
      driver.driverPerf,
      circuit,
      driver.dnfProbability
    )
  }));
  
  return { qualyOrder, raceOrder };
}

function buildTeamSummary(raceOrder, qualyOrder) {
  const teamMap = new Map();
  
  for (const driver of raceOrder) {
    if (!teamMap.has(driver.team)) {
      teamMap.set(driver.team, {
        team: driver.team,
        racePositions: [],
        qualyPositions: [],
        pointsProbabilities: [],
        dnfProbabilities: [],
        averageRaceScore: 0
      });
    }
    const team = teamMap.get(driver.team);
    const qualyDriver = qualyOrder.find(q => q.name === driver.name);
    team.racePositions.push(driver.position);
    team.qualyPositions.push(qualyDriver?.position || 22);
    team.pointsProbabilities.push(driver.pointsProbability);
    team.dnfProbabilities.push(driver.dnfProbability);
    team.averageRaceScore += driver.raceScoreAdjusted;
  }
  
  const teams = [...teamMap.values()].map(team => ({
    team: team.team,
    bestQualy: Math.min(...team.qualyPositions),
    bestRace: Math.min(...team.racePositions),
    averageQualy: round(team.qualyPositions.reduce((a, b) => a + b, 0) / team.qualyPositions.length, 2),
    averageRace: round(team.racePositions.reduce((a, b) => a + b, 0) / team.racePositions.length, 2),
    averagePointsProbability: round(team.pointsProbabilities.reduce((a, b) => a + b, 0) / team.pointsProbabilities.length, 1),
    atLeastOneDnfProbability: round(100 * (1 - team.dnfProbabilities.reduce((acc, p) => acc * (1 - p / 100), 1)), 1),
    averageRaceScore: round(team.averageRaceScore / team.racePositions.length, 3)
  }));
  
  return teams.sort((a, b) => 
    b.averageRaceScore !== a.averageRaceScore 
      ? b.averageRaceScore - a.averageRaceScore 
      : a.team.localeCompare(b.team, 'es')
  );
}

function resolveFavorite(bodyFavorite) {
  // Fallback hardcodeado para cuando no tenemos driverByName cargado
  const fallbackDriver = { name: 'Fernando Alonso', team: 'Aston Martin' };
  
  if (!bodyFavorite || typeof bodyFavorite !== 'object') {
    return { type: 'driver', name: fallbackDriver.name, team: fallbackDriver.team };
  }
  
  if (bodyFavorite.type === 'team') {
    return { type: 'team', name: bodyFavorite.name };
  }
  
  if (bodyFavorite.name) {
    return { type: 'driver', name: bodyFavorite.name, team: bodyFavorite.team || fallbackDriver.team };
  }
  
  return { type: 'driver', name: fallbackDriver.name, team: fallbackDriver.team };
}

function buildFavoritePrediction(favorite, qualyOrder, raceOrder, driverByName) {
  if (favorite.type === 'driver') {
    const driverQualy = qualyOrder.find(q => q.name === favorite.name);
    const driverRace = raceOrder.find(r => r.name === favorite.name);
    
    return {
      type: 'driver',
      name: favorite.name,
      team: favorite.team || driverByName?.[favorite.name]?.team || 'Unknown',
      predictedQualyPosition: driverQualy?.position ?? null,
      predictedRacePosition: driverRace?.position ?? null,
      pointsProbability: driverRace?.pointsProbability ?? 1,
      dnfProbability: driverRace?.dnfProbability ?? 0,
      qualyScore: driverQualy?.qualyScore ?? 0,
      raceScore: driverRace?.raceScoreAdjusted ?? 0
    };
  }
  
  // Team favorite
  const teamRace = raceOrder.filter(d => d.team === favorite.name);
  const teamQualy = qualyOrder.filter(d => d.team === favorite.name);
  
  const pointsAtLeastOneScores = teamRace.length 
    ? 100 * (1 - teamRace.map(d => 1 - (d.pointsProbability / 100)).reduce((a, b) => a * b, 1))
    : 0;
  const dnfAtLeastOne = teamRace.length
    ? 100 * (1 - teamRace.map(d => 1 - (d.dnfProbability / 100)).reduce((a, b) => a * b, 1))
    : 0;
  
  return {
    type: 'team',
    name: favorite.name,
    drivers: teamRace.map(d => ({
      name: d.name,
      predictedQualyPosition: teamQualy.find(q => q.name === d.name)?.position ?? null,
      predictedRacePosition: d.position,
      pointsProbability: d.pointsProbability,
      dnfProbability: d.dnfProbability
    })),
    bestQualyPosition: teamQualy.length ? Math.min(...teamQualy.map(d => d.position)) : null,
    bestRacePosition: teamRace.length ? Math.min(...teamRace.map(d => d.position)) : null,
    teamPointsProbability: round(pointsAtLeastOneScores, 1),
    teamAtLeastOneDnfProbability: round(dnfAtLeastOne, 1)
  };
}

// Helper functions
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}
