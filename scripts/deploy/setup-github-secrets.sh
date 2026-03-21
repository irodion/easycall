#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

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

echo ""
echo -e "${GREEN}GitHub secrets configured! Verify with: gh secret list${NC}"
