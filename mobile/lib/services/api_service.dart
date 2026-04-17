/// VenueFlow AI — API Service Layer
/// Handles all HTTP communication with the FastAPI backend.
/// Includes timeout handling, error mapping, and response parsing.

import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  final http.Client _client = http.Client();

  /// Fetch a recommendation from the backend.
  ///
  /// Returns parsed recommendation map on success, throws [ApiException] on failure.
  Future<Map<String, dynamic>> fetchRecommendation({
    required String intent,
    String userId = 'flutter_mobile_user',
    double latitude = 35.2273,
    double longitude = -81.8388,
    int seatSection = 202,
    String sport = 'ipl',
    String language = 'en',
    List<String> accessibilityNeeds = const [],
    List<String> dietaryRestrictions = const [],
  }) async {
    final url = Uri.parse(AppConfig.recommendationUrl);

    try {
      final response = await _client
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'user_id': userId,
              'location': {'latitude': latitude, 'longitude': longitude},
              'intent': intent,
              'accessibility_needs': accessibilityNeeds,
              'seat_section': seatSection,
              'dietary_restrictions': dietaryRestrictions,
              'sport': sport,
              'language': language,
            }),
          )
          .timeout(Duration(seconds: AppConfig.apiTimeoutSeconds));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['recommendation'] != null) {
          return data['recommendation'] as Map<String, dynamic>;
        }
        throw ApiException('Server returned success=false', response.statusCode);
      }

      throw ApiException(
        _errorMessageForStatus(response.statusCode),
        response.statusCode,
      );
    } on TimeoutException {
      throw ApiException('Request timed out. The server may be starting up.', 408);
    } on http.ClientException catch (e) {
      throw ApiException('Network error: ${e.message}', 0);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Connection failed. Check your network.', 0);
    }
  }

  /// Check backend health
  Future<Map<String, dynamic>> healthCheck() async {
    final url = Uri.parse(AppConfig.healthUrl);
    try {
      final response = await _client
          .get(url)
          .timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      throw ApiException('Health check failed', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Backend unreachable', 0);
    }
  }

  String _errorMessageForStatus(int code) {
    switch (code) {
      case 422:
        return 'Invalid request parameters';
      case 500:
        return 'Server error — please try again';
      case 502:
      case 503:
        return 'Server is starting up — please wait';
      default:
        return 'Unexpected error (HTTP $code)';
    }
  }
}

/// Custom exception for API errors with HTTP status code context.
class ApiException implements Exception {
  final String message;
  final int statusCode;

  ApiException(this.message, this.statusCode);

  @override
  String toString() => 'ApiException($statusCode): $message';
}
