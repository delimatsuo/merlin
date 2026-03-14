#!/usr/bin/env bash
# One-time setup: Workload Identity Federation for GitHub Actions → GCP
# Run this locally with: bash scripts/setup-cicd.sh
#
# Prerequisites:
#   - gcloud CLI authenticated as deli@ellaexecutivesearch.com
#   - Owner or Editor role on merlin-489714
#   - GitHub CLI (gh) authenticated

set -euo pipefail

PROJECT_ID="merlin-489714"
PROJECT_NUMBER="531233742939"
GITHUB_REPO="delimatsuo/merlin"
SA_NAME="github-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_REGION="southamerica-east1"
POOL_NAME="github-actions"
PROVIDER_NAME="github-oidc"

echo "=== Verifying gcloud account ==="
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
echo "Active account: $ACCOUNT"
if [[ "$ACCOUNT" != "deli@ellaexecutivesearch.com" ]]; then
  echo "WARNING: Expected deli@ellaexecutivesearch.com, got $ACCOUNT"
  echo "Run: gcloud config set account deli@ellaexecutivesearch.com"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

echo ""
echo "=== Step 1: Enable required APIs ==="
gcloud services enable \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  run.googleapis.com \
  firebasehosting.googleapis.com \
  --project "$PROJECT_ID"

echo ""
echo "=== Step 2: Create deployment service account ==="
if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" &>/dev/null; then
  echo "Service account $SA_EMAIL already exists, skipping creation."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deploy" \
    --description="Used by GitHub Actions CI/CD via Workload Identity Federation" \
    --project "$PROJECT_ID"
fi

echo ""
echo "=== Step 2b: Create Artifact Registry repository ==="
if gcloud artifacts repositories describe merlin \
  --location="$CLOUD_RUN_REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Artifact Registry repo 'merlin' already exists, skipping."
else
  gcloud artifacts repositories create merlin \
    --repository-format=docker \
    --location="southamerica-east1" \
    --description="Merlin Docker images" \
    --project="$PROJECT_ID"
fi

echo ""
echo "=== Step 3: Grant IAM roles to deploy SA ==="
ROLES=(
  "roles/firebasehosting.admin"     # Deploy to Firebase Hosting
  "roles/firebase.developAdmin"     # Firebase CLI needs broader perms for hosting
  "roles/run.developer"             # Deploy to Cloud Run
  "roles/artifactregistry.writer"   # Push Docker images
  "roles/iam.serviceAccountUser"    # Act as Cloud Run runtime SA
  "roles/storage.objectViewer"      # Read Cloud Storage (for builds)
)

for ROLE in "${ROLES[@]}"; do
  echo "  Granting $ROLE..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None \
    --quiet
done

echo ""
echo "=== Step 4: Create Workload Identity Pool ==="
if gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" --project="$PROJECT_ID" &>/dev/null; then
  echo "Pool $POOL_NAME already exists, skipping."
else
  gcloud iam workload-identity-pools create "$POOL_NAME" \
    --location="global" \
    --display-name="GitHub Actions" \
    --description="WIF pool for GitHub Actions CI/CD" \
    --project="$PROJECT_ID"
fi

echo ""
echo "=== Step 5: Create OIDC Provider ==="
if gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --workload-identity-pool="$POOL_NAME" \
  --location="global" --project="$PROJECT_ID" &>/dev/null; then
  echo "Provider $PROVIDER_NAME already exists, skipping."
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --workload-identity-pool="$POOL_NAME" \
    --location="global" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
    --project="$PROJECT_ID"
fi

echo ""
echo "=== Step 6: Allow GitHub repo to impersonate deploy SA ==="
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
  --project="$PROJECT_ID"

echo ""
echo "=== Step 7: Add GitHub secrets ==="
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"

echo "Setting GitHub secrets via gh CLI..."
echo "$WIF_PROVIDER" | gh secret set WIF_PROVIDER --repo "$GITHUB_REPO"
echo "$SA_EMAIL" | gh secret set WIF_SERVICE_ACCOUNT --repo "$GITHUB_REPO"
echo "AIzaSyAPhPf4qzo94WplQwQl9gbjauBbFOi7J3w" | gh secret set FIREBASE_API_KEY --repo "$GITHUB_REPO"
echo "https://merlin-backend-531233742939.southamerica-east1.run.app" | gh secret set API_URL --repo "$GITHUB_REPO"

echo ""
echo "============================================"
echo "SETUP COMPLETE"
echo "============================================"
echo ""
echo "WIF Provider:     $WIF_PROVIDER"
echo "Service Account:  $SA_EMAIL"
echo ""
echo "GitHub Secrets set:"
echo "  WIF_PROVIDER       = $WIF_PROVIDER"
echo "  WIF_SERVICE_ACCOUNT = $SA_EMAIL"
echo "  FIREBASE_API_KEY   = (set)"
echo "  API_URL            = (set)"
echo ""
echo "Wait ~5 minutes for IAM to propagate, then push to staging to test."
echo "============================================"
