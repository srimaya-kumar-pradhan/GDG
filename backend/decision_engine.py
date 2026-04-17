"""
VenueFlow AI - Rule-Based Decision Engine
Primary decision engine. Gemini is optional enhancement, not dependency.
Uses Haversine formula for all distance calculations.
"""

import math
from datetime import datetime, timezone
from typing import Optional


# ─────────────────────────────────────────────
# Haversine Distance Calculation
# ─────────────────────────────────────────────

EARTH_RADIUS_METERS = 6_371_000  # Mean Earth radius in meters
AVERAGE_WALK_SPEED_MPS = 1.2     # ~1.2 m/s indoor walking speed (conservative)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth
    using the Haversine formula:  distance = 2 * R * asin(sqrt(a))

    Earth radius = 6371 km (6,371,000 m).
    Returns distance in meters.
    """
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2)

    # Canonical Haversine: 2 * R * asin(sqrt(a))
    distance = 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(a))

    return distance


def estimate_walk_time_seconds(distance_meters: float) -> int:
    """Estimate walking time in seconds, with a 20% indoor-navigation overhead."""
    return int((distance_meters / AVERAGE_WALK_SPEED_MPS) * 1.2)


def generate_waypoints(start: dict, end: dict, num_points: int = 3) -> list:
    """
    Generate intermediate waypoints between start and end locations.
    In production, this would use Google Maps Directions API.
    For MVP, we linearly interpolate + add slight curve for realistic turns.
    """
    waypoints = [
        {"latitude": start["latitude"], "longitude": start["longitude"], "description": "Start - your current location"}
    ]

    for i in range(1, num_points + 1):
        fraction = i / (num_points + 1)
        lat = start["latitude"] + (end["latitude"] - start["latitude"]) * fraction
        lon = start["longitude"] + (end["longitude"] - start["longitude"]) * fraction

        # Add slight curve to simulate hallway turns
        offset = 0.00005 * math.sin(fraction * math.pi)
        lat += offset

        desc = f"Continue along concourse" if i < num_points else "Approaching destination"
        waypoints.append({"latitude": round(lat, 6), "longitude": round(lon, 6), "description": desc})

    waypoints.append(
        {"latitude": end["latitude"], "longitude": end["longitude"], "description": f"Destination reached"}
    )
    return waypoints


# ─────────────────────────────────────────────
# Game Timing Intelligence
# ─────────────────────────────────────────────

def analyze_game_timing(game_state: dict) -> dict:
    """
    Analyze game clock to determine optimal action timing.

    Returns:
        dict with keys: is_good_time, reason, minutes_to_break, priority
    """
    quarter = game_state.get("quarter", 1)
    minutes_remaining = game_state.get("minutes_remaining", 15.0)
    momentum = game_state.get("game_momentum", "normal")
    is_timeout = game_state.get("is_timeout", False)
    is_halftime = game_state.get("is_halftime", False)

    # Halftime — best time to move
    if is_halftime:
        return {
            "is_good_time": True,
            "reason": "It's halftime — great time to move around",
            "minutes_to_break": 0,
            "priority": "high",
        }

    # Timeout — good window
    if is_timeout:
        return {
            "is_good_time": True,
            "reason": "Timeout in progress — you have a few minutes",
            "minutes_to_break": 0,
            "priority": "high",
        }

    # Approaching halftime (< 5 min in Q2)
    if quarter == 2 and minutes_remaining <= 5:
        return {
            "is_good_time": True,
            "reason": f"Halftime in ~{int(minutes_remaining)} min — beat the rush now",
            "minutes_to_break": minutes_remaining,
            "priority": "high",
        }

    # Approaching end of quarter
    if minutes_remaining <= 2:
        return {
            "is_good_time": True,
            "reason": f"Quarter ends in ~{int(minutes_remaining)} min — good window coming",
            "minutes_to_break": minutes_remaining,
            "priority": "medium",
        }

    # Close game — suppress non-urgent notifications
    if momentum == "critical_play":
        return {
            "is_good_time": False,
            "reason": "Critical play in progress — recommend waiting",
            "minutes_to_break": minutes_remaining,
            "priority": "low",
        }

    # Default
    return {
        "is_good_time": False,
        "reason": f"Game in progress — next break in ~{int(minutes_remaining)} min",
        "minutes_to_break": minutes_remaining,
        "priority": "medium",
    }


# ─────────────────────────────────────────────
# Accessibility Filtering
# ─────────────────────────────────────────────

def filter_for_accessibility(facilities: list, needs: list) -> list:
    """
    Filter facilities based on user accessibility needs.
    - 'mobility': Only facilities with ramps/elevators, marked accessible
    - 'visual': Prefer facilities on same floor (fewer transitions)
    - 'hearing': No filtering needed (visual signage assumed)
    """
    if not needs:
        return facilities

    filtered = facilities[:]

    if "mobility" in needs:
        filtered = [f for f in filtered if f.get("accessible", False)]

    return filtered


# ─────────────────────────────────────────────
# Core Recommendation Logic
# ─────────────────────────────────────────────

def recommend_restroom(
    user_location: dict,
    facilities: list,
    accessibility_needs: list,
    game_state: dict,
    crowd_density: dict,
) -> dict:
    """
    RESTROOM LOGIC:
    - Identify restrooms within 5-minute walk
    - If wait time > 3 min, suggest alternative
    - Filter for accessibility
    - Rank by composite score (distance + wait time)
    """
    restrooms = [f for f in facilities if f["type"] == "restroom"]
    restrooms = filter_for_accessibility(restrooms, accessibility_needs)

    if not restrooms:
        return _fallback_response("No accessible restrooms found nearby", "restroom", game_state)

    # Score each restroom
    scored = []
    for r in restrooms:
        dist = haversine_distance(
            user_location["latitude"], user_location["longitude"],
            r["location"]["latitude"], r["location"]["longitude"]
        )
        walk_time = estimate_walk_time_seconds(dist)
        wait_time = r.get("wait_time_minutes", 0)

        # Skip facilities > 5 min walk
        if walk_time > 300:
            continue

        # Composite score: lower is better
        # Weight: 60% wait time, 40% walk time (wait is more frustrating)
        score = (wait_time * 60 * 0.6) + (walk_time * 0.4)

        scored.append({
            "facility": r,
            "distance_m": round(dist, 1),
            "walk_time_s": walk_time,
            "wait_time_min": wait_time,
            "score": score,
        })

    if not scored:
        return _fallback_response("No restrooms within 5-minute walk range", "restroom", game_state)

    # Sort by score (best first)
    scored.sort(key=lambda x: x["score"])
    best = scored[0]
    timing = analyze_game_timing(game_state)

    # Build recommendation text
    walk_min = best["walk_time_s"] // 60
    walk_sec = best["walk_time_s"] % 60
    walk_str = f"{walk_min} min {walk_sec} sec" if walk_min > 0 else f"{walk_sec} seconds"

    recommendation_text = (
        f"{best['facility']['name']} is {walk_str} away with a "
        f"{best['wait_time_min']}-minute wait."
    )

    # Add comparison if the user's nearest restroom is crowded
    if len(scored) > 1 and scored[0]["facility"]["id"] != scored[-1]["facility"]["id"]:
        worst = scored[-1]
        if worst["wait_time_min"] > best["wait_time_min"] + 3:
            recommendation_text += (
                f" That's much better than {worst['facility']['name']} "
                f"({worst['wait_time_min']}-min wait)."
            )

    # Add timing context
    if timing["is_good_time"]:
        recommendation_text += f" {timing['reason']}."

    waypoints = generate_waypoints(user_location, best["facility"]["location"])

    return {
        "recommendation": recommendation_text,
        "action_type": "restroom",
        "destination": best["facility"]["name"],
        "destination_id": best["facility"]["id"],
        "route_waypoints": waypoints,
        "eta_seconds": best["walk_time_s"],
        "wait_time_at_destination": best["wait_time_min"],
        "confidence_score": _calculate_confidence(best, crowd_density),
        "accessibility_compliant": _is_accessible(best["facility"], accessibility_needs),
        "game_context": timing["reason"],
        "data_freshness": "fresh",
        "notification_priority": timing["priority"],
        "alternatives": [
            {
                "name": s["facility"]["name"],
                "walk_time_s": s["walk_time_s"],
                "wait_time_min": s["wait_time_min"],
                "accessible": s["facility"].get("accessible", False),
            }
            for s in scored[1:4]  # Top 3 alternatives
        ],
        "fallback_action": "Ask nearest staff member for assistance" if not scored else None,
    }


def recommend_food(
    user_location: dict,
    facilities: list,
    accessibility_needs: list,
    game_state: dict,
    crowd_density: dict,
    dietary_restrictions: Optional[list] = None,
) -> dict:
    """
    FOOD & CONCESSIONS LOGIC:
    - Predict 'best time to grab a snack' = 5 min before halftime rush
    - Suggest short-queue, preferred food option
    - Filter by dietary restrictions
    """
    vendors = [f for f in facilities if f["type"] == "food"]
    vendors = filter_for_accessibility(vendors, accessibility_needs)

    # Filter by dietary restrictions
    if dietary_restrictions:
        vendors = [
            v for v in vendors
            if any(d in v.get("dietary", []) for d in dietary_restrictions)
        ]

    if not vendors:
        return _fallback_response("No matching food vendors found", "food", game_state)

    # Score vendors
    scored = []
    for v in vendors:
        dist = haversine_distance(
            user_location["latitude"], user_location["longitude"],
            v["location"]["latitude"], v["location"]["longitude"]
        )
        walk_time = estimate_walk_time_seconds(dist)
        wait_time = v.get("wait_time_minutes", 0)

        if walk_time > 600:  # 10 min max for food
            continue

        score = (wait_time * 60 * 0.5) + (walk_time * 0.5)
        scored.append({
            "facility": v,
            "distance_m": round(dist, 1),
            "walk_time_s": walk_time,
            "wait_time_min": wait_time,
            "score": score,
        })

    if not scored:
        return _fallback_response("No food vendors within walking range", "food", game_state)

    scored.sort(key=lambda x: x["score"])
    best = scored[0]
    timing = analyze_game_timing(game_state)

    walk_str = _format_walk_time(best["walk_time_s"])

    recommendation_text = (
        f"{best['facility']['name']} ({best['facility'].get('cuisine', 'Food')}) is "
        f"{walk_str} away with a {best['wait_time_min']}-minute wait."
    )

    if timing["is_good_time"]:
        recommendation_text += f" {timing['reason']} — beat the rush!"

    waypoints = generate_waypoints(user_location, best["facility"]["location"])

    return {
        "recommendation": recommendation_text,
        "action_type": "food",
        "destination": best["facility"]["name"],
        "destination_id": best["facility"]["id"],
        "route_waypoints": waypoints,
        "eta_seconds": best["walk_time_s"],
        "wait_time_at_destination": best["wait_time_min"],
        "confidence_score": _calculate_confidence(best, crowd_density),
        "accessibility_compliant": _is_accessible(best["facility"], accessibility_needs),
        "game_context": timing["reason"],
        "data_freshness": "fresh",
        "notification_priority": timing["priority"],
        "alternatives": [
            {
                "name": s["facility"]["name"],
                "cuisine": s["facility"].get("cuisine", ""),
                "walk_time_s": s["walk_time_s"],
                "wait_time_min": s["wait_time_min"],
            }
            for s in scored[1:4]
        ],
        "fallback_action": None,
    }


def recommend_exit(
    user_location: dict,
    facilities: list,
    accessibility_needs: list,
    game_state: dict,
    crowd_density: dict,
    is_emergency: bool = False,
) -> dict:
    """
    NAVIGATION / EXIT LOGIC:
    - Find nearest exit
    - For emergencies, calculate fastest safe route
    - For mobility-impaired, route to accessible exits only
    """
    exits = [f for f in facilities if f["type"] == "exit"]
    exits = filter_for_accessibility(exits, accessibility_needs)

    if not exits:
        # Fallback: return all exits if accessibility filter removes everything
        exits = [f for f in facilities if f["type"] == "exit"]

    scored = []
    for e in exits:
        dist = haversine_distance(
            user_location["latitude"], user_location["longitude"],
            e["location"]["latitude"], e["location"]["longitude"]
        )
        walk_time = estimate_walk_time_seconds(dist)

        # In emergency, prioritize speed. Otherwise consider crowd density too.
        section_key = f"concourse_{e['id'].split('-')[1]}" if "-" in e["id"] else "overall"
        density = crowd_density.get(section_key, 0.5)

        if is_emergency:
            score = walk_time  # Pure speed
        else:
            score = walk_time * (1 + density * 0.5)  # Factor in crowd density

        scored.append({
            "facility": e,
            "distance_m": round(dist, 1),
            "walk_time_s": walk_time,
            "wait_time_min": 0,
            "density": density,
            "score": score,
        })

    scored.sort(key=lambda x: x["score"])
    best = scored[0]

    walk_str = _format_walk_time(best["walk_time_s"])

    if is_emergency:
        recommendation_text = (
            f"⚠️ EMERGENCY: Head to {best['facility']['name']} immediately — "
            f"{walk_str} away. Follow illuminated exit signs."
        )
        priority = "high"
    else:
        recommendation_text = (
            f"{best['facility']['name']} is the closest exit — {walk_str} away."
        )
        priority = "medium"

    waypoints = generate_waypoints(user_location, best["facility"]["location"], num_points=2)

    return {
        "recommendation": recommendation_text,
        "action_type": "safety" if is_emergency else "navigation",
        "destination": best["facility"]["name"],
        "destination_id": best["facility"]["id"],
        "route_waypoints": waypoints,
        "eta_seconds": best["walk_time_s"],
        "wait_time_at_destination": 0,
        "confidence_score": 0.98 if is_emergency else _calculate_confidence(best, crowd_density),
        "accessibility_compliant": _is_accessible(best["facility"], accessibility_needs),
        "game_context": "Emergency evacuation" if is_emergency else "Finding your exit",
        "data_freshness": "fresh",
        "notification_priority": priority,
        "alternatives": [
            {
                "name": s["facility"]["name"],
                "walk_time_s": s["walk_time_s"],
                "accessible": s["facility"].get("accessible", False),
            }
            for s in scored[1:3]
        ],
        "fallback_action": "Follow nearest staff member to safety" if is_emergency else None,
    }


def recommend_seat(
    user_location: dict,
    seat_section: int,
    sections: dict,
    accessibility_needs: list,
    game_state: dict,
    crowd_density: dict,
) -> dict:
    """
    SEAT-FINDING LOGIC:
    - Route user back to their section
    """
    section = sections.get(seat_section)
    if not section:
        return _fallback_response(f"Section {seat_section} not found", "navigation", game_state)

    dest_location = section["center"]
    dist = haversine_distance(
        user_location["latitude"], user_location["longitude"],
        dest_location["latitude"], dest_location["longitude"]
    )
    walk_time = estimate_walk_time_seconds(dist)
    walk_str = _format_walk_time(walk_time)
    timing = analyze_game_timing(game_state)

    recommendation_text = f"Your seat in {section['name']} is {walk_str} away."
    if timing.get("is_good_time"):
        recommendation_text += f" {timing['reason']}."

    waypoints = generate_waypoints(user_location, dest_location, num_points=2)

    return {
        "recommendation": recommendation_text,
        "action_type": "navigation",
        "destination": section["name"],
        "destination_id": f"section-{seat_section}",
        "route_waypoints": waypoints,
        "eta_seconds": walk_time,
        "wait_time_at_destination": 0,
        "confidence_score": 0.95,
        "accessibility_compliant": True,
        "game_context": timing["reason"],
        "data_freshness": "fresh",
        "notification_priority": timing["priority"],
        "alternatives": [],
        "fallback_action": "Ask nearest usher for directions",
    }


# ─────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────

def get_recommendation(
    user_location: dict,
    intent: str,
    facilities: list,
    game_state: dict,
    crowd_density: dict,
    accessibility_needs: Optional[list] = None,
    seat_section: Optional[int] = None,
    dietary_restrictions: Optional[list] = None,
    sections: Optional[dict] = None,
    is_emergency: bool = False,
) -> dict:
    """
    Main decision function. Routes to appropriate sub-engine.

    Args:
        user_location: {"latitude": float, "longitude": float}
        intent: "restroom" | "food" | "exit" | "seat"
        facilities: list of facility dicts with wait times
        game_state: current game state dict
        crowd_density: crowd density map
        accessibility_needs: list of needs (e.g., ["mobility"])
        seat_section: int section number (for "seat" intent)
        dietary_restrictions: list of dietary needs (for "food" intent)
        sections: dict of section layouts
        is_emergency: bool

    Returns:
        dict: structured recommendation (always valid JSON-serializable)
    """
    needs = accessibility_needs or []

    if is_emergency or intent == "emergency":
        return recommend_exit(
            user_location, facilities, needs, game_state, crowd_density, is_emergency=True
        )

    if intent == "restroom":
        return recommend_restroom(
            user_location, facilities, needs, game_state, crowd_density
        )

    if intent == "food":
        return recommend_food(
            user_location, facilities, needs, game_state, crowd_density, dietary_restrictions
        )

    if intent == "exit" or intent == "navigation":
        return recommend_exit(
            user_location, facilities, needs, game_state, crowd_density, is_emergency=False
        )

    if intent == "seat":
        return recommend_seat(
            user_location, seat_section or 202, sections or {}, needs, game_state, crowd_density
        )

    return _fallback_response(f"Unknown intent: {intent}", "navigation", game_state)


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _format_walk_time(seconds: int) -> str:
    """Format walk time as human-readable string."""
    minutes = seconds // 60
    secs = seconds % 60
    if minutes > 0:
        return f"{minutes} min {secs} sec"
    return f"{secs} seconds"


def _calculate_confidence(scored_item: dict, crowd_density: dict) -> float:
    """
    Calculate confidence score 0.0–1.0 based on data quality and conditions.
    Higher confidence when wait times are low and data is recent.
    """
    wait = scored_item.get("wait_time_min", 0)
    overall_density = crowd_density.get("overall", 0.5)

    # Start with high base confidence
    confidence = 0.95

    # Decrease if venue is very crowded (data becomes less reliable)
    if overall_density > 0.85:
        confidence -= 0.15
    elif overall_density > 0.70:
        confidence -= 0.05

    # Decrease if wait time is very high (situation may change)
    if wait > 10:
        confidence -= 0.10
    elif wait > 5:
        confidence -= 0.05

    return round(max(0.1, min(1.0, confidence)), 2)


def _is_accessible(facility: dict, needs: list) -> bool:
    """Check if facility meets all accessibility needs."""
    if not needs:
        return True
    if "mobility" in needs and not facility.get("accessible", False):
        return False
    return True


def _fallback_response(message: str, action_type: str, game_state: dict) -> dict:
    """Generate a fallback response when no recommendation is possible."""
    timing = analyze_game_timing(game_state)
    return {
        "recommendation": message,
        "action_type": action_type,
        "destination": None,
        "destination_id": None,
        "route_waypoints": [],
        "eta_seconds": -1,
        "wait_time_at_destination": -1,
        "confidence_score": 0.2,
        "accessibility_compliant": False,
        "game_context": timing["reason"],
        "data_freshness": "unavailable",
        "notification_priority": "low",
        "alternatives": [],
        "fallback_action": "Ask nearest staff member for assistance",
    }
