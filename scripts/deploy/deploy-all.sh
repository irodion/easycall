#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }

# Parse flags
DRY_RUN=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --firebase-project) export FIREBASE_PROJECT="$2"; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
  shift
done

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     EasyCall Production Deploy       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"

# Step 1: Install dependencies
header "Step 1/5: Installing dependencies"
pnpm install --frozen-lockfile
ok "Root dependencies installed"

# Step 2: Validate environment
header "Step 2/5: Validating environment"
bash "$SCRIPT_DIR/validate-env.sh"
ok "Environment validated"

# Step 3: Quality checks
if [ "$SKIP_TESTS" = false ]; then
  header "Step 3/5: Running quality checks"

  echo "  Running linter..."
  pnpm lint
  ok "Lint passed"

  echo "  Running type check..."
  pnpm exec tsc -b
  ok "Type check passed"

  echo "  Running tests..."
  pnpm test
  ok "Tests passed"
else
  header "Step 3/5: Skipping tests (--skip-tests)"
fi

# Step 4: Build PWA
header "Step 4/5: Building PWA"
pnpm build
ok "PWA built → dist/"

# Verify build output
if [ ! -f "dist/index.html" ] || [ ! -f "dist/firebase-messaging-sw.js" ]; then
  echo -e "${RED}Build output missing critical files!${NC}"
  exit 1
fi
ok "Build output verified (index.html, service worker present)"

if [ "$DRY_RUN" = true ]; then
  echo -e "\n${YELLOW}DRY RUN — skipping deploy steps.${NC}"
  echo -e "${GREEN}Build artifacts are in dist/ — ready for manual deploy.${NC}"
  exit 0
fi

# Step 5: Deploy Firebase (rules, functions, hosting)
header "Step 5/5: Deploying to Firebase"
bash "$SCRIPT_DIR/deploy-firebase.sh" --all ${FIREBASE_PROJECT:+--project "$FIREBASE_PROJECT"}
ok "Firebase deployed (rules + functions + hosting)"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment complete!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"

# Run health check
header "Running post-deploy health check"
bash "$SCRIPT_DIR/health-check.sh" || true
