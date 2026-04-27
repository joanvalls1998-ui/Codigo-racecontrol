#!/bin/bash
# Full deployment script for RaceControl to Railway
set -e

GITHUB_TOKEN="$1"
RAILWAY_TOKEN="$2"

if [ -z "$GITHUB_TOKEN" ] || [ -z "$RAILWAY_TOKEN" ]; then
  echo "Usage: deploy.sh <GITHUB_TOKEN> <RAILWAY_TOKEN>"
  exit 1
fi

REPO_DIR="$HOME/.openclaw/workspace/Codigo-racecontrol"
cd "$REPO_DIR"

git remote set-url origin https://joanvalls1998-ui:$GITHUB_TOKEN@github.com/joanvalls1998-ui/Codigo-racecontrol.git
git config user.email "bot@openclaw.ai"
git config user.name "OpenClaw Bot"
git add -A
git commit -m "Railway deployment: railway.toml fix + all migrated files" || echo "Nothing to commit"
git push origin main

curl -X POST "https://api.railway.app/v1/projects/ce526803-0991-438e-9f1a-1626442f7c97/deployments" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json"

echo "Deploy triggered! Check Railway dashboard."
