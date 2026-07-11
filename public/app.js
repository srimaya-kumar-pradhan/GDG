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

  // ─── Initialize ───
  async function init() {
    populateSections();
    await loadLocalData();
    loadDashboard();
    setupEventListeners();
    loadGoogleMaps();
  }

  // Load static JSON data files for local fallback execution
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

  // Dynamically load Google Maps script using the key from the backend config
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

      // Attach callback to window object so Maps API can trigger it
      window.initMapAsync = () => {
        if (window.StadiumMap) {
          window.StadiumMap.init('stadium-map', stadiumSelect.value);
          updateUserMapPosition();
        }
      };

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${config.GOOGLE_MAPS_API_KEY}&callback=initMapAsync`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } catch (err) {
      console.warn('Failed to fetch API config, loading frontend config fallback:', err);
      appConfig = window.APP_CONFIG || null;
      if (appConfig && appConfig.GOOGLE_MAPS_API_KEY) {
        window.initMapAsync = () => {
          if (window.StadiumMap) {
            window.StadiumMap.init('stadium-map', stadiumSelect.value);
            updateUserMapPosition();
          }
        };
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${appConfig.GOOGLE_MAPS_API_KEY}&callback=initMapAsync`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }
  }

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

  // ─── Dashboard Loading ───
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

  function crowdLabel(density) {
    if (density <= 0.3) return 'low';
    if (density <= 0.6) return 'moderate';
    if (density <= 0.8) return 'high';
    return 'critical';
  }

  function localGetGates(stadiumId) {
    const stadium = localStadiums && localStadiums[stadiumId];
    if (!stadium) return [];
    return Object.entries(stadium.gates).map(([id, gate]) => ({
      id,
      ...gate,
      crowd_level: crowdLabel(gate.crowd_density),
    }));
  }

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

    return { restrooms: restrooms.slice(0, 3), concessions: concessions.slice(0, 3), exits: exits.slice(0, 3) };
  }

  function localGetMatch(stadiumId) {
    if (!localSchedules) return null;
    const match = localSchedules.matches.find((m) => m.stadium === stadiumId);
    if (!match) return null;
    
    // Inject mock phase
    const phases = localSchedules.event_phases;
    const phase = match.status === 'live' ? phases.first_half : phases.pre_match;
    return { ...match, phase };
  }

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
        <div class="crowd-percentage" style="color: var(--accent-${f.level === 'low' ? 'green' : f.level === 'moderate' ? 'blue' : f.level === 'high' ? 'orange' : 'red'})">${pct}%</div>
      `;
      crowdIndicators.appendChild(indicator);
    });
  }

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

  function showAlert(message) {
    alertText.textContent = message;
    alertBanner.hidden = false;
  }

  // ─── Chat Logic ───
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

  // Client-side direct fallback query path when Express backend is unreachable or limited
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

  // Client-side local fallback responder for offline/static deployment mode
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

  // Parse assistant response to highlight recommended location on map
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
  }, 30000);

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
