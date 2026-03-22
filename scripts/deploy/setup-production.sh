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

# Check required CLIs
for cmd in firebase pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}$cmd not found. Install it before running this script.${NC}"
    exit 1
  fi
done

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

header "Step 6: Configure JaaS (Jitsi) secrets for Cloud Functions"
echo "  Cloud Functions need JaaS credentials to generate Jitsi meeting tokens."
echo "  Get these from: https://jaas.8x8.vc/#/apikeys"
echo ""
if [ -f "functions/.env" ] && grep -q "JAAS_APP_ID=" functions/.env; then
  ok "functions/.env already exists with JAAS config"
else
  read -r -p "  JAAS_APP_ID: " JAAS_APP_ID
  read -r -p "  JAAS_KEY_ID: " JAAS_KEY_ID
  echo "  JAAS_PRIVATE_KEY: paste the private key, replacing newlines with \\n"
  read -r -p "  > " JAAS_PRIVATE_KEY
  printf 'JAAS_APP_ID=%s\nJAAS_KEY_ID=%s\nJAAS_PRIVATE_KEY=%s\n' \
    "$JAAS_APP_ID" "$JAAS_KEY_ID" "$JAAS_PRIVATE_KEY" > functions/.env
  ok "functions/.env created"
fi

header "Step 7: Set up IAM roles for CI/CD deploy"
echo "  Granting required IAM roles to the deploy service account..."

# Determine service account email — prefer extracting from JSON key if available
SA_EMAIL=""
read -r -p "  Path to service account JSON key (or Enter to use default): " SA_KEY_PATH
if [ -n "$SA_KEY_PATH" ] && [ -f "$SA_KEY_PATH" ]; then
  SA_EMAIL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['client_email'])" "$SA_KEY_PATH" 2>/dev/null || true)
fi
if [ -z "$SA_EMAIL" ]; then
  SA_EMAIL="firebase-adminsdk-fbsvc@${PROJECT_ID}.iam.gserviceaccount.com"
  warn "Using default service account: $SA_EMAIL"
  echo "  If CI uses a different service account, re-run with the JSON key path."
else
  ok "Service account from key: $SA_EMAIL"
fi

if command -v gcloud &>/dev/null; then
  for role in roles/firebase.admin roles/cloudfunctions.admin roles/firebasehosting.admin \
              roles/firebaserules.admin roles/iam.serviceAccountUser roles/artifactregistry.admin; do
    if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:$SA_EMAIL" \
      --role="$role" \
      --condition=None --quiet --format="none" 2>/dev/null; then
      ok "Granted $role"
    else
      echo -e "  ${RED}✗ Failed to grant $role — check permissions${NC}"
      exit 1
    fi
  done
  if gcloud services enable cloudbilling.googleapis.com --project="$PROJECT_ID" --quiet 2>/dev/null; then
    ok "Cloud Billing API enabled"
  else
    echo -e "  ${RED}✗ Failed to enable Cloud Billing API${NC}"
    exit 1
  fi
else
  warn "gcloud CLI not found — set IAM roles manually in Google Cloud Console"
  echo "  Required roles for $SA_EMAIL:"
  echo "    - Firebase Admin"
  echo "    - Cloud Functions Admin"
  echo "    - Firebase Hosting Admin"
  echo "    - Firebase Rules Admin"
  echo "    - Service Account User"
  echo "    - Artifact Registry Admin"
  echo "  Also enable Cloud Billing API for the project."
fi

header "Step 8: Deploy Cloud Functions"
(cd functions && pnpm install --frozen-lockfile && pnpm run build)
firebase deploy --only functions --project "$PROJECT_ID"
ok "Cloud Functions deployed"

header "Step 9: Get Firebase config for .env.production"
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

header "Step 10: GitHub Secrets Setup"
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
echo "  JaaS secrets (for Cloud Functions — from https://jaas.8x8.vc/#/apikeys):"
echo "    JAAS_APP_ID"
echo "    JAAS_KEY_ID"
echo "    JAAS_PRIVATE_KEY"
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
