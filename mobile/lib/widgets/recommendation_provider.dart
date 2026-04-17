/// VenueFlow AI — Recommendation State Provider
/// Manages recommendation lifecycle: loading → fetched → cached.
/// Uses debounced API calls with 300ms delay to avoid request storms.

import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../config/app_config.dart';

enum RecommendationState { initial, loading, loaded, error }

class RecommendationProvider with ChangeNotifier {
  RecommendationState _state = RecommendationState.initial;
  String _currentIntent = 'restroom';
  Map<String, dynamic>? _recommendationData;
  String? _errorMessage;

  // Cache previous results for instant tab switching
  final Map<String, Map<String, dynamic>> _cache = {};

  Timer? _debounceTimer;

  // ── Getters ──
  RecommendationState get state => _state;
  String get currentIntent => _currentIntent;
  Map<String, dynamic>? get recommendationData => _recommendationData;
  String? get errorMessage => _errorMessage;

  /// Switch intent and fetch new recommendation (debounced).
  void setIntent(String intent) {
    if (_currentIntent == intent && _state != RecommendationState.initial) return;

    _currentIntent = intent;

    // Instant result from cache if available (feels snappy)
    if (_cache.containsKey(intent)) {
      _recommendationData = _cache[intent];
      _state = RecommendationState.loaded;
      notifyListeners();

      // Background refresh to keep data fresh (silent update)
      _backgroundRefresh(intent);
      return;
    }

    _state = RecommendationState.loading;
    notifyListeners();

    // Debounce API calls (300ms) to avoid spamming the backend
    _debounceTimer?.cancel();
    _debounceTimer = Timer(
      Duration(milliseconds: AppConfig.debounceMs),
      () => _fetchRecommendation(intent),
    );
  }

  /// Force refresh current intent (bypass cache)
  void refresh() {
    _cache.remove(_currentIntent);
    _state = RecommendationState.loading;
    notifyListeners();
    _fetchRecommendation(_currentIntent);
  }

  Future<void> _fetchRecommendation(String intent) async {
    try {
      final data = await ApiService.instance.fetchRecommendation(
        intent: intent,
        latitude: AppConfig.demoLatitude,
        longitude: AppConfig.demoLongitude,
        seatSection: AppConfig.demoSeatSection,
        sport: AppConfig.demoSport,
        language: AppConfig.demoLanguage,
      );

      // Only update if this intent is still current (handles race conditions)
      if (_currentIntent != intent) return;

      _recommendationData = data;
      _cache[intent] = data;
      _state = RecommendationState.loaded;
      _errorMessage = null;
    } on ApiException catch (e) {
      if (_currentIntent != intent) return;
      _setError(e.message);
    } catch (e) {
      if (_currentIntent != intent) return;
      _setError('Connection failed. Please check your network.');
    }
    notifyListeners();
  }

  /// Silent background refresh — no loading state shown
  Future<void> _backgroundRefresh(String intent) async {
    try {
      final data = await ApiService.instance.fetchRecommendation(
        intent: intent,
        latitude: AppConfig.demoLatitude,
        longitude: AppConfig.demoLongitude,
        seatSection: AppConfig.demoSeatSection,
        sport: AppConfig.demoSport,
        language: AppConfig.demoLanguage,
      );

      if (_currentIntent == intent) {
        _recommendationData = data;
        _cache[intent] = data;
        notifyListeners();
      }
    } catch (_) {
      // Silent failure — cached data is still valid
    }
  }

  void _setError(String message) {
    _state = RecommendationState.error;
    _errorMessage = message;
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}
