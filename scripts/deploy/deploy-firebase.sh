#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }

# Parse flags
DEPLOY_RULES=false
DEPLOY_FUNCTIONS=false
DEPLOY_HOSTING=false
DEPLOY_ALL=false

if [ $# -eq 0 ]; then
  DEPLOY_ALL=true
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rules) DEPLOY_RULES=true ;;
    --functions) DEPLOY_FUNCTIONS=true ;;
    --hosting) DEPLOY_HOSTING=true ;;
    --all) DEPLOY_ALL=true ;;
    --project) FIREBASE_PROJECT="$2"; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
  shift
done

if [ "$DEPLOY_ALL" = true ]; then
  DEPLOY_RULES=true
  DEPLOY_FUNCTIONS=true
  DEPLOY_HOSTING=true
fi

# Optional project override
PROJECT_FLAG=""
if [ -n "${FIREBASE_PROJECT:-}" ]; then
  PROJECT_FLAG="--project $FIREBASE_PROJECT"
  echo -e "${YELLOW}Using Firebase project: $FIREBASE_PROJECT${NC}"
fi

if [ "$DEPLOY_RULES" = true ]; then
  header "Deploying Firestore rules"
  firebase deploy --only firestore:rules $PROJECT_FLAG
  ok "Firestore rules deployed"

  header "Deploying Firestore indexes"
  firebase deploy --only firestore:indexes $PROJECT_FLAG
  ok "Firestore indexes deployed"

  header "Deploying Realtime Database rules"
  firebase deploy --only database $PROJECT_FLAG
  ok "RTDB rules deployed"
fi

if [ "$DEPLOY_FUNCTIONS" = true ]; then
  header "Installing Cloud Functions dependencies"
  (cd functions && pnpm install --frozen-lockfile)
  ok "Dependencies installed"

  header "Building Cloud Functions"
  (cd functions && pnpm run build)
  ok "Functions built"

  header "Deploying Cloud Functions"
  firebase deploy --only functions $PROJECT_FLAG
  ok "Cloud Functions deployed"
fi

if [ "$DEPLOY_HOSTING" = true ]; then
  header "Deploying to Firebase Hosting"
  if [ ! -d "dist" ]; then
    echo -e "${RED}dist/ not found — run 'pnpm build' first${NC}"
    exit 1
  fi
  firebase deploy --only hosting $PROJECT_FLAG
  ok "Firebase Hosting deployed"
fi

echo ""
echo -e "${GREEN}Firebase deployment complete!${NC}"
