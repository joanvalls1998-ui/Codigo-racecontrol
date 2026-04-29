# API Gateway - RaceControl

Cloudflare Worker que sirve como API Gateway para RaceControl, con las APIs migradas desde Node.js.

## Endpoints Disponibles

### APIs Migradas (Nativas en Worker)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/predict` | POST | Predicción semideterminista de carreras |
| `/api/standings` | GET | Clasificación de pilotos y equipos |
| `/api/calendar` | GET | Calendario de carreras con estados |
| `/api/sim` | POST | Simulación con IA (OpenAI) |

### Edge State (KV)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/get-edge-state` | GET | Obtener estado de ajustes |
| `/api/init-edge-state` | POST | Inicializar estado |
| `/api/reset-edge-state` | POST | Resetear estado |
| `/api/apply-adjustments` | POST | Aplicar ajustes |
| `/api/update-adjustments` | POST | Actualizar ajustes |

### Engineer API (En implementación)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/engineer/telemetry` | GET | Telemetría por vuelta |
| `/api/engineer/context` | GET | Contexto de sesión |
| `/api/engineer/sessions` | GET | Lista de sesiones |
| `/api/engineer/sectors` | GET | Datos por sector |
| `/api/engineer/stints` | GET | Stints de neumáticos |
| `/api/engineer/coverage` | GET | Cobertura de sesión |
| `/api/engineer/evolution` | GET | Evolución de tiempos |
| `/api/engineer/meetings` | GET | Lista de meetings |
| `/api/engineer/entities` | GET | Entidades F1 API |

## Deploy

### 1. Configurar variables de entorno

```bash
# Opción A: Exportar antes de deploy
export CLOUDFLARE_API_TOKEN="tu-api-token"
export OPENAI_API_KEY="tu-openai-key"

# Opción B: Usar wrangler secrets
wrangler secret put OPENAI_API_KEY
```

### 2. Crear KV Namespace (para edge state)

```bash
cd cloudflare-worker/api-gateway
wrangler kv namespace create "EDGE_STATE"
```

Anota el `id` que devuelve y actualiza `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "EDGE_STATE"
id = "xxxxxxxxxxxxxxxx"
```

### 3. Deploy

```bash
wrangler deploy
```

URL resultante: `https://racecontrol-api-gateway.joanvalls1998.workers.dev`

## Test de Endpoints

### Test Predict

```bash
curl -X POST "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/predict" \
  -H "Content-Type: application/json" \
  -d '{"raceName": "GP Miami", "favorite": {"type": "driver", "name": "Fernando Alonso"}}'
```

### Test Standings

```bash
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/standings"
```

### Test Calendar

```bash
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/calendar"
```

### Test Sim

```bash
curl -X POST "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/sim"
```

## Arquitectura

### Migración de Node.js a Cloudflare Workers

**Cambios clave:**

1. **Sin `fs`**: Todos los datos se cargan via `fetch()` desde GitHub raw
2. **Sin imports ES nativos**: Se parsean los módulos con `fetchModule()` que extrae exports
3. **Persistencia con KV**: El estado de ajustes se guarda en Cloudflare KV
4. **Fetch nativo**: Usamos `fetch()` de Cloudflare Workers (con `cacheTtl`)

### Estructura de Datos

Los datos se cargan desde:
- `https://raw.githubusercontent.com/joanvalls1998-ui/Codigo-racecontrol/main/data/`

Archivos:
- `grid.js` → Parrilla de pilotos 2026
- `performance.js` → Rendimientos base de equipos y pilotos
- `manual-adjustments.js` → Límites y ajustes manuales
- `circuits.js` → Perfiles de circuitos
- `calendar-events.js` → Calendario oficial

## Limitaciones

1. **Cache TTL**: Los datos de GitHub se cachean 1 hora (3600s)
2. **KV opcional**: Sin KV configurado, los ajustes usan el estado base
3. **OpenAI requiere secret**: La API de sim necesita `OPENAI_API_KEY` configurada

## Scripts Útiles

```bash
# Ver logs en tiempo real
wrangler tail

# Ver estado del deploy
wrangler deployments list

# Rollback a versión anterior
wrangler rollback

# Eliminar deploy
wrangler delete
```

## Próximos Pasos

- [ ] Migrar telemetría del ingeniero (requiere _core.js)
- [ ] Añadir validación de schemas con Zod
- [ ] Rate limiting por IP
- [ ] Métricas con Cloudflare Analytics
