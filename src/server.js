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
} = require('./stadium-data');
const { checkOvercrowding, getActiveAlerts, acknowledgeAlert, getAlertsSummary } = require('./alerts');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Initialize Gemini
const geminiReady = initGemini(process.env.GEMINI_API_KEY);
console.log(geminiReady ? '✅ Gemini API initialized' : '⚠️ Gemini API not configured — using fallback responses');

// Input sanitization
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')      // Strip HTML tags
    .replace(/[<>"'`;]/g, '')      // Remove dangerous characters
    .trim()
    .slice(0, 500);                // Length limit
}

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
  const start = Date.now();

  // Validate input
  const message = sanitize(req.body.message);
  const stadiumId = sanitize(req.body.stadium_id) || 'metlife';
  const sectionId = sanitize(req.body.section_id) || '100';

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Simulate dynamic density changes
    simulateDensityShift(stadiumId);

    // Check for anomalies
    const newAlerts = checkOvercrowding(stadiumId);

    // Build context for Gemini
    const context = buildContextString(stadiumId, sectionId);
    const alertsSummary = getAlertsSummary(stadiumId);

    // Generate AI response
    const response = await generateResponse(message, context, alertsSummary);

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
