/**
 * FIFA World Cup 2026 Stadium Assistant — Tests
 * Unit tests for stadium-data, alerts, and gemini modules.
 * Integration test for the chat API endpoint.
 */

const {
  haversineDistance,
  estimateWalkTime,
  crowdLabel,
  getStadium,
  listStadiums,
  getGateStatus,
  getSectionInfo,
  getNearestFacilities,
  getNearestExits,
  getMatchInfo,
  buildContextString,
} = require('../src/stadium-data');

const {
  THRESHOLDS,
  checkOvercrowding,
  getActiveAlerts,
  acknowledgeAlert,
  getAlertsSummary,
} = require('../src/alerts');

const {
  generateFallbackResponse,
  SYSTEM_PROMPT,
} = require('../src/gemini');

// ═══════════════════════════════════════════════════════════
// Stadium Data Module Tests
// ═══════════════════════════════════════════════════════════

describe('Stadium Data Module', () => {
  describe('haversineDistance', () => {
    test('returns 0 for same point', () => {
      const point = { lat: 40.8128, lng: -74.0742 };
      expect(haversineDistance(point, point)).toBe(0);
    });

    test('calculates distance between two points', () => {
      const a = { lat: 40.8128, lng: -74.0742 };
      const b = { lat: 40.8135, lng: -74.0755 };
      const dist = haversineDistance(a, b);
      expect(dist).toBeGreaterThan(50);
      expect(dist).toBeLessThan(300);
    });

    test('returns positive value regardless of direction', () => {
      const a = { lat: 40.8135, lng: -74.0755 };
      const b = { lat: 40.8128, lng: -74.0742 };
      expect(haversineDistance(a, b)).toBeGreaterThan(0);
    });
  });

  describe('estimateWalkTime', () => {
    test('returns 0 for 0 distance', () => {
      expect(estimateWalkTime(0)).toBe(0);
    });

    test('accounts for indoor overhead (slower than raw speed)', () => {
      // 120m at 1.2 m/s = 100s, with 1.2x overhead = 120s
      const time = estimateWalkTime(120);
      expect(time).toBe(120);
    });

    test('scales linearly with distance', () => {
      const t1 = estimateWalkTime(100);
      const t2 = estimateWalkTime(200);
      expect(t2).toBe(t1 * 2);
    });
  });

  describe('crowdLabel', () => {
    test('returns low for density <= 0.3', () => {
      expect(crowdLabel(0.1)).toBe('low');
      expect(crowdLabel(0.3)).toBe('low');
    });

    test('returns moderate for density <= 0.6', () => {
      expect(crowdLabel(0.4)).toBe('moderate');
      expect(crowdLabel(0.6)).toBe('moderate');
    });

    test('returns high for density <= 0.8', () => {
      expect(crowdLabel(0.7)).toBe('high');
      expect(crowdLabel(0.8)).toBe('high');
    });

    test('returns critical for density > 0.8', () => {
      expect(crowdLabel(0.9)).toBe('critical');
      expect(crowdLabel(1.0)).toBe('critical');
    });
  });

  describe('getStadium', () => {
    test('returns MetLife stadium data', () => {
      const stadium = getStadium('metlife');
      expect(stadium).not.toBeNull();
      expect(stadium.name).toBe('MetLife Stadium');
      expect(stadium.capacity).toBe(82500);
    });

    test('returns SoFi stadium data', () => {
      const stadium = getStadium('sofi');
      expect(stadium).not.toBeNull();
      expect(stadium.name).toBe('SoFi Stadium');
    });

    test('returns null for unknown stadium', () => {
      expect(getStadium('unknown')).toBeNull();
    });
  });

  describe('listStadiums', () => {
    test('returns all 3 stadiums', () => {
      const stadiums = listStadiums();
      expect(stadiums.length).toBe(3);
      const names = stadiums.map((s) => s.name);
      expect(names).toContain('MetLife Stadium');
      expect(names).toContain('SoFi Stadium');
      expect(names).toContain('AT&T Stadium');
    });
  });

  describe('getGateStatus', () => {
    test('returns gates for MetLife', () => {
      const gates = getGateStatus('metlife');
      expect(gates).not.toBeNull();
      expect(gates.length).toBeGreaterThan(0);
      gates.forEach((g) => {
        expect(g).toHaveProperty('status');
        expect(g).toHaveProperty('crowd_level');
      });
    });

    test('returns null for unknown stadium', () => {
      expect(getGateStatus('fake')).toBeNull();
    });
  });

  describe('getSectionInfo', () => {
    test('returns section data with crowd level', () => {
      const section = getSectionInfo('metlife', '114');
      expect(section).not.toBeNull();
      expect(section.level).toBe('Lower');
      expect(section.zone).toBe('East');
      expect(section).toHaveProperty('crowd_level');
    });

    test('returns null for unknown section', () => {
      expect(getSectionInfo('metlife', '999')).toBeNull();
    });
  });

  describe('getNearestFacilities', () => {
    test('returns top 3 restrooms sorted by composite score', () => {
      const restrooms = getNearestFacilities('metlife', '100', 'restrooms');
      expect(restrooms.length).toBeLessThanOrEqual(3);
      expect(restrooms.length).toBeGreaterThan(0);
      restrooms.forEach((r) => {
        expect(r).toHaveProperty('composite_score');
        expect(r).toHaveProperty('walk_time_seconds');
        expect(r).toHaveProperty('wait_minutes');
      });
      // Verify sorted ascending by score
      for (let i = 1; i < restrooms.length; i++) {
        expect(restrooms[i].composite_score).toBeGreaterThanOrEqual(restrooms[i - 1].composite_score);
      }
    });

    test('filters for accessible facilities', () => {
      const restrooms = getNearestFacilities('metlife', '128', 'restrooms', { accessibleOnly: true });
      restrooms.forEach((r) => {
        expect(r.accessible).toBe(true);
      });
    });

    test('returns empty for unknown stadium', () => {
      expect(getNearestFacilities('fake', '100', 'restrooms')).toEqual([]);
    });
  });

  describe('getNearestExits', () => {
    test('returns exits sorted by composite score', () => {
      const exits = getNearestExits('metlife', '100');
      expect(exits.length).toBeGreaterThan(0);
      expect(exits[0]).toHaveProperty('crowd_level');
      expect(exits[0]).toHaveProperty('walk_time_seconds');
    });

    test('filters for accessible exits', () => {
      const exits = getNearestExits('metlife', '100', { accessibleOnly: true });
      exits.forEach((e) => {
        expect(e.accessible).toBe(true);
      });
    });
  });

  describe('getMatchInfo', () => {
    test('returns match data for SoFi (live match)', () => {
      const match = getMatchInfo('sofi');
      expect(match).not.toBeNull();
      expect(match.status).toBe('live');
      expect(match.current_minute).toBeDefined();
      expect(match.phase).toBeDefined();
    });

    test('returns match for MetLife', () => {
      const match = getMatchInfo('metlife');
      expect(match).not.toBeNull();
      expect(match.team_home).toBe('United States');
    });
  });

  describe('buildContextString', () => {
    test('builds a comprehensive context string', () => {
      const ctx = buildContextString('metlife', '100');
      expect(ctx).toContain('MetLife Stadium');
      expect(ctx).toContain('Section 100');
      expect(ctx).toContain('GATE STATUS');
      expect(ctx).toContain('NEAREST RESTROOMS');
      expect(ctx).toContain('NEAREST FOOD');
      expect(ctx).toContain('NEAREST EXITS');
    });

    test('returns error message for unknown stadium', () => {
      const ctx = buildContextString('fake', '100');
      expect(ctx).toBe('Stadium not found.');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Alerts Module Tests
// ═══════════════════════════════════════════════════════════

describe('Alerts Module', () => {
  describe('THRESHOLDS', () => {
    test('has expected threshold values', () => {
      expect(THRESHOLDS.overcrowding_warning).toBe(0.8);
      expect(THRESHOLDS.overcrowding_critical).toBe(0.95);
      expect(THRESHOLDS.gate_queue_warning_minutes).toBe(15);
    });
  });

  describe('checkOvercrowding', () => {
    test('returns array of alerts', () => {
      const alerts = checkOvercrowding('metlife');
      expect(Array.isArray(alerts)).toBe(true);
    });

    test('alerts have required fields', () => {
      // Force a check — some gates may trigger
      const alerts = checkOvercrowding('metlife');
      alerts.forEach((a) => {
        expect(a).toHaveProperty('id');
        expect(a).toHaveProperty('type');
        expect(a).toHaveProperty('severity');
        expect(a).toHaveProperty('message');
        expect(a).toHaveProperty('timestamp');
      });
    });
  });

  describe('getActiveAlerts', () => {
    test('returns only unacknowledged alerts', () => {
      const alerts = getActiveAlerts();
      alerts.forEach((a) => {
        expect(a.acknowledged).toBe(false);
      });
    });

    test('filters by stadium ID', () => {
      checkOvercrowding('metlife');
      const alerts = getActiveAlerts('metlife');
      alerts.forEach((a) => {
        expect(a.stadium_id).toBe('metlife');
      });
    });
  });

  describe('acknowledgeAlert', () => {
    test('returns false for unknown alert ID', () => {
      expect(acknowledgeAlert('ALERT-999')).toBe(false);
    });
  });

  describe('getAlertsSummary', () => {
    test('returns string summary', () => {
      const summary = getAlertsSummary('sofi');
      expect(typeof summary).toBe('string');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Gemini Module Tests
// ═══════════════════════════════════════════════════════════

describe('Gemini Module', () => {
  describe('SYSTEM_PROMPT', () => {
    test('contains core assistant instructions', () => {
      expect(SYSTEM_PROMPT).toContain('FIFA World Cup 2026');
      expect(SYSTEM_PROMPT).toContain('Stadium Assistant');
      expect(SYSTEM_PROMPT).toContain('crowd');
    });
  });

  describe('generateFallbackResponse', () => {
    const mockContext = `STADIUM: MetLife Stadium (East Rutherford, NJ), Capacity: 82500
USER LOCATION: Section 100, Lower Level, North Zone, Crowd: moderate

GATE STATUS:
  Gate A - Main Entrance: OPEN, Crowd: high (70%)
  Gate B - East: OPEN, Crowd: moderate (40%)
  Gate D - South: OPEN, Crowd: low (30%)

NEAREST RESTROOMS:
  Restroom - East Lower: 45s walk, ~2 min wait, Crowd: low
  Restroom - Mezzanine North: 60s walk, ~3 min wait, Crowd: moderate

NEAREST FOOD/BEVERAGE:
  Global Bites - East (food): 50s walk, ~4 min wait
  Stadium Grill - North (food): 30s walk, ~8 min wait

NEAREST EXITS:
  North Exit 2: 40s walk, Crowd: low, Accessible: Yes
  East Exit 2: 55s walk, Crowd: moderate, Accessible: Yes`;

    test('responds to restroom queries', () => {
      const response = generateFallbackResponse('Where is the nearest restroom?', mockContext);
      expect(response).toContain('⚽');
      expect(response.toLowerCase()).toContain('restroom') || expect(response.toLowerCase()).toContain('wait');
    });

    test('responds to food queries', () => {
      const response = generateFallbackResponse('Where can I get food?', mockContext);
      expect(response).toContain('⚽');
    });

    test('responds to exit queries', () => {
      const response = generateFallbackResponse('Where is the nearest exit?', mockContext);
      expect(response).toContain('⚽');
      expect(response.toLowerCase()).toContain('exit');
    });

    test('responds to gate queries', () => {
      const response = generateFallbackResponse('Which gate should I use?', mockContext);
      expect(response).toContain('⚽');
    });

    test('provides help for unknown queries', () => {
      const response = generateFallbackResponse('hello there', mockContext);
      expect(response).toContain('Stadium Assistant');
    });

    test('handles crowd-related queries', () => {
      const response = generateFallbackResponse('How busy is it?', mockContext);
      expect(response).toContain('⚽');
      expect(response.toLowerCase()).toContain('crowd');
    });

    test('handles accessibility queries', () => {
      const response = generateFallbackResponse('I need accessible routes', mockContext);
      expect(response).toContain('⚽');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Server Integration Tests (mocked)
// ═══════════════════════════════════════════════════════════

describe('Server Integration', () => {
  let app;

  beforeAll(() => {
    // Load app without starting the server
    app = require('../src/server');
  });

  test('health endpoint returns ok', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/api/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toContain('FIFA');

    server.close();
  });

  test('config endpoint returns maps key info', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/api/config`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('GOOGLE_MAPS_API_KEY');

    server.close();
  });

  test('stadium map-data endpoint returns fully aggregated markers', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/api/stadiums/metlife/map-data`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('gates');
    expect(response.body).toHaveProperty('restrooms');
    expect(response.body).toHaveProperty('concessions');
    expect(response.body).toHaveProperty('exits');
    expect(response.body).toHaveProperty('sections');
    expect(response.body.gates.length).toBeGreaterThan(0);

    server.close();
  });

  test('stadiums endpoint returns 3 stadiums', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/api/stadiums`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(response.status).toBe(200);
    expect(response.body.stadiums.length).toBe(3);

    server.close();
  });

  test('chat endpoint requires message', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({});
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Message is required');

    server.close();
  });

  test('chat endpoint returns response and caches it for next call', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const payload = {
      message: 'Where is the nearest restroom?',
      stadium_id: 'metlife',
      section_id: '100',
    };

    const makeRequest = () => new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    // First call (normal)
    const res1 = await makeRequest();
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBeUndefined();

    // Second call (should be cached)
    const res2 = await makeRequest();
    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(true);

    server.close();
  });

  test('input sanitization strips HTML tags', async () => {
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        message: '<script>alert("xss")</script>Where is the exit?',
        stadium_id: 'metlife',
        section_id: '100',
      });
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    expect(response.status).toBe(200);
    expect(response.body.response).not.toContain('<script>');

    server.close();
  });
});
