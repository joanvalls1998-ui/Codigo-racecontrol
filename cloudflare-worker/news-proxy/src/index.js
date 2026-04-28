// Cloudflare Worker para proxy de Google News RSS
// Evita problemas de CORS desde el navegador
// 
// Deploy instructions:
// 1. npm install -g wrangler
// 2. wrangler login
// 3. wrangler deploy
// 
// URL resultante: https://racecontrol-news-proxy.[tu-subdomain].workers.dev

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Configurar CORS headers
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
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Solo permitir GET y POST
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders
      });
    }
    
    try {
      let rssUrl;
      
      if (request.method === 'POST') {
        const body = await request.json();
        rssUrl = body.rssUrl;
        
        if (!rssUrl) {
          return new Response(JSON.stringify({ error: 'Missing rssUrl parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else {
        // GET mode: usar query parameter
        rssUrl = url.searchParams.get('url');
        
        if (!rssUrl) {
          return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Validar que es URL de Google News
      if (!rssUrl.includes('news.google.com')) {
        return new Response(JSON.stringify({ error: 'Only Google News RSS URLs are allowed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Fetch RSS con headers adecuados y caché
      const response = await fetch(rssUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RaceControl/1.0; +https://github.com/joanvalls1998-ui/Codigo-racecontrol)',
          'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        },
        cacheTtl: 3600 // Cachear por 1 hora
      });
      
      if (!response.ok) {
        throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const xml = await response.text();
      
      // Retornar XML con CORS headers
      return new Response(xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          ...corsHeaders
        }
      });
      
    } catch (error) {
      console.error('Error fetching RSS:', error);
      
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch RSS',
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
