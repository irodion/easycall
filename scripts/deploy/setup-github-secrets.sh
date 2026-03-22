#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

if ! command -v gh &>/dev/null; then
  echo -e "${RED}gh CLI not found. Install: brew install gh${NC}"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo -e "${RED}Not authenticated. Run: gh auth login${NC}"
  exit 1
fi

ENV_FILE="${1:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}$ENV_FILE not found.${NC}"
  echo "Usage: $0 [env-file]"
  echo "Example: $0 .env.production"
  exit 1
fi

echo -e "${YELLOW}Setting GitHub Actions secrets from $ENV_FILE${NC}"
echo ""

# Read VITE_ vars from env file
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue

  # Trim whitespace
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)

  if [ -n "$value" ]; then
    gh secret set "$key" --body "$value"
    ok "Set $key"
  else
    fail "Skipped $key (empty value)"
  fi
done < "$ENV_FILE"

echo ""

# Prompt for additional secrets not in env file
echo -e "${YELLOW}Additional secrets needed (not in env file):${NC}"
echo ""

read -p "  FIREBASE_SERVICE_ACCOUNT_KEY (paste base64 JSON, or 'skip'): " SA_KEY
if [ "$SA_KEY" != "skip" ] && [ -n "$SA_KEY" ]; then
  gh secret set FIREBASE_SERVICE_ACCOUNT_KEY --body "$SA_KEY"
  ok "Set FIREBASE_SERVICE_ACCOUNT_KEY"
fi

# JAAS secrets for Cloud Functions (from functions/.env or manual input)
echo ""
echo -e "${YELLOW}JaaS secrets for Cloud Functions (from https://jaas.8x8.vc/#/apikeys):${NC}"
if [ -f "functions/.env" ]; then
  for var in JAAS_APP_ID JAAS_KEY_ID; do
    val=$(grep "^[[:space:]]*${var}=" functions/.env 2>/dev/null | cut -d= -f2- | xargs || true)
    if [ -n "$val" ]; then
      gh secret set "$var" --body "$val"
      ok "Set $var (from functions/.env)"
    else
      warn "$var not found in functions/.env — skipping (set manually with: gh secret set $var)"
    fi
  done

  # JAAS_PRIVATE_KEY needs special handling — it's multi-line PEM
  PRIVATE_KEY=$(sed -n '/^[[:space:]]*JAAS_PRIVATE_KEY=/,/-----END PRIVATE KEY-----/p' functions/.env | sed '1s/^[[:space:]]*JAAS_PRIVATE_KEY=//' | tr -d '"')
  if [ -n "$PRIVATE_KEY" ]; then
    gh secret set JAAS_PRIVATE_KEY --body "$PRIVATE_KEY"
    ok "Set JAAS_PRIVATE_KEY (from functions/.env)"
  else
    warn "JAAS_PRIVATE_KEY not found in functions/.env — skipping (set manually with: gh secret set JAAS_PRIVATE_KEY)"
  fi
else
  warn "functions/.env not found — set JAAS secrets manually:"
  echo "    gh secret set JAAS_APP_ID --body '<value>'"
  echo "    gh secret set JAAS_KEY_ID --body '<value>'"
  echo "    gh secret set JAAS_PRIVATE_KEY < path/to/private-key.pem"
fi

echo ""
echo -e "${GREEN}GitHub secrets configured! Verify with: gh secret list${NC}"
