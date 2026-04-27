#!/bin/bash
# Railway deployment diagnostics for RaceControl
set -e

REPO_DIR="$HOME/.openclaw/workspace/Codigo-racecontrol"
cd "$REPO_DIR"

ERRORS=0

echo "=== RaceControl Railway Diagnostics ==="
echo ""

# Check railway.toml
echo -n "Checking railway.toml... "
if [ -f "railway.toml" ]; then
  if grep -q "\[build\]" railway.toml && grep -q "\[deploy\]" railway.toml; then
    echo "✓ exists with valid sections"
  else
    echo "✗ missing [build] or [deploy] sections"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "✗ NOT FOUND"
  ERRORS=$((ERRORS + 1))
fi

# Check package.json
echo -n "Checking package.json... "
if [ -f "package.json" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('package.json'))" 2>/dev/null; then
    echo "✓ valid JSON"
  else
    echo "✗ invalid JSON"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "✗ NOT FOUND"
  ERRORS=$((ERRORS + 1))
fi

# Check server.js
echo -n "Checking server.js... "
if [ -f "server.js" ]; then
  echo "✓ exists"
else
  echo "✗ NOT FOUND"
  ERRORS=$((ERRORS + 1))
fi

# Check API files
echo "Checking API files..."
API_DIR="$REPO_DIR/api"
if [ -d "$API_DIR" ]; then
  for file in auth.js drivers.js teams.js races.js sessions.js results.js news.js users.js standings.js; do
    echo -n "  $file... "
    if [ -f "$API_DIR/$file" ]; then
      echo "✓"
    else
      echo "✗ MISSING"
      ERRORS=$((ERRORS + 1))
    fi
  done
else
  echo "  ✗ api/ directory not found"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "=== All checks passed! Ready for deployment. ==="
  exit 0
else
  echo "=== $ERRORS error(s) found. Fix before deploying. ==="
  exit 1
fi
