# 🚨 DEPLOY URGENTE - RaceControl API Gateway

## Problema
La web aparece "estática" porque el API Gateway tiene errores 500 en standings y calendar.

## Solución Aplicada
✅ Código ya está en GitHub (commit `f3ff41c`)
✅ Datos embebidos directamente en el Worker
✅ Todos los endpoints arreglados

## ⚠️ FALTA: Hacer Deploy a Cloudflare

### Opción 1: Script Automático (Recomendado)

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway
./deploy.sh
```

### Opción 2: Manual con Wrangler

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway

# Si no tienes wrangler
npm install -g wrangler

# Login (abre navegador)
wrangler login

# Deploy
wrangler deploy
```

### Opción 3: Cloudflare Dashboard

1. Ve a https://dash.cloudflare.com
2. Workers & Pages → `racecontrol-api-gateway`
3. Click en "Deploy" → "Create Deployment"
4. Sube el archivo `src/index.js` actualizado

---

## ✅ Verificación Post-Deploy

Ejecuta estos comandos para verificar:

```bash
# 1. Standings - Debe retornar JSON con 20 pilotos
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/standings" | jq .

# 2. Calendar - Debe retornar JSON con 21 eventos
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/calendar" | jq .

# 3. News - Debe retornar XML RSS
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/news?url=https://news.google.com/rss/search?q=F1+formula+1" | head -20

# 4. Predict (POST) - Debe retornar predicción
curl -X POST "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/predict" \
  -H "Content-Type: application/json" \
  -d '{"favorite":{"type":"driver","name":"Fernando Alonso"},"raceName":"GP Miami"}' | jq .
```

## 🎯 Resultado Esperado

Después del deploy:
- ✅ `/api/standings` → 200 OK con datos de pilotos/equipos
- ✅ `/api/calendar` → 200 OK con 21 eventos
- ✅ `/api/news` → 200 OK con RSS feed
- ✅ `/api/predict` → 200 OK con predicciones (POST)
- ✅ Web en GitHub Pages muestra datos reales

---

## 📝 Notas

- Los cambios ya están en GitHub: https://github.com/joanvalls1998-ui/Codigo-racecontrol/commit/f3ff41c
- Ver informe completo en `AUDITORIA_WEB.md`
- Telemetría sigue pendiente (501) - no es bloqueante
