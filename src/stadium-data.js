/**
 * Stadium Data Manager
 * Loads and manages simulated FIFA WC 2026 stadium data.
 * Provides crowd density, gate status, nearest facilities, and dynamic simulation.
 */

const fs = require('fs');
const path = require('path');

const stadiumsPath = path.join(__dirname, '..', 'data', 'stadiums.json');
const schedulesPath = path.join(__dirname, '..', 'data', 'schedules.json');

let stadiumData = JSON.parse(fs.readFileSync(stadiumsPath, 'utf-8'));
let scheduleData = JSON.parse(fs.readFileSync(schedulesPath, 'utf-8'));

// Haversine distance in meters between two lat/lng points
function haversineDistance(coord1, coord2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Walk time in seconds (1.2 m/s + 20% indoor overhead)
function estimateWalkTime(distanceMeters) {
  return Math.round((distanceMeters / 1.2) * 1.2);
}

// Crowd density label
function crowdLabel(density) {
  const thresholds = stadiumData.crowd_density_thresholds;
  if (density <= thresholds.low) return 'low';
  if (density <= thresholds.medium) return 'moderate';
  if (density <= thresholds.high) return 'high';
  return 'critical';
}

function getStadium(stadiumId) {
  return stadiumData.stadiums[stadiumId] || null;
}

function listStadiums() {
  return Object.entries(stadiumData.stadiums).map(([id, s]) => ({
    id,
    name: s.name,
    city: s.city,
    capacity: s.capacity,
  }));
}

function getGateStatus(stadiumId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return null;
  return Object.entries(stadium.gates).map(([id, gate]) => ({
    id,
    ...gate,
    crowd_level: crowdLabel(gate.crowd_density),
  }));
}

function getSectionInfo(stadiumId, sectionId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return null;
  const section = stadium.sections[sectionId];
  if (!section) return null;
  return { id: sectionId, ...section, crowd_level: crowdLabel(section.crowd_density) };
}

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
    const waitScore = ((f.wait_minutes || 0) / maxWait) * 0.6;
    const walkScore = (f.walk_time_seconds / maxWalk) * 0.4;
    f.composite_score = Math.round((waitScore + walkScore) * 100) / 100;
  });

  items.sort((a, b) => a.composite_score - b.composite_score);
  return items.slice(0, options.limit || 3);
}

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
    const crowdScore = e.crowd_density * 0.5;
    const distScore = (e.distance_meters / maxDist) * 0.5;
    e.composite_score = Math.round((crowdScore + distScore) * 100) / 100;
  });

  exits.sort((a, b) => a.composite_score - b.composite_score);
  return exits.slice(0, options.limit || 3);
}

function getMatchInfo(stadiumId) {
  const match = scheduleData.matches.find((m) => m.stadium === stadiumId);
  if (!match) return null;
  const phase = match.status === 'live' && match.current_minute <= 45
    ? scheduleData.event_phases.first_half
    : match.status === 'live' && match.current_minute > 45
      ? scheduleData.event_phases.second_half
      : scheduleData.event_phases.pre_match;
  return { ...match, phase };
}

// Simulate crowd density changes (call periodically for realism)
function simulateDensityShift(stadiumId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return;
  const jitter = () => (Math.random() - 0.5) * 0.1;
  Object.values(stadium.sections).forEach((s) => {
    s.crowd_density = Math.max(0, Math.min(1, s.crowd_density + jitter()));
  });
  Object.values(stadium.gates).forEach((g) => {
    if (g.status === 'open') {
      g.crowd_density = Math.max(0, Math.min(1, g.crowd_density + jitter()));
    }
  });
  Object.values(stadium.restrooms).forEach((r) => {
    r.crowd_density = Math.max(0, Math.min(1, r.crowd_density + jitter()));
    r.wait_minutes = Math.max(0, r.wait_minutes + Math.round(jitter() * 5));
  });
  Object.values(stadium.concessions).forEach((c) => {
    c.wait_minutes = Math.max(0, c.wait_minutes + Math.round(jitter() * 5));
  });
}

// Build a context string for the Gemini system prompt
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
