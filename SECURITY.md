# VenueFlow AI — Security Policy

**Version:** 2.0.0  
**Last Updated:** 2026-04-19  
**Security Audit:** OWASP Top 10 Applied

---

## Security Controls

### Authentication & Access Control (OWASP A01)
- All admin endpoints (`POST /api/v1/venue-status`, `/game-state`, `/emergency/*`) require `X-Admin-Key` header
- Admin key comparison uses **timing-safe** `hmac.compare_digest()` — immune to timing attacks
- Failed authentication attempts are logged with client IP and timestamp
- No admin key value is ever logged (only the attempt event)

### Cryptographic Security (OWASP A02)
- All secrets loaded from environment variables — never hardcoded in source
- Production startup guard: server **refuses to start** if `ADMIN_KEY` is a known default value
- Firebase credentials stored as environment variable in Render (not committed to Git)
- Gemini API key server-side only — never exposed to Flutter client

### Input Validation (OWASP A03)
- All request inputs validated via Pydantic models with field constraints
- `intent` field validated against regex pattern: `^(restroom|food|exit|seat|navigation|emergency|fan_zone)$`
- `latitude` bounded: `-90 ≤ lat ≤ 90`
- `longitude` bounded: `-180 ≤ lng ≤ 180`
- Firebase paths use known-fixed strings — no user input in path construction

### Security Configuration (OWASP A05)
- CORS origins restricted in production to specific Render domain
- Development mode uses permissive CORS (`*`) for local testing only
- No debug mode in production
- Non-root user in Docker container

### Dependency Management (OWASP A06)
- All Python packages pinned to exact versions in `requirements.txt`
- No known CVEs in current dependency versions (verified 2026-04-19)

### Security Logging (OWASP A09)
- All auth failures logged with: endpoint path, client IP, timestamp
- API keys and secrets are **never logged** at any level
- Structured logging via Python `logging` module (not `print()`)

## Secret Management

| Secret | Storage | Rotation Frequency |
|--------|---------|-------------------|
| `GEMINI_API_KEY` | Render env var | Every 90 days or on compromise |
| `FIREBASE_CREDENTIALS_JSON` | Render env var | Every 180 days or on compromise |
| `ADMIN_KEY` | Render env var | Every 90 days or on compromise |

## Git Security

The `.gitignore` file blocks all credential patterns:
- `.env`, `.env.*`
- `*service-account*.json`
- `*firebase-adminsdk*.json`
- `*credentials*.json`
- `google-services.json`

**Verification command:**
```bash
git log -p --all | grep -E "(AIzaSy|-----BEGIN|private_key)" | head -5
# Should return NO results
```

## Known Limitations

1. **Rate Limiting:** No rate limiting on public endpoints. For production at scale, add `slowapi` or Cloudflare rate limiting.
2. **HTTPS:** Render provides HTTPS by default. Local development uses HTTP.
3. **Data at Rest:** Firebase Spark plan does not encrypt data at rest with customer-managed keys.
4. **JWT Auth:** The system uses API key authentication, not JWT. For user-level auth, implement Firebase Auth.

## Incident Response

1. **Compromised API Key:**
   - Immediately rotate the key (see DEPLOYMENT.md)
   - Check Render logs for unauthorized access
   - Redeploy with new key

2. **Data Breach:**
   - Disable the Render service
   - Rotate all secrets
   - Review Firebase RTDB access logs
   - Redeploy with new credentials
