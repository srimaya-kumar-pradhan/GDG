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

// ─── API Routes ──────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FIFA WC 2026 Stadium Assistant',
    gemini: geminiReady ? 'connected' : 'fallback',
    timestamp: new Date().toISOString(),
  });
});

// List stadiums
app.get('/api/stadiums', (req, res) => {
  res.json({ stadiums: listStadiums() });
});

// Config endpoint for Maps and Gemini keys
app.get('/api/config', (req, res) => {
  res.json({
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || null,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
  });
});

// Single batch map data endpoint for high client efficiency
app.get('/api/stadiums/:id/map-data', (req, res) => {
  const stadiumId = req.params.id;
  const stadium = getStadium(stadiumId);
  if (!stadium) return res.status(404).json({ error: 'Stadium not found' });

  // Map elements
  const gates = Object.entries(stadium.gates).map(([id, g]) => ({
    id,
    name: g.name,
    coords: g.coords,
    status: g.status,
    crowd_density: g.crowd_density,
    crowd_level: crowdLabel(g.crowd_density),
  }));

  const restrooms = Object.entries(stadium.restrooms).map(([id, r]) => ({
    id,
    name: r.name,
    coords: r.coords,
    wait_minutes: r.wait_minutes,
    accessible: r.accessible,
    crowd_density: r.crowd_density,
    crowd_level: crowdLabel(r.crowd_density),
  }));

  const concessions = Object.entries(stadium.concessions).map(([id, c]) => ({
    id,
    name: c.name,
    coords: c.coords,
    wait_minutes: c.wait_minutes,
    accessible: c.accessible,
    type: c.type,
  }));

  const exits = Object.entries(stadium.exits).map(([id, e]) => ({
    id,
    name: e.name,
    coords: e.coords,
    accessible: e.accessible,
    crowd_density: e.crowd_density,
    crowd_level: crowdLabel(e.crowd_density),
  }));

  const sections = Object.entries(stadium.sections).map(([id, s]) => ({
    id,
    coords: s.coords,
    crowd_density: s.crowd_density,
    crowd_level: crowdLabel(s.crowd_density),
  }));

  res.json({ gates, restrooms, concessions, exits, sections });
});

// Gate status for a stadium
app.get('/api/stadiums/:id/gates', (req, res) => {
  const gates = getGateStatus(req.params.id);
  if (!gates) return res.status(404).json({ error: 'Stadium not found' });
  res.json({ gates });
});

// Section info
app.get('/api/stadiums/:id/sections/:section', (req, res) => {
  const section = getSectionInfo(req.params.id, req.params.section);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json({ section });
});

// Nearest facilities (restrooms, concessions)
app.get('/api/stadiums/:id/sections/:section/nearby', (req, res) => {
  const stadiumId = req.params.id;
  const sectionId = req.params.section;
  const accessible = req.query.accessible === 'true';

  const restrooms = getNearestFacilities(stadiumId, sectionId, 'restrooms', { accessibleOnly: accessible });
  const concessions = getNearestFacilities(stadiumId, sectionId, 'concessions', { accessibleOnly: accessible });
  const exits = getNearestExits(stadiumId, sectionId, { accessibleOnly: accessible });

  res.json({ restrooms, concessions, exits });
});

// Match info
app.get('/api/stadiums/:id/match', (req, res) => {
  const match = getMatchInfo(req.params.id);
  if (!match) return res.status(404).json({ error: 'No match found' });
  res.json({ match });
});

// Active alerts
app.get('/api/alerts', (req, res) => {
  const stadiumId = req.query.stadium;
  // Run overcrowding check
  if (stadiumId) checkOvercrowding(stadiumId);
  res.json({ alerts: getActiveAlerts(stadiumId) });
});

// Acknowledge alert
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const ok = acknowledgeAlert(req.params.id);
  res.json({ acknowledged: ok });
});

// ─── Chat Endpoint (Core GenAI) ─────────────────────────

app.post('/api/chat', async (req, res) => {
  // Apply Rate Limiting
  if (!limiter.isAllowed(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  const start = Date.now();

  // Validate input
  const message = sanitize(req.body.message);
  const stadiumId = sanitize(req.body.stadium_id) || 'metlife';
  const sectionId = sanitize(req.body.section_id) || '100';

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
