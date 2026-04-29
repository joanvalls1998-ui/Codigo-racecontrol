# 🚀 Deploy de RaceControl API Gateway

## Problema Detectado

El Worker desplegado tiene una versión antigua del código. Los cambios locales YA están listos:

- ✅ `handleStandings()` - Datos embebidos (20 pilotos, 10 equipos)
- ✅ `handleCalendar()` - Datos embebidos (21 eventos, temporada 2026)
- ✅ `handlePredict()` - Lógica completa migrada
- ✅ Frontend (`main.js`) - Ahora consume del Worker en lugar de datos mock

## Opción 1: Deploy Manual (Recomendada)

```bash
# 1. Navegar al directorio del Worker
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway

# 2. Hacer deploy
wrangler deploy

# 3. Verificar logs (opcional)
wrangler tail
```

### Si pide API Token:

1. Ve a https://dash.cloudflare.com/profile/api-tokens
2. Crea un token con permisos:
   - `Cloudflare Workers: Edit`
   - `Cloudflare Workers Scripts: Edit`
3. Exporta el token:
```bash
export CLOUDFLARE_API_TOKEN="tu-token-aqui"
wrangler deploy
```

## Opción 2: Usando el Script Automático

```bash
# Ejecutar script de deploy
./deploy-worker.sh
```

## ✅ Verificación Post-Deploy

### 1. Test Standings
```bash
curl -s "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/standings" | jq '.drivers[:3]'
```

**Respuesta esperada:**
```json
[
  {"pos":1,"number":"12","name":"Kimi Antonelli","team":"Mercedes","points":72},
  {"pos":2,"number":"63","name":"George Russell","team":"Mercedes","points":63},
  {"pos":3,"number":"16","name":"Charles Leclerc","team":"Ferrari","points":49}
]
```

### 2. Test Calendar
```bash
curl -s "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/calendar" | jq '.events[:3]'
```

**Respuesta esperada:**
```json
[
  {"id":"test-bahrain-1","type":"testing","title":"Pre-Season Testing 1",...},
  {"id":"test-bahrain-2","type":"testing","title":"Pre-Season Testing 2",...},
  {"id":"round-1","type":"race","round":1,"title":"Australian Grand Prix",...}
]
```

### 3. Test News
```bash
curl -s "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/news?url=https://news.google.com/rss/search?q=F1&hl=es&gl=ES" | head -50
```

**Respuesta esperada:** XML RSS con noticias de F1

### 4. Test Predict (POST)
```bash
curl -s -X POST "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/predict" \
  -H "Content-Type: application/json" \
  -d '{"favorite":{"type":"driver","name":"Fernando Alonso"},"raceName":"GP Miami"}' | jq '.summary'
```

**Respuesta esperada:**
```json
{
  "predictedWinner": "...",
  "predictedPole": "...",
  "topTeams": [...],
  "rainProbability": ...,
  "safetyCarProbability": ...
}
```

## 🌐 Verificación en la Web

1. Abre https://joanvalls1998-ui.github.io/Codigo-racecontrol/
2. Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)
3. Verifica cada pantalla:
   - ✅ **Home** - Debe mostrar próxima carrera, noticias, contexto
   - ✅ **Standings** - Debe mostrar tabla completa (20 pilotos, 10 equipos)
   - ✅ **Calendar** - Debe mostrar calendario 2026 completo
   - ✅ **News** - Debe mostrar noticias reales de Google News
   - ✅ **Predict/Ingeniero** - Debe mostrar predicciones para GP Miami

## 📝 Cambios Realizados

### Backend (`cloudflare-worker/api-gateway/src/index.js`)
- Handlers con datos embebidos (no fetch desde GitHub)
- Predict API con lógica completa
- News proxy funcionando

### Frontend (`main.js`)
- `fetchStandingsData()` - Ahora llama al Worker
- `fetchCalendarData()` - Ahora llama al Worker
- `fetchNewsDataForFavorite()` - Ya usaba el Worker (sin cambios)

## 🐛 Si Algo Falla

### 1. Worker no responde
```bash
wrangler whoami  # Verificar autenticación
wrangler deploy --dry-run  # Verificar config
```

### 2. Errores en la web
- Abrir DevTools (F12)
- Ver pestaña Console
- Ver pestaña Network (filtrar por `racecontrol-api-gateway`)

### 3. Datos incorrectos
- Hard refresh en el navegador
- Verificar que `RACECONTROL_CONFIG.API_BASE_URL` sea correcto en `config.js`

## 📞 Soporte

Si necesitas ayuda:
1. Revisa los logs: `wrangler tail`
2. Verifica el estado: `wrangler status`
3. Consulta la documentación: https://developers.cloudflare.com/workers/
