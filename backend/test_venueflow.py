"""
VenueFlow AI - Unit Tests
Tests for decision engine, venue data, and API endpoints.
"""

import unittest
import math
import json
from datetime import datetime

# Import modules under test
from decision_engine import (
    haversine_distance,
    estimate_walk_time_seconds,
    generate_waypoints,
    analyze_game_timing,
    filter_for_accessibility,
    recommend_restroom,
    recommend_food,
    recommend_exit,
    get_recommendation,
)
from venue_data import venue_state, FACILITIES, SECTIONS, VenueState


class TestHaversineDistance(unittest.TestCase):
    """Test Haversine distance calculation."""

    def test_same_point_returns_zero(self):
        """Distance from a point to itself should be ~0."""
        dist = haversine_distance(35.2271, -81.8386, 35.2271, -81.8386)
        self.assertAlmostEqual(dist, 0.0, places=1)

    def test_known_distance(self):
        """Test distance between two known stadium points."""
        # Section 202 to Section 205 (~50m apart in stadium)
        dist = haversine_distance(35.2273, -81.8387, 35.2269, -81.8385)
        self.assertGreater(dist, 10)
        self.assertLess(dist, 200)

    def test_symmetry(self):
        """Distance A→B should equal distance B→A."""
        d1 = haversine_distance(35.2273, -81.8387, 35.2269, -81.8385)
        d2 = haversine_distance(35.2269, -81.8385, 35.2273, -81.8387)
        self.assertAlmostEqual(d1, d2, places=5)

    def test_large_distance(self):
        """Test with a larger known distance (NYC to LA ~3944 km)."""
        dist = haversine_distance(40.7128, -74.0060, 34.0522, -118.2437)
        self.assertAlmostEqual(dist / 1000, 3944, delta=50)  # Within 50km


class TestWalkTimeEstimation(unittest.TestCase):
    """Test walk time estimation."""

    def test_short_distance(self):
        """Short distance should yield reasonable walk time."""
        walk_time = estimate_walk_time_seconds(50)  # 50 meters
        self.assertGreater(walk_time, 30)  # At least 30 seconds
        self.assertLess(walk_time, 120)    # Less than 2 minutes

    def test_zero_distance(self):
        """Zero distance → zero time."""
        self.assertEqual(estimate_walk_time_seconds(0), 0)


class TestWaypointGeneration(unittest.TestCase):
    """Test route waypoint generation."""

    def test_waypoints_count(self):
        """Should generate start + N intermediate + end waypoints."""
        start = {"latitude": 35.2273, "longitude": -81.8387}
        end = {"latitude": 35.2269, "longitude": -81.8385}
        waypoints = generate_waypoints(start, end, num_points=3)
        self.assertEqual(len(waypoints), 5)  # start + 3 + end

    def test_waypoints_endpoints(self):
        """First waypoint = start, last = end."""
        start = {"latitude": 35.0, "longitude": -81.0}
        end = {"latitude": 36.0, "longitude": -82.0}
        waypoints = generate_waypoints(start, end, num_points=2)
        self.assertAlmostEqual(waypoints[0]["latitude"], 35.0)
        self.assertAlmostEqual(waypoints[-1]["latitude"], 36.0)

    def test_waypoints_have_descriptions(self):
        """All waypoints should have description strings."""
        start = {"latitude": 35.0, "longitude": -81.0}
        end = {"latitude": 36.0, "longitude": -82.0}
        waypoints = generate_waypoints(start, end)
        for wp in waypoints:
            self.assertIn("description", wp)
            self.assertIsInstance(wp["description"], str)


class TestGameTimingAnalysis(unittest.TestCase):
    """Test game timing intelligence."""

    def test_halftime_approaching(self):
        """Q2 with 4 min remaining should suggest halftime approaching."""
        gs = {"quarter": 2, "minutes_remaining": 4.0, "game_momentum": "halftime_approaching"}
        result = analyze_game_timing(gs)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["priority"], "high")

    def test_halftime_active(self):
        """During halftime, should be a great time to move."""
        gs = {"quarter": 2, "minutes_remaining": 0, "is_halftime": True}
        result = analyze_game_timing(gs)
        self.assertTrue(result["is_good_time"])

    def test_timeout_active(self):
        """During timeout, should be a good window."""
        gs = {"quarter": 3, "minutes_remaining": 8, "is_timeout": True}
        result = analyze_game_timing(gs)
        self.assertTrue(result["is_good_time"])

    def test_critical_play(self):
        """During critical play, should suppress non-urgent notifications."""
        gs = {"quarter": 4, "minutes_remaining": 8, "game_momentum": "critical_play"}
        result = analyze_game_timing(gs)
        self.assertFalse(result["is_good_time"])
        self.assertEqual(result["priority"], "low")


class TestAccessibilityFiltering(unittest.TestCase):
    """Test accessibility filtering logic."""

    def test_no_needs_returns_all(self):
        """No accessibility needs → all facilities returned."""
        facilities = [{"accessible": True}, {"accessible": False}]
        result = filter_for_accessibility(facilities, [])
        self.assertEqual(len(result), 2)

    def test_mobility_filter(self):
        """Mobility need → only accessible facilities."""
        facilities = [
            {"accessible": True, "name": "A"},
            {"accessible": False, "name": "B"},
            {"accessible": True, "name": "C"},
        ]
        result = filter_for_accessibility(facilities, ["mobility"])
        self.assertEqual(len(result), 2)
        self.assertTrue(all(f["accessible"] for f in result))


class TestRestroomRecommendation(unittest.TestCase):
    """Test the core demo scenario: restroom recommendation from Section 202."""

    def setUp(self):
        """Set up demo scenario data."""
        self.user_location = {"latitude": 35.2273, "longitude": -81.8388}
        self.game_state = {
            "quarter": 2,
            "minutes_remaining": 4.0,
            "game_momentum": "halftime_approaching",
        }
        self.crowd_density = {"overall": 0.78, "section_202": 0.45, "section_205": 0.25}

        # Facilities with demo wait times
        self.facilities = []
        for f in FACILITIES:
            entry = {**f}
            if f["id"] == "restroom-202":
                entry["wait_time_minutes"] = 15
                entry["capacity_remaining"] = 2
            elif f["id"] == "restroom-205":
                entry["wait_time_minutes"] = 2
                entry["capacity_remaining"] = 8
            elif f["id"] == "restroom-201":
                entry["wait_time_minutes"] = 5
                entry["capacity_remaining"] = 7
            else:
                entry["wait_time_minutes"] = 8
                entry["capacity_remaining"] = 5
            self.facilities.append(entry)

    def test_recommends_section_205(self):
        """Demo scenario: Should recommend Section 205 over crowded Section 202."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertEqual(result["action_type"], "restroom")
        self.assertIn("205", result["destination"])

    def test_valid_output_format(self):
        """Output should contain all required fields."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        required_keys = [
            "recommendation", "action_type", "destination", "route_waypoints",
            "eta_seconds", "wait_time_at_destination", "confidence_score",
            "accessibility_compliant", "game_context", "data_freshness",
        ]
        for key in required_keys:
            self.assertIn(key, result, f"Missing key: {key}")

    def test_confidence_in_range(self):
        """Confidence score must be between 0.0 and 1.0."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertGreaterEqual(result["confidence_score"], 0.0)
        self.assertLessEqual(result["confidence_score"], 1.0)

    def test_eta_is_reasonable(self):
        """ETA should be < 300 seconds (5 min walk)."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertGreater(result["eta_seconds"], 0)
        self.assertLessEqual(result["eta_seconds"], 300)

    def test_route_waypoints_present(self):
        """Should include at least 2 waypoints (start + end)."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertGreaterEqual(len(result["route_waypoints"]), 2)

    def test_mobility_accessibility_filter(self):
        """With mobility needs, should only recommend accessible facilities."""
        result = recommend_restroom(
            self.user_location, self.facilities, ["mobility"],
            self.game_state, self.crowd_density
        )
        self.assertTrue(result["accessibility_compliant"])

    def test_alternatives_provided(self):
        """Should provide alternative options."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertIn("alternatives", result)
        self.assertGreater(len(result["alternatives"]), 0)

    def test_game_context_mentions_halftime(self):
        """Game context should mention upcoming halftime."""
        result = recommend_restroom(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertIn("alftime", result["game_context"].lower())


class TestFoodRecommendation(unittest.TestCase):
    """Test food recommendation logic."""

    def setUp(self):
        self.user_location = {"latitude": 35.2273, "longitude": -81.8388}
        self.game_state = {"quarter": 2, "minutes_remaining": 4.0, "game_momentum": "halftime_approaching"}
        self.crowd_density = {"overall": 0.78}
        self.facilities = []
        for f in FACILITIES:
            entry = {**f}
            entry["wait_time_minutes"] = 5
            entry["capacity_remaining"] = 3
            self.facilities.append(entry)

    def test_returns_food_type(self):
        """Should return action_type 'food'."""
        result = recommend_food(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertEqual(result["action_type"], "food")

    def test_dietary_filter(self):
        """With vegetarian filter, should only suggest vegetarian vendors."""
        result = recommend_food(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density,
            dietary_restrictions=["vegetarian"]
        )
        # Should find at least one vendor
        self.assertIsNotNone(result["destination"])


class TestExitRecommendation(unittest.TestCase):
    """Test exit/navigation recommendation."""

    def setUp(self):
        self.user_location = {"latitude": 35.2273, "longitude": -81.8388}
        self.game_state = {"quarter": 4, "minutes_remaining": 0}
        self.crowd_density = {"overall": 0.78, "concourse_north": 0.5, "concourse_south": 0.3}
        self.facilities = []
        for f in FACILITIES:
            entry = {**f}
            entry["wait_time_minutes"] = 0
            entry["capacity_remaining"] = f["capacity"]
            self.facilities.append(entry)

    def test_returns_navigation_type(self):
        result = recommend_exit(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density
        )
        self.assertEqual(result["action_type"], "navigation")

    def test_emergency_returns_safety_type(self):
        result = recommend_exit(
            self.user_location, self.facilities, [],
            self.game_state, self.crowd_density,
            is_emergency=True
        )
        self.assertEqual(result["action_type"], "safety")
        self.assertGreaterEqual(result["confidence_score"], 0.95)


class TestMainEntryPoint(unittest.TestCase):
    """Test the get_recommendation dispatcher."""

    def setUp(self):
        self.user_location = {"latitude": 35.2273, "longitude": -81.8388}
        self.game_state = {"quarter": 2, "minutes_remaining": 4.0, "game_momentum": "halftime_approaching"}
        self.crowd_density = {"overall": 0.78}
        self.facilities = []
        for f in FACILITIES:
            entry = {**f}
            entry["wait_time_minutes"] = 5
            entry["capacity_remaining"] = 3
            self.facilities.append(entry)

    def test_restroom_intent(self):
        result = get_recommendation(self.user_location, "restroom", self.facilities,
                                     self.game_state, self.crowd_density)
        self.assertEqual(result["action_type"], "restroom")

    def test_food_intent(self):
        result = get_recommendation(self.user_location, "food", self.facilities,
                                     self.game_state, self.crowd_density)
        self.assertEqual(result["action_type"], "food")

    def test_exit_intent(self):
        result = get_recommendation(self.user_location, "exit", self.facilities,
                                     self.game_state, self.crowd_density)
        self.assertEqual(result["action_type"], "navigation")

    def test_emergency_intent(self):
        result = get_recommendation(self.user_location, "emergency", self.facilities,
                                     self.game_state, self.crowd_density, is_emergency=True)
        self.assertEqual(result["action_type"], "safety")

    def test_unknown_intent_fallback(self):
        result = get_recommendation(self.user_location, "unknown_thing", self.facilities,
                                     self.game_state, self.crowd_density)
        self.assertIn("Unknown intent", result["recommendation"])


class TestVenueState(unittest.TestCase):
    """Test the simulated venue state."""

    def test_reset(self):
        """Reset should restore demo scenario values."""
        state = VenueState()
        state.wait_times["restroom-202"] = 99
        state.reset()
        self.assertNotEqual(state.wait_times["restroom-202"], 99)

    def test_demo_scenario(self):
        """Demo scenario should set specific wait times."""
        state = VenueState()
        state.set_demo_scenario()
        self.assertEqual(state.wait_times["restroom-202"], 15)
        self.assertEqual(state.wait_times["restroom-205"], 2)

    def test_facility_status_includes_wait_times(self):
        """Facility status should include wait_time_minutes."""
        state = VenueState()
        facilities = state.get_facility_status()
        self.assertGreater(len(facilities), 0)
        for f in facilities:
            self.assertIn("wait_time_minutes", f)

    def test_emergency_trigger_and_clear(self):
        """Emergency alert lifecycle."""
        state = VenueState()
        alert = state.trigger_emergency("Test emergency")
        self.assertTrue(alert["active"])
        self.assertEqual(len(state.emergency_alerts), 1)

        state.clear_emergency()
        self.assertEqual(len(state.emergency_alerts), 0)


class TestAPIEndpoints(unittest.TestCase):
    """Test FastAPI endpoints via test client."""

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app import app
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        """Health check should return 200 with 'healthy' status."""
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_recommendation_endpoint(self):
        """POST /api/v1/recommendations should return a valid recommendation."""
        response = self.client.post('/api/v1/recommendations', json={
            "user_id": "test_user",
            "location": {"latitude": 35.2273, "longitude": -81.8388},
            "intent": "restroom",
            "accessibility_needs": ["mobility"],
            "seat_section": 202,
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        rec = data["recommendation"]
        self.assertEqual(rec["action_type"], "restroom")
        self.assertTrue(rec["accessibility_compliant"])
        self.assertGreaterEqual(rec["confidence_score"], 0.0)
        self.assertLessEqual(rec["confidence_score"], 1.0)

    def test_missing_fields_returns_422(self):
        """Missing required fields should return 422."""
        response = self.client.post('/api/v1/recommendations', json={
            "user_id": "test"
        })
        self.assertEqual(response.status_code, 422)

    def test_invalid_intent_returns_422(self):
        """Invalid intent should return 422."""
        response = self.client.post('/api/v1/recommendations', json={
            "user_id": "test",
            "location": {"latitude": 35.2, "longitude": -81.8},
            "intent": "invalid_intent",
        })
        self.assertEqual(response.status_code, 422)

    def test_venue_status_get(self):
        """GET venue status should return facilities and game state."""
        response = self.client.get('/api/v1/venue-status')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("facilities", data)
        self.assertIn("game_state", data)
        self.assertIn("crowd_density", data)

    def test_demo_reset_endpoint(self):
        """Reset demo should succeed."""
        response = self.client.post('/api/v1/demo/reset')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_analytics_endpoint(self):
        """Analytics endpoint should return valid data."""
        response = self.client.get('/api/v1/analytics')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total_recommendations", data)

    def test_emergency_requires_admin_key(self):
        """Emergency endpoint without admin key should return 401."""
        response = self.client.post('/api/v1/emergency', json={
            "message": "Test"
        })
        self.assertEqual(response.status_code, 401)

    def test_emergency_with_admin_key(self):
        """Emergency with valid admin key should succeed."""
        import os
        admin_key = os.getenv("ADMIN_KEY", "demo-admin-key")
        response = self.client.post('/api/v1/emergency',
            json={"message": "Test emergency"},
            headers={"X-Admin-Key": admin_key}
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

        # Clear it
        self.client.post('/api/v1/emergency/clear',
            headers={"X-Admin-Key": admin_key}
        )
        # Reset to prevent state leakage
        self.client.post('/api/v1/demo/reset')


# ── Additional tests added for coverage expansion ────────────────────

class TestStatusEndpoint(unittest.TestCase):
    """Tests for the /status system endpoint."""

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app import app
        cls.client = TestClient(app)

    def test_status_returns_200(self):
        """Status endpoint must return HTTP 200."""
        response = self.client.get("/status")
        self.assertEqual(response.status_code, 200)

    def test_status_has_version(self):
        """Status must include version field."""
        data = self.client.get("/status").json()
        self.assertIn("version", data)

    def test_status_has_features(self):
        """Status must expose feature flags."""
        data = self.client.get("/status").json()
        self.assertIn("features", data)
        self.assertIn("gemini_ai", data["features"])

    def test_status_has_sports(self):
        """Status must list supported sports."""
        data = self.client.get("/status").json()
        self.assertIn("sports_supported", data)
        self.assertIn("IPL", data["sports_supported"])

    def test_status_has_languages(self):
        """Status must list supported languages."""
        data = self.client.get("/status").json()
        self.assertIn("languages_supported", data)
        self.assertGreaterEqual(len(data["languages_supported"]), 5)


class TestOpenAPISchema(unittest.TestCase):
    """Tests verifying the OpenAPI contract is well-formed."""

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app import app
        cls.client = TestClient(app)

    def test_openapi_json_exists(self):
        """OpenAPI schema endpoint must exist."""
        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)

    def test_openapi_has_all_tags(self):
        """OpenAPI schema must declare expected tags."""
        schema = self.client.get("/openapi.json").json()
        tag_names = [t["name"] for t in schema.get("tags", [])]
        for expected in ["System", "Recommendations", "Venue", "Emergency", "Analytics", "Demo"]:
            self.assertIn(expected, tag_names, f"Missing tag: {expected}")

    def test_openapi_has_contact(self):
        """OpenAPI schema must include contact information."""
        schema = self.client.get("/openapi.json").json()
        self.assertIn("contact", schema.get("info", {}))

    def test_openapi_has_license(self):
        """OpenAPI schema must include license information."""
        schema = self.client.get("/openapi.json").json()
        info = schema.get("info", {})
        self.assertIn("license", info)

    def test_openapi_version_matches(self):
        """OpenAPI version should match health endpoint version."""
        schema = self.client.get("/openapi.json").json()
        self.assertEqual(schema["info"]["version"], "2.0.0")


class TestInputBoundaries(unittest.TestCase):
    """Edge case and boundary tests for input validation."""

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app import app
        cls.client = TestClient(app)

    def test_recommendation_missing_body_returns_422(self):
        """POST to recommendations with no body must return 422."""
        response = self.client.post("/api/v1/recommendations", json={})
        self.assertEqual(response.status_code, 422)

    def test_recommendation_invalid_intent_returns_422(self):
        """POST with invalid intent value must fail validation."""
        response = self.client.post("/api/v1/recommendations", json={
            "user_id": "test",
            "location": {"latitude": 20.0, "longitude": 85.0},
            "intent": "INVALID_INTENT_XYZ",
            "accessibility_needs": [],
            "seat_section": 101
        })
        # Either 422 (Pydantic rejected) or 400 (app rejected) — not 500
        self.assertIn(response.status_code, [400, 422])

    def test_health_method_not_allowed(self):
        """POST to /health must return 405 Method Not Allowed."""
        response = self.client.post("/health")
        self.assertEqual(response.status_code, 405)

    def test_invalid_latitude_rejected(self):
        """Location with latitude > 90 must be rejected."""
        response = self.client.post("/api/v1/recommendations", json={
            "user_id": "test",
            "location": {"latitude": 999.0, "longitude": 85.0},
            "intent": "restroom",
        })
        self.assertEqual(response.status_code, 422)

    def test_invalid_longitude_rejected(self):
        """Location with longitude < -180 must be rejected."""
        response = self.client.post("/api/v1/recommendations", json={
            "user_id": "test",
            "location": {"latitude": 20.0, "longitude": -999.0},
            "intent": "restroom",
        })
        self.assertEqual(response.status_code, 422)


class TestSecurityHeaders(unittest.TestCase):
    """Tests verifying security posture."""

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app import app
        cls.client = TestClient(app)

    def test_admin_endpoint_rejects_no_key(self):
        """Admin endpoint must reject requests without admin key."""
        response = self.client.post("/api/v1/venue-status", json={
            "facility_id": "test",
            "wait_time_minutes": 5,
            "crowd_density": 0.5
        })
        # Must not be 200 — should be 401 or 403
        self.assertIn(response.status_code, [401, 403])

    def test_game_state_rejects_no_key(self):
        """Game state update must reject requests without admin key."""
        response = self.client.post("/api/v1/game-state", json={
            "quarter": 3,
            "minutes_remaining": 10.0,
        })
        self.assertEqual(response.status_code, 401)

    def test_emergency_clear_rejects_no_key(self):
        """Emergency clear must reject requests without admin key."""
        response = self.client.post("/api/v1/emergency/clear")
        self.assertEqual(response.status_code, 401)

    def test_demo_reset_accessible_without_auth(self):
        """Demo reset must be publicly accessible."""
        response = self.client.post("/api/v1/demo/reset")
        self.assertIn(response.status_code, [200, 201])


if __name__ == '__main__':
    unittest.main()
