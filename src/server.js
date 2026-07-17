/**
 * FIFA World Cup 2026 Stadium Assistant — Express Server
 * Serves the frontend and provides the /api/chat endpoint.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { initGemini, generateResponse } = require('./gemini');
const {
  listStadiums,
  getGateStatus,
  getSectionInfo,
  getNearestFacilities,
  getNearestExits,
  getMatchInfo,
  simulateDensityShift,
  buildContextString,
  getStadium,
  crowdLabel,
} = require('./stadium-data');
const { checkOvercrowding, getActiveAlerts, acknowledgeAlert, getAlertsSummary } = require('./alerts');
const { sanitize, ResponseCache, RateLimiter } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Constants ---
const DEFAULT_STADIUM_ID = 'metlife';
const DEFAULT_SECTION_ID = '100';

// Initialize Cache and Rate Limiter
const cache = new ResponseCache();
const limiter = new RateLimiter();

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Security headers with strict Content-Security-Policy
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Set CSP to support Google Maps Platform, Google Fonts, and local APIs
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com; " +
    "connect-src 'self' https://maps.googleapis.com;"
  );
  next();
});

// Initialize Gemini
const geminiReady = initGemini(process.env.GEMINI_API_KEY);
console.log(geminiReady ? '✅ Gemini API initialized' : '⚠️ Gemini API not configured — using fallback responses');

// --- Helper formatters for map aggregated markers ---

/**
 * Formats stadium gates data for front-end map markers.
 * @param {Object} gates - Raw gates key-value dictionary.
 * @returns {Array<Object>} Formatted gates list.
 */
function formatGatesForMap(gates) {
  return Object.entries(gates).map(([id, g]) => ({
    id,
    name: g.name,
    coords: g.coords,
    status: g.status,
    crowd_density: g.crowd_density,
    crowd_level: crowdLabel(g.crowd_density),
  }));
}

/**
 * Formats stadium restrooms data for front-end map markers.
 * @param {Object} restrooms - Raw restrooms key-value dictionary.
 * @returns {Array<Object>} Formatted restrooms list.
 */
function formatRestroomsForMap(restrooms) {
  return Object.entries(restrooms).map(([id, r]) => ({
    id,
    name: r.name,
    coords: r.coords,
    wait_minutes: r.wait_minutes,
    accessible: r.accessible,
    crowd_density: r.crowd_density,
    crowd_level: crowdLabel(r.crowd_density),
  }));
}

/**
 * Formats stadium concessions data for front-end map markers.
 * @param {Object} concessions - Raw concessions key-value dictionary.
 * @returns {Array<Object>} Formatted concessions list.
 */
function formatConcessionsForMap(concessions) {
  return Object.entries(concessions).map(([id, c]) => ({
    id,
    name: c.name,
    coords: c.coords,
    wait_minutes: c.wait_minutes,
    accessible: c.accessible,
    type: c.type,
  }));
}

/**
 * Formats stadium exits data for front-end map markers.
 * @param {Object} exits - Raw exits key-value dictionary.
 * @returns {Array<Object>} Formatted exits list.
 */
function formatExitsForMap(exits) {
  return Object.entries(exits).map(([id, e]) => ({
    id,
    name: e.name,
    coords: e.coords,
    accessible: e.accessible,
    crowd_density: e.crowd_density,
    crowd_level: crowdLabel(e.crowd_density),
  }));
}

/**
 * Formats stadium sections data for front-end map markers.
 * @param {Object} sections - Raw sections key-value dictionary.
 * @returns {Array<Object>} Formatted sections list.
 */
function formatSectionsForMap(sections) {
  return Object.entries(sections).map(([id, s]) => ({
    id,
    coords: s.coords,
    crowd_density: s.crowd_density,
    crowd_level: crowdLabel(s.crowd_density),
  }));
}

// ─── API Routes ──────────────────────────────────────────

/**
 * GET /api/health
 * Health check endpoint indicating service and Gemini connection status.
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FIFA WC 2026 Stadium Assistant',
    gemini: geminiReady ? 'connected' : 'fallback',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/stadiums
 * Returns list of all available stadiums.
 */
app.get('/api/stadiums', (req, res) => {
  res.json({ stadiums: listStadiums() });
});

/**
 * GET /api/config
 * Exposes API keys/configuration options needed by the frontend.
 */
app.get('/api/config', (req, res) => {
  res.json({
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || null,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
  });
});

/**
 * GET /api/stadiums/:id/map-data
 * Returns complete layout markers (gates, restrooms, concessions, exits, sections) for a stadium.
 */
app.get('/api/stadiums/:id/map-data', (req, res) => {
  const stadiumId = req.params.id;
  const stadium = getStadium(stadiumId);
  if (!stadium) return res.status(404).json({ error: 'Stadium not found' });

  const gates = formatGatesForMap(stadium.gates);
  const restrooms = formatRestroomsForMap(stadium.restrooms);
  const concessions = formatConcessionsForMap(stadium.concessions);
  const exits = formatExitsForMap(stadium.exits);
  const sections = formatSectionsForMap(stadium.sections);

  res.json({ gates, restrooms, concessions, exits, sections });
});

/**
 * GET /api/stadiums/:id/gates
 * Returns active gate statuses and crowd levels for a stadium.
 */
app.get('/api/stadiums/:id/gates', (req, res) => {
  const gates = getGateStatus(req.params.id);
  if (!gates) return res.status(404).json({ error: 'Stadium not found' });
  res.json({ gates });
});

/**
 * GET /api/stadiums/:id/sections/:section
 * Returns specific details about a section.
 */
app.get('/api/stadiums/:id/sections/:section', (req, res) => {
  const section = getSectionInfo(req.params.id, req.params.section);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json({ section });
});

/**
 * GET /api/stadiums/:id/sections/:section/nearby
 * Returns nearest facilities (restrooms, concessions, exits) from a section point.
 */
app.get('/api/stadiums/:id/sections/:section/nearby', (req, res) => {
  const stadiumId = req.params.id;
  const sectionId = req.params.section;
  const accessible = req.query.accessible === 'true';

  const restrooms = getNearestFacilities(stadiumId, sectionId, 'restrooms', { accessibleOnly: accessible });
  const concessions = getNearestFacilities(stadiumId, sectionId, 'concessions', { accessibleOnly: accessible });
  const exits = getNearestExits(stadiumId, sectionId, { accessibleOnly: accessible });

  res.json({ restrooms, concessions, exits });
});

/**
 * GET /api/stadiums/:id/match
 * Returns scheduling and score information for match at a stadium.
 */
app.get('/api/stadiums/:id/match', (req, res) => {
  const match = getMatchInfo(req.params.id);
  if (!match) return res.status(404).json({ error: 'No match found' });
  res.json({ match });
});

/**
 * GET /api/alerts
 * Returns active operational alerts, optionally running overcrowding check first.
 */
app.get('/api/alerts', (req, res) => {
  const stadiumId = req.query.stadium;
  // Run overcrowding check
  if (stadiumId) checkOvercrowding(stadiumId);
  res.json({ alerts: getActiveAlerts(stadiumId) });
});

/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledges a specific alert.
 */
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const ok = acknowledgeAlert(req.params.id);
  res.json({ acknowledged: ok });
});

// ─── Chat Endpoint (Core GenAI) ─────────────────────────

/**
 * POST /api/chat
 * Handles real-time queries from fans, including rate-limiting, input-sanitization, caching, and Gemini.
 */
app.post('/api/chat', async (req, res) => {
  // Apply Rate Limiting
  if (!limiter.isAllowed(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  const start = Date.now();

  // Validate input
  const message = sanitize(req.body.message);
  const stadiumId = sanitize(req.body.stadium_id) || DEFAULT_STADIUM_ID;
  const sectionId = sanitize(req.body.section_id) || DEFAULT_SECTION_ID;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Check cache
    const cachedResponse = cache.get(stadiumId, sectionId, message);
    if (cachedResponse) {
      const latencyMs = Date.now() - start;
      return res.json({
        response: cachedResponse,
        stadium_id: stadiumId,
        section_id: sectionId,
        cached: true,
        latency_ms: latencyMs,
      });
    }

    // Simulate dynamic density changes
    simulateDensityShift(stadiumId);

    // Check for anomalies
    const newAlerts = checkOvercrowding(stadiumId);

    // Build context for Gemini
    const context = buildContextString(stadiumId, sectionId);
    const alertsSummary = getAlertsSummary(stadiumId);

    // Generate AI response
    const response = await generateResponse(message, context, alertsSummary);

    // Cache the response
    cache.set(stadiumId, sectionId, message, response);

    const latencyMs = Date.now() - start;

    res.json({
      response,
      stadium_id: stadiumId,
      section_id: sectionId,
      alerts: newAlerts.length > 0 ? newAlerts : undefined,
      latency_ms: latencyMs,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate response. Please try again.' });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`⚽ FIFA WC 2026 Stadium Assistant running on http://localhost:${PORT}`);
  });
}

module.exports = app;
