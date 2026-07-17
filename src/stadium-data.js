/**
 * Stadium Data Manager
 * Loads and manages simulated FIFA WC 2026 stadium data.
 * Provides crowd density, gate status, nearest facilities, and dynamic simulation.
 */

const fs = require('fs');
const path = require('path');

// --- Named Constants ---
const EARTH_RADIUS_METERS = 6371000;
const WALKING_SPEED_MPS = 1.2;
const INDOOR_OVERHEAD_FACTOR = 1.2;
const FACILITY_WAIT_WEIGHT = 0.6;
const FACILITY_WALK_WEIGHT = 0.4;
const EXIT_CROWD_WEIGHT = 0.5;
const EXIT_DISTANCE_WEIGHT = 0.5;
const DEFAULT_RESULTS_LIMIT = 3;
const JITTER_MAX_SHIFT = 0.1;
const JITTER_WAIT_MINUTES_FACTOR = 5;
const FIRST_HALF_MAX_MINUTE = 45;

const stadiumsPath = path.join(__dirname, '..', 'data', 'stadiums.json');
const schedulesPath = path.join(__dirname, '..', 'data', 'schedules.json');

const stadiumData = JSON.parse(fs.readFileSync(stadiumsPath, 'utf-8'));
const scheduleData = JSON.parse(fs.readFileSync(schedulesPath, 'utf-8'));

/**
 * Clamps a crowd density value between 0.0 and 1.0.
 * @param {number} density - The density value to clamp.
 * @returns {number} The clamped density value.
 */
function clampDensity(density) {
  return Math.max(0, Math.min(1, density));
}

/**
 * Calculates the Haversine distance in meters between two lat/lng points.
 * @param {Object} coord1 - The first coordinate.
 * @param {number} coord1.lat - Latitude of the first coordinate.
 * @param {number} coord1.lng - Longitude of the first coordinate.
 * @param {Object} coord2 - The second coordinate.
 * @param {number} coord2.lat - Latitude of the second coordinate.
 * @param {number} coord2.lng - Longitude of the second coordinate.
 * @returns {number} The distance in meters.
 */
function haversineDistance(coord1, coord2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimates walk time in seconds (based on WALKING_SPEED_MPS and INDOOR_OVERHEAD_FACTOR).
 * @param {number} distanceMeters - The distance in meters.
 * @returns {number} The estimated walk time in seconds.
 */
function estimateWalkTime(distanceMeters) {
  return Math.round((distanceMeters / WALKING_SPEED_MPS) * INDOOR_OVERHEAD_FACTOR);
}

/**
 * Returns a crowd density label based on configured thresholds.
 * @param {number} density - The crowd density value (0 to 1).
 * @returns {string} The crowd level label ('low', 'moderate', 'high', 'critical').
 */
function crowdLabel(density) {
  const thresholds = stadiumData.crowd_density_thresholds;
  if (density <= thresholds.low) return 'low';
  if (density <= thresholds.medium) return 'moderate';
  if (density <= thresholds.high) return 'high';
  return 'critical';
}

/**
 * Retrieves the raw data for a specific stadium.
 * @param {string} stadiumId - The identifier of the stadium.
 * @returns {Object|null} The stadium data or null if not found.
 */
function getStadium(stadiumId) {
  return stadiumData.stadiums[stadiumId] || null;
}

/**
 * Lists all available stadiums with basic info.
 * @returns {Array<Object>} An array of stadium summary objects.
 */
function listStadiums() {
  return Object.entries(stadiumData.stadiums).map(([id, s]) => ({
    id,
    name: s.name,
    city: s.city,
    capacity: s.capacity,
  }));
}

/**
 * Gets gate status and crowd level for all gates in a stadium.
 * @param {string} stadiumId - The identifier of the stadium.
 * @returns {Array<Object>|null} The list of gates or null if stadium not found.
 */
function getGateStatus(stadiumId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return null;
  return Object.entries(stadium.gates).map(([id, gate]) => ({
    id,
    ...gate,
    crowd_level: crowdLabel(gate.crowd_density),
  }));
}

/**
 * Gets section details for a specific stadium section.
 * @param {string} stadiumId - The identifier of the stadium.
 * @param {string} sectionId - The section identifier.
 * @returns {Object|null} Section details with crowd level or null if not found.
 */
function getSectionInfo(stadiumId, sectionId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return null;
  const section = stadium.sections[sectionId];
  if (!section) return null;
  return { id: sectionId, ...section, crowd_level: crowdLabel(section.crowd_density) };
}

/**
 * Finds nearby facilities of a certain type sorted by composite efficiency score.
 * @param {string} stadiumId - The identifier of the stadium.
 * @param {string} sectionId - The section identifier.
 * @param {string} facilityType - The type of facility ('restrooms' or 'concessions').
 * @param {Object} [options={}] - Query options.
 * @param {boolean} [options.accessibleOnly=false] - Filter by accessibility.
 * @param {number} [options.limit=3] - Max results to return.
 * @returns {Array<Object>} List of nearby facilities.
 */
function getNearestFacilities(stadiumId, sectionId, facilityType, options = {}) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return [];
  const section = stadium.sections[sectionId];
  if (!section) return [];

  const facilities = stadium[facilityType];
  if (!facilities) return [];

  let items = Object.entries(facilities).map(([id, facility]) => {
    const distance = haversineDistance(section.coords, facility.coords);
    const walkTime = estimateWalkTime(distance);
    return {
      id,
      ...facility,
      distance_meters: Math.round(distance),
      walk_time_seconds: walkTime,
      crowd_level: crowdLabel(facility.crowd_density || 0),
    };
  });

  // Filter for accessibility if requested
  if (options.accessibleOnly) {
    items = items.filter((f) => f.accessible);
  }

  // Composite score: 60% wait time + 40% walk time (normalized)
  const maxWait = Math.max(...items.map((f) => f.wait_minutes || 0), 1);
  const maxWalk = Math.max(...items.map((f) => f.walk_time_seconds), 1);
  items.forEach((f) => {
    const waitScore = ((f.wait_minutes || 0) / maxWait) * FACILITY_WAIT_WEIGHT;
    const walkScore = (f.walk_time_seconds / maxWalk) * FACILITY_WALK_WEIGHT;
    f.composite_score = Math.round((waitScore + walkScore) * 100) / 100;
  });

  items.sort((a, b) => a.composite_score - b.composite_score);
  return items.slice(0, options.limit || DEFAULT_RESULTS_LIMIT);
}

/**
 * Finds nearby exits sorted by composite efficiency score.
 * @param {string} stadiumId - The identifier of the stadium.
 * @param {string} sectionId - The section identifier.
 * @param {Object} [options={}] - Query options.
 * @param {boolean} [options.accessibleOnly=false] - Filter by accessibility.
 * @param {number} [options.limit=3] - Max results to return.
 * @returns {Array<Object>} List of nearby exits.
 */
function getNearestExits(stadiumId, sectionId, options = {}) {
  const stadium = getStadium(stadiumId);
  if (!stadium || !stadium.sections[sectionId]) return [];
  const section = stadium.sections[sectionId];

  let exits = Object.entries(stadium.exits).map(([id, exit]) => {
    const distance = haversineDistance(section.coords, exit.coords);
    return {
      id,
      ...exit,
      distance_meters: Math.round(distance),
      walk_time_seconds: estimateWalkTime(distance),
      crowd_level: crowdLabel(exit.crowd_density),
    };
  });

  if (options.accessibleOnly) {
    exits = exits.filter((e) => e.accessible);
  }

  // Score exits: 50% crowd density + 50% distance
  const maxDist = Math.max(...exits.map((e) => e.distance_meters), 1);
  exits.forEach((e) => {
    const crowdScore = e.crowd_density * EXIT_CROWD_WEIGHT;
    const distScore = (e.distance_meters / maxDist) * EXIT_DISTANCE_WEIGHT;
    e.composite_score = Math.round((crowdScore + distScore) * 100) / 100;
  });

  exits.sort((a, b) => a.composite_score - b.composite_score);
  return exits.slice(0, options.limit || DEFAULT_RESULTS_LIMIT);
}

/**
 * Gets the current match information and active phase for a stadium.
 * @param {string} stadiumId - The identifier of the stadium.
 * @returns {Object|null} Match details with active phase description or null if not found.
 */
function getMatchInfo(stadiumId) {
  const match = scheduleData.matches.find((m) => m.stadium === stadiumId);
  if (!match) return null;
  const phase = match.status === 'live' && match.current_minute <= FIRST_HALF_MAX_MINUTE
    ? scheduleData.event_phases.first_half
    : match.status === 'live' && match.current_minute > FIRST_HALF_MAX_MINUTE
      ? scheduleData.event_phases.second_half
      : scheduleData.event_phases.pre_match;
  return { ...match, phase };
}

/**
 * Simulates crowd density changes by adding minor random shifts.
 * @param {string} stadiumId - The identifier of the stadium.
 */
function simulateDensityShift(stadiumId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return;
  const jitter = () => (Math.random() - 0.5) * JITTER_MAX_SHIFT;
  Object.values(stadium.sections).forEach((s) => {
    s.crowd_density = clampDensity(s.crowd_density + jitter());
  });
  Object.values(stadium.gates).forEach((g) => {
    if (g.status === 'open') {
      g.crowd_density = clampDensity(g.crowd_density + jitter());
    }
  });
  Object.values(stadium.restrooms).forEach((r) => {
    r.crowd_density = clampDensity(r.crowd_density + jitter());
    r.wait_minutes = Math.max(0, r.wait_minutes + Math.round(jitter() * JITTER_WAIT_MINUTES_FACTOR));
  });
  Object.values(stadium.concessions).forEach((c) => {
    c.wait_minutes = Math.max(0, c.wait_minutes + Math.round(jitter() * JITTER_WAIT_MINUTES_FACTOR));
  });
}

/**
 * Builds a structured stadium context string for the Gemini system prompt.
 * @param {string} stadiumId - The identifier of the stadium.
 * @param {string} sectionId - The section identifier.
 * @returns {string} The contextual text prompt.
 */
function buildContextString(stadiumId, sectionId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return 'Stadium not found.';
  const section = getSectionInfo(stadiumId, sectionId);
  const gates = getGateStatus(stadiumId);
  const match = getMatchInfo(stadiumId);
  const restrooms = getNearestFacilities(stadiumId, sectionId, 'restrooms');
  const concessions = getNearestFacilities(stadiumId, sectionId, 'concessions');
  const exits = getNearestExits(stadiumId, sectionId);

  let ctx = `STADIUM: ${stadium.name} (${stadium.city}), Capacity: ${stadium.capacity}\n`;
  if (section) {
    ctx += `USER LOCATION: Section ${sectionId}, ${section.level} Level, ${section.zone} Zone, Crowd: ${section.crowd_level}\n`;
  }
  if (match) {
    ctx += `MATCH: ${match.team_home} vs ${match.team_away} (${match.phase.label}) — ${match.phase.description}\n`;
    if (match.current_minute) ctx += `Current Minute: ${match.current_minute}\n`;
  }
  ctx += '\nGATE STATUS:\n';
  gates.forEach((g) => {
    ctx += `  ${g.name}: ${g.status.toUpperCase()}, Crowd: ${g.crowd_level} (${Math.round(g.crowd_density * 100)}%)\n`;
  });
  ctx += '\nNEAREST RESTROOMS:\n';
  restrooms.forEach((r) => {
    ctx += `  ${r.name}: ${r.walk_time_seconds}s walk, ~${r.wait_minutes} min wait, Crowd: ${r.crowd_level}\n`;
  });
  ctx += '\nNEAREST FOOD/BEVERAGE:\n';
  concessions.forEach((c) => {
    ctx += `  ${c.name} (${c.type}): ${c.walk_time_seconds}s walk, ~${c.wait_minutes} min wait\n`;
  });
  ctx += '\nNEAREST EXITS:\n';
  exits.forEach((e) => {
    ctx += `  ${e.name}: ${e.walk_time_seconds}s walk, Crowd: ${e.crowd_level}, Accessible: ${e.accessible ? 'Yes' : 'No'}\n`;
  });
  return ctx;
}

module.exports = {
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
  simulateDensityShift,
  buildContextString,
};
