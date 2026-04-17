"""
VenueFlow AI — Firebase & Gemini Integration Layer
Secure initialization and safe wrappers for external services.

DEPLOYMENT:
- Local: Set FIREBASE_SERVICE_ACCOUNT_PATH in .env (file path)
- Render: Set FIREBASE_CREDENTIALS_JSON in env vars (full JSON string)

SECURITY:
- All API keys loaded from .env (never hardcoded)
- Firebase Admin SDK for server-side operations only
- Gemini calls wrapped with automatic fallback to rule engine
"""

import os
import json
import tempfile
import logging
from typing import Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger("venueflow.integrations")

# ─────────────────────────────────────────────
# Firebase Admin SDK Initialization
# ─────────────────────────────────────────────

_firebase_initialized = False
_firebase_db = None


def init_firebase():
    """
    Initialize Firebase Admin SDK with service account credentials.
    Connects to Realtime Database for live venue state syncing.

    Supports two credential modes:
    1. FIREBASE_SERVICE_ACCOUNT_PATH — file path (local development)
    2. FIREBASE_CREDENTIALS_JSON — full JSON string (Render / cloud deployment)
    """
    global _firebase_initialized, _firebase_db

    if _firebase_initialized:
        return True

    database_url = os.getenv("FIREBASE_DATABASE_URL")
    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON")

    if not database_url:
        logger.warning(
            "FIREBASE_DATABASE_URL not set — running in LOCAL-ONLY mode."
        )
        return False

    if not service_account_path and not credentials_json:
        logger.warning(
            "Firebase credentials not found — set FIREBASE_SERVICE_ACCOUNT_PATH "
            "or FIREBASE_CREDENTIALS_JSON to enable."
        )
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials, db

        # Mode 1: JSON string from environment (Render deployment)
        if credentials_json:
            cred_dict = json.loads(credentials_json)
            cred = credentials.Certificate(cred_dict)
            logger.info("Using FIREBASE_CREDENTIALS_JSON (cloud mode)")
        # Mode 2: File path (local development)
        elif service_account_path and os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            logger.info(f"Using service account file: {service_account_path}")
        else:
            logger.warning(f"Firebase service account file not found: {service_account_path}")
            return False

        firebase_admin.initialize_app(cred, {
            "databaseURL": database_url,
        })

        _firebase_db = db
        _firebase_initialized = True
        logger.info(f"✅ Firebase initialized — DB: {database_url[:50]}...")
        return True

    except json.JSONDecodeError as e:
        logger.error(f"Firebase credentials JSON parse error: {e}")
        return False
    except Exception as e:
        logger.error(f"Firebase init failed: {e}")
        return False


def get_firebase_db():
    """Get the Firebase DB reference (or None if not initialized)."""
    return _firebase_db


def firebase_write(path: str, data: dict) -> bool:
    """
    Write data to Firebase Realtime Database.
    Silently fails if Firebase is not initialized (local-only mode).
    """
    if not _firebase_initialized or not _firebase_db:
        return False
    try:
        ref = _firebase_db.reference(path)
        ref.set(data)
        logger.info(f"Firebase write: {path}")
        return True
    except Exception as e:
        logger.error(f"Firebase write failed ({path}): {e}")
        return False


def firebase_read(path: str) -> Optional[dict]:
    """Read data from Firebase Realtime Database."""
    if not _firebase_initialized or not _firebase_db:
        return None
    try:
        ref = _firebase_db.reference(path)
        return ref.get()
    except Exception as e:
        logger.error(f"Firebase read failed ({path}): {e}")
        return None


def firebase_push_alert(alert: dict) -> bool:
    """Push an emergency alert to the /alerts node for all clients."""
    return firebase_write("/alerts/active", alert)


def firebase_sync_venue_status(status: dict) -> bool:
    """Sync full venue status to /live_status for Flutter clients."""
    return firebase_write("/live_status", status)


# ─────────────────────────────────────────────
# Gemini AI Integration
# ─────────────────────────────────────────────

_gemini_model = None
_gemini_available = False


def init_gemini():
    """
    Initialize the Gemini generative AI client.
    Uses Gemini 1.5 Flash for low-latency, free-tier friendly responses.
    """
    global _gemini_model, _gemini_available

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not found — running without AI enhancement.")
        return False

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel("gemini-2.0-flash")

        # Quick verification (don't block startup on this)
        logger.info("✅ Gemini AI initialized — model: gemini-2.0-flash")
        _gemini_available = True
        return True

    except Exception as e:
        logger.error(f"Gemini init failed: {e}")
        _gemini_available = False
        return False


async def gemini_enhance_recommendation(
    rule_recommendation: dict,
    match_state: dict,
    sport: str = "ipl",
    language: str = "en",
) -> Optional[str]:
    """
    Use Gemini to generate a personalized, conversational recommendation.
    Falls back to rule-based text if Gemini is unavailable or errors.

    SECURITY: This runs server-side only. API key never exposed to client.

    Args:
        rule_recommendation: The structured output from the rule engine
        match_state: Current match state
        sport: Sport type for context
        language: User's preferred language code

    Returns:
        Enhanced recommendation text or None (use rule-based fallback)
    """
    if not _gemini_available or not _gemini_model:
        return None

    try:
        lang_name = {
            "en": "English", "hi": "Hindi", "ta": "Tamil",
            "or": "Odia", "kn": "Kannada", "te": "Telugu",
            "bn": "Bengali", "gu": "Gujarati", "pa": "Punjabi",
        }.get(language, "English")

        prompt = f"""You are VenueFlow AI, a helpful assistant at an Indian {sport.upper()} stadium.

CONTEXT:
- Sport: {sport.upper()}
- Match State: Overs {match_state.get('overs_completed', '?')}/20, Innings {match_state.get('innings', '?')}
- Batting: {match_state.get('batting_team', 'Team A')} vs {match_state.get('bowling_team', 'Team B')}
- Current Action Type: {rule_recommendation.get('action_type', 'navigation')}
- Destination: {rule_recommendation.get('destination', 'Unknown')}
- Walk Time: {rule_recommendation.get('eta_seconds', 0)} seconds
- Wait Time: {rule_recommendation.get('wait_time_at_destination', 0)} minutes
- Game Context: {rule_recommendation.get('game_context', '')}

TASK: Write a 1-2 sentence helpful, warm, culturally appropriate recommendation in {lang_name}.
Be conversational like a friendly IPL stadium guide. Include a cricket/sport metaphor if appropriate.
Keep it SHORT — max 2 sentences. No emojis. No markdown."""

        response = _gemini_model.generate_content(prompt)

        if response and response.text:
            text = response.text.strip()
            # Sanity check: not too long, not empty
            if 10 < len(text) < 300:
                return text

        return None

    except Exception as e:
        logger.warning(f"Gemini enhancement failed (non-critical): {e}")
        return None


def is_gemini_available() -> bool:
    """Check if Gemini is available for AI enhancement."""
    return _gemini_available


def is_firebase_available() -> bool:
    """Check if Firebase is connected."""
    return _firebase_initialized
