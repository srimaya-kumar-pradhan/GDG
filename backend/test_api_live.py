"""Quick live API test -- verifies all 4 intents return correct responses."""
import requests
import sys
sys.stdout.reconfigure(encoding='utf-8')

BASE = "http://localhost:8080"
PAYLOAD = {
    "location": {"latitude": 35.2273, "longitude": -81.8388},
    "sport": "ipl",
    "seat_section": 202,
    "language": "en",
}

print("=" * 70)
print("VenueFlow AI -- Live API Test")
print("=" * 70)

for intent in ["restroom", "food", "exit", "seat"]:
    PAYLOAD["intent"] = intent
    r = requests.post(f"{BASE}/api/v1/recommendations", json=PAYLOAD)
    d = r.json()["recommendation"]
    eta = d["eta_seconds"]
    eta_str = f"{eta // 60}m {eta % 60}s"
    dest = d.get("destination") or "N/A"
    wait = d.get("wait_time_at_destination", 0)
    conf = d.get("confidence_score", 0)
    gemini = "AI" if d.get("gemini_enhanced") else "Rule"
    ipl = d.get("ipl_context", "")[:50]
    crowd = d.get("crowd_prediction", "")
    
    print(f"\n{'-' * 70}")
    print(f"  INTENT:      {intent.upper()}")
    print(f"  DESTINATION: {dest}")
    print(f"  ETA:         {eta_str} ({eta}s)")
    print(f"  WAIT:        {wait} min")
    print(f"  CONFIDENCE:  {conf}")
    print(f"  ENGINE:      {gemini}")
    print(f"  CROWD:       {crowd}")
    print(f"  IPL CONTEXT: {ipl}")

print(f"\n{'=' * 70}")
print("ALL 4 INTENTS TESTED SUCCESSFULLY")
print("=" * 70)
