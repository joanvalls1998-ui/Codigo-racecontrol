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
        'state/get-edge-state': () => handleGetEdgeState(query, corsHeaders, env),
        'state/init-edge-state': () => handleInitEdgeState(query, corsHeaders, env),
        'state/reset-edge-state': () => handleResetEdgeState(query, corsHeaders, env),
        'state/apply-adjustments': () => handleApplyAdjustments(query, corsHeaders, env),
        'state/update-adjustments': () => handleUpdateAdjustments(query, corsHeaders, env)
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
    
    // Usar funciones embebidas para circuits (evita bugs de parseo)
    const circuit = getCircuitProfileEmbedded(raceName);
    if (!circuit) {
      return jsonResponse({ 
        error: 'Carrera no reconocida', 
        raceName, 
        availableRaces: RACE_OPTIONS_EMBEDDED 
      }, corsHeaders, 400);
    }
    
    // Usar datos embebidos para grid y performance (evita bugs de parseo/red en Cloudflare)
    const gridData = getGridDataEmbedded();
    const { drivers2026, teams2026 } = gridData;
    const driverByName = Object.fromEntries(drivers2026.map(d => [d.name, d]));
    const teamByName = Object.fromEntries(teams2026.map(t => [t.name, t]));
    
    const performanceState = getPerformanceDataEmbedded();
    
    // Cargar solo adjustments desde GitHub
    const adjustmentsCode = await fetch(DATA_URLS.manualAdjustments).then(r => r.text());
    const adjustmentsModule = fetchModuleFromCode(adjustmentsCode);
    const { manualAdjustmentsState } = adjustmentsModule || {};
    
    // Obtener estado de ajustes runtime (desde KV si existe, o usar base)
    const runtimeAdjustmentsState = await getRuntimeAdjustmentsState(env, manualAdjustmentsState);
    
    // Construir predicciones
    console.log('drivers2026 type:', typeof drivers2026, 'isArray:', Array.isArray(drivers2026));
    console.log('performanceState type:', typeof performanceState);
    console.log('driverByName type:', typeof driverByName);
    
    if (!drivers2026 || !Array.isArray(drivers2026)) {
      return jsonResponse({
        error: 'Grid data no cargada correctamente',
        debug: {
          drivers2026: drivers2026 ? 'exists' : 'undefined',
          gridModuleKeys: Object.keys(gridModule)
        }
      }, corsHeaders, 500);
    }
    
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

// Standings API - Datos embebidos (temporada 2026 después de 3 carreras)
async function handleStandings(query, corsHeaders) {
  // Datos estáticos de clasificación (actualizar manualmente cuando cambie)
  const data = {
    updatedAt: new Date().toISOString(),
    source: 'worker_embedded',
    isStaticSnapshot: true,
    drivers: [
      { pos: 1, number: "12", name: "Kimi Antonelli", team: "Mercedes", points: 72 },
      { pos: 2, number: "63", name: "George Russell", team: "Mercedes", points: 63 },
      { pos: 3, number: "16", name: "Charles Leclerc", team: "Ferrari", points: 49 },
      { pos: 4, number: "44", name: "Lewis Hamilton", team: "Ferrari", points: 41 },
      { pos: 5, number: "1", name: "Lando Norris", team: "McLaren", points: 25 },
      { pos: 6, number: "81", name: "Oscar Piastri", team: "McLaren", points: 24 },
      { pos: 7, number: "14", name: "Fernando Alonso", team: "Aston Martin", points: 18 },
      { pos: 8, number: "18", name: "Lance Stroll", team: "Aston Martin", points: 12 },
      { pos: 9, number: "27", name: "Nico Hulkenberg", team: "Haas", points: 8 },
      { pos: 10, number: "23", name: "Alexander Albon", team: "Williams", points: 6 },
      { pos: 11, number: "22", name: "Yuki Tsunoda", team: "Racing Bulls", points: 4 },
      { pos: 12, number: "43", name: "Franco Colapinto", team: "Racing Bulls", points: 2 },
      { pos: 13, number: "10", name: "Pierre Gasly", team: "Alpine", points: 1 },
      { pos: 14, number: "31", name: "Esteban Ocon", team: "Alpine", points: 0 },
      { pos: 15, number: "20", name: "Kevin Magnussen", team: "Haas", points: 0 },
      { pos: 16, number: "40", name: "Liam Lawson", team: "Williams", points: 0 },
      { pos: 17, number: "24", name: "Guanyu Zhou", team: "Audi", points: 0 },
      { pos: 18, number: "77", name: "Valtteri Bottas", team: "Audi", points: 0 },
      { pos: 19, number: "21", name: "Oliver Bearman", team: "Cadillac", points: 0 },
      { pos: 20, number: "88", name: "Colton Herta", team: "Cadillac", points: 0 }
    ],
    teams: [
      { pos: 1, team: "Mercedes", points: 135 },
      { pos: 2, team: "Ferrari", points: 90 },
      { pos: 3, team: "McLaren", points: 49 },
      { pos: 4, team: "Aston Martin", points: 30 },
      { pos: 5, team: "Haas", points: 8 },
      { pos: 6, team: "Williams", points: 6 },
      { pos: 7, team: "Racing Bulls", points: 6 },
      { pos: 8, team: "Alpine", points: 1 },
      { pos: 9, team: "Audi", points: 0 },
      { pos: 10, team: "Cadillac", points: 0 }
    ]
  };
  
  return jsonResponse(data, corsHeaders);
}

// Calendar API - Datos embebidos (temporada 2026)
async function handleCalendar(query, corsHeaders) {
  const nowCal = new Date(); // Declarar ahora dentro del handler
  
  // Datos estáticos del calendario 2026
  const calendarEvents = [
    {
      id: "test-bahrain-1",
      type: "testing",
      title: "Pre-Season Testing 1",
      location: "Bahrain",
      venue: "Bahrain International Circuit",
      start: "2026-02-11",
      end: "2026-02-13"
    },
    {
      id: "test-bahrain-2",
      type: "testing",
      title: "Pre-Season Testing 2",
      location: "Bahrain",
      venue: "Bahrain International Circuit",
      start: "2026-02-18",
      end: "2026-02-20"
    },
    {
      id: "round-1",
      type: "race",
      round: 1,
      title: "Australian Grand Prix",
      predictRace: "GP de Australia",
      location: "Australia",
      venue: "Melbourne",
      start: "2026-03-06",
      end: "2026-03-08"
    },
    {
      id: "round-2",
      type: "race",
      round: 2,
      title: "Chinese Grand Prix",
      predictRace: "GP de China",
      location: "China",
      venue: "Shanghai",
      start: "2026-03-13",
      end: "2026-03-15"
    },
    {
      id: "round-3",
      type: "race",
      round: 3,
      title: "Japanese Grand Prix",
      predictRace: "GP de Japón",
      location: "Japan",
      venue: "Suzuka",
      start: "2026-03-27",
      end: "2026-03-29"
    },
    {
      id: "round-4",
      type: "race",
      round: 4,
      title: "Miami Grand Prix",
      predictRace: "GP Miami",
      location: "USA",
      venue: "Miami",
      start: "2026-05-01",
      end: "2026-05-03",
      sprint: true
    },
    {
      id: "round-5",
      type: "race",
      round: 5,
      title: "Canadian Grand Prix",
      predictRace: "GP de Canadá",
      location: "Canada",
      venue: "Montreal",
      start: "2026-05-22",
      end: "2026-05-24"
    },
    {
      id: "round-6",
      type: "race",
      round: 6,
      title: "Monaco Grand Prix",
      predictRace: "GP de Mónaco",
      location: "Monaco",
      venue: "Monaco",
      start: "2026-06-05",
      end: "2026-06-07"
    },
    {
      id: "round-7",
      type: "race",
      round: 7,
      title: "Spanish Grand Prix",
      predictRace: "GP de España",
      location: "Spain",
      venue: "Barcelona-Catalunya",
      start: "2026-06-12",
      end: "2026-06-14"
    },
    {
      id: "round-8",
      type: "race",
      round: 8,
      title: "Austrian Grand Prix",
      predictRace: "GP de Austria",
      location: "Austria",
      venue: "Red Bull Ring",
      start: "2026-06-26",
      end: "2026-06-28",
      sprint: true
    },
    {
      id: "round-9",
      type: "race",
      round: 9,
      title: "British Grand Prix",
      predictRace: "GP de Gran Bretaña",
      location: "Great Britain",
      venue: "Silverstone",
      start: "2026-07-03",
      end: "2026-07-05"
    },
    {
      id: "round-10",
      type: "race",
      round: 10,
      title: "Belgian Grand Prix",
      predictRace: "GP de Bélgica",
      location: "Belgium",
      venue: "Spa-Francorchamps",
      start: "2026-07-24",
      end: "2026-07-26"
    },
    {
      id: "round-11",
      type: "race",
      round: 11,
      title: "Hungarian Grand Prix",
      predictRace: "GP de Hungría",
      location: "Hungary",
      venue: "Hungaroring",
      start: "2026-07-31",
      end: "2026-08-02"
    },
    {
      id: "round-12",
      type: "race",
      round: 12,
      title: "Dutch Grand Prix",
      predictRace: "GP de Países Bajos",
      location: "Netherlands",
      venue: "Zandvoort",
      start: "2026-08-28",
      end: "2026-08-30"
    },
    {
      id: "round-13",
      type: "race",
      round: 13,
      title: "Italian Grand Prix",
      predictRace: "GP de Italia",
      location: "Italy",
      venue: "Monza",
      start: "2026-09-04",
      end: "2026-09-06"
    },
    {
      id: "round-14",
      type: "race",
      round: 14,
      title: "Azerbaijan Grand Prix",
      predictRace: "GP de Azerbaiyán",
      location: "Azerbaijan",
      venue: "Baku",
      start: "2026-09-18",
      end: "2026-09-20"
    },
    {
      id: "round-15",
      type: "race",
      round: 15,
      title: "Singapore Grand Prix",
      predictRace: "GP de Singapur",
      location: "Singapore",
      venue: "Marina Bay",
      start: "2026-10-02",
      end: "2026-10-04"
    },
    {
      id: "round-16",
      type: "race",
      round: 16,
      title: "United States Grand Prix",
      predictRace: "GP de Estados Unidos",
      location: "USA",
      venue: "Austin",
      start: "2026-10-16",
      end: "2026-10-18",
      sprint: true
    },
    {
      id: "round-17",
      type: "race",
      round: 17,
      title: "Mexico City Grand Prix",
      predictRace: "GP de México",
      location: "Mexico",
      venue: "Autódromo Hermanos Rodríguez",
      start: "2026-10-23",
      end: "2026-10-25"
    },
    {
      id: "round-18",
      type: "race",
      round: 18,
      title: "São Paulo Grand Prix",
      predictRace: "GP de São Paulo",
      location: "Brazil",
      venue: "Interlagos",
      start: "2026-11-06",
      end: "2026-11-08",
      sprint: true
    },
    {
      id: "round-19",
      type: "race",
      round: 19,
      title: "Las Vegas Grand Prix",
      predictRace: "GP de Las Vegas",
      location: "USA",
      venue: "Las Vegas Strip",
      start: "2026-11-20",
      end: "2026-11-22"
    },
    {
      id: "round-20",
      type: "race",
      round: 20,
      title: "Qatar Grand Prix",
      predictRace: "GP de Catar",
      location: "Qatar",
      venue: "Lusail",
      start: "2026-11-28",
      end: "2026-11-30",
      sprint: true
    },
    {
      id: "round-21",
      type: "race",
      round: 21,
      title: "Abu Dhabi Grand Prix",
      predictRace: "GP de Abu Dabi",
      location: "UAE",
      venue: "Yas Marina",
      start: "2026-12-05",
      end: "2026-12-07"
    }
  ];
  
  let nextRaceAssigned = false;
  
  const enriched = calendarEvents.map(event => {
    const endDate = new Date(`${event.end}T23:59:59Z`);
    let status = 'upcoming';
    
    if (endDate < nowCal) {
      status = 'completed';
    } else if (!nextRaceAssigned && event.type === 'race') {
      status = 'next';
      nextRaceAssigned = true;
    }
    
    return { ...event, status };
  });
  
  return jsonResponse({ events: enriched }, corsHeaders);
}

// Funciones helper embebidas para circuits (evita parseo dinámico)
function getCircuitProfileEmbedded(raceName) {
  const circuits = {
    "GP de Australia": { round: 1, venue: "Melbourne", officialVenue: "Albert Park", type: "semiurbano", overtaking: 58, baseRainChance: 24, baseSafetyCarChance: 42, degradation: 58, weights: { qualyImportance: 0.58, racePaceImportance: 0.72, reliabilityStress: 0.48, tyreManagement: 0.55, traction: 0.58, aero: 0.62, topSpeed: 0.45, streetTrack: 0.40 } },
    "GP de China": { round: 2, venue: "Shanghái", officialVenue: "Shanghai International Circuit", type: "permanente", overtaking: 67, baseRainChance: 20, baseSafetyCarChance: 28, degradation: 66, weights: { qualyImportance: 0.54, racePaceImportance: 0.77, reliabilityStress: 0.45, tyreManagement: 0.68, traction: 0.55, aero: 0.60, topSpeed: 0.71, streetTrack: 0.10 } },
    "GP de Japón": { round: 3, venue: "Suzuka", officialVenue: "Suzuka Circuit", type: "permanente", overtaking: 44, baseRainChance: 26, baseSafetyCarChance: 24, degradation: 62, weights: { qualyImportance: 0.67, racePaceImportance: 0.73, reliabilityStress: 0.46, tyreManagement: 0.61, traction: 0.49, aero: 0.86, topSpeed: 0.38, streetTrack: 0.05 } },
    "GP de Baréin": { round: 4, venue: "Baréin", officialVenue: "Sakhir", type: "permanente", overtaking: 72, baseRainChance: 1, baseSafetyCarChance: 26, degradation: 71, weights: { qualyImportance: 0.57, racePaceImportance: 0.79, reliabilityStress: 0.47, tyreManagement: 0.78, traction: 0.72, aero: 0.41, topSpeed: 0.70, streetTrack: 0.00 } },
    "GP de Arabia Saudí": { round: 5, venue: "Yeda", officialVenue: "Jeddah Corniche Circuit", type: "urbano", overtaking: 64, baseRainChance: 1, baseSafetyCarChance: 47, degradation: 46, weights: { qualyImportance: 0.63, racePaceImportance: 0.65, reliabilityStress: 0.56, tyreManagement: 0.44, traction: 0.48, aero: 0.58, topSpeed: 0.77, streetTrack: 0.90 } },
    "GP Miami": { round: 6, venue: "Miami", officialVenue: "Miami International Autodrome", type: "semiurbano", overtaking: 63, baseRainChance: 18, baseSafetyCarChance: 46, degradation: 57, weights: { qualyImportance: 0.56, racePaceImportance: 0.69, reliabilityStress: 0.52, tyreManagement: 0.58, traction: 0.66, aero: 0.57, topSpeed: 0.61, streetTrack: 0.52 } },
    "GP de Canadá": { round: 7, venue: "Montreal", officialVenue: "Circuit Gilles Villeneuve", type: "semiurbano", overtaking: 66, baseRainChance: 21, baseSafetyCarChance: 50, degradation: 52, weights: { qualyImportance: 0.55, racePaceImportance: 0.66, reliabilityStress: 0.54, tyreManagement: 0.48, traction: 0.68, aero: 0.44, topSpeed: 0.72, streetTrack: 0.64 } },
    "GP de Mónaco": { round: 8, venue: "Mónaco", officialVenue: "Montecarlo", type: "urbano", overtaking: 12, baseRainChance: 16, baseSafetyCarChance: 38, degradation: 40, weights: { qualyImportance: 0.92, racePaceImportance: 0.48, reliabilityStress: 0.47, tyreManagement: 0.36, traction: 0.78, aero: 0.67, topSpeed: 0.10, streetTrack: 0.95 } },
    "GP de España": { round: 9, venue: "Barcelona-Catalunya", officialVenue: "Circuit de Barcelona-Catalunya", type: "permanente", overtaking: 46, baseRainChance: 11, baseSafetyCarChance: 20, degradation: 67, weights: { qualyImportance: 0.60, racePaceImportance: 0.79, reliabilityStress: 0.42, tyreManagement: 0.70, traction: 0.48, aero: 0.79, topSpeed: 0.34, streetTrack: 0.02 } },
    "GP de Austria": { round: 10, venue: "Spielberg", officialVenue: "Red Bull Ring", type: "permanente", overtaking: 68, baseRainChance: 28, baseSafetyCarChance: 32, degradation: 54, weights: { qualyImportance: 0.62, racePaceImportance: 0.66, reliabilityStress: 0.40, tyreManagement: 0.50, traction: 0.76, aero: 0.42, topSpeed: 0.73, streetTrack: 0.03 } },
    "GP de Gran Bretaña": { round: 11, venue: "Silverstone", officialVenue: "Silverstone", type: "permanente", overtaking: 59, baseRainChance: 29, baseSafetyCarChance: 24, degradation: 63, weights: { qualyImportance: 0.61, racePaceImportance: 0.76, reliabilityStress: 0.44, tyreManagement: 0.63, traction: 0.42, aero: 0.87, topSpeed: 0.40, streetTrack: 0.01 } },
    "GP de Bélgica": { round: 12, venue: "Spa-Francorchamps", officialVenue: "Spa-Francorchamps", type: "permanente", overtaking: 64, baseRainChance: 36, baseSafetyCarChance: 33, degradation: 56, weights: { qualyImportance: 0.55, racePaceImportance: 0.70, reliabilityStress: 0.50, tyreManagement: 0.54, traction: 0.37, aero: 0.61, topSpeed: 0.74, streetTrack: 0.00 } },
    "GP de Hungría": { round: 13, venue: "Budapest", officialVenue: "Hungaroring", type: "permanente", overtaking: 24, baseRainChance: 19, baseSafetyCarChance: 27, degradation: 64, weights: { qualyImportance: 0.82, racePaceImportance: 0.64, reliabilityStress: 0.38, tyreManagement: 0.63, traction: 0.71, aero: 0.67, topSpeed: 0.16, streetTrack: 0.04 } },
    "GP de Países Bajos": { round: 14, venue: "Zandvoort", officialVenue: "Zandvoort", type: "permanente", overtaking: 22, baseRainChance: 23, baseSafetyCarChance: 25, degradation: 57, weights: { qualyImportance: 0.83, racePaceImportance: 0.63, reliabilityStress: 0.37, tyreManagement: 0.54, traction: 0.56, aero: 0.76, topSpeed: 0.22, streetTrack: 0.02 } },
    "GP de Italia": { round: 15, venue: "Monza", officialVenue: "Monza", type: "permanente", overtaking: 71, baseRainChance: 18, baseSafetyCarChance: 26, degradation: 47, weights: { qualyImportance: 0.60, racePaceImportance: 0.65, reliabilityStress: 0.43, tyreManagement: 0.43, traction: 0.49, aero: 0.12, topSpeed: 0.94, streetTrack: 0.00 } },
    "GP de España (Madrid)": { round: 16, venue: "Madrid", officialVenue: "Madrid", type: "urbano", overtaking: 36, baseRainChance: 10, baseSafetyCarChance: 41, degradation: 55, weights: { qualyImportance: 0.73, racePaceImportance: 0.63, reliabilityStress: 0.49, tyreManagement: 0.52, traction: 0.70, aero: 0.51, topSpeed: 0.46, streetTrack: 0.81 } },
    "GP de Azerbaiyán": { round: 17, venue: "Bakú", officialVenue: "Bakú", type: "urbano", overtaking: 69, baseRainChance: 9, baseSafetyCarChance: 48, degradation: 44, weights: { qualyImportance: 0.60, racePaceImportance: 0.62, reliabilityStress: 0.54, tyreManagement: 0.40, traction: 0.58, aero: 0.27, topSpeed: 0.88, streetTrack: 0.89 } },
    "GP de Singapur": { round: 18, venue: "Singapur", officialVenue: "Marina Bay", type: "urbano", overtaking: 31, baseRainChance: 33, baseSafetyCarChance: 57, degradation: 69, weights: { qualyImportance: 0.70, racePaceImportance: 0.71, reliabilityStress: 0.61, tyreManagement: 0.72, traction: 0.79, aero: 0.60, topSpeed: 0.20, streetTrack: 0.92 } },
    "GP de Estados Unidos": { round: 19, venue: "Austin", officialVenue: "Austin", type: "permanente", overtaking: 57, baseRainChance: 17, baseSafetyCarChance: 27, degradation: 66, weights: { qualyImportance: 0.58, racePaceImportance: 0.76, reliabilityStress: 0.45, tyreManagement: 0.70, traction: 0.54, aero: 0.74, topSpeed: 0.42, streetTrack: 0.00 } },
    "GP de México": { round: 20, venue: "Ciudad de México", officialVenue: "Hermanos Rodríguez", type: "permanente_altitud", overtaking: 72, baseRainChance: 8, baseSafetyCarChance: 29, degradation: 49, weights: { qualyImportance: 0.57, racePaceImportance: 0.67, reliabilityStress: 0.48, tyreManagement: 0.48, traction: 0.58, aero: 0.36, topSpeed: 0.75, streetTrack: 0.01 } },
    "GP de São Paulo": { round: 21, venue: "São Paulo", officialVenue: "Interlagos", type: "permanente", overtaking: 65, baseRainChance: 31, baseSafetyCarChance: 35, degradation: 58, weights: { qualyImportance: 0.55, racePaceImportance: 0.71, reliabilityStress: 0.46, tyreManagement: 0.58, traction: 0.60, aero: 0.52, topSpeed: 0.47, streetTrack: 0.00 } },
    "GP de Las Vegas": { round: 22, venue: "Las Vegas", officialVenue: "Las Vegas Strip Circuit", type: "urbano", overtaking: 74, baseRainChance: 4, baseSafetyCarChance: 39, degradation: 43, weights: { qualyImportance: 0.56, racePaceImportance: 0.62, reliabilityStress: 0.53, tyreManagement: 0.42, traction: 0.44, aero: 0.19, topSpeed: 0.91, streetTrack: 0.84 } },
    "GP de Catar": { round: 23, venue: "Lusail", officialVenue: "Lusail", type: "permanente", overtaking: 49, baseRainChance: 2, baseSafetyCarChance: 22, degradation: 71, weights: { qualyImportance: 0.61, racePaceImportance: 0.77, reliabilityStress: 0.47, tyreManagement: 0.76, traction: 0.41, aero: 0.80, topSpeed: 0.29, streetTrack: 0.00 } },
    "GP de Abu Dabi": { round: 24, venue: "Yas Marina", officialVenue: "Yas Marina", type: "permanente", overtaking: 53, baseRainChance: 1, baseSafetyCarChance: 23, degradation: 51, weights: { qualyImportance: 0.61, racePaceImportance: 0.69, reliabilityStress: 0.42, tyreManagement: 0.50, traction: 0.69, aero: 0.46, topSpeed: 0.52, streetTrack: 0.04 } }
  };
  return circuits[raceName] || null;
}

const RACE_OPTIONS_EMBEDDED = [
  "GP de Australia", "GP de China", "GP de Japón", "GP de Baréin", "GP de Arabia Saudí",
  "GP Miami", "GP de Canadá", "GP de Mónaco", "GP de España", "GP de Austria",
  "GP de Gran Bretaña", "GP de Bélgica", "GP de Hungría", "GP de Países Bajos", "GP de Italia",
  "GP de España (Madrid)", "GP de Azerbaiyán", "GP de Singapur", "GP de Estados Unidos", "GP de México",
  "GP de São Paulo", "GP de Las Vegas", "GP de Catar", "GP de Abu Dabi"
];

// === GRID DATA EMBEDDED ===
function getGridDataEmbedded() {
  return {
    drivers2026: [
  {
    name: "George Russell",
    shortCode: "RUS",
    number: "63",
    team: "Mercedes",
    officialTeam: "Mercedes",
    teamKey: "mercedes",
    colorClass: "mercedes"
  },
  {
    name: "Kimi Antonelli",
    shortCode: "ANT",
    number: "12",
    team: "Mercedes",
    officialTeam: "Mercedes",
    teamKey: "mercedes",
    colorClass: "mercedes"
  },
  {
    name: "Charles Leclerc",
    shortCode: "LEC",
    number: "16",
    team: "Ferrari",
    officialTeam: "Ferrari",
    teamKey: "ferrari",
    colorClass: "ferrari"
  },
  {
    name: "Lewis Hamilton",
    shortCode: "HAM",
    number: "44",
    team: "Ferrari",
    officialTeam: "Ferrari",
    teamKey: "ferrari",
    colorClass: "ferrari"
  },
  {
    name: "Lando Norris",
    shortCode: "NOR",
    number: "1",
    team: "McLaren",
    officialTeam: "McLaren",
    teamKey: "mclaren",
    colorClass: "mclaren"
  },
  {
    name: "Oscar Piastri",
    shortCode: "PIA",
    number: "81",
    team: "McLaren",
    officialTeam: "McLaren",
    teamKey: "mclaren",
    colorClass: "mclaren"
  },
  {
    name: "Max Verstappen",
    shortCode: "VER",
    number: "3",
    team: "Red Bull",
    officialTeam: "Red Bull Racing",
    teamKey: "redbull",
    colorClass: "redbull"
  },
  {
    name: "Isack Hadjar",
    shortCode: "HAD",
    number: "6",
    team: "Red Bull",
    officialTeam: "Red Bull Racing",
    teamKey: "redbull",
    colorClass: "redbull"
  },
  {
    name: "Esteban Ocon",
    shortCode: "OCO",
    number: "31",
    team: "Haas",
    officialTeam: "Haas F1 Team",
    teamKey: "haas",
    colorClass: "haas"
  },
  {
    name: "Oliver Bearman",
    shortCode: "BEA",
    number: "87",
    team: "Haas",
    officialTeam: "Haas F1 Team",
    teamKey: "haas",
    colorClass: "haas"
  },
  {
    name: "Liam Lawson",
    shortCode: "LAW",
    number: "30",
    team: "Racing Bulls",
    officialTeam: "Racing Bulls",
    teamKey: "rb",
    colorClass: "rb"
  },
  {
    name: "Arvid Lindblad",
    shortCode: "LIN",
    number: "41",
    team: "Racing Bulls",
    officialTeam: "Racing Bulls",
    teamKey: "rb",
    colorClass: "rb"
  },
  {
    name: "Pierre Gasly",
    shortCode: "GAS",
    number: "10",
    team: "Alpine",
    officialTeam: "Alpine",
    teamKey: "alpine",
    colorClass: "alpine"
  },
  {
    name: "Franco Colapinto",
    shortCode: "COL",
    number: "43",
    team: "Alpine",
    officialTeam: "Alpine",
    teamKey: "alpine",
    colorClass: "alpine"
  },
  {
    name: "Nico Hulkenberg",
    shortCode: "HUL",
    number: "27",
    team: "Audi",
    officialTeam: "Audi",
    teamKey: "audi",
    colorClass: "audi"
  },
  {
    name: "Gabriel Bortoleto",
    shortCode: "BOR",
    number: "5",
    team: "Audi",
    officialTeam: "Audi",
    teamKey: "audi",
    colorClass: "audi"
  },
  {
    name: "Carlos Sainz",
    shortCode: "SAI",
    number: "55",
    team: "Williams",
    officialTeam: "Williams",
    teamKey: "williams",
    colorClass: "williams"
  },
  {
    name: "Alexander Albon",
    shortCode: "ALB",
    number: "23",
    team: "Williams",
    officialTeam: "Williams",
    teamKey: "williams",
    colorClass: "williams"
  },
  {
    name: "Sergio Perez",
    shortCode: "PER",
    number: "11",
    team: "Cadillac",
    officialTeam: "Cadillac",
    teamKey: "cadillac",
    colorClass: "cadillac"
  },
  {
    name: "Valtteri Bottas",
    shortCode: "BOT",
    number: "77",
    team: "Cadillac",
    officialTeam: "Cadillac",
    teamKey: "cadillac",
    colorClass: "cadillac"
  },
  {
    name: "Fernando Alonso",
    shortCode: "ALO",
    number: "14",
    team: "Aston Martin",
    officialTeam: "Aston Martin",
    teamKey: "aston",
    colorClass: "aston"
  },
  {
    name: "Lance Stroll",
    shortCode: "STR",
    number: "18",
    team: "Aston Martin",
    officialTeam: "Aston Martin",
    teamKey: "aston",
    colorClass: "aston"
  }
],
    teams2026: [
  {
    key: "mercedes",
    name: "Mercedes",
    officialName: "Mercedes",
    colorClass: "mercedes",
    drivers: ["George Russell", "Kimi Antonelli"]
  },
  {
    key: "ferrari",
    name: "Ferrari",
    officialName: "Ferrari",
    colorClass: "ferrari",
    drivers: ["Charles Leclerc", "Lewis Hamilton"]
  },
  {
    key: "mclaren",
    name: "McLaren",
    officialName: "McLaren",
    colorClass: "mclaren",
    drivers: ["Lando Norris", "Oscar Piastri"]
  },
  {
    key: "redbull",
    name: "Red Bull",
    officialName: "Red Bull Racing",
    colorClass: "redbull",
    drivers: ["Max Verstappen", "Isack Hadjar"]
  },
  {
    key: "haas",
    name: "Haas",
    officialName: "Haas F1 Team",
    colorClass: "haas",
    drivers: ["Esteban Ocon", "Oliver Bearman"]
  },
  {
    key: "rb",
    name: "Racing Bulls",
    officialName: "Racing Bulls",
    colorClass: "rb",
    drivers: ["Liam Lawson", "Arvid Lindblad"]
  },
  {
    key: "alpine",
    name: "Alpine",
    officialName: "Alpine",
    colorClass: "alpine",
    drivers: ["Pierre Gasly", "Franco Colapinto"]
  },
  {
    key: "audi",
    name: "Audi",
    officialName: "Audi",
    colorClass: "audi",
    drivers: ["Nico Hulkenberg", "Gabriel Bortoleto"]
  },
  {
    key: "williams",
    name: "Williams",
    officialName: "Williams",
    colorClass: "williams",
    drivers: ["Carlos Sainz", "Alexander Albon"]
  },
  {
    key: "cadillac",
    name: "Cadillac",
    officialName: "Cadillac",
    colorClass: "cadillac",
    drivers: ["Sergio Perez", "Valtteri Bottas"]
  },
  {
    key: "aston",
    name: "Aston Martin",
    officialName: "Aston Martin",
    colorClass: "aston",
    drivers: ["Fernando Alonso", "Lance Stroll"]
  }
]
  };
}

// === PERFORMANCE DATA EMBEDDED ===
function getPerformanceDataEmbedded() {
  return {
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
// === ENGINEER API CORE - Cloudflare Workers Version ===
// Migrado de spawn('curl') a fetch() nativo

const DEFAULT_YEAR = 2026;

const SESSION_TYPES = Object.freeze([
  { key: "fp1", label: "FP1" },
  { key: "fp2", label: "FP2" },
  { key: "fp3", label: "FP3" },
  { key: "qualy", label: "Qualy" },
  { key: "sprint_qualy", label: "Sprint Qualy" },
  { key: "sprint_race", label: "Sprint" },
  { key: "race", label: "Race" }
]);

const TTL = Object.freeze({
  meetings: 1000 * 60 * 30,
  sessions: 1000 * 60 * 15,
  drivers: 1000 * 60 * 8,
  laptimes: 1000 * 60 * 6,
  telemetry: 1000 * 60 * 4,
  context: 1000 * 60 * 5
});

// Cache simple con Map (funciona en Cloudflare Workers)
const cache = {
  meetings: new Map(),
  sessions: new Map(),
  drivers: new Map(),
  laptimes: new Map(),
  telemetry: new Map(),
  context: new Map()
};

function setCached(map, key, value) {
  map.set(key, { ts: Date.now(), value });
  return value;
}

function getCached(map, key, ttlMs) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

// Fetch nativo de Cloudflare Workers (reemplaza spawn('curl'))
async function fetchJson(url) {
  const isGithubApi = url.includes('api.github.com');
  const headers = isGithubApi ? { 'User-Agent': 'RaceControl-Worker/1.0' } : {};
  const response = await fetch(url, { 
    headers,
    cf: { cacheTtl: 300 }
  });
  if (!response.ok) {
    const error = new Error(`HTTP_${response.status}`);
    error.code = `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchRepoContents(path = "") {
  const encoded = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
  const url = `https://api.github.com/repos/TracingInsights/2026/contents${encoded ? `/${encoded}` : ""}?ref=main`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

async function fetchRawJson(path = "") {
  const encoded = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
  const url = `https://raw.githubusercontent.com/TracingInsights/2026/main/${encoded}`;
  return fetchJson(url);
}

function normalizeSessionType(folder = "") {
  const clean = String(folder || "").trim().toLowerCase();
  if (["practice 1", "fp1", "p1"].includes(clean)) return { key: "fp1", label: "FP1" };
  if (["practice 2", "fp2", "p2"].includes(clean)) return { key: "fp2", label: "FP2" };
  if (["practice 3", "fp3", "p3"].includes(clean)) return { key: "fp3", label: "FP3" };
  if (["qualifying", "q", "qualy"].includes(clean)) return { key: "qualy", label: "Qualy" };
  if (["sprint qualifying", "sprint shootout", "sq"].includes(clean)) return { key: "sprint_qualy", label: "Sprint Qualy" };
  if (["sprint", "sprint race", "sr"].includes(clean)) return { key: "sprint_race", label: "Sprint" };
  if (["race", "grand prix", "r"].includes(clean)) return { key: "race", label: "Race" };
  return { key: clean.replace(/\s+/g, "_"), label: folder || "Sesión" };
}

function sessionPriority(typeKey = "") {
  const order = ["fp1", "fp2", "fp3", "sprint_qualy", "qualy", "sprint_race", "race"];
  const index = order.indexOf(typeKey);
  return index === -1 ? 999 : index;
}

async function getMeetings() {
  const key = `${DEFAULT_YEAR}`;
  const cached = getCached(cache.meetings, key, TTL.meetings);
  if (cached) return cached;

  const root = await fetchRepoContents("");
  const meetings = root
    .filter(item => item?.type === "dir")
    .map(item => String(item.name || "").trim())
    .filter(name => name && !name.startsWith(".") && !name.toLowerCase().includes("cache"))
    .filter(name => /grand prix/i.test(name))
    .map(name => ({
      meeting_key: name,
      gp_label: name,
      meeting_name: name
    }))
    .sort((a, b) => a.gp_label.localeCompare(b.gp_label));

  return setCached(cache.meetings, key, meetings);
}

async function getSessions(meetingKey) {
  const cleanMeeting = String(meetingKey || "").trim();
  if (!cleanMeeting) return [];
  const key = `${DEFAULT_YEAR}:${cleanMeeting}`;
  const cached = getCached(cache.sessions, key, TTL.sessions);
  if (cached) return cached;

  const entries = await fetchRepoContents(cleanMeeting);
  const sessions = entries
    .filter(item => item?.type === "dir")
    .map(item => {
      const normalized = normalizeSessionType(item.name);
      return {
        session_key: `${cleanMeeting}__${item.name}`,
        folder: item.name,
        type_key: normalized.key,
        type_label: normalized.label
      };
    })
    .sort((a, b) => sessionPriority(a.type_key) - sessionPriority(b.type_key) || a.folder.localeCompare(b.folder));

  return setCached(cache.sessions, key, sessions);
}

async function getDrivers(sessionKey) {
  const cleanSession = String(sessionKey || "").trim();
  if (!cleanSession || !cleanSession.includes("__")) return [];
  const key = `${DEFAULT_YEAR}:${cleanSession}`;
  const cached = getCached(cache.drivers, key, TTL.drivers);
  if (cached) return cached;

  const [meetingKey, sessionFolder] = cleanSession.split("__");
  const payload = await fetchRawJson(`${meetingKey}/${sessionFolder}/drivers.json`);
  const drivers = (Array.isArray(payload?.drivers) ? payload.drivers : [])
    .map(item => ({
      id: String(item?.dn || "").trim() || String(item?.driver || "").trim(),
      code: String(item?.driver || "").trim(),
      name: String(item?.fn || "").trim() + " " + String(item?.ln || "").trim(),
      team: String(item?.team || "").trim(),
      number: String(item?.dn || "").trim()
    }))
    .filter(item => item.id && item.code)
    .sort((a, b) => a.name.localeCompare(b.name));

  return setCached(cache.drivers, key, drivers);
}

async function loadLaptimes({ meetingKey, sessionFolder, driverCode }) {
  const key = `${meetingKey}:${sessionFolder}:${driverCode}`;
  const cached = getCached(cache.laptimes, key, TTL.laptimes);
  if (cached) return cached;
  const data = await fetchRawJson(`${meetingKey}/${sessionFolder}/${driverCode}/laptimes.json`);
  return setCached(cache.laptimes, key, data || {});
}

async function loadLapTelemetry({ meetingKey, sessionFolder, driverCode, lapNumber }) {
  const key = `${meetingKey}:${sessionFolder}:${driverCode}:${lapNumber}`;
  const cached = getCached(cache.telemetry, key, TTL.telemetry);
  if (cached) return cached;
  const data = await fetchRawJson(`${meetingKey}/${sessionFolder}/${driverCode}/${lapNumber}_tel.json`);
  return setCached(cache.telemetry, key, data || {});
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (value === "None") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasSamples(values = []) {
  return Array.isArray(values) && values.some(value => Number.isFinite(parseNumber(value)));
}

function readFlagArray(source = {}, keys = []) {
  for (const key of keys) {
    if (!Array.isArray(source?.[key])) continue;
    return source[key];
  }
  return [];
}

function parsePitFlag(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const clean = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "pit", "in", "out"].includes(clean);
}

function readTrace(trace = {}, keys = []) {
  for (const key of keys) {
    if (Array.isArray(trace?.[key])) return trace[key];
  }
  return [];
}

function assessTraceUsefulness(trace = null) {
  if (!trace || typeof trace !== "object") {
    return { hasTelemetry: false, points: 0, hasSpeed: false, hasDistance: false, hasTrack: false };
  }
  const speed = readTrace(trace, ["speed"]);
  const throttle = readTrace(trace, ["throttle"]);
  const brake = readTrace(trace, ["brake"]);
  const distance = readTrace(trace, ["distance"]);
  const relDistance = readTrace(trace, ["rel_distance", "relative_distance", "pct_distance"]);
  const trackX = readTrace(trace, ["x", "pos_x"]);
  const trackY = readTrace(trace, ["y", "pos_y"]);
  const hasSpeed = hasSamples(speed);
  const hasDistance = hasSamples(distance) || hasSamples(relDistance);
  const hasTrack = hasSamples(trackX) && hasSamples(trackY);
  const hasControl = hasSamples(throttle) || hasSamples(brake);
  const points = [hasSpeed, hasDistance, hasTrack, hasControl].filter(Boolean).length;
  return { hasTelemetry: points > 0, points, hasSpeed, hasDistance, hasTrack };
}

function buildLapCatalog(laptimes = {}) {
  const lapNumbers = Array.isArray(laptimes.lap) ? laptimes.lap : [];
  const lapTimes = Array.isArray(laptimes.time) ? laptimes.time : [];
  const compounds = Array.isArray(laptimes.compound) ? laptimes.compound : [];
  const stints = Array.isArray(laptimes.stint) ? laptimes.stint : [];
  const s1 = Array.isArray(laptimes.s1) ? laptimes.s1 : [];
  const s2 = Array.isArray(laptimes.s2) ? laptimes.s2 : [];
  const s3 = Array.isArray(laptimes.s3) ? laptimes.s3 : [];
  const pitIn = readFlagArray(laptimes, ["pit_in", "pitin", "is_pit_in", "pit"]);
  const pitOut = readFlagArray(laptimes, ["pit_out", "pitout", "is_pit_out"]);

  const catalog = lapNumbers.map((rawLap, index) => {
    const lapNumber = parseNumber(rawLap);
    const lapTime = parseNumber(lapTimes[index]);
    const sector1 = parseNumber(s1[index]);
    const sector2 = parseNumber(s2[index]);
    const sector3 = parseNumber(s3[index]);
    const isPitIn = parsePitFlag(pitIn[index]);
    const isPitOut = parsePitFlag(pitOut[index]);
    const hasTiming = Number.isFinite(lapTime);
    const hasSectors = Number.isFinite(sector1) || Number.isFinite(sector2) || Number.isFinite(sector3);
    const status = isPitIn || isPitOut ? "pit" : (hasTiming ? "valid" : "invalid");
    return {
      lapNumber,
      lapTime,
      compound: String(compounds[index] || "").trim() || null,
      stint: parseNumber(stints[index]),
      sector1,
      sector2,
      sector3,
      isPitIn,
      isPitOut,
      hasTiming,
      hasSectors
    };
  });

  const validLaps = catalog.filter(lap => Number.isFinite(lap.lapNumber) && lap.hasTiming);
  const bestLap = validLaps.reduce((best, lap) => (!best || lap.lapTime < best.lapTime ? lap : best), null);
  const latestLap = validLaps.length ? validLaps.reduce((max, lap) => (!max || lap.lapNumber > max.lapNumber ? lap : max), null) : null;

  return {
    catalog,
    bestLapNumber: bestLap?.lapNumber ?? null,
    latestLapNumber: latestLap?.lapNumber ?? null
  };
}

async function resolveTelemetryContext({ year = DEFAULT_YEAR, meetingKey = "", sessionType = "", driver = "" }) {
  if (year !== DEFAULT_YEAR) {
    const error = new Error("INVALID_YEAR");
    error.code = "INVALID_YEAR";
    throw error;
  }

  const cacheKey = `${year}:${meetingKey || "auto"}:${sessionType || "auto"}:${driver || "auto"}`;
  const hit = getCached(cache.context, cacheKey, TTL.context);
  if (hit) return hit;

  const meetings = await getMeetings();
  if (!meetings.length) {
    const error = new Error("MEETINGS_UNAVAILABLE");
    error.code = "MEETINGS_UNAVAILABLE";
    throw error;
  }

  const selectedMeeting = meetings.find(item => item.meeting_key === meetingKey) || meetings[0];
  const sessions = await getSessions(selectedMeeting.meeting_key);
  const selectedSession = sessions.find(item => item.type_key === sessionType) || sessions[0] || null;
  const drivers = selectedSession ? await getDrivers(selectedSession.session_key) : [];
  const selectedDriver = drivers.find(item => String(item.id) === String(driver) || String(item.code) === String(driver)) || drivers[0] || null;

  return setCached(cache.context, cacheKey, {
    year,
    source: "tracinginsights/2026",
    meetings,
    sessions,
    drivers,
    selections: {
      meeting_key: selectedMeeting.meeting_key,
      session_key: selectedSession?.session_key || "",
      session_type: selectedSession?.type_key || "",
      driver: selectedDriver?.id || ""
    }
  });
}

async function buildDriverTelemetry({ year = DEFAULT_YEAR, meetingKey, sessionKey, driverNumber, lapMode = "reference", manualLap = "" }) {
  if (year !== DEFAULT_YEAR) {
    const error = new Error("INVALID_YEAR");
    error.code = "INVALID_YEAR";
    throw error;
  }

  const context = await resolveTelemetryContext({ year, meetingKey, driver: driverNumber });
  const selectedMeeting = context.meetings.find(item => item.meeting_key === meetingKey);
  if (!selectedMeeting) {
    const error = new Error("MEETING_NOT_FOUND");
    error.code = "MEETING_NOT_FOUND";
    throw error;
  }

  const sessions = await getSessions(meetingKey);
  const selectedSession = sessions.find(item => item.session_key === sessionKey);
  if (!selectedSession) {
    const error = new Error("SESSION_NOT_FOUND");
    error.code = "SESSION_NOT_FOUND";
    throw error;
  }

  const drivers = await getDrivers(selectedSession.session_key);
  const selectedDriver = drivers.find(item => String(item.id) === String(driverNumber) || String(item.code) === String(driverNumber));
  if (!selectedDriver) {
    const error = new Error("DRIVER_NOT_FOUND");
    error.code = "DRIVER_NOT_FOUND";
    throw error;
  }

  const laptimes = await loadLaptimes({ meetingKey, sessionFolder: selectedSession.folder, driverCode: selectedDriver.code });
  const built = buildLapCatalog(laptimes);
  const telemetryByLap = new Map();
  const telemetryCoverageByLap = new Map();

  for (const lap of built.catalog) {
    try {
      const candidate = await loadLapTelemetry({
        meetingKey,
        sessionFolder: selectedSession.folder,
        driverCode: selectedDriver.code,
        lapNumber: lap.lapNumber
      });
      const trace = candidate?.tel;
      const coverage = assessTraceUsefulness(trace);
      telemetryCoverageByLap.set(lap.lapNumber, coverage);
      if (coverage.hasTelemetry) {
        telemetryByLap.set(lap.lapNumber, trace);
      }
    } catch {
      telemetryCoverageByLap.set(lap.lapNumber, { hasTelemetry: false, points: 0, hasSpeed: false, hasDistance: false, hasTrack: false });
    }
  }

  const lapsForSelector = built.catalog.map(item => {
    const coverage = telemetryCoverageByLap.get(item.lapNumber) || { hasTelemetry: false, points: 0, hasSpeed: false, hasDistance: false, hasTrack: false };
    const hasUsefulTiming = item.hasTiming || item.hasSectors;
    const hasUsefulTelemetry = coverage.hasTelemetry;
    const hasManualEligibility = (hasUsefulTiming || hasUsefulTelemetry) && !(item.isPitIn || item.isPitOut ? (!hasUsefulTelemetry && !item.hasTiming) : false);
    let manualExclusionReason = "";
    if (!hasManualEligibility) {
      if (item.isPitIn || item.isPitOut) manualExclusionReason = "pit_transition_without_data";
      else if (!hasUsefulTiming && !hasUsefulTelemetry) manualExclusionReason = "empty_lap";
      else manualExclusionReason = "insufficient_data";
    }
    return {
      lapNumber: item.lapNumber,
      lapTime: item.lapTime,
      compound: item.compound,
      stint: item.stint,
      status: item.status,
      isBest: Number.isFinite(built.bestLapNumber) && item.lapNumber === built.bestLapNumber,
      hasTelemetry: coverage.hasTelemetry,
      hasTiming: item.hasTiming,
      hasSectors: item.hasSectors,
      isPitIn: item.isPitIn,
      isPitOut: item.isPitOut,
      telemetryPoints: coverage.points,
      hasManualEligibility,
      manualExclusionReason
    };
  });

  const manualEligibleLaps = lapsForSelector.filter(item => item.hasManualEligibility);

  if (!manualEligibleLaps.length) {
    const error = new Error("NO_TELEMETRY");
    error.code = "NO_TELEMETRY";
    throw error;
  }

  const telemetryEligibleLaps = manualEligibleLaps.filter(item => item.hasTelemetry).map(item => item.lapNumber);

  const preferredLapByMode = () => {
    if (lapMode === "manual") {
      const lap = Number(manualLap);
      if (Number.isFinite(lap)) return lap;
      return null;
    }
    if (lapMode === "latest") return built.latestLapNumber;
    return built.bestLapNumber;
  };

  const preferredLap = preferredLapByMode();
  const fallbackByMode = lapMode === "latest"
    ? manualEligibleLaps.map(item => item.lapNumber).slice().sort((a, b) => b - a)
    : manualEligibleLaps.map(item => item.lapNumber).slice().sort((a, b) => a - b);
  const orderedCandidates = [preferredLap, ...fallbackByMode]
    .filter((value, idx, arr) => Number.isFinite(value) && arr.indexOf(value) === idx);

  const selectedLapNumber = orderedCandidates.find(lapNumber => telemetryByLap.has(lapNumber))
    ?? telemetryEligibleLaps[0]
    ?? null;
  const selectedLapTelemetry = Number.isFinite(selectedLapNumber) ? telemetryByLap.get(selectedLapNumber) : null;
  
  if (!selectedLapTelemetry || !Number.isFinite(selectedLapNumber)) {
    const error = new Error("NO_TELEMETRY");
    error.code = "NO_TELEMETRY";
    throw error;
  }

  const trace = selectedLapTelemetry;
  const speed = readTrace(trace, ["speed"]);
  const throttle = readTrace(trace, ["throttle"]);
  const brake = readTrace(trace, ["brake"]);
  const distance = readTrace(trace, ["distance"]);
  const relDistance = readTrace(trace, ["rel_distance", "relative_distance", "pct_distance"]);
  const trackX = readTrace(trace, ["x", "pos_x"]);
  const trackY = readTrace(trace, ["y", "pos_y"]);
  const rpm = readTrace(trace, ["rpm"]);
  const gear = readTrace(trace, ["gear"]);

  return {
    year,
    meeting_key: selectedMeeting.meeting_key,
    session_key: selectedSession.session_key,
    driver: {
      number: selectedDriver.id,
      code: selectedDriver.code,
      name: selectedDriver.name,
      team: selectedDriver.team
    },
    lap: {
      number: selectedLapNumber,
      time: built.catalog.find(l => l.lapNumber === selectedLapNumber)?.lapTime ?? null,
      mode: lapMode,
      isBest: selectedLapNumber === built.bestLapNumber,
      isLatest: selectedLapNumber === built.latestLapNumber
    },
    telemetry: {
      speed: speed.map(parseNumber).filter(Number.isFinite),
      throttle: throttle.map(parseNumber).filter(Number.isFinite),
      brake: brake.map(parseNumber).filter(Number.isFinite),
      distance: distance.map(parseNumber).filter(Number.isFinite),
      relDistance: relDistance.map(parseNumber).filter(Number.isFinite),
      trackX: trackX.map(parseNumber).filter(Number.isFinite),
      trackY: trackY.map(parseNumber).filter(Number.isFinite),
      rpm: rpm.map(parseNumber).filter(Number.isFinite),
      gear: gear.map(parseNumber).filter(Number.isFinite)
    },
    trace: {
      hasSpeed: hasSamples(speed),
      hasThrottle: hasSamples(throttle),
      hasBrake: hasSamples(brake),
      hasDistance: hasSamples(distance) || hasSamples(relDistance),
      hasTrack: hasSamples(trackX) && hasSamples(trackY),
      hasRpm: hasSamples(rpm),
      hasGear: hasSamples(gear)
    },
    laps: lapsForSelector,
    source: "tracinginsights/2026",
    generatedAt: new Date().toISOString()
  };
}

// Export para usar en el Worker
export { buildDriverTelemetry, resolveTelemetryContext, getMeetings, getSessions, getDrivers };


async function handleEngineerTelemetry(query, corsHeaders) {
  try {
    const meetingKey = query.get('meeting_key');
    const sessionKey = query.get('session_key');
    const driverNumber = query.get('driver_number');
    const lapMode = query.get('lap_mode') || 'reference';
    const manualLap = query.get('manual_lap') || '';
    const year = query.get('year');

    console.log('[TELEMETRY] Request:', JSON.stringify({ meetingKey, sessionKey, driverNumber, lapMode, manualLap, year }));

    if (!meetingKey || !sessionKey || !driverNumber) {
      console.log('[TELEMETRY] Missing params:', { meetingKey, sessionKey, driverNumber });
      return jsonResponse({
        error: 'Faltan parámetros',
        required: ['meeting_key', 'session_key', 'driver_number'],
        received: { meeting_key: meetingKey, session_key: sessionKey, driver_number: driverNumber },
        example: '/api/engineer/telemetry?meeting_key=Australian%20Grand%20Prix&session_key=Australian%20Grand%20Prix__Race&driver_number=12&lap_mode=best'
      }, corsHeaders, 400);
    }

    const payload = await buildDriverTelemetry({
      year: DEFAULT_YEAR,
      meetingKey,
      sessionKey,
      driverNumber,
      lapMode,
      manualLap
    });

    // Transformar al formato que espera la web
    const transformed = {
      year: payload.year,
      meeting_key: payload.meeting_key,
      session_key: payload.session_key,
      driver: payload.driver,
      lap_selector: {
        laps: payload.laps.map(lap => ({
          lapNumber: lap.lapNumber,
          lapTime: lap.lapTime,
          compound: lap.compound,
          stint: lap.stint,
          status: lap.status,
          isBest: lap.isBest,
          hasTelemetry: lap.hasTelemetry,
          hasTiming: lap.hasTiming,
          hasSectors: lap.hasSectors,
          isPitIn: lap.isPitIn,
          isPitOut: lap.isPitOut,
          telemetryPoints: lap.telemetryPoints
        })),
        selectedLapNumber: payload.lap.number
      },
      traces: {
        speed: payload.telemetry.speed,
        throttle: payload.telemetry.throttle,
        brake: payload.telemetry.brake,
        distance: payload.telemetry.distance,
        relativeDistance: payload.telemetry.relDistance,
        trackX: payload.telemetry.trackX,
        trackY: payload.telemetry.trackY,
        rpm: payload.telemetry.rpm,
        gear: payload.telemetry.gear
      },
      trace: payload.trace,
      source: payload.source,
      generatedAt: payload.generatedAt
    };

    return jsonResponse(transformed, corsHeaders);
  } catch (error) {
    if (error?.code === 'MEETING_NOT_FOUND') {
      return jsonResponse({ error: 'GP no válido para 2026', code: 'MEETING_NOT_FOUND' }, corsHeaders, 404);
    }
    if (error?.code === 'SESSION_NOT_FOUND') {
      return jsonResponse({ error: 'Sesión no disponible para este GP', code: 'SESSION_NOT_FOUND' }, corsHeaders, 404);
    }
    if (error?.code === 'DRIVER_NOT_FOUND') {
      return jsonResponse({ error: 'Piloto no disponible en esta sesión', code: 'DRIVER_NOT_FOUND' }, corsHeaders, 404);
    }
    if (error?.code === 'NO_TELEMETRY') {
      console.log('[TELEMETRY] NO_TELEMETRY error for:', { meetingKey, sessionKey, driverNumber, lapMode });
      return jsonResponse({ error: 'No hay telemetría disponible para esta vuelta', code: 'NO_TELEMETRY', debug: { meetingKey, sessionKey, driverNumber, lapMode } }, corsHeaders, 404);
    }
    console.error('Telemetry error:', error);
    return jsonResponse({ error: 'Error interno', message: error?.message, code: error?.code }, corsHeaders, 500);
  }
}

// === ENGINEER API HANDLERS ADICIONALES ===

async function handleEngineerSessions(query, corsHeaders) {
  try {
    const meetingKey = query.get('meeting_key');
    
    if (!meetingKey) {
      return jsonResponse({
        error: 'Falta meeting_key',
        required: ['meeting_key'],
        example: '/api/engineer/sessions?meeting_key=Australian%20Grand%20Prix'
      }, corsHeaders, 400);
    }

    const sessions = await getSessions(meetingKey);
    
    return jsonResponse({
      year: DEFAULT_YEAR,
      meeting_key: meetingKey,
      sessions: sessions.map(s => ({
        session_key: s.session_key,
        folder: s.folder,
        type_key: s.type_key,
        type_label: s.type_label
      }))
    }, corsHeaders);
  } catch (error) {
    console.error('Sessions error:', error);
    return jsonResponse({ error: 'No se pudieron cargar sesiones', message: error?.message, code: error?.code }, corsHeaders, 500);
  }
}

async function handleEngineerSectors(query, corsHeaders) {
  // Endpoint simplificado - devuelve estructura básica
  const meetingKey = query.get('meeting_key');
  const sessionKey = query.get('session_key');
  const type = query.get('type') || 'driver';
  const a = query.get('a');
  const b = query.get('b');

  if (!meetingKey || !sessionKey || !a || !b) {
    return jsonResponse({
      error: 'Faltan parámetros',
      required: ['meeting_key', 'session_key', 'a', 'b'],
      example: '/api/engineer/sectors?meeting_key=Australian%20Grand%20Prix&session_key=Australian%20Grand%20Prix__Race&type=driver&a=12&b=63'
    }, corsHeaders, 400);
  }

  // Nota: buildComparison está retirado en el código original
  return jsonResponse({
    year: DEFAULT_YEAR,
    meeting_key: meetingKey,
    session_key: sessionKey,
    type: type,
    sectors: null,
    note: 'Comparativas sectoriales retiradas en esta versión'
  }, corsHeaders);
}

async function handleEngineerStints(query, corsHeaders) {
  const meetingKey = query.get('meeting_key');
  const sessionKey = query.get('session_key');
  const type = query.get('type') || 'driver';
  const a = query.get('a');
  const b = query.get('b');

  if (!meetingKey || !sessionKey || !a || !b) {
    return jsonResponse({
      error: 'Faltan parámetros',
      required: ['meeting_key', 'session_key', 'a', 'b'],
      example: '/api/engineer/stints?meeting_key=Australian%20Grand%20Prix&session_key=Australian%20Grand%20Prix__Race&type=driver&a=12&b=63'
    }, corsHeaders, 400);
  }

  // Nota: buildComparison está retirado
  return jsonResponse({
    year: DEFAULT_YEAR,
    meeting_key: meetingKey,
    session_key: sessionKey,
    type: type,
    stints: null,
    note: 'Comparativas de stints retiradas en esta versión'
  }, corsHeaders);
}

async function handleEngineerCoverage(query, corsHeaders) {
  // Endpoint protegido con token - simplificado para Cloudflare
  const token = query.get('token');
  
  // Sin token configurado, retornamos estructura básica
  return jsonResponse({
    year: DEFAULT_YEAR,
    source: 'tracinginsights/2026',
    coverage: {
      note: 'Endpoint de cobertura requiere configuración adicional',
      meetings_available: true
    }
  }, corsHeaders);
}

async function handleEngineerEvolution(query, corsHeaders) {
  const meetingKey = query.get('meeting_key');
  const sessionKey = query.get('session_key');
  const type = query.get('type') || 'driver';
  const a = query.get('a');
  const b = query.get('b');

  if (!meetingKey || !sessionKey || !a || !b) {
    return jsonResponse({
      error: 'Faltan parámetros',
      required: ['meeting_key', 'session_key', 'a', 'b'],
      example: '/api/engineer/evolution?meeting_key=Australian%20Grand%20Prix&session_key=Australian%20Grand%20Prix__Race&type=driver&a=12&b=63'
    }, corsHeaders, 400);
  }

  // Nota: buildComparison está retirado
  return jsonResponse({
    year: DEFAULT_YEAR,
    meeting_key: meetingKey,
    session_key: sessionKey,
    type: type,
    evolution: [],
    note: 'Comparativas de evolución retiradas en esta versión'
  }, corsHeaders);
}

async function handleEngineerMeetings(query, corsHeaders) {
  try {
    const meetings = await getMeetings();
    
    return jsonResponse({
      year: DEFAULT_YEAR,
      source: 'tracinginsights/2026',
      meetings: meetings.map(m => ({
        meeting_key: m.meeting_key,
        gp_label: m.gp_label,
        meeting_name: m.meeting_name
      }))
    }, corsHeaders);
  } catch (error) {
    console.error('Meetings error:', error);
    return jsonResponse({ error: 'No se pudieron cargar GPs', message: error?.message, code: error?.code }, corsHeaders, 500);
  }
}

async function handleEngineerEntities(query, corsHeaders) {
  try {
    const sessionKey = query.get('session_key');
    
    if (!sessionKey) {
      return jsonResponse({
        error: 'Falta session_key',
        required: ['session_key'],
        example: '/api/engineer/entities?session_key=Australian%20Grand%20Prix__Race'
      }, corsHeaders, 400);
    }

    const drivers = await getDrivers(sessionKey);
    
    return jsonResponse({
      year: DEFAULT_YEAR,
      session_key: sessionKey,
      entities: {
        drivers: drivers.map(d => ({
          id: d.id,
          code: d.code,
          name: d.name,
          team: d.team,
          number: d.number
        })),
        teams: [] // Teams no implementado en esta versión
      }
    }, corsHeaders);
  } catch (error) {
    console.error('Entities error:', error);
    return jsonResponse({ error: 'No se pudieron cargar entidades', message: error?.message, code: error?.code }, corsHeaders, 500);
  }
}


async function handleEngineerContext(query, corsHeaders) {
  try {
    const meeting_key = query.get('meeting_key') || '';
    const session_type = query.get('session_type') || '';
    const driver = query.get('driver') || '';

    const context = await resolveTelemetryContext({
      year: DEFAULT_YEAR,
      meetingKey: meeting_key,
      sessionType: session_type,
      driver: driver
    });

    return jsonResponse({
      year: context.year,
      source: context.source,
      meetings: context.meetings.map(m => ({ meeting_key: m.meeting_key, gp_label: m.gp_label })),
      sessions: context.sessions,
      drivers: context.drivers,
      selections: context.selections
    }, corsHeaders);
  } catch (error) {
    console.error('Context error:', error);
    return jsonResponse({ error: 'Error obteniendo contexto', message: error?.message, code: error?.code }, corsHeaders, 500);
  }
}

// ============== UTILIDADES PREDICT ==============

// Fetch y parse de módulos ES desde GitHub
// Extraer valor de export const contando llaves para objetos anidados
function extractConstValue(code, startIndex) {
  let braceCount = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;
  let valueStart = startIndex;
  
  // Encontrar el inicio del valor (después del =)
  while (valueStart < code.length && code[valueStart] !== '=' && code[valueStart] !== '{' && code[valueStart] !== '[') {
    valueStart++;
  }
  
  if (valueStart >= code.length) return null;
  
  // Saltar el '=' si lo encontramos
  if (code[valueStart] === '=') {
    valueStart++;
    // Saltar espacios después del =
    while (valueStart < code.length && /\s/.test(code[valueStart])) {
      valueStart++;
    }
  }
  
  if (valueStart >= code.length) return null;
  
  const firstChar = code[valueStart];
  
  // Si es objeto o array, contar llaves/corchetes
  if (firstChar === '{' || firstChar === '[') {
    const openChar = firstChar;
    const closeChar = firstChar === '{' ? '}' : ']';
    let i = valueStart;
    braceCount = 0;
    
    while (i < code.length) {
      const char = code[i];
      
      if (escaped) {
        escaped = false;
      } else if (char === '\\' && inString) {
        escaped = true;
      } else if ((char === '"' || char === "'" || char === '`') && !escaped) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
      } else if (!inString) {
        if (char === openChar) braceCount++;
        else if (char === closeChar) {
          braceCount--;
          if (braceCount === 0) {
            return code.substring(valueStart, i + 1);
          }
        }
      }
      i++;
    }
    return null;
  }
  
  // Si no es objeto/array, buscar hasta el punto y coma
  const endIdx = code.indexOf(';', valueStart);
  if (endIdx === -1) return null;
  return code.substring(valueStart, endIdx).trim();
}

// Evaluar módulo ES6 de forma directa (más robusto para arrays grandes)
function evaluateModule(code) {
  const exports = {};
  
  // Crear un wrapper que capture los exports
  const wrappedCode = `(function(exports) { ${code.replace(/export const /g, 'exports.').replace(/export function /g, 'exports.')} })(exports)`;
  
  try {
    eval(wrappedCode);
  } catch (e) {
    console.warn('evaluateModule eval error:', e.message);
    // Fallback: intentar con el parser original
    return fetchModuleFromCode(code);
  }
  
  return exports;
}

// Fallback al parser original
function fetchModuleFromCode(code) {
  const module = {};
  const exportConstRegex = /export const (\w+)\s*=/g;
  let match;
  while ((match = exportConstRegex.exec(code)) !== null) {
    const name = match[1];
    const valueStart = match.index + match[0].length;
    const value = extractConstValue(code, valueStart);
    
    if (value) {
      try {
        module[name] = new Function(`return ${value}`)();
      } catch (e) {
        console.warn(`Failed to parse export const ${name}:`, e.message);
      }
    }
  }
  return module;
}

async function fetchModule(url) {
  const response = await fetch(url, { cacheTtl: 3600 });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const code = await response.text();
  
  const module = {};
  
  // Extraer export const usando parser que cuenta llaves
  const exportConstRegex = /export const (\w+)\s*=/g;
  let match;
  while ((match = exportConstRegex.exec(code)) !== null) {
    const name = match[1];
    const valueStart = match.index + match[0].length;
    const value = extractConstValue(code, valueStart);
    
    if (value) {
      try {
        // Usar Function para evaluar de forma segura
        module[name] = new Function(`return ${value}`)();
      } catch (e) {
        console.warn(`Failed to parse export const ${name}:`, e.message);
        try {
          // Fallback con eval controlado
          module[name] = eval(`(${value})`);
        } catch (e2) {
          console.warn(`Fallback failed for ${name}:`, e2.message);
        }
      }
    }
  }
  
  // Extraer export function (simplificado, solo funciones cortas)
  const funcRegex = /export function (\w+)\(([^)]*)\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let funcMatch;
  while ((funcMatch = funcRegex.exec(code)) !== null) {
    const [, name, params, body] = funcMatch;
    try {
      module[name] = new Function(params, body);
    } catch (e) {
      console.warn(`Failed to parse export function ${name}:`, e.message);
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
