/**
 * Google Maps Stadium Visualization
 * Renders interactive stadium map with gates, facilities, crowd density overlays.
 * Integrates with the chat assistant to highlight recommended locations.
 */

/* global google */

const StadiumMap = (() => {
  'use strict';

  let map = null;
  let markers = [];
  let densityCircles = [];
  let highlightMarker = null;
  let userMarker = null;
  let infoWindow = null;
  let currentStadium = null;

  // Stadium coordinates
  const STADIUM_COORDS = {
    metlife: { lat: 40.8128, lng: -74.0742, zoom: 17 },
    sofi: { lat: 33.9535, lng: -118.3392, zoom: 17 },
    att: { lat: 32.7473, lng: -97.0945, zoom: 17 },
  };

  // Crowd density color palette (WCAG AA on dark bg)
  const DENSITY_COLORS = {
    low: { fill: '#22c55e', stroke: '#16a34a', label: 'Low', icon: '🟢' },
    moderate: { fill: '#eab308', stroke: '#ca8a04', label: 'Moderate', icon: '🟡' },
    high: { fill: '#f97316', stroke: '#ea580c', label: 'High', icon: '🟠' },
    critical: { fill: '#ef4444', stroke: '#dc2626', label: 'Critical', icon: '🔴' },
  };

  // Marker icon configs (lazy loaded inside init)
  let MARKER_ICONS = null;

  // Dark mode map style
  const MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3748' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a2b' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3a2a' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  ];

  /**
   * Initialize the Google Map
   * @param {string} containerId - DOM element ID for the map
   * @param {string} stadiumId - Initial stadium to display
   */
  function init(containerId, stadiumId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Initialize MARKER_ICONS now that Google Maps API is loaded
    MARKER_ICONS = {
      gate_open: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#22c55e', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 2 },
      gate_closed: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#ef4444', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 2 },
      restroom: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#3b82f6', fillOpacity: 0.8, strokeColor: '#fff', strokeWeight: 1.5 },
      food: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#f59e0b', fillOpacity: 0.8, strokeColor: '#fff', strokeWeight: 1.5 },
      exit: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#a855f7', fillOpacity: 0.8, strokeColor: '#fff', strokeWeight: 1.5 },
      user: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#22d3ee', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      highlight: { path: google.maps.SymbolPath.CIRCLE, scale: 16, fillColor: '#f0d078', fillOpacity: 0.6, strokeColor: '#d4a843', strokeWeight: 3 },
    };

    const coords = STADIUM_COORDS[stadiumId] || STADIUM_COORDS.metlife;
    currentStadium = stadiumId;

    map = new google.maps.Map(container, {
      center: { lat: coords.lat, lng: coords.lng },
      zoom: coords.zoom,
      styles: MAP_STYLES,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });

    infoWindow = new google.maps.InfoWindow();

    // Load stadium data and render markers
    loadMapData(stadiumId);
  }

  /**
   * Load map data from the server and render markers
   */
  async function loadMapData(stadiumId) {
    try {
      const res = await fetch(`/api/stadiums/${stadiumId}/map-data`);
      if (!res.ok) throw new Error('Failed to load map data');
      const data = await res.json();
      renderMarkers(data);
    } catch (err) {
      console.warn('Map data load error, trying direct data fetch:', err);
      // Fallback: try loading raw stadium data
      try {
        const res = await fetch(`/api/stadiums/${stadiumId}/gates`);
        if (res.ok) {
          const gateData = await res.json();
          renderGateMarkers(gateData.gates || []);
        }
      } catch (e) {
        console.warn('Map fallback also failed:', e);
      }
    }
  }

  /**
   * Render all markers and overlays from map data
   */
  function renderMarkers(data) {
    clearMarkers();

    // Gates
    (data.gates || []).forEach((gate) => {
      const icon = gate.status === 'open' ? MARKER_ICONS.gate_open : MARKER_ICONS.gate_closed;
      const crowdInfo = DENSITY_COLORS[gate.crowd_level] || DENSITY_COLORS.low;
      addMarker({
        position: gate.coords,
        icon: { ...icon, fillColor: gate.status === 'open' ? crowdInfo.fill : '#ef4444' },
        title: `${gate.name} — ${gate.status.toUpperCase()} — Crowd: ${crowdInfo.label} ${crowdInfo.icon}`,
        info: buildInfoContent('gate', gate, crowdInfo),
      });
    });

    // Restrooms
    (data.restrooms || []).forEach((r) => {
      const crowdInfo = DENSITY_COLORS[r.crowd_level] || DENSITY_COLORS.low;
      addMarker({
        position: r.coords,
        icon: MARKER_ICONS.restroom,
        title: `${r.name} — Wait: ${r.wait_minutes}min — ${crowdInfo.label} ${crowdInfo.icon}`,
        info: buildInfoContent('restroom', r, crowdInfo),
      });
    });

    // Concessions
    (data.concessions || []).forEach((c) => {
      addMarker({
        position: c.coords,
        icon: MARKER_ICONS.food,
        title: `${c.name} — Wait: ${c.wait_minutes}min`,
        info: buildInfoContent('food', c),
      });
    });

    // Exits
    (data.exits || []).forEach((e) => {
      const crowdInfo = DENSITY_COLORS[e.crowd_level] || DENSITY_COLORS.low;
      addMarker({
        position: e.coords,
        icon: MARKER_ICONS.exit,
        title: `${e.name} — Crowd: ${crowdInfo.label} ${crowdInfo.icon} — Accessible: ${e.accessible ? 'Yes' : 'No'}`,
        info: buildInfoContent('exit', e, crowdInfo),
      });
    });

    // Crowd density circles for sections
    (data.sections || []).forEach((s) => {
      const crowdInfo = DENSITY_COLORS[s.crowd_level] || DENSITY_COLORS.low;
      addDensityCircle(s.coords, s.crowd_density, crowdInfo, `Section ${s.id}: ${crowdInfo.label} (${Math.round(s.crowd_density * 100)}%)`);
    });
  }

  function renderGateMarkers(gates) {
    clearMarkers();
    gates.forEach((gate) => {
      if (!gate.coords) return;
      addMarker({
        position: gate.coords,
        icon: gate.status === 'open' ? MARKER_ICONS.gate_open : MARKER_ICONS.gate_closed,
        title: `${gate.name} — ${gate.status}`,
        info: `<div class="map-info"><strong>${escapeHtml(gate.name)}</strong><br>Status: ${gate.status}</div>`,
      });
    });
  }

  /**
   * Build HTML content for info window
   */
  function buildInfoContent(type, item, crowdInfo) {
    const crowdBadge = crowdInfo
      ? `<span class="map-info-badge" style="background:${crowdInfo.fill}20;color:${crowdInfo.fill}">${crowdInfo.icon} ${crowdInfo.label}</span>`
      : '';

    let content = `<div class="map-info-window">`;
    content += `<div class="map-info-title">${getTypeEmoji(type)} ${escapeHtml(item.name)}</div>`;

    if (type === 'gate') {
      content += `<div class="map-info-row">Status: <strong>${item.status.toUpperCase()}</strong></div>`;
      content += `<div class="map-info-row">Crowd: ${crowdBadge}</div>`;
    } else if (type === 'restroom') {
      content += `<div class="map-info-row">Wait: <strong>${item.wait_minutes} min</strong></div>`;
      content += `<div class="map-info-row">Crowd: ${crowdBadge}</div>`;
      content += `<div class="map-info-row">Accessible: ${item.accessible ? '♿ Yes' : 'No'}</div>`;
    } else if (type === 'food') {
      content += `<div class="map-info-row">Wait: <strong>${item.wait_minutes} min</strong></div>`;
      content += `<div class="map-info-row">Type: ${item.type || 'food'}</div>`;
      content += `<div class="map-info-row">Accessible: ${item.accessible ? '♿ Yes' : 'No'}</div>`;
    } else if (type === 'exit') {
      content += `<div class="map-info-row">Crowd: ${crowdBadge}</div>`;
      content += `<div class="map-info-row">Accessible: ${item.accessible ? '♿ Yes' : 'No'}</div>`;
    }

    content += `</div>`;
    return content;
  }

  function getTypeEmoji(type) {
    const emojis = { gate: '🚪', restroom: '🚻', food: '🍔', exit: '🚶', section: '💺' };
    return emojis[type] || '📍';
  }

  /**
   * Add a marker to the map
   */
  function addMarker({ position, icon, title, info }) {
    const marker = new google.maps.Marker({
      position,
      map,
      icon,
      title,
      optimized: false,
    });

    if (info) {
      marker.addListener('click', () => {
        infoWindow.setContent(info);
        infoWindow.open(map, marker);
      });
    }

    // Keyboard accessibility
    marker.addListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        infoWindow.setContent(info);
        infoWindow.open(map, marker);
      }
    });

    markers.push(marker);
    return marker;
  }

  /**
   * Add a crowd density circle overlay
   */
  function addDensityCircle(center, density, crowdInfo, label) {
    const circle = new google.maps.Circle({
      center,
      radius: 25 + density * 30,
      fillColor: crowdInfo.fill,
      fillOpacity: 0.15 + density * 0.2,
      strokeColor: crowdInfo.stroke,
      strokeWeight: 1,
      strokeOpacity: 0.4,
      map,
      clickable: true,
    });

    circle.addListener('click', () => {
      infoWindow.setContent(`<div class="map-info-window"><div class="map-info-title">💺 ${escapeHtml(label)}</div></div>`);
      infoWindow.setPosition(center);
      infoWindow.open(map);
    });

    densityCircles.push(circle);
  }

  /**
   * Highlight a specific location on the map (called when assistant recommends a location)
   */
  function highlightLocation(name, coords) {
    removeHighlight();

    if (coords) {
      highlightMarker = new google.maps.Marker({
        position: coords,
        map,
        icon: MARKER_ICONS.highlight,
        title: `Recommended: ${name}`,
        animation: google.maps.Animation.BOUNCE,
        zIndex: 1000,
      });

      // Stop bouncing after 3 seconds
      setTimeout(() => {
        if (highlightMarker) highlightMarker.setAnimation(null);
      }, 3000);

      // Pan to highlighted location
      map.panTo(coords);
      map.setZoom(18);

      // Show info window
      infoWindow.setContent(`<div class="map-info-window"><div class="map-info-title">⭐ Recommended</div><div class="map-info-row">${escapeHtml(name)}</div></div>`);
      infoWindow.open(map, highlightMarker);
    }
  }

  /**
   * Set the user's position marker
   */
  function setUserPosition(coords, label) {
    if (userMarker) userMarker.setMap(null);
    userMarker = new google.maps.Marker({
      position: coords,
      map,
      icon: MARKER_ICONS.user,
      title: `You are here: ${label}`,
      zIndex: 999,
    });
  }

  /**
   * Switch the map to a different stadium
   */
  function switchStadium(stadiumId) {
    const coords = STADIUM_COORDS[stadiumId];
    if (!coords || !map) return;
    currentStadium = stadiumId;
    clearMarkers();
    map.setCenter({ lat: coords.lat, lng: coords.lng });
    map.setZoom(coords.zoom);
    loadMapData(stadiumId);
  }

  /**
   * Refresh markers with updated crowd data
   */
  function refresh() {
    if (currentStadium) loadMapData(currentStadium);
  }

  function removeHighlight() {
    if (highlightMarker) {
      highlightMarker.setMap(null);
      highlightMarker = null;
    }
  }

  function clearMarkers() {
    markers.forEach((m) => m.setMap(null));
    markers = [];
    densityCircles.forEach((c) => c.setMap(null));
    densityCircles = [];
    removeHighlight();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Try to find coordinates for a location name from map data
   */
  function findCoordsForLocation(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    for (const m of markers) {
      const title = (m.getTitle() || '').toLowerCase();
      if (title.includes(lower) || lower.includes(title.split(' — ')[0])) {
        const pos = m.getPosition();
        return { lat: pos.lat(), lng: pos.lng() };
      }
    }
    return null;
  }

  // Public API
  const api = {
    init,
    switchStadium,
    highlightLocation,
    setUserPosition,
    refresh,
    findCoordsForLocation,
    loadMapData,
  };

  // Expose to window globally
  window.StadiumMap = api;
  return api;
})();
