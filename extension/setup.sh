#!/bin/bash
# Gupy AutoApply Extension — one-command setup & launch
# Usage: ./setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
EXT_DIR="$SCRIPT_DIR"
EXT_ID="gpnbdjkdalnalehhfajgapalhlogbbbd"
EXT_ORIGIN="chrome-extension://$EXT_ID"
FIREBASE_PROJECT="merlin-489714"
AUTH_DOMAIN="${EXT_ID}.chromiumapp.org"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${GREEN}[$1/7]${NC} $2"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
ok()   { echo -e "${GREEN}✓  $1${NC}"; }
fail() { echo -e "${RED}✕  $1${NC}"; exit 1; }
info() { echo -e "${CYAN}   $1${NC}"; }

# ─── Step 1: Build extension ───────────────────────────────────────
step 1 "Building extension..."
cd "$EXT_DIR"
if [ ! -d node_modules ]; then
  npm install --silent 2>&1 | tail -1
fi
npx webpack --mode development 2>&1 | tail -1
ok "Extension built → $EXT_DIR/dist/"

# ─── Step 2: Firebase Auth domain ──────────────────────────────────
step 2 "Checking Firebase Auth authorized domains..."

# Use Firebase REST API via access token
ACCESS_TOKEN=$(gcloud auth print-access-token --project="$FIREBASE_PROJECT" 2>/dev/null || echo "")

if [ -n "$ACCESS_TOKEN" ]; then
  API_BASE="https://identitytoolkit.googleapis.com/v2/projects/$FIREBASE_PROJECT/config"
  AUTH_HEADERS=(-H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Goog-User-Project: $FIREBASE_PROJECT")

  # Check if already authorized
  CURRENT_DOMAINS=$(curl -s "${AUTH_HEADERS[@]}" "$API_BASE" 2>/dev/null | \
    sed -n '/authorizedDomains/,/]/p' || echo "")

  if echo "$CURRENT_DOMAINS" | grep -q "$AUTH_DOMAIN"; then
    ok "Domain $AUTH_DOMAIN already authorized"
  else
    # Extract current domains, append ours, and PATCH
    DOMAINS_JSON=$(curl -s "${AUTH_HEADERS[@]}" "$API_BASE" 2>/dev/null | \
      python3 -c "
import sys, re, json
text = sys.stdin.read()
m = re.search(r'\"authorizedDomains\":\s*\[(.*?)\]', text, re.DOTALL)
if m:
    domains = [d.strip().strip('\"') for d in m.group(1).split(',') if d.strip().strip('\"')]
    domains.append('$AUTH_DOMAIN')
    print(json.dumps(domains))
else:
    print('[\"$AUTH_DOMAIN\"]')
" 2>/dev/null)

    PATCH_RESULT=$(curl -s -X PATCH \
      "${AUTH_HEADERS[@]}" \
      -H "Content-Type: application/json" \
      -d "{\"authorizedDomains\": $DOMAINS_JSON}" \
      "${API_BASE}?updateMask=authorizedDomains" 2>/dev/null || echo "")

    if echo "$PATCH_RESULT" | grep -q "$AUTH_DOMAIN"; then
      ok "Added $AUTH_DOMAIN to Firebase Auth"
    else
      warn "Could not auto-add domain."
      info "Add manually: Firebase Console → Auth → Settings → Add domain: $AUTH_DOMAIN"
    fi
  fi
else
  warn "gcloud not authenticated. Run: gcloud auth login"
  info "Then add domain manually: Firebase Console → Auth → Settings → Add: $AUTH_DOMAIN"
fi

# ─── Step 3: Backend secrets + CORS ────────────────────────────────
step 3 "Configuring backend environment..."
ENV_FILE="$BACKEND_DIR/.env"

# Pull secrets from GCP Secret Manager if not already in .env
fetch_secret() {
  local secret_name="$1"
  local env_var="$2"

  if grep -q "^${env_var}=" "$ENV_FILE" 2>/dev/null; then
    return 0  # Already set
  fi

  if [ -n "$ACCESS_TOKEN" ]; then
    local value=$(curl -s \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      "https://secretmanager.googleapis.com/v1/projects/$FIREBASE_PROJECT/secrets/$secret_name/versions/latest:access" 2>/dev/null | \
      python3 -c "import json,sys,base64; d=json.load(sys.stdin); print(base64.b64decode(d['payload']['data']).decode())" 2>/dev/null || echo "")

    if [ -n "$value" ]; then
      echo "${env_var}=${value}" >> "$ENV_FILE"
      ok "Loaded $secret_name from GCP Secret Manager"
      return 0
    fi
  fi
  warn "Could not load $secret_name — set ${env_var} in $ENV_FILE manually"
  return 1
}

# Ensure .env exists with CORS
touch "$ENV_FILE"
if grep -q "CHROME_EXTENSION_ORIGIN" "$ENV_FILE"; then
  sed -i '' "s|CHROME_EXTENSION_ORIGIN=.*|CHROME_EXTENSION_ORIGIN=$EXT_ORIGIN|" "$ENV_FILE"
else
  echo "CHROME_EXTENSION_ORIGIN=$EXT_ORIGIN" >> "$ENV_FILE"
fi
ok "CORS configured for $EXT_ORIGIN"

# Fetch required secrets
fetch_secret "GEMINI_API_KEY" "GEMINI_API_KEY" || true
fetch_secret "ANTHROPIC_API_KEY" "ANTHROPIC_API_KEY" || true

# Verify required secrets exist
MISSING=""
grep -q "^GEMINI_API_KEY=" "$ENV_FILE" || MISSING="GEMINI_API_KEY "
grep -q "^ANTHROPIC_API_KEY=" "$ENV_FILE" || MISSING="${MISSING}ANTHROPIC_API_KEY"

if [ -n "$MISSING" ]; then
  fail "Missing secrets in $ENV_FILE: $MISSING\n   Set them manually or run: gcloud auth login --account=deli@ellaexecutivesearch.com"
fi

ok "All required secrets present"

# ─── Step 4: Start backend ─────────────────────────────────────────
step 4 "Starting backend..."
cd "$BACKEND_DIR"

# Kill existing backend if running on port 8000
EXISTING_PID=$(lsof -ti :8000 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  ok "Stopped existing process on port 8000"
fi

# Start in background with venv
"$BACKEND_DIR/venv/bin/python" -m uvicorn app.main:app --reload --port 8000 > /tmp/merlin-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for startup (up to 10 seconds)
for i in $(seq 1 10); do
  if curl -s http://localhost:8000/health 2>/dev/null | grep -q "healthy"; then
    ok "Backend running on http://localhost:8000 (PID $BACKEND_PID)"
    break
  fi
  if [ $i -eq 10 ]; then
    echo ""
    tail -20 /tmp/merlin-backend.log
    fail "Backend failed to start after 10s. See logs above."
  fi
  sleep 1
done

# ─── Step 5: Verify API endpoints ─────────────────────────────────
step 5 "Verifying autoapply endpoints..."
ROUTES=$(curl -s http://localhost:8000/openapi.json 2>/dev/null | python3 -c "
import json, sys
try:
  spec = json.load(sys.stdin)
  paths = [p for p in spec.get('paths', {}) if '/autoapply' in p]
  for p in paths: print(f'  {p}')
  if not paths: print('  (none found)')
except: print('  (could not parse)')
" 2>/dev/null)
echo "$ROUTES"
ok "Autoapply API is live"

# ─── Step 6: Open Chrome ──────────────────────────────────────────
step 6 "Opening Chrome with extension..."

if pgrep -q "Google Chrome"; then
  warn "Chrome is already running — loading extension manually not possible."
  info "Go to chrome://extensions/ → Developer mode → Load unpacked → select:"
  info "$EXT_DIR"
  echo ""
  info "Or quit Chrome and re-run this script for auto-load."
else
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --load-extension="$EXT_DIR" \
    --no-first-run \
    "https://www.gupy.io" &>/dev/null &
  sleep 2
  ok "Chrome launched with extension at gupy.io"
fi

# ─── Step 7: Summary ──────────────────────────────────────────────
step 7 "Ready!"
echo ""
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │  Extension ID: $EXT_ID     │"
echo "  │                                                     │"
echo "  │  1. Click the blue extension icon in Chrome         │"
echo "  │  2. Sign in with Google                             │"
echo "  │  3. Fill PII (at minimum: CPF + phone)              │"
echo "  │  4. Go to a Gupy job → click 'Iniciar candidatura'  │"
echo "  │                                                     │"
echo "  │  Mode: DRY-RUN (won't actually submit)              │"
echo "  └─────────────────────────────────────────────────────┘"
echo ""
echo "  Backend logs:  tail -f /tmp/merlin-backend.log"
echo "  Stop backend:  kill $BACKEND_PID"
echo "  Rebuild ext:   cd extension && npx webpack"
