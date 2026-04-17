"""
VenueFlow AI — IPL & Multi-Sport Decision Engine
India-focused match intelligence for cricket, football, kabaddi.

Extends the base decision engine with sport-specific timing logic,
cultural context awareness, and regional personalization.
"""

from typing import Optional


# ─────────────────────────────────────────────
# Sport Configurations (Pluggable Rule Sets)
# ─────────────────────────────────────────────

SPORT_CONFIGS = {
    "ipl": {
        "name": "Indian Premier League",
        "format": "T20",
        "total_overs": 20,
        "innings": 2,
        "strategic_timeout_over_1st": 6,   # Mandatory: end of 6th over (1st innings)
        "strategic_timeout_over_2nd": 13,  # Before 13th over (2nd innings)
        "powerplay_end": 6,
        "death_overs_start": 16,
        "mid_innings_break_minutes": 20,
        "typical_match_duration_hours": 3.5,
        "peak_crowd_moments": ["toss", "powerplay", "death_overs", "super_over", "dhoni_batting", "kohli_batting"],
        "fan_zone_types": ["team_merchandise", "photo_booth", "food_court", "kids_zone"],
    },
    "odi": {
        "name": "One Day International",
        "format": "ODI",
        "total_overs": 50,
        "innings": 2,
        "powerplay_end": 10,
        "death_overs_start": 40,
        "mid_innings_break_minutes": 40,
        "typical_match_duration_hours": 8,
        "peak_crowd_moments": ["toss", "powerplay", "death_overs", "century"],
        "fan_zone_types": ["team_merchandise", "food_court"],
    },
    "isl": {
        "name": "Indian Super League",
        "format": "Football",
        "halves": 2,
        "half_duration_minutes": 45,
        "halftime_break_minutes": 15,
        "injury_time_avg_minutes": 4,
        "peak_crowd_moments": ["kickoff", "goal", "penalty", "halftime"],
        "fan_zone_types": ["team_merchandise", "food_court"],
    },
    "pkl": {
        "name": "Pro Kabaddi League",
        "format": "Kabaddi",
        "halves": 2,
        "half_duration_minutes": 20,
        "halftime_break_minutes": 5,
        "peak_crowd_moments": ["super_raid", "all_out", "do_or_die"],
        "fan_zone_types": ["team_merchandise", "food_court"],
    },
}


# ─────────────────────────────────────────────
# IPL Match Phase Analysis
# ─────────────────────────────────────────────

def analyze_ipl_timing(match_state: dict) -> dict:
    """
    IPL-specific match intelligence.
    Analyzes overs, innings, and momentum to find optimal movement windows.

    Args:
        match_state: {
            "overs_completed": float,  # e.g., 5.3 = 5 overs 3 balls
            "innings": int,            # 1 or 2
            "batting_team": str,       # e.g., "CSK"
            "bowling_team": str,       # e.g., "MI"
            "runs": int,
            "wickets": int,
            "target": int | None,      # Set in 2nd innings
            "is_strategic_timeout": bool,
            "is_innings_break": bool,
            "momentum": str,           # "normal", "boundary_spree", "wicket_fall", "super_over"
            "star_player_batting": str | None,  # e.g., "Dhoni", "Kohli"
        }

    Returns:
        dict with: is_good_time, reason, priority, action_window_seconds,
                   crowd_prediction, ipl_context
    """
    overs = match_state.get("overs_completed", 0)
    innings = match_state.get("innings", 1)
    momentum = match_state.get("momentum", "normal")
    is_timeout = match_state.get("is_strategic_timeout", False)
    is_break = match_state.get("is_innings_break", False)
    star = match_state.get("star_player_batting")
    wickets = match_state.get("wickets", 0)
    target = match_state.get("target")

    config = SPORT_CONFIGS["ipl"]

    # ── INNINGS BREAK (20 min) — BEST TIME ──
    if is_break:
        return {
            "is_good_time": True,
            "reason": "Innings break — 20 minutes to move freely!",
            "priority": "high",
            "action_window_seconds": config["mid_innings_break_minutes"] * 60,
            "crowd_prediction": "high",  # Everyone moves during break
            "ipl_context": "Move NOW — queues will peak in 5 minutes",
        }

    # ── STRATEGIC TIMEOUT (2.5 min) — QUICK ACTION ──
    if is_timeout:
        return {
            "is_good_time": True,
            "reason": "Strategic Timeout — you have 2.5 minutes!",
            "priority": "urgent",
            "action_window_seconds": 150,
            "crowd_prediction": "medium",
            "ipl_context": "Quick dash — timeout ends soon",
        }

    # ── STAR PLAYER BATTING — DON'T MOVE ──
    if star and star.lower() in ["dhoni", "kohli", "rohit", "hardik", "bumrah"]:
        return {
            "is_good_time": False,
            "reason": f"{star} is at the crease — you won't want to miss this!",
            "priority": "low",
            "action_window_seconds": 0,
            "crowd_prediction": "very_low",  # Nobody leaving seats
            "ipl_context": f"Queues are empty but {star} is batting — stay put!",
        }

    # ── DEATH OVERS (16-20) — HIGH INTENSITY ──
    if overs >= config["death_overs_start"]:
        # 2nd innings chase = absolute peak tension
        if innings == 2 and target:
            return {
                "is_good_time": False,
                "reason": "Death overs chase — the match is on the line!",
                "priority": "low",
                "action_window_seconds": 0,
                "crowd_prediction": "very_low",
                "ipl_context": "Nobody is moving. Stay and watch!",
            }
        return {
            "is_good_time": False,
            "reason": f"Death overs ({int(overs)}/20) — high intensity phase",
            "priority": "low",
            "action_window_seconds": 0,
            "crowd_prediction": "low",
            "ipl_context": "Wait for the innings break if possible",
        }

    # ── POWERPLAY (1-6) — MODERATE INTEREST ──
    if overs < config["powerplay_end"]:
        return {
            "is_good_time": False,
            "reason": f"Powerplay in progress ({int(overs)}/{config['powerplay_end']} overs)",
            "priority": "medium",
            "action_window_seconds": 0,
            "crowd_prediction": "low",
            "ipl_context": "Powerplay action — consider waiting for Strategic Timeout",
        }

    # ── APPROACHING STRATEGIC TIMEOUT ──
    timeout_over = config["strategic_timeout_over_1st"] if innings == 1 else config["strategic_timeout_over_2nd"]
    overs_to_timeout = timeout_over - overs
    if 0 < overs_to_timeout <= 2:
        return {
            "is_good_time": True,
            "reason": f"Strategic Timeout in ~{int(overs_to_timeout)} overs — start moving now!",
            "priority": "high",
            "action_window_seconds": int(overs_to_timeout * 4 * 25),  # ~25 sec per ball
            "crowd_prediction": "low",
            "ipl_context": "Beat the crowd — move before the timeout rush",
        }

    # ── WICKET FALL — BRIEF WINDOW ──
    if momentum == "wicket_fall":
        return {
            "is_good_time": True,
            "reason": "Wicket just fell — batsman change gives you 2-3 minutes",
            "priority": "medium",
            "action_window_seconds": 180,
            "crowd_prediction": "low",
            "ipl_context": "Quick movement window during batsman change",
        }

    # ── BOUNDARY SPREE — DON'T MOVE ──
    if momentum == "boundary_spree":
        return {
            "is_good_time": False,
            "reason": "Boundaries flowing — crowd is fully engaged!",
            "priority": "low",
            "action_window_seconds": 0,
            "crowd_prediction": "very_low",
            "ipl_context": "Great time for empty queues, but you'll miss the action!",
        }

    # ── MIDDLE OVERS (7-15) — BEST REGULAR WINDOW ──
    if config["powerplay_end"] <= overs < config["death_overs_start"]:
        return {
            "is_good_time": True,
            "reason": f"Middle overs ({int(overs)}/20) — lower intensity phase",
            "priority": "medium",
            "action_window_seconds": int((config["death_overs_start"] - overs) * 4 * 25),
            "crowd_prediction": "medium",
            "ipl_context": "Good window to move — intensity picks up from over 16",
        }

    # ── DEFAULT ──
    return {
        "is_good_time": False,
        "reason": "Match in progress",
        "priority": "medium",
        "action_window_seconds": 0,
        "crowd_prediction": "medium",
        "ipl_context": "Check back for a better movement window",
    }


# ─────────────────────────────────────────────
# ISL (Football) Match Phase Analysis
# ─────────────────────────────────────────────

def analyze_isl_timing(match_state: dict) -> dict:
    """ISL-specific timing for football."""
    minute = match_state.get("minute", 0)
    half = match_state.get("half", 1)
    is_halftime = match_state.get("is_halftime", False)
    momentum = match_state.get("momentum", "normal")

    if is_halftime:
        return {
            "is_good_time": True,
            "reason": "Halftime — 15 minutes to move!",
            "priority": "high",
            "action_window_seconds": 900,
            "crowd_prediction": "high",
            "ipl_context": "Move quickly before halftime queues build",
        }

    # Last 10 minutes — high intensity
    if (half == 1 and minute > 35) or (half == 2 and minute > 80):
        return {
            "is_good_time": False,
            "reason": "End of half approaching — stay for the action!",
            "priority": "low",
            "action_window_seconds": 0,
            "crowd_prediction": "low",
            "ipl_context": "Wait for the break",
        }

    return {
        "is_good_time": True,
        "reason": f"Minute {minute} — moderate intensity",
        "priority": "medium",
        "action_window_seconds": 300,
        "crowd_prediction": "medium",
        "ipl_context": "Reasonable window to move",
    }


# ─────────────────────────────────────────────
# PKL (Kabaddi) Match Phase Analysis
# ─────────────────────────────────────────────

def analyze_pkl_timing(match_state: dict) -> dict:
    """Pro Kabaddi League timing analysis."""
    minute = match_state.get("minute", 0)
    half = match_state.get("half", 1)
    is_halftime = match_state.get("is_halftime", False)
    momentum = match_state.get("momentum", "normal")

    if is_halftime:
        return {
            "is_good_time": True,
            "reason": "Halftime — 5 minute window!",
            "priority": "high",
            "action_window_seconds": 300,
            "crowd_prediction": "high",
            "ipl_context": "Short halftime — move fast!",
        }

    if momentum == "super_raid" or momentum == "all_out":
        return {
            "is_good_time": False,
            "reason": "Super Raid / All Out — peak excitement!",
            "priority": "low",
            "action_window_seconds": 0,
            "crowd_prediction": "very_low",
            "ipl_context": "Don't miss this moment!",
        }

    return {
        "is_good_time": True,
        "reason": f"Minute {minute} — normal play",
        "priority": "medium",
        "action_window_seconds": 120,
        "crowd_prediction": "medium",
        "ipl_context": "Quick movements possible",
    }


# ─────────────────────────────────────────────
# Unified Sport Dispatcher
# ─────────────────────────────────────────────

def analyze_match_timing(match_state: dict, sport: str = "ipl") -> dict:
    """
    Unified entry point for multi-sport timing analysis.

    Args:
        match_state: Sport-specific match state dict
        sport: One of 'ipl', 'odi', 'isl', 'pkl'

    Returns:
        Timing analysis dict with is_good_time, reason, priority, etc.
    """
    dispatchers = {
        "ipl": analyze_ipl_timing,
        "odi": analyze_ipl_timing,  # ODI uses similar cricket logic
        "isl": analyze_isl_timing,
        "pkl": analyze_pkl_timing,
    }

    analyzer = dispatchers.get(sport, analyze_ipl_timing)
    return analyzer(match_state)


# ─────────────────────────────────────────────
# IPL Team Fan Zone Recommendations
# ─────────────────────────────────────────────

IPL_TEAMS = {
    "CSK": {"name": "Chennai Super Kings", "color": "#FFFF00", "city": "Chennai", "lang": "ta"},
    "MI":  {"name": "Mumbai Indians", "color": "#004BA0", "city": "Mumbai", "lang": "hi"},
    "RCB": {"name": "Royal Challengers Bengaluru", "color": "#D4213D", "city": "Bengaluru", "lang": "kn"},
    "KKR": {"name": "Kolkata Knight Riders", "color": "#3A225D", "city": "Kolkata", "lang": "bn"},
    "DC":  {"name": "Delhi Capitals", "color": "#004C93", "city": "Delhi", "lang": "hi"},
    "RR":  {"name": "Rajasthan Royals", "color": "#EA1A85", "city": "Jaipur", "lang": "hi"},
    "SRH": {"name": "Sunrisers Hyderabad", "color": "#FF822A", "city": "Hyderabad", "lang": "te"},
    "GT":  {"name": "Gujarat Titans", "color": "#1B2133", "city": "Ahmedabad", "lang": "gu"},
    "LSG": {"name": "Lucknow Super Giants", "color": "#ACE5F3", "city": "Lucknow", "lang": "hi"},
    "PBKS": {"name": "Punjab Kings", "color": "#ED1B24", "city": "Mohali", "lang": "pa"},
}


def get_fan_zone_recommendation(user_team: str, facilities: list, user_location: dict) -> Optional[dict]:
    """
    Recommend nearest fan zone for the user's team.

    Args:
        user_team: IPL team code (e.g., "CSK")
        facilities: List of facilities with fan_zone types
        user_location: User's current location

    Returns:
        Fan zone recommendation or None
    """
    team_info = IPL_TEAMS.get(user_team)
    if not team_info:
        return None

    fan_zones = [f for f in facilities if f.get("type") == "fan_zone"]
    team_zones = [f for f in fan_zones if f.get("team") == user_team]

    if team_zones:
        return {
            "type": "fan_zone",
            "team": user_team,
            "team_name": team_info["name"],
            "zone_name": team_zones[0].get("name", f"{team_info['name']} Fan Zone"),
            "activities": team_zones[0].get("activities", ["merchandise", "photo_op"]),
        }

    return None


# ─────────────────────────────────────────────
# India-Specific Crowd Prediction
# ─────────────────────────────────────────────

def predict_crowd_surge(match_state: dict, sport: str = "ipl") -> dict:
    """
    Predict upcoming crowd surges at Indian venues.
    Indians have distinct crowd behavior patterns around food, breaks, and star players.

    Returns:
        dict with surge_level, surge_in_minutes, affected_areas, recommendation
    """
    overs = match_state.get("overs_completed", 0)
    innings = match_state.get("innings", 1)

    config = SPORT_CONFIGS.get(sport, SPORT_CONFIGS["ipl"])

    # Predict post-innings break rush
    if sport in ["ipl", "odi"]:
        remaining_overs = config["total_overs"] - overs
        if remaining_overs <= 2 and innings == 1:
            return {
                "surge_level": "extreme",
                "surge_in_minutes": int(remaining_overs * 4 * 0.4),  # ~25 sec per ball
                "affected_areas": ["restrooms", "food_courts", "exits"],
                "recommendation": "Head to restroom NOW — massive rush starts at innings break",
            }

    # Pre-match toss period
    if overs == 0 and innings == 1:
        return {
            "surge_level": "high",
            "surge_in_minutes": 0,
            "affected_areas": ["food_courts", "entrances"],
            "recommendation": "Fans are still entering — food courts are crowded",
        }

    return {
        "surge_level": "normal",
        "surge_in_minutes": -1,
        "affected_areas": [],
        "recommendation": "Normal crowd levels",
    }


# ─────────────────────────────────────────────
# Multi-Language Support
# ─────────────────────────────────────────────

TRANSLATIONS = {
    "en": {
        "restroom_found": "{name} is {time} away with a {wait}-minute wait.",
        "innings_break": "Innings break — great time to move!",
        "strategic_timeout": "Strategic Timeout — you have 2.5 minutes!",
        "emergency": "EMERGENCY: Head to {exit} immediately!",
        "star_batting": "{star} is batting — queues are empty!",
    },
    "hi": {
        "restroom_found": "{name} {time} दूर है, {wait} मिनट का इंतज़ार।",
        "innings_break": "इनिंग्स ब्रेक — अभी चलने का सबसे अच्छा समय!",
        "strategic_timeout": "स्ट्रैटेजिक टाइमआउट — 2.5 मिनट हैं!",
        "emergency": "आपातकाल: तुरंत {exit} की ओर जाएं!",
        "star_batting": "{star} बल्लेबाजी कर रहे हैं — कतारें खाली हैं!",
    },
    "ta": {
        "restroom_found": "{name} {time} தூரத்தில், {wait} நிமிட காத்திருப்பு.",
        "innings_break": "இன்னிங்ஸ் பிரேக் — நகர சிறந்த நேரம்!",
        "strategic_timeout": "ஸ்ட்ராடெஜிக் டைம்அவுட் — 2.5 நிமிடங்கள்!",
        "emergency": "அவசரநிலை: உடனடியாக {exit} செல்லுங்கள்!",
        "star_batting": "{star} பேட்டிங் — வரிசைகள் காலியாக உள்ளன!",
    },
    "or": {
        "restroom_found": "{name} {time} ଦୂରରେ, {wait} ମିନିଟ୍ ଅପେକ୍ଷା।",
        "innings_break": "ଇନିଂସ ବ୍ରେକ — ଯିବାର ସର୍ବୋତ୍ତମ ସମୟ!",
        "strategic_timeout": "ଷ୍ଟ୍ରାଟେଜିକ ଟାଇମଆଉଟ — 2.5 ମିନିଟ ଅଛି!",
        "emergency": "ଜରୁରୀକାଳୀନ: ତୁରନ୍ତ {exit} ଆଡ଼କୁ ଯାଆନ୍ତୁ!",
        "star_batting": "{star} ବ୍ୟାଟିଂ କରୁଛନ୍ତି — ଲାଇନ ଖାଲି!",
    },
    "kn": {
        "restroom_found": "{name} {time} ದೂರದಲ್ಲಿ, {wait} ನಿಮಿಷ ಕಾಯುವಿಕೆ.",
        "innings_break": "ಇನ್ನಿಂಗ್ಸ್ ಬ್ರೇಕ್ — ಹೋಗಲು ಉತ್ತಮ ಸಮಯ!",
        "strategic_timeout": "ಸ್ಟ್ರಾಟೆಜಿಕ್ ಟೈಮ್‌ಔಟ್ — 2.5 ನಿಮಿಷ!",
        "emergency": "ತುರ್ತು: ತಕ್ಷಣ {exit} ಕಡೆ ಹೋಗಿ!",
        "star_batting": "{star} ಬ್ಯಾಟಿಂಗ್ — ಸಾಲುಗಳು ಖಾಲಿ!",
    },
}


def translate(key: str, lang: str = "en", **kwargs) -> str:
    """Get translated string with interpolation."""
    lang_dict = TRANSLATIONS.get(lang, TRANSLATIONS["en"])
    template = lang_dict.get(key, TRANSLATIONS["en"].get(key, key))
    try:
        return template.format(**kwargs)
    except (KeyError, ValueError):
        return template
