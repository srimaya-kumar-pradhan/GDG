/// VenueFlow AI — App Configuration
/// Centralized configuration for API endpoints and app settings.
///
/// DEPLOYMENT: Change [baseUrl] to your Render deployment URL before building.
/// For local development, use 10.0.2.2 (Android emulator) or localhost (web/iOS).

class AppConfig {
  AppConfig._();

  // ── API Configuration ──

  /// Set this to your deployed Render URL for production builds.
  /// Example: 'https://venueflow-ai-backend.onrender.com'
  static const String _productionUrl = 'https://venueflow-ai-backend.onrender.com';

  /// Local development URL for Android emulator (10.0.2.2 maps to host localhost)
  static const String _localUrl = 'http://10.0.2.2:8080';

  /// Toggle this to switch between local and production
  static const bool isProduction = false;

  /// Current active base URL
  static String get baseUrl => isProduction ? _productionUrl : _localUrl;

  /// Full recommendation endpoint
  static String get recommendationUrl => '$baseUrl/api/v1/recommendations';

  /// Venue status endpoint
  static String get venueStatusUrl => '$baseUrl/api/v1/venue-status';

  /// Health check endpoint
  static String get healthUrl => '$baseUrl/health';

  /// Match context endpoint
  static String get matchContextUrl => '$baseUrl/api/v1/ipl/match-context';

  // ── Demo Configuration ──
  static const double demoLatitude = 35.2273;
  static const double demoLongitude = -81.8388;
  static const int demoSeatSection = 202;
  static const String demoSport = 'ipl';
  static const String demoLanguage = 'en';

  // ── Timing ──
  static const int debounceMs = 300;
  static const int apiTimeoutSeconds = 10;
}
