/**
 * FIFA World Cup 2026 Stadium Assistant — Frontend Logic
 * Handles chat, dashboard updates, and quick actions.
 */

(function () {
  'use strict';

  // ─── DOM Elements ───
  const stadiumSelect = document.getElementById('stadium-select');
  const sectionSelect = document.getElementById('section-select');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('send-btn');
  const alertBanner = document.getElementById('alert-banner');
  const alertText = document.getElementById('alert-text');
  const alertDismiss = document.getElementById('alert-dismiss');
  const gatesGrid = document.getElementById('gates-grid');
  const crowdIndicators = document.getElementById('crowd-indicators');
  const matchInfo = document.getElementById('match-info');
  const quickBtns = document.querySelectorAll('.quick-btn');

  const API_BASE = '';

  // ─── Constants ───
  const DASHBOARD_REFRESH_INTERVAL_MS = 30000;
  const DEFAULT_RESULTS_LIMIT = 3;

  // ─── State ───
  let isLoading = false;
  let appConfig = null;
  let localStadiums = null;
  let localSchedules = null;
  let localAlerts = [];

  // ─── Section data per stadium ───
  const stadiumSections = {
    metlife: ['100', '114', '128', '200', '214', '300', '314', '328'],
    sofi: ['100', '112', '130', '200', '212'],
    att: ['100', '120', '140', '200', '220'],
  };

  /**
   * Initializes the application frontend.
   */
  async function init() {
    populateSections();
    await loadLocalData();
    loadDashboard();
    setupEventListeners();
    loadGoogleMaps();
  }

  /**
   * Loads static fallback JSON data files from the frontend.
   */
  async function loadLocalData() {
    try {
      const [stadiumsRes, schedulesRes] = await Promise.all([
        fetch('/data/stadiums.json'),
        fetch('/data/schedules.json')
      ]);
      if (stadiumsRes.ok) {
        const data = await stadiumsRes.json();
        localStadiums = data.stadiums;
      }
      if (schedulesRes.ok) {
        localSchedules = await schedulesRes.json();
      }
    } catch (err) {
      console.warn('Unable to load static fallback data files:', err);
    }
  }

  /**
   * Helper to load the Google Maps API script dynamically.
   * @param {string} apiKey - The Google Maps API Key.
   */
  function loadMapsScript(apiKey) {
    if (!apiKey) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMapAsync`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  /**
   * Registers the Maps initialization callback globally.
   */
  function setupMapCallback() {
    window.initMapAsync = () => {
      if (window.StadiumMap) {
        window.StadiumMap.init('stadium-map', stadiumSelect.value);
        updateUserMapPosition();
      }
    };
  }

  /**
   * Dynamically loads Google Maps script using backend config key or fallback local config.
   */
  async function loadGoogleMaps() {
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      if (!res.ok) throw new Error('Failed to load maps configuration');
      const config = await res.json();
      appConfig = config;
      
      if (!config.GOOGLE_MAPS_API_KEY) {
        console.warn('Google Maps API key not set in environment.');
        return;
      }

      setupMapCallback();
      loadMapsScript(config.GOOGLE_MAPS_API_KEY);
    } catch (err) {
      console.warn('Failed to fetch API config, loading frontend config fallback:', err);
      appConfig = window.APP_CONFIG || null;
      if (appConfig && appConfig.GOOGLE_MAPS_API_KEY) {
        setupMapCallback();
        loadMapsScript(appConfig.GOOGLE_MAPS_API_KEY);
      }
    }
  }

  /**
   * Populates the section drop-down based on the selected stadium.
   */
  function populateSections() {
    const stadium = stadiumSelect.value;
    const sections = stadiumSections[stadium] || [];
    sectionSelect.innerHTML = '';
    sections.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = `Section ${s}`;
      sectionSelect.appendChild(opt);
    });
  }

  /**
   * Updates the user's position indicator on the Google Map.
   */
  function updateUserMapPosition() {
    if (window.StadiumMap && window.google) {
      fetch(`${API_BASE}/api/stadiums/${stadiumSelect.value}/sections/${sectionSelect.value}`)
        .then((res) => {
          if (!res.ok) throw new Error('API section not found');
          return res.json();
        })
        .then((data) => {
          if (data.section && data.section.coords) {
            window.StadiumMap.setUserPosition(data.section.coords, `Section ${sectionSelect.value}`);
          }
        })
        .catch((err) => {
          console.warn('API user map pos error, checking local fallback:', err);
          const stadium = localStadiums && localStadiums[stadiumSelect.value];
          const section = stadium && stadium.sections[sectionSelect.value];
          if (section && section.coords) {
            window.StadiumMap.setUserPosition(section.coords, `Section ${sectionSelect.value}`);
          }
        });
    }
  }

  /**
   * Sets up interactive frontend event listeners.
   */
  function setupEventListeners() {
    stadiumSelect.addEventListener('change', () => {
      populateSections();
      loadDashboard();
      if (window.StadiumMap) {
        window.StadiumMap.switchStadium(stadiumSelect.value);
        updateUserMapPosition();
      }
    });

    sectionSelect.addEventListener('change', () => {
      loadDashboard();
      updateUserMapPosition();
    });

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (msg && !isLoading) sendMessage(msg);
    });

    quickBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-query');
        if (query && !isLoading) sendMessage(query);
      });
    });

    alertDismiss.addEventListener('click', () => {
      alertBanner.hidden = true;
    });

    // Keyboard: Enter to send
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  /**
   * Loads dashboard statistics and updates the operational panels.
   */
  async function loadDashboard() {
    const stadium = stadiumSelect.value;
    try {
      const [gatesRes, nearbyRes, matchRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/api/stadiums/${stadium}/gates`),
        fetch(`${API_BASE}/api/stadiums/${stadium}/sections/${sectionSelect.value}/nearby`),
        fetch(`${API_BASE}/api/stadiums/${stadium}/match`),
        fetch(`${API_BASE}/api/alerts?stadium=${stadium}`),
      ]);

      if (gatesRes.ok) {
        const data = await gatesRes.json();
        renderGates(data.gates);
      } else {
        renderGates(localGetGates(stadium));
      }

      if (nearbyRes.ok) {
        const data = await nearbyRes.json();
        renderCrowdIndicators(data);
      } else {
        renderCrowdIndicators(localGetNearby(stadium, sectionSelect.value));
      }

      if (matchRes.ok) {
        const data = await matchRes.json();
        renderMatchInfo(data.match);
      } else {
        renderMatchInfo(localGetMatch(stadium));
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json();
        if (data.alerts && data.alerts.length > 0) {
          showAlert(data.alerts[0].message);
        }
      } else {
        const alerts = localCheckAlerts(stadium);
        if (alerts.length > 0) {
          showAlert(alerts[0].message);
        }
      }
    } catch (err) {
      console.warn('Dashboard load error, switching to static fallback logic:', err);
      // Fallback rendering
      renderGates(localGetGates(stadium));
      renderCrowdIndicators(localGetNearby(stadium, sectionSelect.value));
      renderMatchInfo(localGetMatch(stadium));
      const alerts = localCheckAlerts(stadium);
      if (alerts.length > 0) {
        showAlert(alerts[0].message);
      }
    }
  }

  // ─── Client-Side Fallback Engine ───

  /**
   * Helper to resolve density to a text label.
   */
  function crowdLabel(density) {
    if (density <= 0.3) return 'low';
    if (density <= 0.6) return 'moderate';
    if (density <= 0.8) return 'high';
    return 'critical';
  }

  /**
   * Retrieves gates locally in fallback offline mode.
   */
  function localGetGates(stadiumId) {
    const stadium = localStadiums && localStadiums[stadiumId];
    if (!stadium) return [];
    return Object.entries(stadium.gates).map(([id, gate]) => ({
      id,
      ...gate,
      crowd_level: crowdLabel(gate.crowd_density),
    }));
  }

  /**
   * Retrieves nearby facilities locally in fallback offline mode.
   */
  function localGetNearby(stadiumId, sectionId) {
    const stadium = localStadiums && localStadiums[stadiumId];
    if (!stadium || !stadium.sections[sectionId]) return { restrooms: [], concessions: [], exits: [] };
    const section = stadium.sections[sectionId];

    // Restrooms
    let restrooms = Object.entries(stadium.restrooms).map(([id, r]) => {
      const dist = haversineDistance(section.coords, r.coords);
      return {
        id,
        ...r,
        distance_meters: Math.round(dist),
        walk_time_seconds: Math.round((dist / 1.2) * 1.2),
        crowd_level: crowdLabel(r.crowd_density || 0),
      };
    });
    restrooms.sort((a, b) => (a.wait_minutes * 0.6 + a.walk_time_seconds * 0.4 / 10) - (b.wait_minutes * 0.6 + b.walk_time_seconds * 0.4 / 10));

    // Concessions
    let concessions = Object.entries(stadium.concessions).map(([id, c]) => {
      const dist = haversineDistance(section.coords, c.coords);
      return {
        id,
        ...c,
        distance_meters: Math.round(dist),
        walk_time_seconds: Math.round((dist / 1.2) * 1.2),
      };
    });
    concessions.sort((a, b) => (a.wait_minutes * 0.6 + a.walk_time_seconds * 0.4 / 10) - (b.wait_minutes * 0.6 + b.walk_time_seconds * 0.4 / 10));

    // Exits
    let exits = Object.entries(stadium.exits).map(([id, e]) => {
      const dist = haversineDistance(section.coords, e.coords);
      return {
        id,
        ...e,
        distance_meters: Math.round(dist),
        walk_time_seconds: Math.round((dist / 1.2) * 1.2),
        crowd_level: crowdLabel(e.crowd_density),
      };
    });
    exits.sort((a, b) => a.distance_meters - b.distance_meters);

    return {
      restrooms: restrooms.slice(0, DEFAULT_RESULTS_LIMIT),
      concessions: concessions.slice(0, DEFAULT_RESULTS_LIMIT),
      exits: exits.slice(0, DEFAULT_RESULTS_LIMIT)
    };
  }

  /**
   * Retrieves match information locally in fallback offline mode.
   */
  function localGetMatch(stadiumId) {
    if (!localSchedules) return null;
    const match = localSchedules.matches.find((m) => m.stadium === stadiumId);
    if (!match) return null;
    
    // Inject mock phase
    const phases = localSchedules.event_phases;
    const phase = match.status === 'live' ? phases.first_half : phases.pre_match;
    return { ...match, phase };
  }

  /**
   * Generates mock operational warnings in local fallback offline mode.
   */
  function localCheckAlerts(stadiumId) {
    const stadium = localStadiums && localStadiums[stadiumId];
    if (!stadium) return [];
    const alerts = [];

    // Check gates
    Object.entries(stadium.gates).forEach(([id, gate]) => {
      if (gate.status === 'open' && gate.crowd_density >= 0.95) {
        alerts.push({ message: `CRITICAL: ${gate.name} crowd density at ${Math.round(gate.crowd_density * 100)}%. Immediate action required!` });
      } else if (gate.status === 'open' && gate.crowd_density >= 0.8) {
        alerts.push({ message: `WARNING: ${gate.name} crowd density at ${Math.round(gate.crowd_density * 100)}%.` });
      }
    });

    return alerts;
  }

  /**
   * Calculates distance between coordinates.
   */
  function haversineDistance(coord1, coord2) {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(coord2.lat - coord1.lat);
    const dLng = toRad(coord2.lng - coord1.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Renders gate details on the dashboard gate status grid.
   */
  function renderGates(gates) {
    gatesGrid.innerHTML = '';
    gates.forEach((gate) => {
      const item = document.createElement('div');
      item.className = 'gate-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <span class="gate-name">${escapeHtml(gate.name.split(' - ')[1] || gate.name)}</span>
        <span class="gate-status ${gate.status}">${gate.status}</span>
        <span class="crowd-badge ${gate.crowd_level}">${gate.crowd_level}</span>
      `;
      gatesGrid.appendChild(item);
    });
  }

  /**
   * Translates a crowd level into a CSS custom variable color name suffix.
   * @param {string} level - The crowd level ('low', 'moderate', 'high', 'critical').
   * @returns {string} The color suffix ('green', 'blue', 'orange', or 'red').
   */
  function crowdLevelToColor(level) {
    if (level === 'low') return 'green';
    if (level === 'moderate') return 'blue';
    if (level === 'high') return 'orange';
    return 'red';
  }

  /**
   * Renders crowd layout bar indicators on the dashboard panel.
   */
  function renderCrowdIndicators(data) {
    crowdIndicators.innerHTML = '';

    // Show restrooms crowd
    const facilities = [
      ...(data.restrooms || []).map((r) => ({ name: r.name.replace('Restroom - ', ''), density: r.crowd_density || 0, level: r.crowd_level || 'low' })),
      ...(data.exits || []).slice(0, 2).map((e) => ({ name: e.name, density: e.crowd_density || 0, level: e.crowd_level || 'low' })),
    ];

    facilities.forEach((f) => {
      const pct = Math.round(f.density * 100);
      const indicator = document.createElement('div');
      indicator.className = 'crowd-indicator';
      indicator.setAttribute('role', 'listitem');
      indicator.innerHTML = `
        <div class="crowd-section-label">${escapeHtml(f.name)}</div>
        <div class="crowd-bar-container">
          <div class="crowd-bar ${f.level}" style="width: ${pct}%"></div>
        </div>
        <div class="crowd-percentage" style="color: var(--accent-${crowdLevelToColor(f.level)})">${pct}%</div>
      `;
      crowdIndicators.appendChild(indicator);
    });
  }

  /**
   * Renders scheduling details on the dashboard match info panel.
   */
  function renderMatchInfo(match) {
    if (!match) {
      matchInfo.innerHTML = '<p class="match-details">No match currently scheduled</p>';
      return;
    }

    let html = `<div class="match-teams">${escapeHtml(match.team_home)} vs ${escapeHtml(match.team_away)}</div>`;

    if (match.status === 'live') {
      html += `<span class="match-live-badge">● LIVE</span>`;
      html += `<div class="match-score">${match.score_home} — ${match.score_away}</div>`;
      html += `<div class="match-phase">${match.phase?.label || 'In Progress'} (${match.current_minute}')</div>`;
    } else {
      html += `<div class="match-phase">${escapeHtml(match.phase?.label || match.status)}</div>`;
      html += `<div class="match-details">${match.date} at ${match.time}</div>`;
    }

    html += `<div class="match-details">${escapeHtml(match.phase?.description || '')}</div>`;
    matchInfo.innerHTML = html;
  }

  /**
   * Shows an operational alert at the top of the interface.
   */
  function showAlert(message) {
    alertText.textContent = message;
    alertBanner.hidden = false;
  }

  // ─── Chat Logic ───

  /**
   * Sends a user query to the AI backend assistant, displaying typing indicators and updating states.
   */
  async function sendMessage(text) {
    if (isLoading) return;

    // Add user message
    addMessage(text, 'user');
    chatInput.value = '';
    isLoading = true;
    sendBtn.disabled = true;

    // Show typing indicator
    const typingEl = addTypingIndicator();

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          stadium_id: stadiumSelect.value,
          section_id: sectionSelect.value,
        }),
      });

      removeTypingIndicator(typingEl);

      if (res.ok) {
        const data = await res.json();
        addMessage(data.response, 'assistant');

        // Parse response to find locations to highlight on map
        highlightSuggestedLocations(data.response);

        // Show any new alerts
        if (data.alerts && data.alerts.length > 0) {
          showAlert(data.alerts[0].message);
        }

        // Refresh dashboard
        loadDashboard();
        if (window.StadiumMap) {
          window.StadiumMap.refresh();
        }
      } else {
        const fallbackOk = await sendDirectGeminiQuery(text);
        if (!fallbackOk) {
          const fallbackText = localGenerateFallbackResponse(text);
          addMessage(fallbackText, 'assistant');
          highlightSuggestedLocations(fallbackText);
        }
      }
    } catch (err) {
      removeTypingIndicator(typingEl);
      const fallbackOk = await sendDirectGeminiQuery(text);
      if (!fallbackOk) {
        const fallbackText = localGenerateFallbackResponse(text);
        addMessage(fallbackText, 'assistant');
        highlightSuggestedLocations(fallbackText);
      }
    }

    isLoading = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }

  /**
   * Sends a client-side direct request to Gemini API key when backend Express route is unavailable.
   */
  async function sendDirectGeminiQuery(text) {
    const apiKey = appConfig && appConfig.GEMINI_API_KEY;
    if (!apiKey) return false;

    try {
      const stadiumName = stadiumSelect.options[stadiumSelect.selectedIndex].text;
      const sectionName = sectionSelect.value;
      const prompt = `You are a helpful FIFA World Cup 2026 Stadium Assistant at ${stadiumName}.
The user is at Section ${sectionName}.
User question: ${text}
Provide a short, direct, friendly response with navigation guidance. Keep it to 2-3 sentences.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) return false;
      const data = await response.json();
      if (!data.candidates || data.candidates.length === 0) return false;
      const answer = data.candidates[0].content.parts[0].text;
      addMessage(answer, 'assistant');
      highlightSuggestedLocations(answer);
      return true;
    } catch (err) {
      console.warn('Direct Gemini browser fallback failed:', err);
      return false;
    }
  }

  /**
   * Generates a conversational response in offline/local-only fallback mode.
   */
  function localGenerateFallbackResponse(userMessage) {
    const msg = userMessage.toLowerCase();
    const stadiumId = stadiumSelect.value;
    const sectionId = sectionSelect.value;

    const nearby = localGetNearby(stadiumId, sectionId);
    
    if (msg.includes('restroom') || msg.includes('bathroom') || msg.includes('toilet') || msg.includes('washroom')) {
      const best = nearby.restrooms[0];
      if (best) {
        return `⚽ The nearest restroom is **${best.name}** in the ${best.zone} zone. It's a **${best.walk_time_seconds}s walk** (~${best.distance_meters}m) from Section ${sectionId} with a **${best.wait_minutes} min wait** (Crowd: **${best.crowd_level}**).`;
      }
      return `⚽ Restrooms are located on the concourse level. Please check the nearest zone signage!`;
    }

    if (msg.includes('food') || msg.includes('eat') || msg.includes('hungry') || msg.includes('drink') || msg.includes('beer') || msg.includes('concession')) {
      const best = nearby.concessions[0];
      if (best) {
        return `⚽ I recommend **${best.name}** in the ${best.zone} zone. It is a **${best.walk_time_seconds}s walk** from Section ${sectionId} with a **${best.wait_minutes} min wait**. Type: **${best.type || 'food'}**.`;
      }
      return `⚽ Concessions stands are located around the main concourse loops.`;
    }

    if (msg.includes('exit') || msg.includes('leave') || msg.includes('way out') || msg.includes('go out')) {
      const best = nearby.exits[0];
      if (best) {
        return `⚽ The closest exit is **${best.name}** in the ${best.zone} zone, located **${best.walk_time_seconds}s walk** away. Crowd is currently **${best.crowd_level}**.`;
      }
      return `⚽ Follow the green EXIT signs located above every main corridor.`;
    }

    if (msg.includes('gate') || msg.includes('entrance') || msg.includes('enter')) {
      const gates = localGetGates(stadiumId);
      const openGates = gates.filter(g => g.status === 'open');
      openGates.sort((a,b) => a.crowd_density - b.crowd_density);
      const best = openGates[0];
      if (best) {
        return `⚽ Recommended entrance: **${best.name}** (Crowd: **${best.crowd_level}**). Avoid any gates showing HIGH or CRITICAL crowds.`;
      }
      return `⚽ Gates typically open 3 hours prior to kickoff. Check ticket instructions for your designated gate.`;
    }

    return `⚽ I am your FIFA World Cup 2026 Stadium Assistant! I can help you with:\n\n• Finding restrooms, food stands, or exits with the shortest wait times\n• Navigating between gates and sections\n• Real-time crowd density checking\n• Accessible routes filtering\n\nAsk me anything like "Where is the nearest restroom?" or "Which gate has the lowest crowd?"`;
  }

  /**
   * Highlights coordinates/markers on map corresponding to landmark/facilities.
   */
  function highlightSuggestedLocations(responseText) {
    if (!window.StadiumMap || !window.google) return;

    // Pattern matches
    const gateMatch = responseText.match(/Gate\s+[A-E]/i);
    const sectionMatch = responseText.match(/Section\s+\d+/i);
    
    // Facility keywords
    const facilities = [
      'Global Bites', 'Stadium Grill', 'LA Street Tacos', 'Burger Stand', 
      'Sushi Bar', 'Texas BBQ Pit', 'Nacho Station', 'Craft Beer Bar', 
      'Quick Snacks', 'Beverage Bar',
      'Restroom - East Lower', 'Restroom - North Lower', 'Restroom - South Lower',
      'Restroom - Mezzanine North', 'Restroom - Upper East', 'Restroom - NW Lower',
      'Restroom - NE Lower', 'Restroom - East Lower',
      'North Exit 1', 'North Exit 2', 'North Exit 3', 'East Exit 1',
      'East Exit 2', 'East Exit 3', 'South Exit 1', 'South Exit 3',
      'NW Exit 1', 'NW Exit 2', 'NE Exit 1', 'NE Exit 2'
    ];

    let foundName = null;

    if (gateMatch) {
      foundName = gateMatch[0];
    } else if (sectionMatch) {
      foundName = sectionMatch[0];
    } else {
      // Look for facility names in response text
      for (const f of facilities) {
        if (responseText.toLowerCase().includes(f.toLowerCase())) {
          foundName = f;
          break;
        }
      }
    }

    if (foundName) {
      const coords = window.StadiumMap.findCoordsForLocation(foundName);
      if (coords) {
        window.StadiumMap.highlightLocation(foundName, coords);
      }
    }
  }

  /**
   * Renders a message element in the chat thread.
   */
  function addMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}-message`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = sender === 'assistant' ? '⚽' : '👤';

    const content = document.createElement('div');
    content.className = 'message-content';

    // Convert newlines to paragraphs, preserve markdown-like bold
    const paragraphs = text.split('\n').filter((p) => p.trim());
    paragraphs.forEach((p) => {
      const para = document.createElement('p');
      // Simple bold conversion: **text** → <strong>text</strong>
      para.innerHTML = escapeHtml(p).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      content.appendChild(para);
    });

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /**
   * Creates and displays a typing bubble indicator.
   */
  function addTypingIndicator() {
    const msg = document.createElement('div');
    msg.className = 'message assistant-message';
    msg.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '⚽';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  /**
   * Dismisses the typing bubble indicator.
   */
  function removeTypingIndicator(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  // ─── Utilities ───
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Auto-refresh dashboard every 30s ───
  setInterval(() => {
    if (!isLoading) loadDashboard();
  }, DASHBOARD_REFRESH_INTERVAL_MS);

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
