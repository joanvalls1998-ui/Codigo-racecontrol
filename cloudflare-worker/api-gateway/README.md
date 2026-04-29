# RaceControl API Gateway - Cloudflare Worker

Este Worker reemplaza todas las APIs que antes funcionaban en Vercel. Ahora corren en Cloudflare Workers (gratis hasta 100k requests/día).

## Endpoints disponibles

```
/api/engineer/context
/api/engineer/telemetry
/api/engineer/sessions
/api/engineer/sectors
/api/engineer/stints
/api/engineer/coverage
/api/engineer/evolution
/api/engineer/meetings
/api/engineer/entities
/api/predict
/api/standings
/api/calendar
/api/news
/api/sim
/api/get-edge-state
/api/init-edge-state
/api/reset-edge-state
/api/apply-adjustments
/api/update-adjustments
```

## Deploy paso a paso

### 1. Instalar Wrangler (CLI de Cloudflare)

```bash
npm install -g wrangler
```

### 2. Iniciar sesión en Cloudflare

```bash
wrangler login
```

Se abrirá el navegador. Autoriza el acceso.

### 3. Deploy del Worker

```bash
cd cloudflare-worker/api-gateway
wrangler deploy
```

### 4. Obtener la URL

Después del deploy, Wrangler te dará una URL como:
```
https://racecontrol-api-gateway.[tu-subdomain].workers.dev
```

### 5. Actualizar tu web

En tu código frontend, cambia las llamadas a `/api/...` por la URL del Worker:

**Antes:**
```javascript
fetch('/api/engineer/context', ...)
```

**Después:**
```javascript
fetch('https://racecontrol-api-gateway.[tu-subdomain].workers.dev/api/engineer/context', ...)
```

O mejor, usa una variable de entorno en tu `main.js`:

```javascript
const API_BASE = 'https://racecontrol-api-gateway.[tu-subdomain].workers.dev';
```

## Migrar la lógica de las APIs

Ahora mismo los handlers retornan datos mock. Tienes que migrar la lógica de cada archivo `api/*.js` a su handler correspondiente en `src/index.js`.

**Ejemplo:**

El archivo `api/predict.js` tiene toda la lógica de predicciones. Copia esa lógica al handler `handlePredict()` en `src/index.js`.

**Importante:** Cloudflare Workers tiene algunas limitaciones:
- No puedes usar `fs` (sistema de archivos)
- No puedes usar librerías nativas de Node.js
- Sí puedes usar `fetch()` para APIs externas
- Sí puedes usar almacenamiento KV (clave-valor) si necesitas persistencia

Si alguna API necesita acceso a archivos, tendrás que:
1. Mover los datos a Cloudflare KV, o
2. Usar un endpoint externo que sirva los datos

## Testing local

Puedes probar el Worker en local antes de deployar:

```bash
wrangler dev
```

Esto levanta un servidor local en `http://localhost:8787`.

## Límites del plan gratis

- 100,000 requests por día
- 10ms CPU time por request (puede ser poco para cálculos complejos)
- Almacenamiento KV: 1GB gratis

Si superas los límites, Cloudflare te avisa y puedes upgrading o optimizar.

## Siguientes pasos

1. ✅ Deployar este Worker base
2. 🔄 Migrar la lógica de cada API (empezar por `engineer/telemetry` que es la más importante)
3. 🔄 Actualizar el frontend para usar la nueva URL
4. 🔄 Testear cada endpoint
5. ✅ Desactivar Vercel cuando todo funcione

## Dudas

Cualquier problema, revisa los logs en el dashboard de Cloudflare:
https://dash.cloudflare.com/?to=/:account/workers
