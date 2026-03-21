#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
info() { echo -e "  $1"; }

echo -e "${BLUE}╔═════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   EasyCall Production Setup Assistant   ║${NC}"
echo -e "${BLUE}╚═════════════════════════════════════════╝${NC}"

# Check firebase CLI
if ! command -v firebase &>/dev/null; then
  echo -e "${RED}firebase CLI not found. Install: npm install -g firebase-tools${NC}"
  exit 1
fi

header "Step 1: Firebase Authentication"
if firebase projects:list --limit 1 &>/dev/null; then
  ok "Already authenticated"
else
  echo "  Opening browser for Firebase login..."
  firebase login
fi

header "Step 2: Create or select Firebase project"
echo "  Current projects:"
firebase projects:list 2>/dev/null | head -20

echo ""
read -p "  Enter production project ID (or 'new' to create one): " PROJECT_ID

if [ "$PROJECT_ID" = "new" ]; then
  read -p "  Enter new project ID (e.g., easycall-prod): " PROJECT_ID
  read -p "  Enter display name (e.g., EasyCall Production): " DISPLAY_NAME
  firebase projects:create "$PROJECT_ID" --display-name "$DISPLAY_NAME"
  ok "Project created: $PROJECT_ID"
fi

header "Step 3: Configure .firebaserc for production"
# Add production alias
cat > .firebaserc.production <<EOF
{
  "projects": {
    "default": "easycall-dev",
    "production": "$PROJECT_ID"
  }
}
EOF
ok "Generated .firebaserc.production (review and merge into .firebaserc)"
info "To use: firebase use production"

header "Step 4: Enable Firebase services"
echo -e "  ${YELLOW}The following services must be enabled manually in Firebase Console:${NC}"
echo "  1. Authentication → Sign-in methods → Enable Anonymous + Email/Password"
echo "     URL: https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers"
echo ""
echo "  2. Firestore Database → Create database (production mode)"
echo "     URL: https://console.firebase.google.com/project/$PROJECT_ID/firestore"
echo ""
echo "  3. Realtime Database → Create database"
echo "     URL: https://console.firebase.google.com/project/$PROJECT_ID/database"
echo ""
echo "  4. Cloud Messaging → Generate VAPID key pair"
echo "     URL: https://console.firebase.google.com/project/$PROJECT_ID/settings/cloudmessaging"
echo ""
read -p "  Press Enter when you've completed the above steps..."

header "Step 5: Deploy security rules"
firebase deploy --only firestore:rules,firestore:indexes,database --project "$PROJECT_ID"
ok "Security rules deployed"

header "Step 6: Deploy Cloud Functions"
(cd functions && pnpm install --frozen-lockfile)
firebase deploy --only functions --project "$PROJECT_ID"
ok "Cloud Functions deployed"

header "Step 7: Get Firebase config for .env.production"
echo ""
echo "  Run the following to get your web app config:"
echo "  firebase apps:sdkconfig web --project $PROJECT_ID"
echo ""
echo "  Or find it in Firebase Console → Project Settings → General → Your apps → Web app"
echo ""

# Try to get it automatically
if firebase apps:list --project "$PROJECT_ID" 2>/dev/null | grep -q "WEB"; then
  echo "  Attempting to fetch config automatically..."
  firebase apps:sdkconfig web --project "$PROJECT_ID" 2>/dev/null || true
fi

header "Step 8: GitHub Secrets Setup"
echo "  Set these secrets in your GitHub repo (Settings → Secrets → Actions):"
echo ""
echo "  Firebase/App secrets (from Firebase Console):"
echo "    VITE_FIREBASE_API_KEY"
echo "    VITE_FIREBASE_AUTH_DOMAIN"
echo "    VITE_FIREBASE_PROJECT_ID"
echo "    VITE_FIREBASE_STORAGE_BUCKET"
echo "    VITE_FIREBASE_MESSAGING_SENDER_ID"
echo "    VITE_FIREBASE_APP_ID"
echo "    VITE_FIREBASE_VAPID_KEY"
echo "    VITE_JAAS_APP_ID"
echo ""
echo "  Firebase service account key (for deploy):"
echo "    FIREBASE_SERVICE_ACCOUNT_KEY — base64 JSON key from:"
echo "    https://console.firebase.google.com/project/$PROJECT_ID/settings/serviceaccounts/adminsdk"
echo ""

echo -e "${GREEN}╔═════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup guide complete!                 ║${NC}"
echo -e "${GREEN}║   Next: fill in .env.production         ║${NC}"
echo -e "${GREEN}║   Then: bash scripts/deploy/deploy-all.sh ║${NC}"
echo -e "${GREEN}╚═════════════════════════════════════════╝${NC}"
