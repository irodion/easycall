#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }

# Get project config
FIREBASE_PROJECT=$(cat .firebaserc 2>/dev/null | grep -o '"default": "[^"]*"' | cut -d'"' -f4 || true)
SITE_URL="${SITE_URL:-}"

if [ -z "$FIREBASE_PROJECT" ]; then
  fail ".firebaserc missing or malformed — cannot determine Firebase project"
  echo -e "\n${RED}Health check aborted.${NC}"
  exit 1
fi

header "Firebase Services Health Check"

# Check Firestore rules are deployed (by checking the project is accessible)
if firebase firestore:indexes --project "$FIREBASE_PROJECT" &>/dev/null; then
  ok "Firestore accessible (project: $FIREBASE_PROJECT)"
else
  fail "Cannot reach Firestore for project: $FIREBASE_PROJECT"
fi

# Check Cloud Functions are deployed
FUNCTIONS_LIST=$(firebase functions:list --project "$FIREBASE_PROJECT" 2>/dev/null || echo "")
if echo "$FUNCTIONS_LIST" | grep -q "generateJitsiJwt\|validatePairingCode\|onIncomingCall"; then
  ok "Cloud Functions deployed"
else
  fail "Cloud Functions not found — deploy with: bash scripts/deploy/deploy-firebase.sh --functions"
fi

if [ -n "$SITE_URL" ]; then
  header "Site Health Check ($SITE_URL)"

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    ok "Site responds with HTTP 200"
  else
    fail "Site returned HTTP $HTTP_STATUS"
  fi

  # Check service worker
  SW_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SITE_URL}/firebase-messaging-sw.js" 2>/dev/null || echo "000")
  if [ "$SW_STATUS" = "200" ]; then
    ok "Service worker accessible"
  else
    fail "Service worker not accessible (HTTP $SW_STATUS)"
  fi

  # Check manifest
  MANIFEST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SITE_URL}/manifest.webmanifest" 2>/dev/null || echo "000")
  if [ "$MANIFEST_STATUS" = "200" ]; then
    ok "PWA manifest accessible"
  else
    fail "PWA manifest not accessible (HTTP $MANIFEST_STATUS)"
  fi
else
  header "Site Health Check"
  echo -e "  ${YELLOW}Skipped — set SITE_URL env var to check (e.g., SITE_URL=https://easycall-dev.web.app)${NC}"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}Health check found $ERRORS issue(s).${NC}"
  exit 1
else
  echo -e "${GREEN}All health checks passed!${NC}"
fi
