# VenueFlow AI — API Documentation

**Base URL:** `https://venueflow-ai-backend.onrender.com` (production)  
**Local URL:** `http://localhost:8080` (development)  
**Version:** 2.0.0

---

## Public Endpoints (No Auth Required)

### `GET /health`

Health check with integration status.

**Response:**
```json
{
  "status": "healthy",
  "service": "VenueFlow AI",
  "version": "2.0.0",
  "environment": "production",
  "integrations": {
    "firebase": true,
    "gemini": true
  },
  "sport_modes": ["ipl", "odi", "isl", "pkl"],
  "timestamp": "2026-04-19T00:00:00+00:00"
}
```

**curl:**
```bash
curl https://venueflow-ai-backend.onrender.com/health
```

---

### `POST /api/v1/recommendations`

Get an AI-powered venue recommendation.

**Request Body:**
```json
{
  "user_id": "demo_user",
  "location": {
    "latitude": 35.2273,
    "longitude": -81.8388
  },
  "intent": "restroom",
  "accessibility_needs": ["mobility"],
  "seat_section": 202,
  "dietary_restrictions": [],
  "sport": "ipl",
  "language": "en",
  "favorite_team": "CSK"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `user_id` | string | No (default: `demo_user`) | — |
| `location.latitude` | float | Yes | `-90 ≤ x ≤ 90` |
| `location.longitude` | float | Yes | `-180 ≤ x ≤ 180` |
| `intent` | string | Yes | `restroom\|food\|exit\|seat\|navigation\|emergency\|fan_zone` |
| `accessibility_needs` | string[] | No | `["mobility"]` |
| `seat_section` | int | No | Section number |
| `dietary_restrictions` | string[] | No | `["vegetarian", "gluten_free_options"]` |
| `sport` | string | No (default: `ipl`) | `ipl\|odi\|isl\|pkl` |
| `language` | string | No (default: `en`) | `en\|hi\|ta\|or\|kn\|te\|bn\|gu\|pa` |
| `favorite_team` | string | No | IPL team code: `CSK\|MI\|RCB\|KKR\|DC\|RR\|SRH\|GT\|LSG\|PBKS` |

**Response (200):**
```json
{
  "success": true,
  "recommendation": {
    "recommendation": "Section 205 Restroom is 38 seconds away with a 2-minute wait.",
    "action_type": "restroom",
    "destination": "Section 205 Restroom",
    "destination_id": "restroom-205",
    "route_waypoints": [...],
    "eta_seconds": 38,
    "wait_time_at_destination": 2,
    "confidence_score": 0.9,
    "accessibility_compliant": true,
    "game_context": "Halftime in ~4 min — beat the rush now",
    "ipl_context": "Good window to move — intensity picks up from over 16",
    "crowd_prediction": "normal",
    "gemini_enhanced": true,
    "recommendation_ai": "Head to Section 205 — just a short walk away..."
  },
  "latency_ms": 245.3,
  "timestamp": "2026-04-19T00:00:00+00:00"
}
```

**curl:**
```bash
curl -X POST https://venueflow-ai-backend.onrender.com/api/v1/recommendations \
  -H "Content-Type: application/json" \
  -d '{"location":{"latitude":35.2273,"longitude":-81.8388},"intent":"restroom","seat_section":202,"sport":"ipl"}'
```

---

### `GET /api/v1/venue-status`

Get current venue status (read-only).

**Response (200):**
```json
{
  "facilities": [...],
  "game_state": {...},
  "crowd_density": {...},
  "emergency_alerts": [],
  "timestamp": "..."
}
```

**curl:**
```bash
curl https://venueflow-ai-backend.onrender.com/api/v1/venue-status
```

---

### `GET /api/v1/ipl/teams`

Get list of IPL teams for fan personalization.

**Response (200):**
```json
{
  "teams": {
    "CSK": {"name": "Chennai Super Kings", "color": "#FFFF00", "city": "Chennai"},
    "MI": {"name": "Mumbai Indians", "color": "#004BA0", "city": "Mumbai"}
  }
}
```

---

### `GET /api/v1/ipl/match-context`

Get current IPL match timing analysis.

**Response (200):**
```json
{
  "match_state": {...},
  "timing": {"is_good_time": true, "reason": "...", "priority": "high"},
  "crowd_prediction": {"surge_level": "normal"},
  "timestamp": "..."
}
```

---

### `GET /api/v1/analytics`

Get recommendation analytics and usage stats.

**Response (200):**
```json
{
  "total_recommendations": 42,
  "avg_latency_ms": 180.5,
  "avg_confidence": 0.87,
  "gemini_usage_pct": 85.0,
  "intent_breakdown": {"restroom": 15, "food": 12, "exit": 8, "seat": 7},
  "integrations": {"firebase": true, "gemini": true},
  "recent_logs": [...]
}
```

---

## Admin Endpoints (Requires `X-Admin-Key` Header)

> All admin endpoints require the `X-Admin-Key` header with the configured admin key.
> Requests without a valid key return `401 Unauthorized`.

### `POST /api/v1/venue-status`

Update a facility's wait time or crowd density.

**Headers:** `X-Admin-Key: <your-admin-key>`

**Request Body:**
```json
{
  "facility_id": "restroom-202",
  "wait_time_minutes": 15,
  "crowd_density": 0.85
}
```

---

### `POST /api/v1/game-state`

Update match state (IPL + legacy fields).

**Headers:** `X-Admin-Key: <your-admin-key>`

**Request Body (IPL):**
```json
{
  "overs_completed": 12.3,
  "innings": 1,
  "batting_team": "CSK",
  "bowling_team": "MI",
  "runs": 156,
  "wickets": 3,
  "is_strategic_timeout": false,
  "momentum": "boundary_spree"
}
```

---

### `POST /api/v1/emergency`

Trigger an emergency evacuation alert.

**Headers:** `X-Admin-Key: <your-admin-key>`

**Request Body:**
```json
{
  "message": "EMERGENCY: Evacuate to nearest exit immediately.",
  "exit_routes": ["exit-north", "exit-south", "exit-west"]
}
```

---

### `POST /api/v1/emergency/clear`

Clear active emergency alerts.

**Headers:** `X-Admin-Key: <your-admin-key>`

---

### `POST /api/v1/demo/reset`

Reset venue state to demo scenario. *(No admin key required.)*

**curl:**
```bash
curl -X POST https://venueflow-ai-backend.onrender.com/api/v1/demo/reset
```

---

## Error Responses

| Status | Meaning | Example |
|--------|---------|---------|
| `200` | Success | — |
| `401` | Missing or invalid `X-Admin-Key` | `{"detail": "Unauthorized"}` |
| `422` | Validation error (bad input) | `{"detail": [...]}` (Pydantic errors) |
| `500` | Internal server error | `{"detail": "error message"}` |
