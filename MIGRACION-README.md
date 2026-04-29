# 🏁 RaceControl - Migración Completa a GitHub Pages + Cloudflare Workers

## ✅ ¿Qué hemos hecho?

### Antes (Vercel)
- Web + APIs en Vercel
- Límites de build/minutos superados
- No podías hacer deploy sin pagar

### Ahora (100% gratis)
- **Web:** GitHub Pages (ilimitado)
- **APIs:** Cloudflare Workers (100k requests/día gratis)
- **Sin límites** de deploy
- **Sin coste** mensual

---

## 📁 Archivos creados/actualizados

### Nuevos archivos:
```
cloudflare-worker/api-gateway/
├── wrangler.toml          # Config del Worker
├── src/index.js           # API Gateway (todos los endpoints)
├── README.md              # Instrucciones detalladas
└── ../DEPLOY-CLOUDFLARE.md # Guía rápida de deploy

config.js                  # Configuración (URL del Worker)
MIGRACION-README.md        # Este archivo
```

### Actualizados:
```
index.html                 # Añadido config.js
screens/predict.js         # fetchEngineerApi() ahora usa config
```

---

## 🚀 Cómo deployar (resumen rápido)

```bash
# 1. Instalar Wrangler
npm install -g wrangler

# 2. Login
wrangler login

# 3. Deploy del Worker
cd cloudflare-worker/api-gateway
wrangler deploy

# 4. Copia la URL que te dé y actualiza config.js

# 5. Push a GitHub
cd ../..
git add .
git commit -m "Migrar a Cloudflare Workers"
git push origin main
```

**Lee `DEPLOY-CLOUDFLARE.md` para instrucciones detalladas.**

---

## 🔧 Próximo paso: Migrar la lógica de las APIs

Ahora mismo el Worker retorna datos mock. Tienes que migrar cada API:

### Endpoints que necesitas migrar:

| Endpoint | Archivo original | Handler en Worker |
|----------|------------------|-------------------|
| `/api/engineer/context` | `api/engineer/*.js` | `handleEngineerContext()` |
| `/api/engineer/telemetry` | `api/engineer/telemetry.js` | `handleEngineerTelemetry()` |
| `/api/predict` | `api/predict.js` | `handlePredict()` |
| `/api/standings` | `api/standings.js` | `handleStandings()` |
| `/api/calendar` | `api/calendar.js` | `handleCalendar()` |
| `/api/news` | `api/news.js` | `handleNews()` |
| ... | ... | ... |

**Empieza por `engineer/telemetry` que es la que no te funciona ahora.**

---

## ⚠️ Limitaciones de Cloudflare Workers

### Lo que SÍ puedes usar:
- ✅ `fetch()` para APIs externas
- ✅ Almacenamiento KV (clave-valor)
- ✅ JavaScript moderno (ES modules)
- ✅ Web Crypto API

### Lo que NO puedes usar:
- ❌ `fs` (sistema de archivos)
- ❌ Librerías nativas de Node.js
- ❌ Base de datos local
- ❌ Más de 10ms de CPU time por request (en plan gratis)

**Si tu código usa `fs.readFileSync()`, tendrás que:**
1. Mover los datos a Cloudflare KV, o
2. Servir los datos desde GitHub (`raw.githubusercontent.com`)

---

## 💰 Coste

| Servicio | Plan | Límite | Tu uso estimado |
|----------|------|--------|-----------------|
| GitHub Pages | Gratis | Ilimitado | ✅ Perfecto |
| Cloudflare Workers | Gratis | 100k req/día | ~1-5k req/día ✅ |
| **Total** | **€0/mes** | - | ✅ |

---

## 📊 Estado actual

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Web en GitHub Pages | ✅ Funciona | `https://joanvalls1998-ui.github.io/Codigo-racecontrol/` |
| API Gateway | ⚠️ Deploy pendiente | Necesitas hacer `wrangler deploy` |
| Ingeniero/Telemetría | ⚠️ Lógica pendiente | Migrar `api/engineer/*.js` al Worker |
| Predict | ⚠️ Lógica pendiente | Migrar `api/predict.js` |
| Standings | ⚠️ Lógica pendiente | Migrar `api/standings.js` |
| Calendar | ⚠️ Lógica pendiente | Migrar `api/calendar.js` |
| News | ✅ Funciona | Ya tienes `news-proxy` deployed |

---

## 🎯 Siguientes pasos

1. **Haz deploy del Worker** (sigue `DEPLOY-CLOUDFLARE.md`)
2. **Actualiza `config.js`** con la URL del Worker
3. **Testea la web** en GitHub Pages
4. **Migra la lógica** de cada API (empieza por telemetry)
5. **Desactiva Vercel** cuando todo funcione

---

## 🆘 Ayuda

Si tienes problemas:

1. Revisa `DEPLOY-CLOUDFLARE.md` - tiene troubleshooting
2. Mira los logs en Cloudflare Dashboard
3. Prueba en local con `wrangler dev`

---

**¡Ya está todo listo! Solo falta deployar y migrar la lógica.** 🚀
