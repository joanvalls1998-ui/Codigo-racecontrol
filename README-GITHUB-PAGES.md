# 🏁 RaceControl en GitHub Pages - Guía Completa

**Estado:** ✅ **COMPLETADO Y DESPLEGADO**  
**URL:** https://joanvalls1998-ui.github.io/Codigo-racecontrol/  
**Fecha:** 2026-04-28

---

## 📊 RESUMEN DE LA MIGRACIÓN

| Característica | Estado | Notas |
|----------------|--------|-------|
| **Frontend** | ✅ 100% estático | GitHub Pages CDN |
| **Clasificación (standings)** | ✅ Funciona | Datos estáticos en main.js |
| **Calendario** | ✅ Funciona | Importa `data/calendar-events.js` |
| **Noticias** | ⚠️ Pendiente | Requiere Cloudflare Worker (ver abajo) |
| **Ingeniero/Predict** | ✅ Funciona | Web Worker (sin timeout) |
| **Estado persistente** | ✅ Funciona | localStorage + IndexedDB |
| **PWA** | ✅ Funciona | Service Worker incluido |
| **Coste** | ✅ $0 | 100% gratis |

---

## 🎯 FUNCIONALIDADES ACTUALES

### ✅ Lo que SÍ funciona:

1. **Clasificación de pilotos y constructores**
   - Datos actualizados manualmente en `main.js`
   - Para actualizar: editar el array `drivers` y `teams` en `fetchStandingsData()`

2. **Calendario F1 2026**
   - Lee desde `data/calendar-events.js`
   - Muestra próximas carreras y sesiones

3. **Ingeniero (Predict)**
   - Usa Web Worker (`workers/sim-worker.js`)
   - Simulaciones en segundo plano (sin bloquear UI)
   - Sin límites de tiempo

4. **Persistencia de datos**
   - Estado guardado en localStorage/IndexedDB
   - Sobrevive a recargas y cierres

5. **PWA (Progressive Web App)**
   - Funciona offline
   - Añadir a pantalla de inicio en iOS/Android

### ⚠️ Lo que requiere acción:

**Noticias de Google News:**
- Actualmente desactivadas por CORS
- Solución: Deploy del Cloudflare Worker (2 minutos)

---

## ☁️ DEPLOY DEL CLOUDFLARE WORKER (OPCIONAL)

Para activar las noticias:

### Paso 1: Instalar Wrangler

```bash
npm install -g wrangler
```

### Paso 2: Login

```bash
wrangler login
```

(Se abrirá el navegador, inicia sesión en Cloudflare - cuenta gratis)

### Paso 3: Deploy

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/news-proxy
wrangler deploy
```

### Paso 4: Copiar la URL

Verás algo como:
```
https://racecontrol-news-proxy.joanvalls.workers.dev
```

### Paso 5: Conectar con main.js

Edita `main.js`, busca `fetchNewsDataForFavorite` y reemplaza la sección de noticias vacías por:

```javascript
const WORKER_URL = 'https://racecontrol-news-proxy.joanvalls.workers.dev'; // TU URL

const queries = buildQueries(favorite);
const allItems = [];

for (const query of queries) {
  const rssUrl = buildGoogleNewsRssUrl(query);
  
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rssUrl })
    });
    
    if (!response.ok) continue;
    
    const xml = await response.text();
    const items = parseRssItems(xml);
    allItems.push(...items);
  } catch (e) {
    console.warn('Error fetching news:', e);
  }
}

const data = {
  favorite,
  items: dedupeNews(allItems).slice(0, 8)
};
```

Luego:
```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol
git add main.js
git commit -m "📰 Activar noticias con Cloudflare Worker"
git push origin main
```

---

## 📱 CÓMO USAR LA APP

### En iOS (iPhone/iPad):

1. Abre Safari
2. Ve a: https://joanvalls1998-ui.github.io/Codigo-racecontrol/
3. Toca "Compartir" → "Añadir a pantalla de inicio"
4. ¡Listo! Se abre como app nativa

### En Android:

1. Abre Chrome
2. Ve a la URL
3. Toca menú → "Instalar aplicación"
4. ¡Listo!

### En Desktop:

1. Abre tu navegador favorito
2. Ve a la URL
3. Funciona offline después de la primera carga

---

## 🔧 MANTENIMIENTO

### Actualizar clasificación:

Edita `main.js`, busca `fetchStandingsData` y actualiza los arrays `drivers` y `teams`.

### Actualizar calendario:

Edita `data/calendar-events.js` con nuevas carreras.

### Actualizar la app:

```bash
# Hacer cambios locales
git add .
git commit -m "Descripción de cambios"
git push origin main
```

GitHub Pages desplegará automáticamente en ~1 minuto.

---

## 📊 COMPARATIVA FINAL

| Antes (Vercel/Railway) | Ahora (GitHub Pages) |
|------------------------|----------------------|
| $5-20/mes | ✅ $0 |
| Backend Node.js | ✅ 100% estático |
| Límite 10s funciones | ✅ Sin límites |
| Timeout en simulaciones | ✅ Web Workers |
| Estado en servidor | ✅ localStorage (más rápido) |
| 100GB/mes ancho de banda | ✅ Ilimitado (uso razonable) |

---

## 🆘 SOPORTE

### La app no carga:
- Verifica que GitHub Pages está activo: https://github.com/joanvalls1998-ui/Codigo-racecontrol/settings/pages
- Revisa los logs: https://github.com/joanvalls1998-ui/Codigo-racecontrol/actions

### Las noticias no funcionan:
- Es normal, requiere Cloudflare Worker (ver sección arriba)

### El estado no se guarda:
- Abre la consola (F12) y verifica que no hay errores de localStorage
- Algunos navegadores en modo incógnito bloquean localStorage

### PWA no se instala:
- Asegúrate de usar HTTPS (GitHub Pages lo tiene)
- En iOS, usa Safari (no Chrome)

---

## 📁 ESTRUCTURA DEL REPO

```
Codigo-racecontrol/
├── index.html                    ← Entrada principal
├── main.js                       ← Lógica (parcheada para GitHub Pages)
├── styles.css                    ← Estilos
├── sw.js                         ← Service Worker (PWA)
├── manifest.webmanifest          ← PWA manifest
├── data/
│   └── calendar-events.js        ← Calendario estático
├── utils/
│   └── state-manager.js          ← Gestión de estado
├── workers/
│   └── sim-worker.js             ← Web Worker para simulaciones
├── cloudflare-worker/
│   └── news-proxy/               ← Worker para noticias (deploy manual)
├── .github/
│   └── workflows/
│       └── deploy.yml            ← Deploy automático
└── README-GITHUB-PAGES.md        ← Este archivo
```

---

## 🎉 ¡LISTO!

Tu app RaceControl ahora es:
- ✅ 100% gratis
- ✅ Más rápida (CDN global)
- ✅ Funciona offline
- ✅ Sin límites de tiempo
- ✅ Fácil de mantener

**URL:** https://joanvalls1998-ui.github.io/Codigo-racecontrol/

---

**Skill usada:** `racecontrol-migrator`  
**Agente:** RACECONTROL-MIGRADOR  
**Completado:** 2026-04-28 17:50
