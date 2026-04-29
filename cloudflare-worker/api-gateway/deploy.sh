#!/bin/bash
# Deploy script para RaceControl API Gateway
# Uso: ./deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 RaceControl API Gateway - Deploy Script"
echo "==========================================="
echo ""

# Verificar wrangler
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler no está instalado. Ejecuta: npm install -g wrangler"
    exit 1
fi

echo "✅ wrangler encontrado: $(wrangler --version)"
echo ""

# Verificar autenticación
echo "🔐 Verificando autenticación con Cloudflare..."
if ! wrangler whoami &> /dev/null; then
    echo "❌ No estás autenticado con Cloudflare."
    echo "   Ejecuta: wrangler login"
    echo "   O configura CLOUDFLARE_API_TOKEN en tu entorno"
    exit 1
fi

echo "✅ Autenticado correctamente"
echo ""

# Verificar wrangler.toml
if [ ! -f "wrangler.toml" ]; then
    echo "❌ wrangler.toml no encontrado en $SCRIPT_DIR"
    exit 1
fi

echo "📄 wrangler.toml encontrado"
echo ""

# Deploy
echo "📦 Desplegando Worker..."
echo ""

wrangler deploy

echo ""
echo "✅ ¡Deploy completado!"
echo ""
echo "🌐 URLs:"
echo "   API Gateway: https://racecontrol-api-gateway.joanvalls1998.workers.dev"
echo "   Web: https://joanvalls1998-ui.github.io/Codigo-racecontrol/"
echo ""
echo "🧪 Test endpoints:"
echo "   curl https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/standings"
echo "   curl https://racecontrol-api-gateway.joanvalls1998.workers.dev/api/calendar"
echo ""
