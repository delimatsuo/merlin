#!/bin/bash
# Gupy AutoApply Extension — one-command setup & launch
# Usage: ./setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
EXT_DIR="$SCRIPT_DIR"
EXT_ID="pckpedgciidgclkelofcicgaeelcicea"
EXT_ORIGIN="chrome-extension://$EXT_ID"
FIREBASE_PROJECT="merlin-489714"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${GREEN}[$1/7]${NC} $2"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✕ $1${NC}"; exit 1; }

# ─── Step 1: Build extension ───────────────────────────────────────
step 1 "Building extension..."
cd "$EXT_DIR"
if [ ! -d node_modules ]; then
  npm install --silent
fi
npx webpack --mode development 2>&1 | tail -1
ok "Extension built → $EXT_DIR/dist/"

# ─── Step 2: Add Firebase authorized domain ────────────────────────
step 2 "Adding Chrome extension domain to Firebase Auth..."
AUTH_DOMAIN="${EXT_ID}.chromiumapp.org"

# Check if already added (Firebase CLI doesn't have a direct "list domains" command,
# so we use the REST API via gcloud)
EXISTING=$(gcloud alpha identity-platform config describe \
  --project="$FIREBASE_PROJECT" \
  --format="value(authorizedDomains)" 2>/dev/null || echo "")

if echo "$EXISTING" | grep -q "$AUTH_DOMAIN"; then
  ok "Domain $AUTH_DOMAIN already authorized"
else
  # Use firebase auth:import or the REST API to add the domain
  # Firebase CLI doesn't expose domain management directly, so we use gcloud
  gcloud alpha identity-platform config update \
    --project="$FIREBASE_PROJECT" \
    --add-authorized-domains="$AUTH_DOMAIN" 2>/dev/null && \
    ok "Added $AUTH_DOMAIN to Firebase authorized domains" || \
    warn "Could not auto-add domain. Add manually: Firebase Console → Authentication → Settings → Authorized domains → Add '$AUTH_DOMAIN'"
fi

# ─── Step 3: Set CORS for local backend ────────────────────────────
step 3 "Configuring CORS for extension..."
ENV_FILE="$BACKEND_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  # Update existing
  if grep -q "CHROME_EXTENSION_ORIGIN" "$ENV_FILE"; then
    sed -i '' "s|CHROME_EXTENSION_ORIGIN=.*|CHROME_EXTENSION_ORIGIN=$EXT_ORIGIN|" "$ENV_FILE"
  else
    echo "CHROME_EXTENSION_ORIGIN=$EXT_ORIGIN" >> "$ENV_FILE"
  fi
else
  echo "CHROME_EXTENSION_ORIGIN=$EXT_ORIGIN" > "$ENV_FILE"
fi
ok "Set CHROME_EXTENSION_ORIGIN=$EXT_ORIGIN in $ENV_FILE"

# ─── Step 4: Start backend ─────────────────────────────────────────
step 4 "Starting backend..."
cd "$BACKEND_DIR"

# Kill existing backend if running
EXISTING_PID=$(lsof -ti :8000 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  ok "Stopped existing backend (PID $EXISTING_PID)"
fi

# Start in background
source "$BACKEND_DIR/venv/bin/activate"
CHROME_EXTENSION_ORIGIN="$EXT_ORIGIN" \
  nohup uvicorn app.main:app --reload --port 8000 > /tmp/merlin-backend.log 2>&1 &
BACKEND_PID=$!
sleep 2

# Verify it's running
if curl -s http://localhost:8000/health | grep -q "healthy"; then
  ok "Backend running on http://localhost:8000 (PID $BACKEND_PID)"
  ok "Logs: tail -f /tmp/merlin-backend.log"
else
  fail "Backend failed to start. Check: tail -f /tmp/merlin-backend.log"
fi

# ─── Step 5: Verify extension ID ──────────────────────────────────
step 5 "Extension details"
echo "  Extension ID:  $EXT_ID"
echo "  Origin:        $EXT_ORIGIN"
echo "  Auth domain:   $AUTH_DOMAIN"
echo "  API target:    http://localhost:8000 (dev mode auto-detected)"

# ─── Step 6: Open Chrome with extension ────────────────────────────
step 6 "Opening Chrome..."

# Check if Chrome is running
if pgrep -q "Google Chrome"; then
  warn "Chrome is already running. Load the extension manually:"
  echo "  1. Go to chrome://extensions/"
  echo "  2. Enable Developer mode"
  echo "  3. Click 'Load unpacked' → select: $EXT_DIR"
  echo ""
  echo "  Or close Chrome and re-run this script to auto-load."
else
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --load-extension="$EXT_DIR" \
    --no-first-run \
    "https://www.gupy.io" &
  ok "Chrome launched with extension loaded"
fi

# ─── Step 7: Summary ──────────────────────────────────────────────
step 7 "Ready to test!"
echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  1. Click the blue extension icon in Chrome      │"
echo "  │  2. Sign in with Google                          │"
echo "  │  3. Fill PII profile (CPF + phone minimum)       │"
echo "  │  4. Navigate to a Gupy job listing               │"
echo "  │  5. Click 'Iniciar candidatura'                  │"
echo "  │                                                   │"
echo "  │  Mode is DRY-RUN by default (won't submit)       │"
echo "  └─────────────────────────────────────────────────┘"
echo ""
echo "  Stop backend: kill $BACKEND_PID"
echo "  Backend logs: tail -f /tmp/merlin-backend.log"
