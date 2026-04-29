#!/bin/bash

# 🚀 Script de Deploy de RaceControl API Gateway a Cloudflare Workers
# Ejecuta esto cuando estés frente al Mac y puedas autorizar el login

set -e  # Detener si hay error

echo "🏁 RaceControl - Deploy a Cloudflare Workers"
echo "============================================"
echo ""

# 1. Instalar Wrangler si no existe
if ! command -v wrangler &> /dev/null; then
    echo "📦 Instalando Wrangler..."
    npm install -g wrangler
else
    echo "✅ Wrangler ya está instalado"
fi

echo ""
echo "🔐 Paso 1: Login en Cloudflare"
echo "   Se abrirá el navegador. Autoriza el acceso."
echo "   (Presiona Enter cuando hayas autorizado)"
read -p ""

wrangler login

echo ""
echo "🚀 Paso 2: Deploy del API Gateway..."
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol/cloudflare-worker/api-gateway

# Deploy y capturar la URL
OUTPUT=$(wrangler deploy 2>&1)
echo "$OUTPUT"

# Extraer la URL del output
WORKER_URL=$(echo "$OUTPUT" | grep -oP 'https://racecontrol-api-gateway\.[\w.-]+\.workers\.dev' | head -1)

if [ -z "$WORKER_URL" ]; then
    echo "⚠️  No pude extraer la URL del Worker automáticamente"
    echo "   Copia la URL que ves arriba (empieza por https://racecontrol-api-gateway...)"
    read -p "Pega la URL del Worker: " WORKER_URL
fi

echo ""
echo "✅ Worker deployed en: $WORKER_URL"
echo ""

# 3. Actualizar config.js
echo "📝 Paso 3: Actualizando config.js..."
cd /Users/joanvalls/.openclaw/workspace/Codigo-racecontrol

# Crear backup
cp config.js config.js.bak

# Reemplazar API_BASE_URL
sed -i '' "s|API_BASE_URL: ''|API_BASE_URL: '$WORKER_URL'|" config.js

echo "✅ config.js actualizado con: $WORKER_URL"
echo ""

# 4. Commit y push a GitHub
echo "📤 Paso 4: Push a GitHub..."
git add .
git commit -m "🚀 Migrar APIs a Cloudflare Workers - $(date +%Y-%m-%d)"
git push origin main

echo ""
echo "============================================"
echo "✅ ¡DEPLOY COMPLETADO!"
echo ""
echo "📱 Tu web está en:"
echo "   https://joanvalls1998-ui.github.io/Codigo-racecontrol/"
echo ""
echo "🔧 Tu API Gateway está en:"
echo "   $WORKER_URL"
echo ""
echo "⚠️  Próximo paso: Migrar la lógica de las APIs"
echo "   Lee MIGRACION-README.md para más info"
echo "============================================"
