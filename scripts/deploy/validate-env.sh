#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

header "Checking required CLI tools"

for cmd in node pnpm firebase gh; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd ($(command -v "$cmd"))"
  else
    fail "$cmd not found — install it first"
  fi
done

# Check node version >= 20
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -ge 20 ]; then
  ok "Node.js v$(node -v | sed 's/v//') (>= 20 required)"
else
  fail "Node.js $(node -v) too old — need >= 20"
fi

header "Checking Firebase authentication"

if firebase projects:list &>/dev/null; then
  ok "Firebase CLI authenticated"
else
  fail "Firebase CLI not authenticated — run: firebase login"
fi

header "Checking Firebase project"

FIREBASE_PROJECT=$(cat .firebaserc 2>/dev/null | grep -o '"default": "[^"]*"' | cut -d'"' -f4)
if [ -n "$FIREBASE_PROJECT" ]; then
  ok "Firebase project: $FIREBASE_PROJECT"
else
  fail ".firebaserc missing or no default project set"
fi

header "Checking environment files"

# Check for production env (passed as arg or .env.production)
ENV_FILE="${1:-.env.production}"
if [ -f "$ENV_FILE" ]; then
  ok "Environment file: $ENV_FILE"

  # Validate required VITE_ vars
  for var in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
             VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID \
             VITE_FIREBASE_VAPID_KEY; do
    val=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
    if [ -n "$val" ]; then
      ok "$var is set"
    else
      fail "$var is missing or empty in $ENV_FILE"
    fi
  done

  # Optional but recommended
  db_url=$(grep "^VITE_FIREBASE_DATABASE_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
  if [ -n "$db_url" ]; then
    ok "VITE_FIREBASE_DATABASE_URL is set"
  else
    warn "VITE_FIREBASE_DATABASE_URL not set — RTDB will derive URL from projectId"
  fi
else
  warn "No $ENV_FILE found — using .env.local for dev deploy"
fi

# Check functions env
if [ -f "functions/.env" ]; then
  ok "functions/.env exists"
  for var in JAAS_APP_ID JAAS_KEY_ID JAAS_PRIVATE_KEY; do
    if grep -q "${var}=" functions/.env 2>/dev/null; then
      ok "Functions: $var is set"
    else
      fail "Functions: $var missing in functions/.env"
    fi
  done
else
  fail "functions/.env not found — Cloud Functions will fail"
fi

header "Checking build prerequisites"

if [ -f "pnpm-lock.yaml" ]; then
  ok "pnpm-lock.yaml exists"
else
  fail "pnpm-lock.yaml missing — run: pnpm install"
fi

if [ -d "node_modules" ]; then
  ok "node_modules exists"
else
  fail "node_modules missing — run: pnpm install"
fi

if [ -d "functions/node_modules" ]; then
  ok "functions/node_modules exists"
else
  fail "functions/node_modules missing — run: cd functions && pnpm install"
fi

header "Checking PWA assets"

for icon in public/pwa-192x192.png public/pwa-512x512.png public/apple-touch-icon.png public/favicon.svg; do
  if [ -f "$icon" ]; then
    ok "$icon"
  else
    fail "Missing PWA icon: $icon"
  fi
done

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}Pre-deploy validation failed with $ERRORS error(s).${NC}"
  exit 1
else
  echo -e "${GREEN}All pre-deploy checks passed!${NC}"
fi
