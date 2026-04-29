// Configuración de RaceControl
// Actualiza esto después de deployar el Worker

const RACECONTROL_CONFIG = {
  // URL del API Gateway en Cloudflare Workers
  // Después del deploy, cambia esto por la URL real:
  // https://racecontrol-api-gateway.[tu-subdomain].workers.dev
  
  API_BASE_URL: 'https://racecontrol-api-gateway.joanvalls1998.workers.dev', // Cloudflare Worker
  
  // URLs de APIs externas
  F1_LIVE_TIMING_API: 'https://livetimingapi.com/api',
  ERGAST_API: 'https://ergast.com/api/f1',
  
  // News proxy (ya existe)
  NEWS_PROXY_URL: '', // https://racecontrol-news-proxy.[tu-subdomain].workers.dev
  
  // GitHub Pages
  BASE_PATH: '/Codigo-racecontrol/',
  
  // Debug mode
  DEBUG: false
};

// Helper para construir URLs de API
function getApiUrl(endpoint) {
  if (RACECONTROL_CONFIG.API_BASE_URL) {
    return `${RACECONTROL_CONFIG.API_BASE_URL}/api/${endpoint}`;
  }
  return `/api/${endpoint}`;
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RACECONTROL_CONFIG;
}
