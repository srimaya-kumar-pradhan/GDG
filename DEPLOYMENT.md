# VenueFlow AI — Deployment Guide

**Version:** 2.0.0  
**Last Updated:** 2026-04-19

---

## Architecture Overview

```
Flutter Mobile App
       │
       ▼ (HTTPS POST)
┌──────────────────────────────┐
│  Render.com (Free Tier)      │
│  FastAPI + Uvicorn            │
│  ┌─────────────────────────┐ │
│  │ Rule Engine (primary)   │ │
│  │ Gemini 2.0 Flash (opt.) │ │
│  └─────────────────────────┘ │
│       │              │       │
│       ▼              ▼       │
│  Firebase RTDB   Gemini API  │
│  (Spark Plan)    (Free Tier) │
└──────────────────────────────┘
```

## Prerequisites

- Python 3.11+
- Flutter 3.0+
- A Google account (for Firebase + Gemini free tiers)
- A Render.com account (free tier)

## Environment Variables

| Variable | Required | Source | Description |
|----------|----------|--------|-------------|
| `GEMINI_API_KEY` | Yes | [AI Studio](https://aistudio.google.com/apikey) | Gemini 2.0 Flash API key |
| `FIREBASE_DATABASE_URL` | Yes | Firebase Console | Realtime Database URL |
| `FIREBASE_CREDENTIALS_JSON` | Yes (prod) | Firebase Console → Service Accounts | Full JSON string (single line) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes (dev) | Local file path | Path to service account `.json` |
| `ADMIN_KEY` | Yes | Self-generated | Strong random string for admin endpoints |
| `APP_ENV` | Yes | `development` or `production` | Controls CORS and startup guards |
| `PYTHON_VERSION` | Render only | `3.11.0` | Render Python version |

## Local Development

```bash
# 1. Backend
cd backend
cp .env.example .env    # Fill in real values
pip install -r requirements.txt
python app.py           # Runs at http://localhost:8080

# 2. Flutter (in another terminal)
cd mobile
flutter pub get
flutter run             # Uses http://10.0.2.2:8080 (emulator → host)
```

## Render Deployment

1. Push code to GitHub
2. Create a Web Service on Render.com
3. Set Root Directory: `backend`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
6. Add all environment variables (see table above)
7. `APP_ENV=production` is critical — enables security guards
8. Health check path: `/health`

## Secret Rotation

### Rotate Gemini API Key
1. Go to [AI Studio](https://aistudio.google.com/apikey)
2. Revoke old key, create new one
3. Update `GEMINI_API_KEY` in Render dashboard
4. Trigger manual deploy

### Rotate Firebase Service Account
1. Firebase Console → Project Settings → Service Accounts
2. Generate new private key
3. Flatten the JSON: `python -c "import json; print(json.dumps(json.load(open('new-key.json'))))"`
4. Update `FIREBASE_CREDENTIALS_JSON` in Render dashboard
5. Trigger manual deploy

### Rotate Admin Key
1. Generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Update `ADMIN_KEY` in Render dashboard
3. Update any admin tools/scripts that use the old key

## Redeployment After Code Changes

```bash
git add -A
git commit -m "your change description"
git push origin main
# Render auto-deploys on push (autoDeploy: true in render.yaml)
```

## Monitoring

- **Health:** `GET /health` — returns integration status
- **Analytics:** `GET /api/v1/analytics` — recommendation stats
- **Render Logs:** Dashboard → Service → Logs tab
