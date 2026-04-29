# 🚀 Deploy Automático - Instrucciones

## Cuando vuelvas al Mac, ejecuta ESTO:

```bash
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol
./deploy-worker.sh
```

**Eso es todo.** El script hará:

1. ✅ Instalar `wrangler` (si no lo tienes)
2. 🔐 Abrir el navegador para login (tienes que autorizar)
3. 🚀 Deployar el API Gateway
4. 📝 Actualizar `config.js` automáticamente
5. 📤 Hacer commit y push a GitHub

## Tiempo estimado: 2-3 minutos

---

## ¿Qué pasa después?

1. GitHub Pages hará deploy automático de tu web (1-2 min)
2. Tu web llamará al nuevo API Gateway en Cloudflare
3. ¡Todo debería funcionar!

---

## Si algo sale mal:

**Error en el login:**
- Asegúrate de tener cuenta en Cloudflare (gratis)
- Ve a https://dash.cloudflare.com y crea una si no tienes

**Error en el deploy:**
- Ejecuta `wrangler deploy` manualmente para ver el error completo
- Revisa los logs en https://dash.cloudflare.com/?to=/:account/workers

**La web no carga:**
- Espera 2-3 minutos (GitHub Pages tarda un poco)
- Limpia caché del navegador
- Revisa la consola (F12) para errores

---

## URLs después del deploy:

| Qué | URL |
|-----|-----|
| Web principal | `https://joanvalls1998-ui.github.io/Codigo-racecontrol/` |
| API Gateway | `https://racecontrol-api-gateway.[tu-subdomain].workers.dev` |
| Dashboard Cloudflare | `https://dash.cloudflare.com/` |

---

**¡Ejecuta el script cuando vuelvas y en 2 minutos estará listo!** 🏁
