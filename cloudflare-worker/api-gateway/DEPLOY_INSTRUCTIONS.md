# 🚀 Instrucciones de Deploy - API Gateway RaceControl

## Resumen de la Migración

Se han migrado 4 APIs desde Node.js a Cloudflare Workers:

| API | Estado | Notas |
|-----|--------|-------|
| **predict** | ✅ Completado | Lógica semideterminista completa, datos desde GitHub |
| **standings** | ✅ Completado | Fetch desde GitHub con fallback |
| **calendar** | ✅ Completado | Carga eventos y calcula estados (next/completed/upcoming) |
| **sim** | ✅ Completado | Integración con OpenAI (requiere API key) |

## Pasos para Deploy

### 1. Obtener Cloudflare API Token

1. Ve a https://dash.cloudflare.com/profile/api-tokens
2. Crea un token con permisos:
   - `Cloudflare Workers: Edit`
   - `Cloudflare Workers KV Storage: Edit`
3. Copia el token

### 2. Configurar Variables de Entorno

```bash
# En tu terminal
export CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

### 3. Crear KV Namespace

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway

# Crear el namespace
wrangler kv namespace create "EDGE_STATE"

# Salida esperada:
# 🌀 Creating namespace with title "edge-state"
# ✨ Success!
# Add the following to your wrangler.toml to configure this namespace:
# [[kv_namespaces]]
# binding = "EDGE_STATE"
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 4. Actualizar wrangler.toml

Edita `wrangler.toml` y reemplaza el ID del KV:

```toml
[[kv_namespaces]]
binding = "EDGE_STATE"
id = "COPIA_EL_ID_AQUI"
```

### 5. Configurar OpenAI API Key (opcional, para /api/sim)

```bash
wrangler secret put OPENAI_API_KEY
# Te pedirá que pegues tu API key de OpenAI
```

### 6. Deploy

```bash
wrangler deploy
```

**URL resultante:** `https://racecontrol-api-gateway.joanvalls1998.workers.dev`

## Test Rápido

```bash
# Test standings
curl https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/standings

# Test calendar
curl https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/calendar

# Test predict
curl -X POST "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/predict" \
  -H "Content-Type: application/json" \
  -d '{"raceName": "GP Miami", "favorite": {"type": "driver", "name": "Fernando Alonso"}}'

# O usa el script
./test-endpoints.sh
```

## Cambios Técnicos Clave

### 1. Datos desde GitHub
Los archivos de datos (`grid.js`, `performance.js`, etc.) se cargan via `fetch()` desde GitHub raw:
```javascript
const DATA_URLS = {
  grid: 'https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main/data/grid.js',
  // ...
};
```

### 2. Parse de Módulos ES
Cloudflare Workers no puede hacer `import` dinámico de módulos ES arbitrarios. Se implementó `fetchModule()` que:
- Fetch del código fuente
- Extrae `export const` con regex
- Evalúa de forma controlada

### 3. Estado Persistente con KV
Los ajustes runtime se guardan en Cloudflare KV:
- `get-edge-state`: Lee el estado actual
- `init-edge-state`: Inicializa
- `reset-edge-state`: Borra

### 4. Sin fs, sin path, sin Node.js
Todo el código usa APIs web estándar:
- `fetch()` en vez de `axios` o `https`
- `Response` y `Request` nativos
- JSON.parse/stringify nativos

## Estructura de Archivos

```
cloudflare-worker/api-gateway/
├── src/
│   └── index.js          # Worker principal (migrado)
├── wrangler.toml         # Configuración (actualizar KV id)
├── README.md             # Documentación completa
├── test-endpoints.sh     # Script de test
└── DEPLOY_INSTRUCTIONS.md # Este archivo
```

## Solución de Problemas

### Error: "In a non-interactive environment..."
```bash
export CLOUDFLARE_API_TOKEN="tu-token"
```

### Error: "KV namespace not found"
1. Asegúrate de haber creado el KV: `wrangler kv namespace create "EDGE_STATE"`
2. Copia el ID a `wrangler.toml`

### Error: "OPENAI_API_KEY no configurada"
```bash
wrangler secret put OPENAI_API_KEY
```

### Los datos no se actualizan
El cache TTL es de 1 hora. Para forzar refresh:
```bash
wrangler deploy --force
```

## Próximos Pasos

1. **Deployar** siguiendo los pasos anteriores
2. **Testear** todos los endpoints
3. **Actualizar** el frontend para usar la nueva URL
4. **Monitorizar** logs con `wrangler tail`

---

**Nota:** La API de telemetría del ingeniero (`/api/engineer/telemetry`) requiere migrar `_core.js` que tiene lógica compleja de procesamiento. Está marcada como pendiente.
