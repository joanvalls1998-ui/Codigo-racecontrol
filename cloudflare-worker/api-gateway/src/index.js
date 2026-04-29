// Cloudflare Worker - API Gateway para RaceControl
// Maneja todas las APIs: engineer, predict, standings, news, etc.
//
// Deploy:
// 1. cd cloudflare-worker/api-gateway
// 2. wrangler login
// 3. wrangler deploy
//
// URL: https://racecontrol-api-gateway.[tu-subdomain].workers.dev

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
      
      // Endpoints disponibles
      const routes = {
        'engineer/context': handleEngineerContext,
        'engineer/telemetry': handleEngineerTelemetry,
        'engineer/sessions': handleEngineerSessions,
        'engineer/sectors': handleEngineerSectors,
        'engineer/stints': handleEngineerStints,
        'engineer/coverage': handleEngineerCoverage,
        'engineer/evolution': handleEngineerEvolution,
        'engineer/meetings': handleEngineerMeetings,
        'engineer/entities': handleEngineerEntities,
        'predict': handlePredict,
        'standings': handleStandings,
        'calendar': handleCalendar,
        'news': handleNews,
        'sim': handleSim,
        'get-edge-state': handleGetEdgeState,
        'init-edge-state': handleInitEdgeState,
        'reset-edge-state': handleResetEdgeState,
        'apply-adjustments': handleApplyAdjustments,
        'update-adjustments': handleUpdateAdjustments
      };
      
      // Buscar handler
      const handler = routes[path];
      
      if (!handler) {
        return new Response(JSON.stringify({ 
          error: 'Endpoint not found',
          path: path 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Ejecutar handler
      return await handler(request, env, ctx);
      
    } catch (error) {
      console.error('API Gateway error:', error);
      
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// ============== HANDLERS ==============

// Engineer API Handlers
async function handleEngineerContext(request, env, ctx) {
  // TODO: Implementar lógica de engineer/context
  // Por ahora retorna datos mock
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer context - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerTelemetry(request, env, ctx) {
  // TODO: Implementar lógica de engineer/telemetry
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer telemetry - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerSessions(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer sessions - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerSectors(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer sectors - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerStints(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer stints - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerCoverage(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer coverage - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerEvolution(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer evolution - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerMeetings(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer meetings - implementar lógica' }
  }, corsHeaders);
}

async function handleEngineerEntities(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Engineer entities - implementar lógica' }
  }, corsHeaders);
}

// Predict API
async function handlePredict(request, env, ctx) {
  // TODO: Migrar lógica de api/predict.js
  return jsonResponse({
    status: 'ok',
    data: { message: 'Predict API - implementar lógica' }
  }, corsHeaders);
}

// Standings API
async function handleStandings(request, env, ctx) {
  // TODO: Migrar lógica de api/standings.js
  return jsonResponse({
    status: 'ok',
    data: { message: 'Standings API - implementar lógica' }
  }, corsHeaders);
}

// Calendar API
async function handleCalendar(request, env, ctx) {
  // TODO: Migrar lógica de api/calendar.js
  return jsonResponse({
    status: 'ok',
    data: { message: 'Calendar API - implementar lógica' }
  }, corsHeaders);
}

// News API (ya existe en news-proxy)
async function handleNews(request, env, ctx) {
  // Reutilizar lógica de news-proxy
  const rssUrl = new URL(request.url).searchParams.get('url');
  if (!rssUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, {}, 400);
  }
  
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
}

// Sim API
async function handleSim(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Sim API - implementar lógica' }
  }, corsHeaders);
}

// Edge State Handlers
async function handleGetEdgeState(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Get edge state - implementar lógica' }
  }, corsHeaders);
}

async function handleInitEdgeState(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Init edge state - implementar lógica' }
  }, corsHeaders);
}

async function handleResetEdgeState(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Reset edge state - implementar lógica' }
  }, corsHeaders);
}

async function handleApplyAdjustments(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Apply adjustments - implementar lógica' }
  }, corsHeaders);
}

async function handleUpdateAdjustments(request, env, ctx) {
  return jsonResponse({
    status: 'ok',
    data: { message: 'Update adjustments - implementar lógica' }
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
