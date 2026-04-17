/**
 * VenueFlow AI — Frontend Application
 * Handles: Stadium rendering, API calls, recommendations, admin controls
 */

// ═════════════════════════════════════════════
// Configuration
// ═════════════════════════════════════════════

const API_BASE = window.location.origin;
const POLL_INTERVAL = 8000; // ms — venue status refresh

// Section coordinates (for canvas rendering — pixel positions)
const SECTION_LAYOUT = {
    201: { cx: 130, cy: 130, rx: 55, ry: 30, angle: -25 },
    202: { cx: 190, cy: 170, rx: 55, ry: 30, angle: -15 },
    203: { cx: 250, cy: 200, rx: 55, ry: 30, angle: -5 },
    204: { cx: 310, cy: 215, rx: 55, ry: 30, angle: 0 },
    205: { cx: 370, cy: 215, rx: 55, ry: 30, angle: 0 },
    206: { cx: 430, cy: 200, rx: 55, ry: 30, angle: 5 },
    207: { cx: 480, cy: 175, rx: 55, ry: 30, angle: 15 },
    208: { cx: 520, cy: 140, rx: 55, ry: 30, angle: 25 },
    209: { cx: 540, cy: 100, rx: 55, ry: 30, angle: 35 },
    210: { cx: 100, cy: 95, rx: 50, ry: 25, angle: -35 },
};

// Facility positions (canvas coordinates)
const FACILITY_POSITIONS = {
    'restroom-201': { x: 100, y: 175, icon: '🚻' },
    'restroom-202': { x: 170, y: 215, icon: '🚻' },
    'restroom-205': { x: 380, y: 258, icon: '🚻' },
    'restroom-210': { x: 75, y: 130, icon: '🚻' },
    'restroom-concourse-east': { x: 540, y: 200, icon: '🚻' },
    'food-bbq-201': { x: 125, y: 200, icon: '🍖' },
    'food-pizza-204': { x: 285, y: 255, icon: '🍕' },
    'food-tacos-208': { x: 510, y: 185, icon: '🌮' },
    'food-drinks-206': { x: 440, y: 245, icon: '🥤' },
    'exit-north': { x: 310, y: 48, icon: '🚪' },
    'exit-south': { x: 310, y: 430, icon: '🚪' },
    'exit-east': { x: 580, y: 260, icon: '🚪' },
    'exit-west': { x: 40, y: 260, icon: '🚪' },
};

// ═════════════════════════════════════════════
// State
// ═════════════════════════════════════════════

let currentVenueStatus = null;
let currentRecommendation = null;
let activeIntent = null;
let selectedSection = 202;
let routeWaypoints = [];
let highlightedFacility = null;
let isAdminOpen = false;

// ═════════════════════════════════════════════
// DOM Elements
// ═════════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const canvas = $('stadium-canvas');
const ctx = canvas.getContext('2d');

// ═════════════════════════════════════════════
// API Layer
// ═════════════════════════════════════════════

async function apiPost(endpoint, body = {}, isAdmin = false) {
    // Determine if this endpoint needs admin authentication
    const needsAdmin = isAdmin ||
        endpoint.includes('emergency') ||
        endpoint.includes('game-state') ||
        (endpoint === '/api/v1/venue-status' && body.facility_id);

    const headers = { 'Content-Type': 'application/json' };
    if (needsAdmin) {
        headers['X-Admin-Key'] = 'demo-admin-key';
    }

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        return await res.json();
    } catch (e) {
        console.error(`API POST ${endpoint} failed:`, e);
        showToast(`API error: ${e.message}`, 'error');
        return null;
    }
}

async function apiGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`);
        return await res.json();
    } catch (e) {
        console.error(`API GET ${endpoint} failed:`, e);
        return null;
    }
}

// ═════════════════════════════════════════════
// Venue Status Polling
// ═════════════════════════════════════════════

async function fetchVenueStatus() {
    const data = await apiGet('/api/v1/venue-status');
    if (data) {
        currentVenueStatus = data;
        updateGameTicker(data.game_state);
        updateStats(data);
        checkEmergency(data.emergency_alerts);
        renderStadium();
    }
}

function updateGameTicker(gs) {
    if (!gs) return;
    $('home-team').textContent = gs.home_team || 'Home';
    $('away-team').textContent = gs.away_team || 'Away';
    $('home-score').textContent = gs.home_score ?? '--';
    $('away-score').textContent = gs.away_score ?? '--';
    $('game-quarter').textContent = `Q${gs.quarter || 1}`;

    const mins = Math.floor(gs.minutes_remaining || 0);
    const secs = String(Math.round(((gs.minutes_remaining || 0) - mins) * 60)).padStart(2, '0');
    $('game-time').textContent = `${mins}:${secs}`;
}

function updateStats(data) {
    if (!data) return;

    const density = data.crowd_density?.overall ?? 0.78;
    const pct = Math.round(density * 100);
    $('stat-density-value').textContent = `${pct}%`;
    $('stat-density-bar').style.width = `${pct}%`;

    // Color the bar based on density
    const bar = $('stat-density-bar');
    if (density > 0.8) bar.style.background = 'linear-gradient(90deg, #ef4444, #f59e0b)';
    else if (density > 0.6) bar.style.background = 'linear-gradient(90deg, #f59e0b, #10b981)';
    else bar.style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';

    const users = Math.round(density * 50000);
    $('stat-users-value').textContent = users.toLocaleString();

    const facilities = data.facilities || [];
    const waitTimes = facilities.filter(f => f.wait_time_minutes > 0).map(f => f.wait_time_minutes);
    const avg = waitTimes.length ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
    $('stat-wait-value').textContent = `${avg} min`;
}

function checkEmergency(alerts) {
    const banner = $('emergency-banner');
    if (alerts && alerts.length > 0 && alerts[0].active) {
        $('emergency-message').textContent = alerts[0].message || 'Emergency alert active';
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ═════════════════════════════════════════════
// Stadium Canvas Rendering
// ═════════════════════════════════════════════

function renderStadium() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = rect.width;
    const H = rect.height;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Background field
    drawField(W, H);

    // Sections (with crowd density colors)
    drawSections(W, H);

    // Facilities
    drawFacilities(W, H);

    // Route overlay
    if (routeWaypoints.length > 0) {
        drawRoute(W, H);
    }

    // User marker
    drawUserMarker(W, H);
}

function drawField(W, H) {
    const scaleX = W / 620;
    const scaleY = H / 480;

    // Stadium outline (bowl shape)
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.45, W * 0.46, H * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner field
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.45, W * 0.22, H * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Field lines
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.45 - H * 0.18);
    ctx.lineTo(W / 2, H * 0.45 + H * 0.18);
    ctx.stroke();

    // "FIELD" label
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.font = `600 ${12 * scaleX}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('FIELD', W / 2, H * 0.46);

    ctx.restore();
}

function drawSections(W, H) {
    const scaleX = W / 620;
    const scaleY = H / 480;
    const density = currentVenueStatus?.crowd_density || {};

    for (const [id, layout] of Object.entries(SECTION_LAYOUT)) {
        const secDensity = density[`section_${id}`] ?? 0.5;
        const cx = layout.cx * scaleX;
        const cy = layout.cy * scaleY;
        const rx = layout.rx * scaleX;
        const ry = layout.ry * scaleY;
        const angle = (layout.angle * Math.PI) / 180;

        // Density color
        let color;
        if (secDensity < 0.4) color = { r: 16, g: 185, b: 129 };       // Green
        else if (secDensity < 0.7) color = { r: 245, g: 158, b: 11 };   // Amber
        else color = { r: 239, g: 68, b: 68 };                          // Red

        const isSelected = parseInt(id) === selectedSection;
        const isHighlighted = highlightedFacility && highlightedFacility.includes(id);
        const alpha = isSelected ? 0.45 : 0.2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // Section fill
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        ctx.fill();

        // Section border
        ctx.strokeStyle = isSelected
            ? 'rgba(99, 102, 241, 0.8)'
            : `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
        ctx.lineWidth = isSelected ? 2.5 : 1;
        ctx.stroke();

        // Glow for selected
        if (isSelected) {
            ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
            ctx.shadowBlur = 15;
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Label
        ctx.rotate(-angle);
        ctx.fillStyle = isSelected ? '#f0f0f5' : 'rgba(240, 240, 245, 0.6)';
        ctx.font = `${isSelected ? '700' : '500'} ${(isSelected ? 12 : 10) * Math.min(scaleX, scaleY)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(id, 0, -2);

        // Density percentage
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
        ctx.font = `600 ${8 * Math.min(scaleX, scaleY)}px 'JetBrains Mono', monospace`;
        ctx.fillText(`${Math.round(secDensity * 100)}%`, 0, 10);

        ctx.restore();
    }
}

function drawFacilities(W, H) {
    const scaleX = W / 620;
    const scaleY = H / 480;
    const facilities = currentVenueStatus?.facilities || [];

    for (const [id, pos] of Object.entries(FACILITY_POSITIONS)) {
        const x = pos.x * scaleX;
        const y = pos.y * scaleY;
        const fac = facilities.find(f => f.id === id);
        const waitTime = fac?.wait_time_minutes ?? 0;

        const isHighlighted = highlightedFacility === id;
        const size = isHighlighted ? 16 : 12;

        // Background circle
        let bgColor = 'rgba(17, 17, 24, 0.7)';
        let borderColor = 'rgba(99, 102, 241, 0.2)';

        if (isHighlighted) {
            bgColor = 'rgba(99, 102, 241, 0.3)';
            borderColor = 'rgba(99, 102, 241, 0.8)';

            // Pulse glow
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, size + 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();

        // Icon
        ctx.font = `${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pos.icon, x, y);

        // Wait time label (if applicable)
        if (waitTime > 0 && (fac?.type === 'restroom' || fac?.type === 'food')) {
            const labelY = y + size + 10;
            ctx.fillStyle = waitTime > 10 ? 'rgba(239, 68, 68, 0.9)' : waitTime > 5 ? 'rgba(245, 158, 11, 0.9)' : 'rgba(16, 185, 129, 0.9)';
            ctx.font = `700 ${9 * Math.min(scaleX, scaleY)}px 'JetBrains Mono', monospace`;
            ctx.fillText(`${waitTime}m`, x, labelY);
        }

        ctx.restore();
    }
}

function drawUserMarker(W, H) {
    const scaleX = W / 620;
    const scaleY = H / 480;
    const layout = SECTION_LAYOUT[selectedSection];
    if (!layout) return;

    const x = layout.cx * scaleX;
    const y = layout.cy * scaleY;

    // Pulsing ring
    const t = (Date.now() % 2000) / 2000;
    const pulseR = 8 + t * 12;
    const pulseAlpha = 0.5 - t * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(99, 102, 241, ${pulseAlpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Core dot
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.strokeStyle = '#f0f0f5';
    ctx.lineWidth = 2;
    ctx.stroke();

    // "YOU" label
    ctx.fillStyle = '#6366f1';
    ctx.font = `700 ${9 * Math.min(scaleX, scaleY)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('YOU', x, y - 14);

    ctx.restore();
}

function drawRoute(W, H) {
    if (!routeWaypoints || routeWaypoints.length < 2) return;

    const scaleX = W / 620;
    const scaleY = H / 480;

    // Convert lat/lng waypoints to canvas coordinates
    // We'll approximate positions based on the section/facility positions
    const startSection = SECTION_LAYOUT[selectedSection];
    const destId = currentRecommendation?.destination_id;
    const dest = FACILITY_POSITIONS[destId];

    if (!startSection || !dest) return;

    const points = [];
    const numSteps = routeWaypoints.length;

    for (let i = 0; i < numSteps; i++) {
        const frac = i / (numSteps - 1);
        const x = (startSection.cx + (dest.x - startSection.cx) * frac) * scaleX;
        const y = (startSection.cy + (dest.y - startSection.cy) * frac) * scaleY;
        // Add curve variance
        const curveFactor = Math.sin(frac * Math.PI) * 15 * scaleX;
        points.push({ x: x + curveFactor, y });
    }

    // Draw dashed route line with gradient
    ctx.save();

    // Glow effect
    ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
    ctx.shadowBlur = 10;

    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2.5;

    const gradient = ctx.createLinearGradient(
        points[0].x, points[0].y,
        points[points.length - 1].x, points[points.length - 1].y
    );
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#06b6d4');
    ctx.strokeStyle = gradient;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        if (i < points.length - 1) {
            const cpx = (points[i].x + points[i + 1].x) / 2;
            const cpy = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, cpx, cpy);
        } else {
            ctx.lineTo(points[i].x, points[i].y);
        }
    }
    ctx.stroke();

    // Destination marker
    const lastPt = points[points.length - 1];
    ctx.setLineDash([]);
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#06b6d4';
    ctx.fill();
    ctx.strokeStyle = '#f0f0f5';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

// Animation loop for user marker pulse
function animateCanvas() {
    renderStadium();
    requestAnimationFrame(animateCanvas);
}

// ═════════════════════════════════════════════
// Recommendation Flow
// ═════════════════════════════════════════════

async function requestRecommendation(intent) {
    // Set active button state
    document.querySelectorAll('.intent-btn').forEach(btn => {
        btn.classList.remove('active', 'loading');
    });
    const activeBtn = document.querySelector(`[data-intent="${intent}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'loading');
    }

    activeIntent = intent;

    // Get section center coordinates
    const sections = {
        201: { lat: 35.2276, lng: -81.8391 },
        202: { lat: 35.2273, lng: -81.8388 },
        203: { lat: 35.2271, lng: -81.8386 },
        204: { lat: 35.2269, lng: -81.8387 },
        205: { lat: 35.2267, lng: -81.8386 },
        206: { lat: 35.2265, lng: -81.8383 },
        207: { lat: 35.2263, lng: -81.8380 },
        208: { lat: 35.2261, lng: -81.8377 },
        209: { lat: 35.2259, lng: -81.8375 },
        210: { lat: 35.2257, lng: -81.8373 },
    };

    const sec = sections[selectedSection] || sections[202];
    const mobilityChecked = $('accessibility-mobility').checked;

    const body = {
        user_id: 'demo_user',
        location: { latitude: sec.lat, longitude: sec.lng },
        intent: intent,
        accessibility_needs: mobilityChecked ? ['mobility'] : [],
        seat_section: selectedSection,
    };

    const result = await apiPost('/api/v1/recommendations', body);

    // Remove loading state
    if (activeBtn) activeBtn.classList.remove('loading');

    if (result && result.success) {
        currentRecommendation = result.recommendation;
        displayRecommendation(result.recommendation, result.latency_ms);
        highlightedFacility = result.recommendation.destination_id;
        routeWaypoints = result.recommendation.route_waypoints || [];
        renderStadium();
    } else {
        showToast('Failed to get recommendation', 'error');
    }
}

function displayRecommendation(rec, latencyMs) {
    const card = $('recommendation-card');
    card.classList.remove('hidden');

    // Re-trigger animation
    card.style.animation = 'none';
    card.offsetHeight; // Reflow
    card.style.animation = '';

    // Type badge
    const badge = $('rec-type-badge');
    badge.textContent = (rec.action_type || 'info').toUpperCase();
    badge.className = 'rec-type-badge';
    if (rec.action_type === 'safety') badge.classList.add('safety');

    // Confidence
    const conf = Math.round((rec.confidence_score || 0) * 100);
    $('confidence-value').textContent = `${conf}%`;
    $('confidence-value').style.color = conf >= 80 ? '#10b981' : conf >= 50 ? '#f59e0b' : '#ef4444';

    // Recommendation text
    $('rec-text').textContent = rec.recommendation || 'No recommendation available.';

    // ETA
    const etaSec = rec.eta_seconds || 0;
    $('eta-value').textContent = etaSec >= 60 ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s` : `${etaSec}s`;

    // Wait time
    const wait = rec.wait_time_at_destination;
    $('wait-value').textContent = wait >= 0 ? `${wait} min` : 'N/A';

    // Accessibility
    $('accessible-value').textContent = rec.accessibility_compliant ? '✅ Yes' : '❌ No';

    // Game context
    $('game-context-text').textContent = rec.game_context || '';

    // Alternatives
    const alts = rec.alternatives || [];
    const altSection = $('alternatives-section');
    const altList = $('alternatives-list');
    altList.innerHTML = '';

    if (alts.length > 0) {
        altSection.classList.remove('hidden');
        alts.forEach(alt => {
            const el = document.createElement('div');
            el.className = 'alternative-item';
            const walkStr = alt.walk_time_s >= 60
                ? `${Math.floor(alt.walk_time_s / 60)}m ${alt.walk_time_s % 60}s`
                : `${alt.walk_time_s}s`;
            el.innerHTML = `
                <span class="alt-name">${alt.name || alt.cuisine || ''}</span>
                <span class="alt-details">
                    <span>🚶 ${walkStr}</span>
                    ${alt.wait_time_min !== undefined ? `<span>⏳ ${alt.wait_time_min}m</span>` : ''}
                </span>
            `;
            altList.appendChild(el);
        });
    } else {
        altSection.classList.add('hidden');
    }

    // Route steps
    const steps = rec.route_waypoints || [];
    const stepsEl = $('route-steps');
    stepsEl.innerHTML = '';
    steps.forEach((wp, i) => {
        const el = document.createElement('div');
        el.className = 'route-step';
        el.textContent = wp.description || `Waypoint ${i + 1}`;
        stepsEl.appendChild(el);
    });

    // Latency
    $('latency-value').textContent = Math.round(latencyMs || 0);
}

// ═════════════════════════════════════════════
// Toast Notifications
// ═════════════════════════════════════════════

function showToast(message, type = 'info') {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ═════════════════════════════════════════════
// Admin Panel
// ═════════════════════════════════════════════

function toggleAdmin() {
    isAdminOpen = !isAdminOpen;
    const panel = $('admin-panel');
    if (isAdminOpen) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

async function resetDemo() {
    const result = await apiPost('/api/v1/demo/reset');
    if (result?.success) {
        showToast('Demo scenario reset successfully', 'success');
        routeWaypoints = [];
        highlightedFacility = null;
        currentRecommendation = null;
        $('recommendation-card').classList.add('hidden');
        document.querySelectorAll('.intent-btn').forEach(btn => btn.classList.remove('active'));
        await fetchVenueStatus();
    }
}

async function triggerEmergency() {
    const result = await apiPost('/api/v1/emergency', {
        message: 'EMERGENCY: Please evacuate to the nearest exit immediately. Follow staff instructions.',
        exit_routes: ['exit-north', 'exit-south', 'exit-west'],
    }, true);

    if (result?.success) {
        showToast('⚠️ Emergency alert triggered', 'error');
        await fetchVenueStatus();
    }
}

async function clearEmergency() {
    const result = await apiPost('/api/v1/emergency/clear', {}, true);
    if (result?.success) {
        showToast('Emergency cleared', 'success');
        await fetchVenueStatus();
    }
}

async function updateGameState() {
    const body = {
        quarter: parseInt($('admin-quarter').value),
        minutes_remaining: parseFloat($('admin-minutes').value),
        game_momentum: $('admin-momentum').value,
    };

    const result = await apiPost('/api/v1/game-state', body, true);
    if (result?.success) {
        showToast('Game state updated', 'success');
        await fetchVenueStatus();
    }
}

async function updateWaitTime() {
    const body = {
        facility_id: $('admin-facility').value,
        wait_time_minutes: parseInt($('admin-wait-time').value),
    };

    const result = await apiPost('/api/v1/venue-status', body, true);
    if (result?.success) {
        showToast(`Wait time updated for ${body.facility_id}`, 'success');
        await fetchVenueStatus();
    }
}

async function refreshAnalytics() {
    const data = await apiGet('/api/v1/analytics');
    if (data) {
        const el = $('analytics-display');
        el.innerHTML = `
            <div>Total: <strong>${data.total_recommendations}</strong></div>
            <div>Avg Latency: <strong>${data.avg_latency_ms}ms</strong></div>
            <div>Avg Confidence: <strong>${Math.round(data.avg_confidence * 100)}%</strong></div>
            ${data.intent_breakdown ? `<div>Intents: ${Object.entries(data.intent_breakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>` : ''}
        `;
    }
}

// ═════════════════════════════════════════════
// Canvas Mouse Interaction
// ═════════════════════════════════════════════

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = rect.width / 620;
    const scaleY = rect.height / 480;

    const tooltip = $('map-tooltip');
    let found = false;

    // Check sections
    for (const [id, layout] of Object.entries(SECTION_LAYOUT)) {
        const cx = layout.cx * scaleX;
        const cy = layout.cy * scaleY;
        const rx = layout.rx * scaleX;
        const ry = layout.ry * scaleY;

        const dx = (mx - cx) / rx;
        const dy = (my - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
            const density = currentVenueStatus?.crowd_density?.[`section_${id}`];
            tooltip.style.display = 'block';
            tooltip.style.left = `${mx + 12}px`;
            tooltip.style.top = `${my - 8}px`;
            $('tooltip-text').textContent = `Section ${id} — ${density ? Math.round(density * 100) + '% full' : 'No data'}`;
            found = true;
            break;
        }
    }

    // Check facilities
    if (!found) {
        for (const [id, pos] of Object.entries(FACILITY_POSITIONS)) {
            const fx = pos.x * scaleX;
            const fy = pos.y * scaleY;
            const dist = Math.sqrt((mx - fx) ** 2 + (my - fy) ** 2);
            if (dist < 16) {
                const fac = currentVenueStatus?.facilities?.find(f => f.id === id);
                tooltip.style.display = 'block';
                tooltip.style.left = `${mx + 12}px`;
                tooltip.style.top = `${my - 8}px`;
                $('tooltip-text').textContent = `${fac?.name || id} — Wait: ${fac?.wait_time_minutes ?? '?'}min`;
                found = true;
                break;
            }
        }
    }

    if (!found) {
        tooltip.style.display = 'none';
    }
});

canvas.addEventListener('mouseleave', () => {
    $('map-tooltip').style.display = 'none';
});

// Click to select section
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = rect.width / 620;
    const scaleY = rect.height / 480;

    for (const [id, layout] of Object.entries(SECTION_LAYOUT)) {
        const cx = layout.cx * scaleX;
        const cy = layout.cy * scaleY;
        const rx = layout.rx * scaleX;
        const ry = layout.ry * scaleY;

        const dx = (mx - cx) / rx;
        const dy = (my - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
            selectedSection = parseInt(id);
            $('section-select').value = id;
            showToast(`Moved to Section ${id}`, 'info');
            renderStadium();
            break;
        }
    }
});

// ═════════════════════════════════════════════
// Event Listeners
// ═════════════════════════════════════════════

function initEventListeners() {
    // Intent buttons
    document.querySelectorAll('.intent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const intent = btn.dataset.intent;
            requestRecommendation(intent);
        });
    });

    // Section selector
    $('section-select').addEventListener('change', (e) => {
        selectedSection = parseInt(e.target.value);
        renderStadium();
    });

    // Admin toggle
    $('admin-toggle').addEventListener('click', toggleAdmin);
    $('admin-close').addEventListener('click', toggleAdmin);

    // Admin actions
    $('btn-reset-demo').addEventListener('click', resetDemo);
    $('btn-trigger-emergency').addEventListener('click', triggerEmergency);
    $('btn-clear-emergency').addEventListener('click', clearEmergency);
    $('btn-update-game').addEventListener('click', updateGameState);
    $('btn-update-wait').addEventListener('click', updateWaitTime);
    $('btn-refresh-analytics').addEventListener('click', refreshAnalytics);

    // Emergency dismiss
    $('emergency-dismiss').addEventListener('click', () => {
        $('emergency-banner').classList.add('hidden');
    });

    // Window resize
    window.addEventListener('resize', () => renderStadium());
}

// ═════════════════════════════════════════════
// Boot
// ═════════════════════════════════════════════

async function init() {
    initEventListeners();
    await fetchVenueStatus();
    animateCanvas();

    // Poll venue status
    setInterval(fetchVenueStatus, POLL_INTERVAL);

    showToast('VenueFlow AI is live — try finding a restroom!', 'info');
}

document.addEventListener('DOMContentLoaded', init);
