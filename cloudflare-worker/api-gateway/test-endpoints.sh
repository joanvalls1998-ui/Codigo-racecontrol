#!/bin/bash
# Test script para API Gateway en Cloudflare Workers
# Uso: ./test-endpoints.sh [URL_BASE]

URL_BASE="${1:-https://racecontrol-api-gateway.joanvalls1998.workers.dev}"

echo "🧪 Test API Gateway - $URL_BASE"
echo "================================"
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  
  echo -n "Testing $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$URL_BASE$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$URL_BASE$endpoint")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ OK ($http_code)${NC}"
  elif [ "$http_code" = "404" ]; then
    echo -e "${YELLOW}⚠ Not Found ($http_code)${NC}"
  elif [ "$http_code" = "500" ]; then
    echo -e "${RED}✗ Server Error ($http_code)${NC}"
    echo "   Response: $(echo $body | head -c 100)..."
  elif [ "$http_code" = "501" ]; then
    echo -e "${YELLOW}⚠ Not Implemented ($http_code)${NC}"
  else
    echo -e "${RED}✗ Failed ($http_code)${NC}"
  fi
}

echo "📊 APIs Migradas"
echo "----------------"
test_endpoint "Standings" "GET" "/api/standings"
test_endpoint "Calendar" "GET" "/api/calendar"
test_endpoint "Predict (Miami)" "POST" "/api/predict" '{"raceName": "GP Miami", "favorite": {"type": "driver", "name": "Fernando Alonso"}}'
test_endpoint "Sim (OpenAI)" "POST" "/api/sim" '{}'

echo ""
echo "🔧 Edge State (requiere KV)"
echo "---------------------------"
test_endpoint "Get Edge State" "GET" "/api/get-edge-state"
test_endpoint "Init Edge State" "POST" "/api/init-edge-state" '{}'

echo ""
echo "👨‍💻 Engineer API (placeholders)"
echo "-------------------------------"
test_endpoint "Engineer Context" "GET" "/api/engineer/context?meeting_key=1234&session_type=Race"
test_endpoint "Engineer Telemetry" "GET" "/api/engineer/telemetry?meeting_key=1234&session_key=5678&driver_number=14"

echo ""
echo "❌ Error cases"
echo "--------------"
test_endpoint "Invalid endpoint" "GET" "/api/invalid"
test_endpoint "Predict sin body" "POST" "/api/predict" ''

echo ""
echo "✅ Tests completados"
