"""
VenueFlow AI — Comprehensive API Test Suite
Covers: health, routes, input validation, CORS, OpenAPI, security, recommendations.
Run with: cd backend && pytest tests/ -v
"""
import sys
import os
import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is on the path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app

client = TestClient(app)


# ═══════════════════════════════════════════════
# Health Endpoint Tests
# ═══════════════════════════════════════════════

class TestHealthEndpoint:
    """Tests for the /health endpoint."""

    def test_health_returns_200(self):
        """Health endpoint must return HTTP 200."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_json(self):
        """Health endpoint must return valid JSON with correct content type."""
        response = client.get("/health")
        assert "application/json" in response.headers["content-type"]

    def test_health_contains_status_field(self):
        """Health response must contain a 'status' field."""
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"

    def test_health_contains_service_name(self):
        """Health response must identify the service."""
        response = client.get("/health")
        data = response.json()
        assert "service" in data
        assert data["service"] == "VenueFlow AI"

    def test_health_contains_version(self):
        """Health response must include an API version."""
        response = client.get("/health")
        data = response.json()
        assert "version" in data

    def test_health_contains_integrations(self):
        """Health response must report integration status."""
        response = client.get("/health")
        data = response.json()
        assert "integrations" in data
        assert "firebase" in data["integrations"]
        assert "gemini" in data["integrations"]

    def test_health_contains_sport_modes(self):
        """Health response must list supported sport modes."""
        response = client.get("/health")
        data = response.json()
        assert "sport_modes" in data
        assert "ipl" in data["sport_modes"]

    def test_health_contains_timestamp(self):
        """Health response must include a timestamp."""
        response = client.get("/health")
        data = response.json()
        assert "timestamp" in data


# ═══════════════════════════════════════════════
# Input Validation Tests (Pydantic)
# ═══════════════════════════════════════════════

class TestInputValidation:
    """Tests for Pydantic model validation on POST endpoints."""

    def test_recommendations_rejects_empty_body(self):
        """POST /api/v1/recommendations with empty body must return 422."""
        response = client.post("/api/v1/recommendations", json={})
        assert response.status_code == 422

    def test_recommendations_rejects_invalid_intent(self):
        """POST /api/v1/recommendations with invalid intent must return 422."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "invalid_intent_value",
            "seat_section": 202,
        })
        assert response.status_code == 422

    def test_recommendations_accepts_valid_restroom_intent(self):
        """POST /api/v1/recommendations with valid restroom intent must return 200."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "restroom",
            "seat_section": 202,
        })
        assert response.status_code == 200

    def test_recommendations_accepts_valid_food_intent(self):
        """POST /api/v1/recommendations with valid food intent must return 200."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "food",
            "seat_section": 202,
        })
        assert response.status_code == 200

    def test_recommendations_accepts_valid_exit_intent(self):
        """POST /api/v1/recommendations with valid exit intent must return 200."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "exit",
            "seat_section": 202,
        })
        assert response.status_code == 200

    def test_recommendations_response_has_success_field(self):
        """Recommendations response must include a success boolean."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "restroom",
            "seat_section": 202,
        })
        data = response.json()
        assert "success" in data
        assert data["success"] is True

    def test_recommendations_response_has_latency(self):
        """Recommendations response must include latency measurement."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "restroom",
            "seat_section": 202,
        })
        data = response.json()
        assert "latency_ms" in data

    def test_recommendations_response_has_recommendation_object(self):
        """Recommendations response must include structured recommendation."""
        response = client.post("/api/v1/recommendations", json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "restroom",
            "seat_section": 202,
        })
        data = response.json()
        assert "recommendation" in data
        rec = data["recommendation"]
        assert "action_type" in rec
        assert "confidence_score" in rec
        assert "accessibility_compliant" in rec


# ═══════════════════════════════════════════════
# CORS & Security Headers Tests
# ═══════════════════════════════════════════════

class TestCORSAndSecurity:
    """Tests for CORS and security configuration."""

    def test_cors_preflight_does_not_crash(self):
        """OPTIONS preflight must not return 500."""
        response = client.options("/health")
        assert response.status_code in [200, 204, 400, 405]

    def test_admin_endpoint_rejects_without_key(self):
        """Admin endpoints must reject requests without X-Admin-Key."""
        response = client.post("/api/v1/emergency", json={
            "message": "Test alert",
        })
        assert response.status_code == 401

    def test_admin_endpoint_rejects_wrong_key(self):
        """Admin endpoints must reject requests with incorrect key."""
        response = client.post("/api/v1/emergency",
            json={"message": "Test alert"},
            headers={"X-Admin-Key": "wrong-key-12345"},
        )
        assert response.status_code == 401

    def test_game_state_rejects_without_key(self):
        """POST /api/v1/game-state must require admin key."""
        response = client.post("/api/v1/game-state", json={
            "quarter": 2,
            "minutes_remaining": 5.0,
        })
        assert response.status_code == 401

    def test_venue_status_update_rejects_without_key(self):
        """POST /api/v1/venue-status must require admin key."""
        response = client.post("/api/v1/venue-status", json={
            "facility_id": "restroom-202",
            "wait_time_minutes": 10,
        })
        assert response.status_code == 401


# ═══════════════════════════════════════════════
# OpenAPI / API Structure Tests
# ═══════════════════════════════════════════════

class TestAPIStructure:
    """Tests that verify the OpenAPI spec and documentation."""

    def test_openapi_schema_exists(self):
        """FastAPI must serve a valid OpenAPI schema."""
        response = client.get("/openapi.json")
        assert response.status_code == 200

    def test_openapi_has_title(self):
        """OpenAPI schema must have a title."""
        response = client.get("/openapi.json")
        schema = response.json()
        assert "info" in schema
        assert "title" in schema["info"]

    def test_openapi_has_paths(self):
        """OpenAPI schema must document API paths."""
        response = client.get("/openapi.json")
        schema = response.json()
        assert "paths" in schema
        assert len(schema["paths"]) > 0

    def test_docs_endpoint_accessible(self):
        """Swagger docs must be accessible."""
        response = client.get("/docs")
        assert response.status_code == 200

    def test_redoc_endpoint_accessible(self):
        """ReDoc documentation must be accessible."""
        response = client.get("/redoc")
        assert response.status_code == 200


# ═══════════════════════════════════════════════
# Venue Status & Analytics Tests
# ═══════════════════════════════════════════════

class TestVenueStatus:
    """Tests for venue status and analytics endpoints."""

    def test_venue_status_returns_200(self):
        """GET /api/v1/venue-status must return 200."""
        response = client.get("/api/v1/venue-status")
        assert response.status_code == 200

    def test_venue_status_has_facilities(self):
        """Venue status must include facilities array."""
        response = client.get("/api/v1/venue-status")
        data = response.json()
        assert "facilities" in data

    def test_venue_status_has_game_state(self):
        """Venue status must include game state."""
        response = client.get("/api/v1/venue-status")
        data = response.json()
        assert "game_state" in data

    def test_venue_status_has_crowd_density(self):
        """Venue status must include crowd density data."""
        response = client.get("/api/v1/venue-status")
        data = response.json()
        assert "crowd_density" in data

    def test_analytics_returns_200(self):
        """GET /api/v1/analytics must return 200."""
        response = client.get("/api/v1/analytics")
        assert response.status_code == 200

    def test_analytics_has_total_count(self):
        """Analytics must report total recommendation count."""
        response = client.get("/api/v1/analytics")
        data = response.json()
        assert "total_recommendations" in data


# ═══════════════════════════════════════════════
# IPL / Multi-Sport Endpoints Tests
# ═══════════════════════════════════════════════

class TestIPLEndpoints:
    """Tests for IPL-specific endpoints."""

    def test_ipl_teams_returns_200(self):
        """GET /api/v1/ipl/teams must return 200."""
        response = client.get("/api/v1/ipl/teams")
        assert response.status_code == 200

    def test_ipl_teams_has_teams(self):
        """IPL teams response must include teams dict."""
        response = client.get("/api/v1/ipl/teams")
        data = response.json()
        assert "teams" in data
        assert len(data["teams"]) > 0

    def test_ipl_match_context_returns_200(self):
        """GET /api/v1/ipl/match-context must return 200."""
        response = client.get("/api/v1/ipl/match-context")
        assert response.status_code == 200

    def test_ipl_match_context_has_timing(self):
        """Match context must include timing analysis."""
        response = client.get("/api/v1/ipl/match-context")
        data = response.json()
        assert "timing" in data
        assert "is_good_time" in data["timing"]

    def test_ipl_match_context_has_crowd_prediction(self):
        """Match context must include crowd prediction."""
        response = client.get("/api/v1/ipl/match-context")
        data = response.json()
        assert "crowd_prediction" in data


# ═══════════════════════════════════════════════
# Demo Reset Tests
# ═══════════════════════════════════════════════

class TestDemoReset:
    """Tests for the demo reset functionality."""

    def test_demo_reset_returns_200(self):
        """POST /api/v1/demo/reset must return 200."""
        response = client.post("/api/v1/demo/reset")
        assert response.status_code == 200

    def test_demo_reset_returns_success(self):
        """Demo reset must return success status."""
        response = client.post("/api/v1/demo/reset")
        data = response.json()
        assert data["success"] is True


# ═══════════════════════════════════════════════
# Root / Frontend Serving Test
# ═══════════════════════════════════════════════

class TestRootEndpoint:
    """Tests for the root endpoint."""

    def test_root_returns_200(self):
        """GET / must return 200 (either frontend or API info)."""
        response = client.get("/")
        assert response.status_code == 200
