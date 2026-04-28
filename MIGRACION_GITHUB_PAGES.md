# 🏁 RaceControl - Migración a GitHub Pages

## ✅ Archivos creados/actualizados:

```
Codigo-racecontrol/
├── utils/
│   └── state-manager.js          ← Gestión de estado (localStorage + IndexedDB)
├── workers/
│   └── sim-worker.js             ← Web Worker para simulaciones
├── .github/
│   └── workflows/
│       └── deploy.yml            ← Deploy automático a GitHub Pages
└── index.html                    ← Actualizado con base path
```

---

## 📋 PRÓXIMOS PASOS (MANUALES):

### Paso 1: Activar GitHub Pages

1. Ve a: https://github.com/joanvalls1998-ui/Codigo-racecontrol/settings/pages
2. En **Source**, selecciona: **GitHub Actions**
3. Guarda los cambios

### Paso 2: Hacer push de los cambios

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol
git add .
git commit -m "Migrar a GitHub Pages - arquitectura estática"
git push origin main
```

### Paso 3: Esperar el deploy

- GitHub Actions empezará automáticamente
- Tardará ~1-2 minutos
- Tu app estará en: **https://joanvalls1998-ui.github.io/Codigo-racecontrol/**

---

## 🔧 CAMBIOS PENDIENTES (opcionales):

### A. Modificar `main.js` para usar el nuevo state manager

Reemplazar las llamadas al backend por:

```javascript
import stateManager from './utils/state-manager.js';

// En lugar de fetch('/api/get-edge-state')
const state = await stateManager.init();

// En lugar de fetch('/api/init-edge-state', ...)
await stateManager.saveState(newState);

// En lugar de fetch('/api/reset-edge-state')
await stateManager.resetState();
```

### B. Modificar `screens/predict.js` para usar Web Worker

Reemplazar la lógica de simulación pesada por:

```javascript
const simWorker = new Worker('workers/sim-worker.js');

simWorker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'simulation_complete') {
    // Actualizar UI con resultados
    updatePredictUI(data);
  }
};

// Enviar datos al worker
simWorker.postMessage({ 
  type: 'simulate_race', 
  data: simulationParams 
});
```

### C. Cloudflare Worker para noticias (si hace falta por CORS)

Si las noticias de Google News fallan por CORS:

1. Ve a: https://dash.cloudflare.com/?to=/:account/workers-and-pages/create
2. Crea un worker llamado: `racecontrol-news`
3. Pega el código de: `cloudflare-worker/news-proxy.js`
4. Deploy
5. URL: `https://racecontrol-news.joanvalls.workers.dev`

---

## 🎯 VENTAJAS DE ESTA MIGRACIÓN:

| Antes (Vercel/Railway) | Ahora (GitHub Pages) |
|------------------------|----------------------|
| ❌ Coste mensual | ✅ 100% gratis |
| ❌ Límites de funciones (10s) | ✅ Sin límites de tiempo |
| ❌ Backend que mantener | ✅ 100% estático |
| ❌ Escalabilidad limitada | ✅ CDN global de GitHub |
| ⚠️ Estado en servidor | ✅ Estado en navegador (más rápido) |

---

## 📊 ESTADO ACTUAL:

- ✅ Workflow de GitHub Pages creado
- ✅ State manager implementado (localStorage + IndexedDB)
- ✅ Web Worker para simulaciones
- ✅ index.html actualizado
- ⏳ Pendiente: Activar GitHub Pages en settings
- ⏳ Pendiente: Hacer git push

---

## 🆘 SOPORTE:

Si algo falla:

1. Revisa los logs de GitHub Actions: https://github.com/joanvalls1998-ui/Codigo-racecontrol/actions
2. Abre la consola del navegador para ver errores
3. Verifica que GitHub Pages está activo en Settings > Pages

---

**Skill usada:** `racecontrol-migrator`  
**Fecha:** 2026-04-28  
**Estado:** Listo para push 🚀
