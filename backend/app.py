"""
VenueFlow AI - FastAPI Backend (Production)
IPL-focused venue intelligence with Firebase + Gemini integration.
Rule-based engine is primary; Gemini enhances (optional).
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import os
import hmac
import logging
from dotenv import load_dotenv

# Load .env BEFORE any imports that need env vars
load_dotenv()

from decision_engine import get_recommendation
from venue_data import venue_state, FACILITIES, SECTIONS
from ipl_engine import analyze_match_timing, predict_crowd_surge, IPL_TEAMS, translate
from integrations import (
    init_firebase, init_gemini,
    firebase_sync_venue_status, firebase_push_alert,
    gemini_enhance_recommendation,
    is_firebase_available, is_gemini_available,
)


# ─────────────────────────────────────────────
# Environment, Security & Lifecycle
# ─────────────────────────────────────────────

APP_ENV = os.getenv("APP_ENV", "development")
ADMIN_KEY = os.getenv("ADMIN_KEY", "demo-admin-key")


def _verify_admin_key(provided_key: str) -> bool:
    """Timing-safe admin key verification (OWASP A01 mitigation)."""
    return hmac.compare_digest(provided_key.encode(), ADMIN_KEY.encode())


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize external services on startup."""
    logger.info("═══ VenueFlow AI Starting ═══")
    logger.info(f"Environment: {APP_ENV}")

    # SECURITY: Block production deployment with default admin key
    if APP_ENV == "production" and ADMIN_KEY in ("demo-admin-key", "demo-admin-key-2026", "change-this-to-a-secure-key"):
        logger.critical("FATAL: Default ADMIN_KEY detected in production. Set a secure key via ADMIN_KEY env var.")
        raise RuntimeError("FATAL: Default ADMIN_KEY detected in production. Set a secure ADMIN_KEY.")

    # Initialize Firebase (non-blocking — works without it)
    fb_ok = init_firebase()
    logger.info(f"Firebase: {'✅ Connected' if fb_ok else '⚠️ Local-only mode'}")

    # Initialize Gemini (non-blocking — falls back to rules)
    gem_ok = init_gemini()
    logger.info(f"Gemini:   {'✅ Ready' if gem_ok else '⚠️ Rule-engine only'}")

    logger.info("═══ VenueFlow AI Ready ═══")
    yield
    logger.info("═══ VenueFlow AI Shutting Down ═══")


app = FastAPI(
    title="VenueFlow AI",
    description="Real-time venue intelligence for Indian sporting events (IPL/ISL/PKL)",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — environment-gated (OWASP A05 mitigation)
_cors_origins = ["*"] if APP_ENV == "development" else [
    # Firebase Hosting (primary frontend)
    "https://venueflow-ai-493608.web.app",
    "https://venueflow-ai-493608.firebaseapp.com",
    # Cloud Run backend (self-reference for /docs)
    "https://venueflow-ai-backend.onrender.com",
    "https://venueflow-backend.onrender.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("venueflow")

# Serve frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# ─────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────

class Location(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class RecommendationRequest(BaseModel):
    user_id: str = "demo_user"
    location: Location
    intent: str = Field(..., pattern="^(restroom|food|exit|seat|navigation|emergency|fan_zone)$")
    accessibility_needs: Optional[list[str]] = []
    seat_section: Optional[int] = None
    dietary_restrictions: Optional[list[str]] = []
    # IPL-specific fields
    sport: str = "ipl"
    language: str = "en"
    favorite_team: Optional[str] = None  # e.g., "CSK", "MI"


class MatchStateUpdate(BaseModel):
    """IPL/Cricket match state — replaces generic game state."""
    overs_completed: Optional[float] = None
    innings: Optional[int] = None
    batting_team: Optional[str] = None
    bowling_team: Optional[str] = None
    runs: Optional[int] = None
    wickets: Optional[int] = None
    target: Optional[int] = None
    is_strategic_timeout: Optional[bool] = None
    is_innings_break: Optional[bool] = None
    momentum: Optional[str] = None
    star_player_batting: Optional[str] = None
    # Legacy fields for backward compatibility
    quarter: Optional[int] = None
    minutes_remaining: Optional[float] = None
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    game_momentum: Optional[str] = None
    is_timeout: Optional[bool] = None
    is_halftime: Optional[bool] = None
    status: Optional[str] = None


class VenueStatusUpdate(BaseModel):
    facility_id: str
    wait_time_minutes: Optional[int] = None
    crowd_density: Optional[float] = None


class EmergencyRequest(BaseModel):
    message: str
    exit_routes: Optional[list[str]] = None


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@app.get("/")
async def root():
    """Serve the frontend."""
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "VenueFlow AI API v2.0 is running. Frontend not found."}


@app.get("/health")
async def health():
    """Health check with integration status."""
    return {
        "status": "healthy",
        "service": "VenueFlow AI",
        "version": "2.0.0",
        "environment": APP_ENV,
        "integrations": {
            "firebase": is_firebase_available(),
            "gemini": is_gemini_available(),
        },
        "sport_modes": ["ipl", "odi", "isl", "pkl"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/recommendations")
async def get_venue_recommendation(req: RecommendationRequest):
    """
    Main endpoint: IPL-aware intelligent recommendation.
    Pipeline: Rule Engine → (optional) Gemini Enhancement → Firebase Sync
    """
    try:
        start_time = datetime.now(timezone.utc)

        # Fetch real-time venue status
        facilities = venue_state.get_facility_status()
        game_state = venue_state.get_game_state()
        crowd_density = venue_state.get_crowd_density()

        # Check for active emergency
        if venue_state.emergency_alerts:
            req.intent = "emergency"

        # ── STEP 1: Rule Engine (primary — always runs) ──
        recommendation = get_recommendation(
            user_location={"latitude": req.location.latitude, "longitude": req.location.longitude},
            intent=req.intent,
            facilities=facilities,
            game_state=game_state,
            crowd_density=crowd_density,
            accessibility_needs=req.accessibility_needs,
            seat_section=req.seat_section,
            dietary_restrictions=req.dietary_restrictions,
            sections=SECTIONS,
            is_emergency=(req.intent == "emergency"),
        )

        # ── STEP 2: IPL Match Context ──
        match_state = game_state  # Use current game state for timing
        ipl_timing = analyze_match_timing(match_state, sport=req.sport)
        crowd_surge = predict_crowd_surge(match_state, sport=req.sport)

        # Enrich recommendation with IPL context
        recommendation["ipl_context"] = ipl_timing.get("ipl_context", "")
        recommendation["crowd_prediction"] = crowd_surge.get("surge_level", "normal")
        recommendation["sport"] = req.sport

        # ── STEP 3: Gemini Enhancement (optional — async, non-blocking) ──
        gemini_text = await gemini_enhance_recommendation(
            recommendation, match_state, sport=req.sport, language=req.language
        )
        if gemini_text:
            recommendation["gemini_enhanced"] = True
            recommendation["recommendation_ai"] = gemini_text
        else:
            recommendation["gemini_enhanced"] = False

        # Calculate latency
        latency_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000

        logger.info(
            f"Recommendation | user={req.user_id} intent={req.intent} sport={req.sport} "
            f"gemini={'✓' if gemini_text else '✗'} "
            f"confidence={recommendation.get('confidence_score', 'N/A')} "
            f"latency={latency_ms:.1f}ms"
        )

        # Store for analytics
        venue_state.recommendation_log.append({
            "user_id": req.user_id,
            "intent": req.intent,
            "sport": req.sport,
            "recommendation": recommendation.get("recommendation"),
            "confidence": recommendation.get("confidence_score"),
            "gemini_used": bool(gemini_text),
            "latency_ms": round(latency_ms, 1),
            "timestamp": start_time.isoformat(),
        })

        # ── STEP 4: Firebase Sync (non-blocking) ──
        firebase_sync_venue_status({
            "last_recommendation": {
                "intent": req.intent,
                "destination": recommendation.get("destination"),
                "latency_ms": round(latency_ms, 1),
            },
            "venue_status": {
                "crowd_density": crowd_density.get("overall", 0),
                "active_alerts": len(venue_state.emergency_alerts),
            },
            "updated_at": start_time.isoformat(),
        })

        return {
            "success": True,
            "recommendation": recommendation,
            "latency_ms": round(latency_ms, 1),
            "timestamp": start_time.isoformat(),
        }

    except Exception as e:
        logger.error(f"Recommendation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/venue-status")
async def get_venue_status():
    """Get current venue status (public, read-only)."""
    return {
        "facilities": venue_state.get_facility_status(),
        "game_state": venue_state.get_game_state(),
        "crowd_density": venue_state.get_crowd_density(),
        "emergency_alerts": venue_state.emergency_alerts,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/venue-status")
async def update_venue_status(update: VenueStatusUpdate, request: Request):
    """Admin endpoint: Update facility wait time or crowd density."""
    admin_key = request.headers.get("X-Admin-Key", "")

    if not _verify_admin_key(admin_key):
        logger.warning(f"Failed admin auth attempt on /venue-status from {request.client.host}")
        raise HTTPException(status_code=401, detail="Unauthorized")

    if update.wait_time_minutes is not None:
        if update.facility_id in venue_state.wait_times:
            venue_state.wait_times[update.facility_id] = update.wait_time_minutes

    if update.crowd_density is not None:
        density_key = update.facility_id.replace("-", "_")
        if density_key in venue_state.crowd_density:
            venue_state.crowd_density[density_key] = update.crowd_density

    # Sync to Firebase
    firebase_sync_venue_status({
        "facility_update": update.facility_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "message": "Venue status updated"}


@app.post("/api/v1/game-state")
async def update_game_state(update: MatchStateUpdate, request: Request):
    """Admin endpoint: Update match/game state (supports IPL + legacy)."""
    admin_key = request.headers.get("X-Admin-Key", "")

    if not _verify_admin_key(admin_key):
        logger.warning(f"Failed admin auth attempt on /game-state from {request.client.host}")
        raise HTTPException(status_code=401, detail="Unauthorized")

    gs = venue_state.game_state

    # IPL/Cricket fields
    if update.overs_completed is not None:
        gs["overs_completed"] = update.overs_completed
    if update.innings is not None:
        gs["innings"] = update.innings
    if update.batting_team is not None:
        gs["batting_team"] = update.batting_team
    if update.bowling_team is not None:
        gs["bowling_team"] = update.bowling_team
    if update.runs is not None:
        gs["runs"] = update.runs
    if update.wickets is not None:
        gs["wickets"] = update.wickets
    if update.target is not None:
        gs["target"] = update.target
    if update.is_strategic_timeout is not None:
        gs["is_strategic_timeout"] = update.is_strategic_timeout
    if update.is_innings_break is not None:
        gs["is_innings_break"] = update.is_innings_break
    if update.momentum is not None:
        gs["momentum"] = update.momentum
        gs["game_momentum"] = update.momentum  # Backward compat
    if update.star_player_batting is not None:
        gs["star_player_batting"] = update.star_player_batting

    # Legacy fields (backward compatibility)
    if update.quarter is not None:
        gs["quarter"] = update.quarter
    if update.minutes_remaining is not None:
        gs["minutes_remaining"] = update.minutes_remaining
    if update.home_score is not None:
        gs["home_score"] = update.home_score
    if update.away_score is not None:
        gs["away_score"] = update.away_score
    if update.game_momentum is not None:
        gs["game_momentum"] = update.game_momentum
    if update.is_timeout is not None:
        gs["is_timeout"] = update.is_timeout
    if update.is_halftime is not None:
        gs["is_halftime"] = update.is_halftime
    if update.status is not None:
        gs["status"] = update.status

    return {"success": True, "game_state": gs}


@app.post("/api/v1/emergency")
async def trigger_emergency(req: EmergencyRequest, request: Request):
    """Emergency endpoint: Broadcast evacuation protocol + Firebase push."""
    admin_key = request.headers.get("X-Admin-Key", "")

    if not _verify_admin_key(admin_key):
        logger.warning(f"Failed admin auth attempt on /emergency from {request.client.host}")
        raise HTTPException(status_code=401, detail="Unauthorized")

    alert = venue_state.trigger_emergency(req.message, req.exit_routes)
    logger.critical(f"EMERGENCY ALERT TRIGGERED: {req.message}")

    # Push to Firebase for Flutter clients
    firebase_push_alert(alert)

    return {"success": True, "alert": alert}


@app.post("/api/v1/emergency/clear")
async def clear_emergency(request: Request):
    """Clear emergency alerts."""
    admin_key = request.headers.get("X-Admin-Key", "")

    if not _verify_admin_key(admin_key):
        logger.warning(f"Failed admin auth attempt on /emergency/clear from {request.client.host}")
        raise HTTPException(status_code=401, detail="Unauthorized")

    venue_state.clear_emergency()

    # Clear Firebase alert node
    firebase_push_alert({"active": False, "cleared_at": datetime.now(timezone.utc).isoformat()})

    return {"success": True, "message": "Emergency cleared"}


@app.post("/api/v1/demo/reset")
async def reset_demo():
    """Reset venue to demo scenario state."""
    venue_state.reset()
    venue_state.set_demo_scenario()
    return {"success": True, "message": "Demo scenario reset"}


@app.get("/api/v1/analytics")
async def get_analytics():
    """Get recommendation analytics."""
    logs = venue_state.recommendation_log[-100:]  # Last 100

    if not logs:
        return {"total_recommendations": 0, "avg_latency_ms": 0, "avg_confidence": 0, "logs": []}

    avg_latency = sum(l.get("latency_ms", 0) for l in logs) / len(logs)
    avg_confidence = sum(l.get("confidence", 0) for l in logs) / len(logs)
    gemini_usage = sum(1 for l in logs if l.get("gemini_used")) / len(logs) * 100

    intent_breakdown = {}
    for l in logs:
        intent = l.get("intent", "unknown")
        intent_breakdown[intent] = intent_breakdown.get(intent, 0) + 1

    return {
        "total_recommendations": len(venue_state.recommendation_log),
        "avg_latency_ms": round(avg_latency, 1),
        "avg_confidence": round(avg_confidence, 2),
        "gemini_usage_pct": round(gemini_usage, 1),
        "intent_breakdown": intent_breakdown,
        "integrations": {
            "firebase": is_firebase_available(),
            "gemini": is_gemini_available(),
        },
        "recent_logs": logs[-10:],
    }


@app.get("/api/v1/ipl/teams")
async def get_ipl_teams():
    """Get list of IPL teams for fan personalization."""
    return {"teams": IPL_TEAMS}


@app.get("/api/v1/ipl/match-context")
async def get_match_context():
    """Get current IPL match context and timing analysis."""
    game_state = venue_state.get_game_state()
    timing = analyze_match_timing(game_state, sport="ipl")
    crowd = predict_crowd_surge(game_state, sport="ipl")

    return {
        "match_state": game_state,
        "timing": timing,
        "crowd_prediction": crowd,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
