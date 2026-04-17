"""
VenueFlow AI - IPL Engine Tests
Tests for IPL timing analysis, multi-sport support, translations, and crowd prediction.
"""

import unittest
from ipl_engine import (
    analyze_ipl_timing,
    analyze_isl_timing,
    analyze_pkl_timing,
    analyze_match_timing,
    predict_crowd_surge,
    get_fan_zone_recommendation,
    translate,
    SPORT_CONFIGS,
    IPL_TEAMS,
)


class TestIPLTimingAnalysis(unittest.TestCase):
    """Test IPL-specific match phase intelligence."""

    def test_innings_break_is_best_time(self):
        """Innings break = 20 minutes of free movement."""
        state = {"overs_completed": 20, "innings": 1, "is_innings_break": True}
        result = analyze_ipl_timing(state)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["priority"], "high")
        self.assertIn("20 minutes", result["reason"])

    def test_strategic_timeout_is_urgent(self):
        """Strategic timeout = 2.5 min quick action window."""
        state = {"overs_completed": 6, "innings": 1, "is_strategic_timeout": True}
        result = analyze_ipl_timing(state)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["priority"], "urgent")
        self.assertEqual(result["action_window_seconds"], 150)

    def test_star_player_batting_dont_move(self):
        """When Dhoni or Kohli is batting, recommend staying."""
        for star in ["Dhoni", "Kohli", "Rohit"]:
            state = {"overs_completed": 12, "innings": 1, "star_player_batting": star}
            result = analyze_ipl_timing(state)
            self.assertFalse(result["is_good_time"])
            self.assertIn(star, result["reason"])

    def test_death_overs_high_intensity(self):
        """Death overs (16-20) = don't move."""
        state = {"overs_completed": 18, "innings": 1}
        result = analyze_ipl_timing(state)
        self.assertFalse(result["is_good_time"])
        self.assertEqual(result["priority"], "low")

    def test_death_overs_chase_even_higher(self):
        """2nd innings chase in death overs = absolute peak."""
        state = {"overs_completed": 18, "innings": 2, "target": 180}
        result = analyze_ipl_timing(state)
        self.assertFalse(result["is_good_time"])
        self.assertIn("chase", result["reason"].lower())

    def test_powerplay_moderate(self):
        """Powerplay (1-6) = moderate, suggest waiting."""
        state = {"overs_completed": 3, "innings": 1}
        result = analyze_ipl_timing(state)
        self.assertFalse(result["is_good_time"])
        self.assertIn("Powerplay", result["reason"])

    def test_approaching_timeout_good(self):
        """2 overs before strategic timeout = start moving."""
        state = {"overs_completed": 11, "innings": 2}  # 2nd innings timeout at 13
        result = analyze_ipl_timing(state)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["priority"], "high")

    def test_middle_overs_good_window(self):
        """Middle overs (7-15) = best regular window."""
        state = {"overs_completed": 10, "innings": 1}
        result = analyze_ipl_timing(state)
        self.assertTrue(result["is_good_time"])

    def test_wicket_fall_brief_window(self):
        """Wicket fall gives 2-3 minutes."""
        state = {"overs_completed": 8, "innings": 1, "momentum": "wicket_fall"}
        result = analyze_ipl_timing(state)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["action_window_seconds"], 180)

    def test_boundary_spree_dont_move(self):
        """Boundary spree = crowd fully engaged."""
        state = {"overs_completed": 12, "innings": 1, "momentum": "boundary_spree"}
        result = analyze_ipl_timing(state)
        self.assertFalse(result["is_good_time"])


class TestISLTimingAnalysis(unittest.TestCase):
    """Test ISL (football) timing."""

    def test_halftime_is_best(self):
        state = {"minute": 45, "half": 1, "is_halftime": True}
        result = analyze_isl_timing(state)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["action_window_seconds"], 900)

    def test_end_of_half_stay(self):
        state = {"minute": 85, "half": 2}
        result = analyze_isl_timing(state)
        self.assertFalse(result["is_good_time"])


class TestPKLTimingAnalysis(unittest.TestCase):
    """Test PKL (kabaddi) timing."""

    def test_halftime(self):
        state = {"minute": 20, "half": 1, "is_halftime": True}
        result = analyze_pkl_timing(state)
        self.assertTrue(result["is_good_time"])
        self.assertEqual(result["action_window_seconds"], 300)

    def test_super_raid(self):
        state = {"minute": 15, "half": 2, "momentum": "super_raid"}
        result = analyze_pkl_timing(state)
        self.assertFalse(result["is_good_time"])


class TestMultiSportDispatcher(unittest.TestCase):
    """Test unified sport dispatcher."""

    def test_ipl_dispatch(self):
        state = {"overs_completed": 10, "innings": 1}
        result = analyze_match_timing(state, sport="ipl")
        self.assertIn("is_good_time", result)

    def test_isl_dispatch(self):
        state = {"minute": 30, "half": 1}
        result = analyze_match_timing(state, sport="isl")
        self.assertIn("is_good_time", result)

    def test_pkl_dispatch(self):
        state = {"minute": 10, "half": 1}
        result = analyze_match_timing(state, sport="pkl")
        self.assertIn("is_good_time", result)

    def test_unknown_sport_fallback(self):
        """Unknown sport should fallback to IPL logic."""
        state = {"overs_completed": 10, "innings": 1}
        result = analyze_match_timing(state, sport="unknown_sport")
        self.assertIn("is_good_time", result)


class TestCrowdPrediction(unittest.TestCase):
    """Test India-specific crowd surge prediction."""

    def test_pre_innings_break_extreme(self):
        """Last 2 overs of 1st innings = extreme surge coming."""
        state = {"overs_completed": 19, "innings": 1}
        result = predict_crowd_surge(state, sport="ipl")
        self.assertEqual(result["surge_level"], "extreme")

    def test_pre_match_high(self):
        """Before match starts = high at food courts."""
        state = {"overs_completed": 0, "innings": 1}
        result = predict_crowd_surge(state, sport="ipl")
        self.assertEqual(result["surge_level"], "high")

    def test_normal_play(self):
        """Mid-play = normal crowd."""
        state = {"overs_completed": 10, "innings": 1}
        result = predict_crowd_surge(state, sport="ipl")
        self.assertEqual(result["surge_level"], "normal")


class TestIPLTeams(unittest.TestCase):
    """Test IPL team data."""

    def test_all_10_teams(self):
        self.assertEqual(len(IPL_TEAMS), 10)

    def test_csk_exists(self):
        self.assertIn("CSK", IPL_TEAMS)
        self.assertEqual(IPL_TEAMS["CSK"]["city"], "Chennai")

    def test_team_has_language(self):
        for code, team in IPL_TEAMS.items():
            self.assertIn("lang", team, f"{code} missing language")


class TestTranslations(unittest.TestCase):
    """Test multi-language support."""

    def test_english_default(self):
        result = translate("innings_break", "en")
        self.assertIn("Innings break", result)

    def test_hindi_translation(self):
        result = translate("innings_break", "hi")
        self.assertIn("इनिंग्स", result)

    def test_tamil_translation(self):
        result = translate("innings_break", "ta")
        self.assertIn("இன்னிங்ஸ்", result)

    def test_odia_translation(self):
        result = translate("innings_break", "or")
        self.assertIn("ଇନିଂସ", result)

    def test_interpolation(self):
        result = translate("star_batting", "en", star="Dhoni")
        self.assertIn("Dhoni", result)

    def test_unknown_lang_fallback(self):
        """Unknown language should fallback to English."""
        result = translate("innings_break", "xx")
        self.assertIn("Innings break", result)


class TestSportConfigs(unittest.TestCase):
    """Test sport configurations."""

    def test_ipl_config(self):
        config = SPORT_CONFIGS["ipl"]
        self.assertEqual(config["total_overs"], 20)
        self.assertEqual(config["powerplay_end"], 6)
        self.assertEqual(config["death_overs_start"], 16)

    def test_odi_config(self):
        config = SPORT_CONFIGS["odi"]
        self.assertEqual(config["total_overs"], 50)

    def test_isl_config(self):
        config = SPORT_CONFIGS["isl"]
        self.assertEqual(config["half_duration_minutes"], 45)

    def test_pkl_config(self):
        config = SPORT_CONFIGS["pkl"]
        self.assertEqual(config["half_duration_minutes"], 20)


if __name__ == "__main__":
    unittest.main()
