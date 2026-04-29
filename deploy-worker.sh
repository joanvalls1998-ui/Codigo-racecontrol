#!/bin/bash
# Deploy script for RaceControl API Gateway
# Usage: ./deploy-worker.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/cloudflare-worker/api-gateway"
API_URL="https://racecontrol-api-gateway.joanvalls1998.workers.dev"

echo "🚀 RaceControl Worker Deploy Script"
echo "===================================="
echo ""

# Check if CLOUDFLARE_API_TOKEN is set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "⚠️  CLOUDFLARE_API_TOKEN no está configurado"
    echo ""
    echo "Opciones:"
    echo "1. Exportar el token:"
    echo "   export CLOUDFLARE_API_TOKEN='tu-token-aqui'"
    echo ""
    echo "2. O ejecutar wrangler login primero:"
    echo "   wrangler login"
    echo ""
    read -p "¿Quieres continuar sin token? (se intentará con wrangler login) [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

cd "$WORKER_DIR"

echo "📁 Directorio: $(pwd)"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler no está instalado"
    echo "Instala con: npm install -g wrangler"
    exit 1
fi

echo "📦 Wrangler version: $(wrangler --version)"
echo ""

# Dry run first
echo "🔍 Verificando configuración..."
wrangler deploy --dry-run || {
    echo "❌ Error en dry-run. Revisa wrangler.toml"
    exit 1
}

echo ""
echo "🚀 Deployando Worker..."
wrangler deploy

echo ""
echo "✅ Deploy completado!"
echo ""
echo "🧪 Testing endpoints..."
echo ""

# Test standings
echo "1. Testing /api/standings..."
STANDINGS_RESPONSE=$(curl -s "$API_URL/api/standings")
if echo "$STANDINGS_RESPONSE" | grep -q "drivers"; then
    echo "   ✅ Standings OK"
    echo "$STANDINGS_RESPONSE" | python3 -m json.tool | head -20
else
    echo "   ❌ Standings FAILED"
    echo "$STANDINGS_RESPONSE" | head -5
fi

echo ""

# Test calendar
echo "2. Testing /api/calendar..."
CALENDAR_RESPONSE=$(curl -s "$API_URL/api/calendar")
if echo "$CALENDAR_RESPONSE" | grep -q "events"; then
    echo "   ✅ Calendar OK"
    echo "$CALENDAR_RESPONSE" | python3 -m json.tool | head -20
else
    echo "   ❌ Calendar FAILED"
    echo "$CALENDAR_RESPONSE" | head -5
fi

echo ""

# Test news
echo "3. Testing /api/news..."
NEWS_RESPONSE=$(curl -s "$API_URL/api/news?url=https://news.google.com/rss/search?q=F1&hl=es&gl=ES" | head -c 200)
if echo "$NEWS_RESPONSE" | grep -q "<?xml"; then
    echo "   ✅ News OK"
else
    echo "   ❌ News FAILED"
    echo "$NEWS_RESPONSE"
fi

echo ""
echo "===================================="
echo "🎉 Deploy finalizado"
echo ""
echo "Web: https://joanvalls1998-ui.github.io/Codigo-racecontrol/"
echo "API: $API_URL"
echo ""
echo "💡 Hard refresh en el navegador: Cmd+Shift+R"
