/**
 * Shared Utilities — Sanitization, Caching, Helpers
 */

// Input sanitization — strips HTML, dangerous chars, limits length
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`;]/g, '')
    .trim()
    .slice(0, 500);
}

// Simple in-memory LRU response cache
class ResponseCache {
  constructor(maxSize = 50, ttlMs = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  _key(stadiumId, sectionId, message) {
    return `${stadiumId}:${sectionId}:${message.toLowerCase().trim()}`;
  }

  get(stadiumId, sectionId, message) {
    const key = this._key(stadiumId, sectionId, message);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  set(stadiumId, sectionId, message, response) {
    const key = this._key(stadiumId, sectionId, message);
    if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { response, timestamp: Date.now() });
  }
}

// Simple rate limiter (per IP, sliding window)
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 20) {
    this.windows = new Map();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(clientId) {
    const now = Date.now();
    const requests = this.windows.get(clientId) || [];
    // Remove expired entries
    const valid = requests.filter((t) => now - t < this.windowMs);
    if (valid.length >= this.maxRequests) {
      this.windows.set(clientId, valid);
      return false;
    }
    valid.push(now);
    this.windows.set(clientId, valid);
    return true;
  }
}

module.exports = { sanitize, ResponseCache, RateLimiter };
