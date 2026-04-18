# VenueFlow AI — Changelog

All notable changes to this project are documented in this file.

## [2.0.1] - 2026-04-19

### Security (Priority 1 — OWASP Compliance)

- **[A01] Timing-safe admin key:** Replaced all `==` admin key comparisons with `hmac.compare_digest()` to prevent timing attacks (`app.py`)
- **[A02] Production admin key guard:** Server refuses to start in production if `ADMIN_KEY` is a known default value (e.g., `demo-admin-key`)
- **[A05] Environment-gated CORS:** `allow_origins=["*"]` now only applies in `development` mode; production restricts to specific Render domain
- **[A06] Pinned dependencies:** All packages in `requirements.txt` pinned to exact versions (no wildcards)
- **[A09] Auth failure logging:** All admin endpoint auth failures now logged with client IP, endpoint path, and timestamp

### Performance (Priority 2)

- **Async Gemini calls:** Wrapped blocking `_gemini_model.generate_content()` in `asyncio.to_thread()` to prevent FastAPI event loop starvation (`integrations.py`)
- **Health endpoint:** Added `environment` field to `/health` response for ops visibility

### Infrastructure

- **Dockerfile:** Added production-ready Dockerfile with non-root user, health check, and slim Python base image
- **`.dockerignore`:** Created to exclude secrets, tests, and caches from container image
- **`render.yaml`:** Added missing `FIREBASE_CREDENTIALS_JSON` secret reference
- **`.env.example`:** Updated with security warnings about production guards

### Documentation

- **`DEPLOYMENT.md`:** Complete deployment guide with architecture, env vars, secret rotation
- **`SECURITY.md`:** OWASP security policy, incident response procedures
- **`CHANGELOG.md`:** This file
- **`API_DOCS.md`:** Complete API reference with curl examples

## [2.0.0] - 2026-04-17

### Features
- IPL/Multi-sport decision engine with timing intelligence
- Firebase Realtime Database integration (Admin SDK)
- Gemini 2.0 Flash AI enhancement (server-side only)
- Flutter mobile app with premium UI, shimmer loading, animations
- Web frontend with interactive canvas stadium map
- 5-language support (EN, HI, TA, OR, KN)
- 45-test comprehensive test suite
