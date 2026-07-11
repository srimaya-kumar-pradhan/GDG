# ⚽ FIFA World Cup 2026 — Stadium Assistant

**A GenAI-powered fan navigation and crowd management assistant for FIFA World Cup 2026 stadiums.**

The Stadium Assistant uses **Google Gemini AI** to provide real-time, conversational guidance to fans — helping them find restrooms, food, exits, and navigate between sections while avoiding crowds and bottlenecks.

---

## 🧭 Chosen Vertical

**Fan Navigation & Crowd Management**

This project addresses the core challenge faced by 80,000+ fans at every World Cup match:

- **No real-time guidance** — Fans rely on static signage in unfamiliar, massive stadiums
- **Unpredictable queues** — Halftime restroom and concession lines can exceed 15 minutes
- **Crowd bottlenecks** — Gates, exits, and concourses become dangerously congested at peak times
- **Accessibility gaps** — Fans with mobility needs have no way to find accessible routes dynamically
- **Language barriers** — International fans struggle with navigation in a foreign stadium

The Stadium Assistant solves this with a **conversational AI interface** that reasons about live conditions and gives personalized, actionable directions.

---

## 🧠 Approach & Design Logic

### Architecture

```
┌──────────────────────────────────────────────────┐
│     Frontend — Static Web (HTML/CSS/JS)          │
│  • Accessible Chat Interface (ARIA, keyboard)    │
│  • Live Crowd Density Dashboard                  │
│  • Quick Action Buttons for Common Needs         │
├──────────────────────────────────────────────────┤
│     Backend — Node.js + Express                  │
│  • /api/chat — Gemini-powered conversational AI  │
│  • /api/stadiums — Stadium data & gate status    │
│  • /api/alerts — Overcrowding detection          │
│  • Input sanitization & security headers         │
├──────────────────────────────────────────────────┤
│     AI Layer — Google Gemini API                 │
│  • System prompt with stadium-expert persona     │
│  • Dynamic context injection (crowd, gates,      │
│    wait times, match phase)                      │
│  • Anomaly-aware responses (warns about crowds)  │
├──────────────────────────────────────────────────┤
│     Data Layer — Simulated Stadium Data          │
│  • 3 real FIFA 2026 venues (MetLife, SoFi, AT&T) │
│  • Gates, sections, restrooms, concessions, exits│
│  • Dynamic crowd density simulation              │
│  • Match schedule with live game state            │
└──────────────────────────────────────────────────┘
```

### Why This Design

| Decision | Reasoning |
|----------|-----------|
| **Gemini API as primary engine** | Generates contextual, natural-language responses — not static/hardcoded answers. Fans ask in their own words and get personalized guidance. |
| **Dynamic context injection** | Every Gemini call includes current crowd density, gate status, wait times, and match phase. The AI reasons over live conditions, not just static maps. |
| **Composite scoring model** | Facilities ranked by `(wait_time × 0.6) + (walk_time × 0.4)` — waiting is more frustrating than walking, backed by venue operations research. |
| **Haversine distance** | Geodesic calculation for accurate indoor distances without requiring Google Maps API for every query. |
| **Intelligent fallback** | If the Gemini API is unavailable, the system still provides data-driven recommendations using rule-based logic — zero downtime. |
| **Anomaly detection** | Automatically flags overcrowding (>80% density) and long queues (>15 min) as operational alerts for staff. |

### Key Design Principles

1. **Dynamic over static** — Every response is generated based on current conditions. No hardcoded answers.
2. **Crowd-aware routing** — Directions prefer low-crowd paths over shortest distance.
3. **Accessible by default** — ARIA labels, keyboard navigation, high-contrast dark mode, accessible facility filtering.
4. **Mobile-first** — Designed for fans reading on phones in a noisy stadium.
5. **Fail-safe** — Works without API keys (fallback mode), never crashes on bad input.

---

## ⚙️ How It Works — Setup & Usage

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Google Gemini API Key** — Free at [Google AI Studio](https://aistudio.google.com/)
- *(Optional)* Google Maps API Key for enhanced routing

### Installation

```bash
# Clone the repo
git clone https://github.com/srimaya-kumar-pradhan/GDG.git
cd GDG

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

### Running

```bash
# Start the server
npm start

# Open in browser
# → http://localhost:3000
```

### Using the Assistant

1. **Select your stadium** from the dropdown (MetLife, SoFi, or AT&T)
2. **Select your section** to set your location in the stadium
3. **Ask a question** in the chat box or use a quick action button:
   - 🚻 *"Where's the nearest restroom with the shortest wait?"*
   - 🍔 *"Where can I get food quickly?"*
   - 🚪 *"What's the nearest exit with low crowd?"*
   - 🎫 *"Which gate should I enter?"*
   - ♿ *"I need accessible routes"*
4. **View the dashboard** for real-time gate status, crowd density, and match info
5. **Watch for alerts** — the system warns about overcrowding automatically

### Running Tests

```bash
npm test
```

---

## ⚠️ Assumptions Made

### Data Simulation
- **Crowd density is simulated** — Real deployment would use IoT sensors, camera feeds, or WiFi/cellular density estimation. Current data uses realistic ranges (0.0–1.0) that shift dynamically during interaction.
- **Wait times are simulated** — Restroom and concession wait times use plausible values (1–12 minutes) that fluctuate to demonstrate the system's reasoning.
- **Stadium layouts are approximated** — Gate, section, and facility GPS coordinates are based on real stadium locations but simplified to key areas.

### Operational Context
- **Match schedule is pre-loaded** — In production, this would integrate with FIFA's live data feed.
- **Event phase detection is simulated** — The system simulates pre-match, halftime, and post-match crowd patterns. Production would use actual kick-off times and game clock.
- **Anomaly thresholds are configurable** — Overcrowding warning at 80%, critical at 95% density — these match industry standards for large venue management.

### Technical Constraints
- **Single-server deployment** — The current version runs on a single Node.js instance. Production would use Cloud Run with auto-scaling.
- **No persistent storage** — All state is in-memory. Production would use Firestore for cross-instance data sharing.
- **Gemini API is optional** — The system fully functions without an API key using intelligent rule-based fallback. This ensures the demo works for evaluators without requiring API credentials.

### User Assumptions
- Fans have a **smartphone with internet connectivity** inside the stadium
- User location is determined by their **selected seat section** (not live GPS)
- Walking speed estimated at **1.2 m/s** with 20% indoor overhead

---

## 📁 Project Structure

```
GDG/
├── src/
│   ├── server.js           # Express server + API endpoints
│   ├── gemini.js            # Gemini API integration + system prompt
│   ├── stadium-data.js      # Stadium data engine + Haversine distance
│   └── alerts.js            # Overcrowding detection + operational alerts
├── public/
│   ├── index.html           # Accessible chat UI (ARIA, semantic HTML)
│   ├── styles.css           # Premium dark-mode FIFA-themed design
│   └── app.js               # Frontend logic + dashboard rendering
├── data/
│   ├── stadiums.json        # 3 FIFA 2026 venues with full facility data
│   └── schedules.json       # Match schedule + event phase definitions
├── tests/
│   └── assistant.test.js    # 30+ unit + integration tests
├── .env.example             # Environment variable template
├── .gitignore               # Excludes node_modules, secrets, artifacts
├── package.json             # Dependencies + scripts
└── README.md                # This file
```

---

## 🔒 Security

- ✅ No API keys or secrets committed — environment variables only
- ✅ Input sanitization — HTML tags stripped, dangerous characters removed, length limited
- ✅ Security headers — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`
- ✅ Request size limits — JSON body capped at 10KB
- ✅ Gemini prompts sandboxed — no system access from user input

---

## 🛠️ Google Technologies Used

| Component | Google Technology |
|-----------|-------------------|
| **AI/GenAI** | Google Gemini API (`gemini-2.0-flash` via `@google/generative-ai` SDK) |
| **Maps** | Google Maps Platform (optional enhancement for visual routing) |
| **Fonts** | Google Fonts (Inter) |
| **Hosting** | Firebase Hosting compatible (static frontend) |

No OpenAI, Anthropic, AWS, Azure, or other third-party AI/cloud services are used.

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| **API Latency (fallback mode)** | < 5ms |
| **API Latency (Gemini)** | ~500ms |
| **Test Suite** | 30+ tests |
| **Dependencies** | 3 production packages |
| **Frontend Load** | < 1s (no framework) |

---

**Built for GDG Solutions Challenge 2026** 🏆
