/**
 * Alerts & Anomaly Detection Engine
 * Monitors crowd density and generates operational alerts for staff/volunteers.
 */

const { getStadium, crowdLabel } = require('./stadium-data');

const THRESHOLDS = {
  overcrowding_warning: 0.8,
  overcrowding_critical: 0.95,
  gate_queue_warning_minutes: 15,
};

// Active alerts store (in-memory)
const activeAlerts = [];
let alertIdCounter = 1;

function createAlert(type, severity, message, location, stadiumId) {
  const alert = {
    id: `ALERT-${String(alertIdCounter++).padStart(3, '0')}`,
    type,
    severity,
    message,
    location,
    stadium_id: stadiumId,
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };
  activeAlerts.push(alert);
  return alert;
}

function checkOvercrowding(stadiumId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return [];
  const newAlerts = [];

  // Check gates
  Object.entries(stadium.gates).forEach(([id, gate]) => {
    if (gate.status === 'open' && gate.crowd_density >= THRESHOLDS.overcrowding_critical) {
      const existing = activeAlerts.find(
        (a) => a.location === gate.name && a.type === 'overcrowding' && !a.acknowledged
      );
      if (!existing) {
        newAlerts.push(
          createAlert(
            'overcrowding',
            'critical',
            `CRITICAL: ${gate.name} crowd density at ${Math.round(gate.crowd_density * 100)}%. Immediate action required — consider diverting fans to alternate gates.`,
            gate.name,
            stadiumId
          )
        );
      }
    } else if (gate.status === 'open' && gate.crowd_density >= THRESHOLDS.overcrowding_warning) {
      const existing = activeAlerts.find(
        (a) => a.location === gate.name && a.type === 'overcrowding' && !a.acknowledged
      );
      if (!existing) {
        newAlerts.push(
          createAlert(
            'overcrowding',
            'warning',
            `WARNING: ${gate.name} crowd density at ${Math.round(gate.crowd_density * 100)}%. Monitor closely and prepare alternate routing.`,
            gate.name,
            stadiumId
          )
        );
      }
    }
  });

  // Check sections
  Object.entries(stadium.sections).forEach(([id, section]) => {
    if (section.crowd_density >= THRESHOLDS.overcrowding_critical) {
      const locName = `Section ${id}`;
      const existing = activeAlerts.find(
        (a) => a.location === locName && a.type === 'overcrowding' && !a.acknowledged
      );
      if (!existing) {
        newAlerts.push(
          createAlert(
            'overcrowding',
            'critical',
            `CRITICAL: ${locName} crowd density at ${Math.round(section.crowd_density * 100)}%. Section may exceed safe capacity.`,
            locName,
            stadiumId
          )
        );
      }
    }
  });

  // Check concession wait times
  Object.entries(stadium.concessions).forEach(([id, c]) => {
    if (c.wait_minutes >= THRESHOLDS.gate_queue_warning_minutes) {
      const existing = activeAlerts.find(
        (a) => a.location === c.name && a.type === 'long_queue' && !a.acknowledged
      );
      if (!existing) {
        newAlerts.push(
          createAlert(
            'long_queue',
            'warning',
            `${c.name} queue time is ${c.wait_minutes} minutes. Consider opening additional service points.`,
            c.name,
            stadiumId
          )
        );
      }
    }
  });

  return newAlerts;
}

function getActiveAlerts(stadiumId) {
  if (stadiumId) {
    return activeAlerts.filter((a) => a.stadium_id === stadiumId && !a.acknowledged);
  }
  return activeAlerts.filter((a) => !a.acknowledged);
}

function acknowledgeAlert(alertId) {
  const alert = activeAlerts.find((a) => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
    return true;
  }
  return false;
}

function getAlertsSummary(stadiumId) {
  const alerts = getActiveAlerts(stadiumId);
  if (alerts.length === 0) return 'No active alerts.';
  return alerts
    .map((a) => `[${a.severity.toUpperCase()}] ${a.message}`)
    .join('\n');
}

module.exports = {
  THRESHOLDS,
  checkOvercrowding,
  getActiveAlerts,
  acknowledgeAlert,
  getAlertsSummary,
  createAlert,
};
