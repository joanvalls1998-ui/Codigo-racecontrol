# Auditoría Completa de RaceControl - 29 Abril 2026

## 📊 Resumen Ejecutivo

- **Estado general:** ❌ PROBLEMAS CRÍTICOS
- **Pantallas que funcionan:** News ✅
- **Pantallas rotas:** Standings ❌, Calendar ❌, Predict ⚠️
- **APIs que funcionan:** `/api/news` ✅
- **APIs rotas:** `/api/standings` ❌, `/api/calendar` ❌, `/api/predict` ❌

---

## 🔍 Test de Endpoints (Resultados Reales)

### 1. `/api/standings`
**Estado:** ❌ ROTO
```json
{"error":"No se pudo cargar standings","message":"HTTP 404","fallback":true}
```
**Problema:** El Worker intenta fetch de `standings.json` desde GitHub Raw pero el archivo NO existe (404).

### 2. `/api/calendar`
**Estado:** ❌ ROTO
```json
{"error":"No se pudo cargar calendar","message":"Cannot read properties of undefined (reading 'map')"}
```
**Problema:** El `fetchModule()` no parsea correctamente el ES6 module `calendar-events.js` → `calendarEvents` es undefined.

### 3. `/api/news`
**Estado:** ✅ FUNCIONA
**Respuesta:** XML RSS válido con ~50 noticias de F1.

### 4. `/api/predict`
**Estado:** ❌ ROTO
```json
{"error":"Error interno","message":"getCircuitProfile is not a function"}
```
**Problema:** `circuits.js` exporta `circuitProfiles` (objeto), pero el Worker busca `getCircuitProfile` (función).

### 5. `/api/engineer/*`
**Estado:** ⚠️ PENDIENTE (501 Not Implemented)
**Nota:** Feature avanzada, no bloqueante.

---

## 📁 Análisis de Archivos

### Backend (Cloudflare Worker)

| Archivo | Estado | Problema |
|---------|--------|----------|
| `index.js` | ❌ | Handlers de standings/calendar/predict rotos |
| `wrangler.toml` | ✅ | Config correcta, falta KV EDGE_STATE |

### Frontend

| Archivo | Estado | Notas |
|---------|--------|-------|
| `screens/standings.js` | ✅ | Bien estructurado, usa datos embebidos en main.js |
| `screens/calendar.js` | ✅ | Bien estructurado, importa desde `data/calendar-events.js` |
| `screens/predict.js` | ✅ | Usa Web Worker, no API directa |
| `screens/news.js` | ✅ | Excelente, filtrado contextual |
| `main.js` | ⚠️ | `fetchStandingsData()` y `fetchCalendarData()` tienen datos embebidos como fallback |
| `config.js` | ✅ | `API_BASE_URL` correcta |

---

## 🛠️ Solución Requerida

El Worker necesita datos **embebidos** en lugar de intentar fetch desde GitHub:

### 1. `handleStandings()` - Arreglar
Reemplazar intento de fetch con datos estáticos:
```javascript
const data = {
  updatedAt: new Date().toISOString(),
  drivers: [
    { pos: 1, number: "12", name: "Kimi Antonelli", team: "Mercedes", points: 72 },
    // ... 20 pilotos
  ],
  teams: [
    { pos: 1, team: "Mercedes", points: 135 },
    // ... 10 equipos
  ]
};
```

### 2. `handleCalendar()` - Arreglar
Reemplazar intento de parse con array embebido:
```javascript
const calendarEvents = [
  { id: "round-1", type: "race", round: 1, title: "Australian Grand Prix", ... },
  // ... 21 eventos
];
```

### 3. `handlePredict()` - Arreglar
El parser de módulos ES6 no funciona. Opciones:
- **Opción A:** Embutir `circuitProfiles` directamente en el Worker
- **Opción B:** Arreglar `fetchModule()` para extraer `export const circuitProfiles`

---

## 📋 Lista de Arreglos Prioritarios

### CRÍTICO (impide que funcione)
1. ❌ `/api/standings` → 404 desde GitHub
2. ❌ `/api/calendar` → undefined.map()
3. ❌ `/api/predict` → getCircuitProfile is not a function

### ALTO (hace que se vea "estática")
1. ❌ Standings no muestra datos reales
2. ❌ Calendar no muestra próximas carreras
3. ⚠️ Predict falla si se usa desde API (frontend usa Web Worker)

### MEDIO
1. ⚠️ KV EDGE_STATE no configurado (ajustes runtime)
2. ⚠️ Engineer API sin implementar

### BAJO
1. 📝 Mejorar caching
2. 📝 Añadir más endpoints de ingeniero

---

## 🎯 Plan de Acción

### Fase 1: Arreglos críticos (AHORA)

1. **Arreglar `handleStandings()`** - Datos embebidos
2. **Arreglar `handleCalendar()`** - Datos embebidos
3. **Arreglar `handlePredict()`** - Embutir circuitProfiles o arreglar parser

### Fase 2: Deploy

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway
wrangler deploy
```

### Fase 3: Verificación

```bash
# Test standings
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/standings"

# Test calendar
curl "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/calendar"

# Test predict
curl -X POST "https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/predict" \
  -H "Content-Type: application/json" \
  -d '{"favorite":{"type":"driver","name":"Fernando Alonso"},"raceName":"GP Miami"}'
```

### Fase 4: Web

Visitar: https://joanvalls1998-ui.github.io/Codigo-racecontrol/

---

## 📝 Notas

- El frontend YA tiene datos embebidos como fallback en `main.js`
- El problema es que el Worker NO está sirviendo datos consistentes
- News funciona perfectamente (proxy RSS)
- Predict del frontend usa Web Worker, no depende del API Gateway

---

**Próximo paso:** Aplicar fixes al Worker y deployar.
