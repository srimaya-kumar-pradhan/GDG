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

  // ─── Section data per stadium ───
  const stadiumSections = {
    metlife: ['100', '114', '128', '200', '214', '300', '314', '328'],
    sofi: ['100', '112', '130', '200', '212'],
    att: ['100', '120', '140', '200', '220'],
  };

  // ─── Initialize ───
  function init() {
    populateSections();
    loadDashboard();
    setupEventListeners();
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

  function setupEventListeners() {
    stadiumSelect.addEventListener('change', () => {
      populateSections();
      loadDashboard();
    });

    sectionSelect.addEventListener('change', loadDashboard);

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
      }

      if (nearbyRes.ok) {
        const data = await nearbyRes.json();
        renderCrowdIndicators(data);
      }

      if (matchRes.ok) {
        const data = await matchRes.json();
        renderMatchInfo(data.match);
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json();
        if (data.alerts && data.alerts.length > 0) {
          showAlert(data.alerts[0].message);
        }
      }
    } catch (err) {
      console.warn('Dashboard load error:', err);
    }
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

        // Show any new alerts
        if (data.alerts && data.alerts.length > 0) {
          showAlert(data.alerts[0].message);
        }

        // Refresh dashboard
        loadDashboard();
      } else {
        addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
      }
    } catch (err) {
      removeTypingIndicator(typingEl);
      addMessage('Unable to reach the server. Please check your connection and try again.', 'assistant');
    }

    isLoading = false;
    sendBtn.disabled = false;
    chatInput.focus();
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
