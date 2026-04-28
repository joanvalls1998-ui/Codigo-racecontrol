# 📰 Cloudflare Worker - News Proxy para RaceControl

Este worker actúa como proxy para las noticias de Google News RSS, evitando problemas de CORS cuando se llama desde el navegador en GitHub Pages.

---

## 🚀 Deploy Rápido (2 minutos)

### Paso 1: Instalar Wrangler CLI

```bash
npm install -g wrangler
```

### Paso 2: Login en Cloudflare

```bash
wrangler login
```

Se abrirá el navegador. Inicia sesión con tu cuenta de Cloudflare (crea una gratis si no tienes).

### Paso 3: Deploy del Worker

```bash
cd cloudflare-worker/news-proxy
wrangler deploy
```

### Paso 4: Copiar la URL

Al finalizar, verás algo como:

```
Deployed! https://racecontrol-news-proxy.[tu-subdomain].workers.dev
```

Copia esa URL.

---

## 🔧 Conectar con RaceControl

Edita `main.js` y busca la función `fetchNewsDataForFavorite`. Reemplaza:

```javascript
// ANTES (vacío):
const data = {
  favorite,
  items: []
};
```

Por:

```javascript
// NUEVO (con Cloudflare Worker):
const WORKER_URL = 'https://racecontrol-news-proxy.[tu-subdomain].workers.dev';

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

---

## 📊 Coste

✅ **Totalmente gratis** con el plan free de Cloudflare Workers:
- 100,000 peticiones/día
- 10ms CPU time por petición (suficiente para RSS proxy)
- Sin tarjeta de crédito requerida

---

## 🔒 Seguridad

El worker solo permite:
- URLs de Google News RSS
- Orígenes autorizados (tu GitHub Pages)
- Métodos GET y POST

---

## 🛠️ Comandos Útiles

```bash
# Ver logs en tiempo real
wrangler tail

# Ver configuración
wrangler whoami

# Actualizar deploy
wrangler deploy

# Eliminar worker
wrangler delete
```

---

## 📝 Notas

- El worker cachea las respuestas por 1 hora (ahorra peticiones)
- Si superas los límites gratis, Cloudflare te avisa antes de cobrar
- Puedes añadir un dominio personalizado si quieres

---

**Creado:** 2026-04-28  
**Para:** RaceControl en GitHub Pages  
**Estado:** Listo para deploy ✅
