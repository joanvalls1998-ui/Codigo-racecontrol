# 🚀 Deploy en Cloudflare Workers - Guía Rápida

## Resumen

Vas a migrar todas las APIs de Vercel a Cloudflare Workers. Tu web seguirá en GitHub Pages, pero las APIs ahora correrán en Cloudflare (gratis hasta 100k requests/día).

---

## 📋 Paso 1: Instalar Wrangler

```bash
npm install -g wrangler
```

---

## 📋 Paso 2: Login en Cloudflare

```bash
wrangler login
```

Se abrirá el navegador. Autoriza el acceso con tu cuenta de Cloudflare.

---

## 📋 Paso 3: Deploy del API Gateway

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway
wrangler deploy
```

**Resultado:** Verás algo como:
```
Deployed racecontrol-api-gateway triggers:
  https://racecontrol-api-gateway.[tu-subdomain].workers.dev
```

**Copia esa URL** - la necesitarás en el siguiente paso.

---

## 📋 Paso 4: Actualizar config.js

Abre `/Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/config.js`

Cambia:
```javascript
API_BASE_URL: '', // Déjalo vacío para usar /api/ en local
```

Por:
```javascript
API_BASE_URL: 'https://racecontrol-api-gateway.[tu-subdomain].workers.dev',
```

---

## 📋 Paso 5: Commit y push a GitHub

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol
git add .
git commit -m "Migrar APIs a Cloudflare Workers"
git push origin main
```

GitHub Pages hará deploy automático en 1-2 minutos.

---

## 📋 Paso 6: Testear

Abre tu web en GitHub Pages:
```
https://joanvalls1998-ui.github.io/Codigo-racecontrol/
```

Prueba:
1. ✅ La pantalla de "Ingeniero" carga
2. ✅ La telemetría funciona
3. ✅ Las clasificaciones se ven
4. ✅ El calendario carga

---

## 🔧 Migrar la lógica de las APIs

Ahora mismo el Worker retorna datos mock. Tienes que copiar la lógica de cada archivo `api/*.js` a su handler en `cloudflare-worker/api-gateway/src/index.js`.

**Ejemplo para predict:**

1. Abre `api/predict.js` y copia todo el código
2. Abre `cloudflare-worker/api-gateway/src/index.js`
3. Busca `handlePredict()` y reemplaza el código mock con tu lógica

**Importante:** Cloudflare Workers no tiene acceso al sistema de archivos. Si tu código usa `fs.readFileSync()`, tendrás que:
- Mover los datos a Cloudflare KV, o
- Servir los datos desde un endpoint externo

---

## 🐛 Debugging

Si algo no funciona:

1. **Abre la consola del navegador** (F12) y mira los errores
2. **Revisa los logs del Worker** en el dashboard de Cloudflare:
   https://dash.cloudflare.com/?to=/:account/workers
3. **Prueba en local** antes de deployar:
   ```bash
   cd cloudflare-worker/api-gateway
   wrangler dev
   ```

---

## ✅ Checklist final

- [ ] Wrangler instalado
- [ ] Login en Cloudflare hecho
- [ ] API Gateway deployed
- [ ] `config.js` actualizado con la URL del Worker
- [ ] Código actualizado en GitHub
- [ ] Web en GitHub Pages funciona
- [ ] Ingeniero/telemetría funciona
- [ ] Clasificaciones funcionan
- [ ] Calendario funciona
- [ ] Noticias funcionan

---

## 💰 Coste

**Total: €0/mes**

- GitHub Pages: Gratis
- Cloudflare Workers: Gratis hasta 100k requests/día
- Tu uso estimado: ~1-5k requests/día (sobra)

---

## 🆘 Problemas comunes

### "Error 404 en /api/..."
- Verifica que `config.js` tiene la URL correcta del Worker
- Verifica que el Worker está deployed (`wrangler deploy`)

### "CORS error"
- El Worker ya incluye CORS headers, pero verifica que `ALLOWED_ORIGINS` en `wrangler.toml` incluye tu URL de GitHub Pages

### "La telemetría no carga"
- Revisa los logs del Worker en Cloudflare Dashboard
- Puede que necesites migrar la lógica de `api/engineer/telemetry.js` al handler `handleEngineerTelemetry()`

---

## 📚 Recursos

- Docs de Cloudflare Workers: https://developers.cloudflare.com/workers/
- Dashboard: https://dash.cloudflare.com/
- Tu Worker: https://dash.cloudflare.com/?to=/:account/workers/services/view/racecontrol-api-gateway

---

**¿Listo?** Empieza por el Paso 1 y avísame si tienes algún problema. 🚀
