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

/**
 * Checks if there is already an active (unacknowledged) alert for a specific location and type.
 * @param {string} location - The location name (e.g., gate name or section name).
 * @param {string} type - The alert type (e.g., 'overcrowding', 'long_queue').
 * @returns {boolean} True if an active alert exists, false otherwise.
 */
function hasActiveAlert(location, type) {
  return activeAlerts.some(
    (a) => a.location === location && a.type === type && !a.acknowledged
  );
}

/**
 * Converts a density value to a rounded percentage integer.
 * @param {number} density - The crowd density value (0.0 to 1.0).
 * @returns {number} The rounded percentage.
 */
function densityPercent(density) {
  return Math.round(density * 100);
}

/**
 * Creates a new alert, adds it to the active store, and returns it.
 * @param {string} type - The type of alert (e.g., 'overcrowding', 'long_queue').
 * @param {string} severity - The severity level ('warning' or 'critical').
 * @param {string} message - The alert description.
 * @param {string} location - The human-readable location name.
 * @param {string} stadiumId - The ID of the stadium.
 * @returns {Object} The created alert object.
 */
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

/**
 * Runs overcrowding and queue length checks on a stadium, generating any new alerts.
 * @param {string} stadiumId - The identifier of the stadium to check.
 * @returns {Array<Object>} List of newly generated alerts.
 */
function checkOvercrowding(stadiumId) {
  const stadium = getStadium(stadiumId);
  if (!stadium) return [];
  const newAlerts = [];

  // Check gates
  Object.entries(stadium.gates).forEach(([id, gate]) => {
    if (gate.status === 'open') {
      const isCritical = gate.crowd_density >= THRESHOLDS.overcrowding_critical;
      const isWarning = gate.crowd_density >= THRESHOLDS.overcrowding_warning;

      if (isCritical) {
        if (!hasActiveAlert(gate.name, 'overcrowding')) {
          newAlerts.push(
            createAlert(
              'overcrowding',
              'critical',
              `CRITICAL: ${gate.name} crowd density at ${densityPercent(gate.crowd_density)}%. Immediate action required — consider diverting fans to alternate gates.`,
              gate.name,
              stadiumId
            )
          );
        }
      } else if (isWarning) {
        if (!hasActiveAlert(gate.name, 'overcrowding')) {
          newAlerts.push(
            createAlert(
              'overcrowding',
              'warning',
              `WARNING: ${gate.name} crowd density at ${densityPercent(gate.crowd_density)}%. Monitor closely and prepare alternate routing.`,
              gate.name,
              stadiumId
            )
          );
        }
      }
    }
  });

  // Check sections
  Object.entries(stadium.sections).forEach(([id, section]) => {
    if (section.crowd_density >= THRESHOLDS.overcrowding_critical) {
      const locName = `Section ${id}`;
      if (!hasActiveAlert(locName, 'overcrowding')) {
        newAlerts.push(
          createAlert(
            'overcrowding',
            'critical',
            `CRITICAL: ${locName} crowd density at ${densityPercent(section.crowd_density)}%. Section may exceed safe capacity.`,
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
      if (!hasActiveAlert(c.name, 'long_queue')) {
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

/**
 * Retrieves unacknowledged active alerts, optionally filtered by stadium.
 * @param {string} [stadiumId] - The optional stadium filter.
 * @returns {Array<Object>} List of active alerts.
 */
function getActiveAlerts(stadiumId) {
  if (stadiumId) {
    return activeAlerts.filter((a) => a.stadium_id === stadiumId && !a.acknowledged);
  }
  return activeAlerts.filter((a) => !a.acknowledged);
}

/**
 * Acknowledges an alert by its ID.
 * @param {string} alertId - The ID of the alert to acknowledge.
 * @returns {boolean} True if the alert was found and acknowledged, false otherwise.
 */
function acknowledgeAlert(alertId) {
  const alert = activeAlerts.find((a) => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
    return true;
  }
  return false;
}

/**
 * Generates a text summary of active alerts for a stadium.
 * @param {string} stadiumId - The identifier of the stadium.
 * @returns {string} The text summary.
 */
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
