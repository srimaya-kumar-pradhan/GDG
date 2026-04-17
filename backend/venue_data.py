"""
VenueFlow AI - Simulated Venue Data Store
Replaces Firebase Realtime DB for MVP demo.
Contains stadium layout, facilities, and real-time simulation data.
"""

import math
import random
import time
from datetime import datetime, timezone
from typing import Optional

# ─────────────────────────────────────────────
# Stadium Configuration (Bank of America Stadium style)
# ─────────────────────────────────────────────

STADIUM_CENTER = {"latitude": 35.2258, "longitude": -81.8384}
STADIUM_NAME = "VenueFlow Demo Stadium"
STADIUM_CAPACITY = 50000

# ─────────────────────────────────────────────
# Facility Directory
# ─────────────────────────────────────────────

FACILITIES = [
    {
        "id": "restroom-201",
        "name": "Section 201 Restroom",
        "type": "restroom",
        "location": {"latitude": 35.2275, "longitude": -81.8392},
        "section": 201,
        "accessible": True,
        "capacity": 12,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": True,
    },
    {
        "id": "restroom-202",
        "name": "Section 202 Restroom",
        "type": "restroom",
        "location": {"latitude": 35.2273, "longitude": -81.8387},
        "section": 202,
        "accessible": True,
        "capacity": 10,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": True,
    },
    {
        "id": "restroom-205",
        "name": "Section 205 Restroom",
        "type": "restroom",
        "location": {"latitude": 35.2269, "longitude": -81.8385},
        "section": 205,
        "accessible": True,
        "capacity": 14,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": False,
    },
    {
        "id": "restroom-210",
        "name": "Section 210 Restroom",
        "type": "restroom",
        "location": {"latitude": 35.2260, "longitude": -81.8378},
        "section": 210,
        "accessible": False,
        "capacity": 8,
        "floor": "upper",
        "has_ramp": False,
        "has_elevator_nearby": False,
    },
    {
        "id": "restroom-concourse-east",
        "name": "Concourse East Restroom",
        "type": "restroom",
        "location": {"latitude": 35.2260, "longitude": -81.8380},
        "section": 0,
        "accessible": False,
        "capacity": 20,
        "floor": "concourse",
        "has_ramp": False,
        "has_elevator_nearby": False,
    },
    {
        "id": "food-bbq-201",
        "name": "Smokey's BBQ",
        "type": "food",
        "location": {"latitude": 35.2274, "longitude": -81.8390},
        "section": 201,
        "accessible": True,
        "capacity": 6,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": True,
        "cuisine": "BBQ",
        "dietary": ["gluten_free_options"],
    },
    {
        "id": "food-pizza-204",
        "name": "Stadium Slice",
        "type": "food",
        "location": {"latitude": 35.2270, "longitude": -81.8388},
        "section": 204,
        "accessible": True,
        "capacity": 4,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": False,
        "cuisine": "Pizza",
        "dietary": ["vegetarian"],
    },
    {
        "id": "food-tacos-208",
        "name": "Taco Fiesta",
        "type": "food",
        "location": {"latitude": 35.2262, "longitude": -81.8376},
        "section": 208,
        "accessible": True,
        "capacity": 5,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": False,
        "cuisine": "Mexican",
        "dietary": ["vegetarian", "gluten_free_options"],
    },
    {
        "id": "food-drinks-206",
        "name": "Cold Brew Corner",
        "type": "food",
        "location": {"latitude": 35.2265, "longitude": -81.8382},
        "section": 206,
        "accessible": True,
        "capacity": 3,
        "floor": "concourse",
        "has_ramp": True,
        "has_elevator_nearby": False,
        "cuisine": "Drinks",
        "dietary": [],
    },
    {
        "id": "exit-north",
        "name": "North Gate Exit",
        "type": "exit",
        "location": {"latitude": 35.2282, "longitude": -81.8384},
        "section": 0,
        "accessible": True,
        "capacity": 100,
        "floor": "ground",
        "has_ramp": True,
        "has_elevator_nearby": True,
    },
    {
        "id": "exit-south",
        "name": "South Gate Exit",
        "type": "exit",
        "location": {"latitude": 35.2240, "longitude": -81.8384},
        "section": 0,
        "accessible": True,
        "capacity": 100,
        "floor": "ground",
        "has_ramp": True,
        "has_elevator_nearby": True,
    },
    {
        "id": "exit-east",
        "name": "East Gate Exit",
        "type": "exit",
        "location": {"latitude": 35.2258, "longitude": -81.8370},
        "section": 0,
        "accessible": False,
        "capacity": 60,
        "floor": "ground",
        "has_ramp": False,
        "has_elevator_nearby": False,
    },
    {
        "id": "exit-west",
        "name": "West Gate Exit",
        "type": "exit",
        "location": {"latitude": 35.2258, "longitude": -81.8398},
        "section": 0,
        "accessible": True,
        "capacity": 80,
        "floor": "ground",
        "has_ramp": True,
        "has_elevator_nearby": True,
    },
]

# ─────────────────────────────────────────────
# Section Layout (for seat-finding)
# ─────────────────────────────────────────────

SECTIONS = {
    201: {"center": {"latitude": 35.2276, "longitude": -81.8391}, "name": "Section 201", "level": "lower"},
    202: {"center": {"latitude": 35.2273, "longitude": -81.8388}, "name": "Section 202", "level": "lower"},
    203: {"center": {"latitude": 35.2271, "longitude": -81.8386}, "name": "Section 203", "level": "lower"},
    204: {"center": {"latitude": 35.2269, "longitude": -81.8387}, "name": "Section 204", "level": "lower"},
    205: {"center": {"latitude": 35.2267, "longitude": -81.8386}, "name": "Section 205", "level": "lower"},
    206: {"center": {"latitude": 35.2265, "longitude": -81.8383}, "name": "Section 206", "level": "lower"},
    207: {"center": {"latitude": 35.2263, "longitude": -81.8380}, "name": "Section 207", "level": "lower"},
    208: {"center": {"latitude": 35.2261, "longitude": -81.8377}, "name": "Section 208", "level": "lower"},
    209: {"center": {"latitude": 35.2259, "longitude": -81.8375}, "name": "Section 209", "level": "lower"},
    210: {"center": {"latitude": 35.2257, "longitude": -81.8373}, "name": "Section 210", "level": "upper"},
}


# ─────────────────────────────────────────────
# Real-Time State (Mutable / Simulated)
# ─────────────────────────────────────────────

class VenueState:
    """Simulates real-time venue conditions. In production, this would read from Firebase."""

    def __init__(self):
        self.reset()

    def reset(self):
        """Reset to initial demo state."""
        self._last_update = time.time()

        # Game state
        self.game_state = {
            "sport": "Football",
            "home_team": "Panthers",
            "away_team": "Falcons",
            "home_score": 14,
            "away_score": 10,
            "quarter": 2,
            "minutes_remaining": 4.0,
            "game_momentum": "halftime_approaching",
            "is_timeout": False,
            "is_halftime": False,
            "status": "in_progress",
        }

        # Wait times per facility (minutes)
        self.wait_times = {
            "restroom-201": 5,
            "restroom-202": 15,
            "restroom-205": 2,
            "restroom-210": 7,
            "restroom-concourse-east": 8,
            "food-bbq-201": 12,
            "food-pizza-204": 4,
            "food-tacos-208": 6,
            "food-drinks-206": 2,
            "exit-north": 0,
            "exit-south": 0,
            "exit-east": 0,
            "exit-west": 0,
        }

        # Crowd density per section (0.0 - 1.0)
        self.crowd_density = {
            "overall": 0.78,
            "section_201": 0.65,
            "section_202": 0.45,
            "section_203": 0.70,
            "section_204": 0.55,
            "section_205": 0.25,
            "section_206": 0.60,
            "section_207": 0.72,
            "section_208": 0.40,
            "section_209": 0.50,
            "section_210": 0.80,
            "concourse_north": 0.82,
            "concourse_south": 0.55,
            "concourse_east": 0.70,
            "concourse_west": 0.45,
        }

        # Emergency alerts
        self.emergency_alerts = []

        # Recommendation log
        self.recommendation_log = []

    def add_jitter(self):
        """Add realistic random fluctuation to wait times and crowd density."""
        now = time.time()
        if now - self._last_update < 10:
            return  # Only update every 10 seconds

        self._last_update = now

        for fid in self.wait_times:
            base = self.wait_times[fid]
            if base > 0:
                delta = random.randint(-1, 2)
                self.wait_times[fid] = max(0, min(25, base + delta))

        for key in self.crowd_density:
            base = self.crowd_density[key]
            delta = random.uniform(-0.03, 0.03)
            self.crowd_density[key] = max(0.0, min(1.0, round(base + delta, 2)))

    def get_facility_status(self):
        """Return facilities with current wait times."""
        self.add_jitter()
        result = []
        for facility in FACILITIES:
            fid = facility["id"]
            entry = {**facility}
            entry["wait_time_minutes"] = self.wait_times.get(fid, 0)
            entry["capacity_remaining"] = max(
                0, facility["capacity"] - int(self.wait_times.get(fid, 0) * 0.6)
            )
            result.append(entry)
        return result

    def get_game_state(self):
        """Return current game state."""
        return {**self.game_state}

    def get_crowd_density(self):
        """Return crowd density map."""
        self.add_jitter()
        return {**self.crowd_density}

    def trigger_emergency(self, message: str, exit_routes: Optional[list] = None):
        """Simulate emergency broadcast."""
        alert = {
            "active": True,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "exit_routes": exit_routes or ["exit-north", "exit-south", "exit-west"],
        }
        self.emergency_alerts = [alert]
        return alert

    def clear_emergency(self):
        """Clear emergency alerts."""
        self.emergency_alerts = []

    def set_demo_scenario(self):
        """
        Set up the exact demo scenario from the prompt:
        User in Section 202 → restroom crowded → system suggests Section 205
        """
        self.wait_times["restroom-202"] = 15  # Crowded
        self.wait_times["restroom-205"] = 2   # Available
        self.wait_times["restroom-201"] = 5
        self.crowd_density["section_202"] = 0.45
        self.crowd_density["section_205"] = 0.25
        self.game_state["quarter"] = 2
        self.game_state["minutes_remaining"] = 4.0
        self.game_state["game_momentum"] = "halftime_approaching"


# Global singleton
venue_state = VenueState()
venue_state.set_demo_scenario()
