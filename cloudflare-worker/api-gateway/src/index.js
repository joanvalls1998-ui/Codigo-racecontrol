// Cloudflare Worker - API Gateway para RaceControl
// Proxy a los archivos originales en GitHub + handlers nativos
//
// Deploy:
// 1. cd cloudflare-worker/api-gateway
// 2. wrangler deploy
//
// URL: https://racecontrol-api-gateway.joanvalls1998.workers.dev

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
        
        // Otras APIs
        'predict': () => handlePredict(query, corsHeaders),
        'standings': () => handleStandings(query, corsHeaders),
        'calendar': () => handleCalendar(query, corsHeaders),
        'news': () => handleNews(query, corsHeaders, request),
        'sim': () => handleSim(query, corsHeaders),
        
        // Edge State
        'get-edge-state': () => handleGetEdgeState(query, corsHeaders),
        'init-edge-state': () => handleInitEdgeState(query, corsHeaders),
        'reset-edge-state': () => handleResetEdgeState(query, corsHeaders),
        'apply-adjustments': () => handleApplyAdjustments(query, corsHeaders),
        'update-adjustments': () => handleUpdateAdjustments(query, corsHeaders)
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

// Engineer API - Proxy a GitHub raw
// Los archivos originales están en: https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main/api/engineer/

async function handleEngineerTelemetry(query, corsHeaders) {
  const year = query.get('year') || '2026';
  const meeting_key = query.get('meeting_key');
  const session_key = query.get('session_key');
  const driver_number = query.get('driver_number');
  const lap_mode = query.get('lap_mode') || 'reference';
  const manual_lap = query.get('manual_lap');
  
  // Validar parámetros
  if (!meeting_key || !session_key || !driver_number) {
    return jsonResponse({
      error: 'Faltan parámetros',
      required: ['meeting_key', 'session_key', 'driver_number'],
      code: 'MISSING_PARAMS'
    }, corsHeaders, 400);
  }
  
  if (year !== '2026') {
    return jsonResponse({
      error: 'Ingeniero solo admite temporada 2026',
      code: 'INVALID_YEAR'
    }, corsHeaders, 400);
  }
  
  // Proxy a la API original en GitHub (usando jsDelivr para evitar CORS)
  const githubUrl = `https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main/api/engineer/telemetry.js`;
  
  // Nota: Esto no puede ejecutar el código Node.js directamente.
  // Necesitamos implementar la lógica aquí o usar un enfoque diferente.
  
  // Por ahora, retornamos un error informativo
  return jsonResponse({
    error: 'Telemetría en implementación',
    message: 'La API de telemetría requiere migrar la lógica de _core.js al Worker',
    status: 'pending',
    params: { year, meeting_key, session_key, driver_number, lap_mode, manual_lap }
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
  
  // Datos mock por ahora
  return jsonResponse({
    status: 'ok',
    data: {
      year,
      meeting_key,
      session_type,
      message: 'Contexto de ingeniero - implementar lógica'
    }
  }, corsHeaders);
}

async function handleEngineerSessions(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Sessions - implementar' }
  }, corsHeaders);
}

async function handleEngineerSectors(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Sectors - implementar' }
  }, corsHeaders);
}

async function handleEngineerStints(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Stints - implementar' }
  }, corsHeaders);
}

async function handleEngineerCoverage(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Coverage - implementar' }
  }, corsHeaders);
}

async function handleEngineerEvolution(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Evolution - implementar' }
  }, corsHeaders);
}

async function handleEngineerMeetings(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Meetings - implementar' }
  }, corsHeaders);
}

async function handleEngineerEntities(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Entities - implementar' }
  }, corsHeaders);
}

// Predict API
async function handlePredict(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Predict - implementar' }
  }, corsHeaders);
}

// Standings API
async function handleStandings(query, corsHeaders) {
  // Datos estáticos desde GitHub
  const url = 'https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main/data/standings.json';
  
  try {
    const response = await fetch(url, { cacheTtl: 300 });
    const data = await response.json();
    return jsonResponse({ status: 'ok', data }, corsHeaders);
  } catch (error) {
    return jsonResponse({
      error: 'No se pudo cargar standings',
      message: error.message
    }, corsHeaders, 500);
  }
}

// Calendar API
async function handleCalendar(query, corsHeaders) {
  const url = 'https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main/data/calendar.json';
  
  try {
    const response = await fetch(url, { cacheTtl: 3600 });
    const data = await response.json();
    return jsonResponse({ status: 'ok', data }, corsHeaders);
  } catch (error) {
    return jsonResponse({
      error: 'No se pudo cargar calendar',
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

// Sim API
async function handleSim(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Sim - implementar' }
  }, corsHeaders);
}

// Edge State Handlers
async function handleGetEdgeState(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Get edge state - implementar' }
  }, corsHeaders);
}

async function handleInitEdgeState(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Init edge state - implementar' }
  }, corsHeaders);
}

async function handleResetEdgeState(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Reset edge state - implementar' }
  }, corsHeaders);
}

async function handleApplyAdjustments(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Apply adjustments - implementar' }
  }, corsHeaders);
}

async function handleUpdateAdjustments(query, corsHeaders) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Update adjustments - implementar' }
  }, corsHeaders);
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
