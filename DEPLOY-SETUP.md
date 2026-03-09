# Deployment Setup Log

**Generated**: 2026-03-09
**Generator**: /deploy-setup v1
**Platform**: Firebase Hosting + Cloud Run
**Config schema**: v1

## What Was Configured

- [x] Deploy config: `.claude/deploy-config.yaml`
- [x] GitHub Actions: `.github/workflows/deploy.yml` (starter)
- [x] GitHub Actions: `.github/workflows/rollback.yml` (starter)
- [skip] Dockerfile: already exists at `backend/Dockerfile`
- [skip] Docker ignore: not generated (backend already has Dockerfile setup)
- [ ] Staging branch: not yet created (no initial commit exists)

## Detected Configuration

| Item | Value | Source |
|------|-------|--------|
| Stack | Next.js 16 + TypeScript (frontend), Python 3.12 FastAPI (backend) | package.json, Dockerfile |
| Platform | Firebase Hosting + Cloud Run | firebase.json, Dockerfile, cloudbuild.yaml |
| GCP Project | merlin-489714 (both envs) | .firebaserc |
| Git Provider | GitHub — github.com/delimatsuo/Merlin | user input |
| Branch Strategy | staging → main | configured |
| CI/CD | GitHub Actions + Cloud Build (existing) | generated + cloudbuild.yaml |
| Production URL | https://merlincv.com | user config |
| Backend URL | https://merlin-backend-531233742939.southamerica-east1.run.app | Cloud Run |
| Region | southamerica-east1 | cloudbuild.yaml |

## Manual Steps Required

- [ ] Create initial commit and push to GitHub (`git push -u origin main`)
- [ ] Create `staging` branch after initial push (`git checkout -b staging && git push -u origin staging`)
- [ ] Review and customize TODO comments in `.github/workflows/deploy.yml`
- [ ] Review and customize TODO comments in `.github/workflows/rollback.yml`
- [ ] Add required secrets to GitHub repository settings:
  - `FIREBASE_API_KEY` — Firebase client API key
  - `FIREBASE_SERVICE_ACCOUNT` — Firebase service account JSON
  - `API_URL` — Cloud Run backend URL
- [ ] Configure Workload Identity Federation in GCP Console (for GitHub Actions → GCP auth)
- [ ] Enable branch protection on `main` and `staging`
- [ ] Run `/deploy` to test the pipeline end-to-end
