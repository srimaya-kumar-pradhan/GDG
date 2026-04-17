/// VenueFlow AI — Home Screen
/// Main screen with proper scroll handling, venue header, and recommendation section.
/// Uses SingleChildScrollView to prevent overflow and ensure smooth scrolling.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/recommendation_section.dart';
import '../config/app_config.dart';
import '../services/api_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  late AnimationController _pulseController;
  bool _backendOnline = false;
  bool _checkingHealth = true;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);
    _checkBackendHealth();
  }

  Future<void> _checkBackendHealth() async {
    try {
      await ApiService.instance.healthCheck();
      if (mounted) setState(() { _backendOnline = true; _checkingHealth = false; });
    } catch (_) {
      if (mounted) setState(() { _backendOnline = false; _checkingHealth = false; });
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Set system UI overlay style for immersive dark theme
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF080C14),
    ));

    return Scaffold(
      backgroundColor: const Color(0xFF080C14),
      body: SafeArea(
        // ── SCROLL FIX: SingleChildScrollView wraps entire content ──
        // This prevents overflow errors and ensures smooth scrolling
        // on all device sizes, including low-end phones.
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(),
              const SizedBox(height: 8),
              _buildBackendStatus(),
              const SizedBox(height: 20),
              _buildVenueInfoCard(),
              const SizedBox(height: 24),
              _buildSectionTitle('AI Recommendation'),
              const SizedBox(height: 12),
              const RecommendationSection(),
              const SizedBox(height: 24),
              _buildMatchContextCard(),
              const SizedBox(height: 24),
              _buildQuickActions(),
              // Bottom padding for safe scrolling
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  // ── App Header ──
  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ShaderMask(
              shaderCallback: (bounds) => const LinearGradient(
                colors: [Color(0xFF60A5FA), Color(0xFFA78BFA)],
              ).createShader(bounds),
              child: const Text(
                'VenueFlow AI',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Smart Stadium Navigation',
              style: TextStyle(
                color: Colors.white.withOpacity(0.4),
                fontSize: 13,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        // Pulse ring indicator
        AnimatedBuilder(
          animation: _pulseController,
          builder: (context, child) {
            final scale = 1.0 + _pulseController.value * 0.15;
            return Transform.scale(
              scale: scale,
              child: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [
                      const Color(0xFF3B82F6).withOpacity(0.3),
                      const Color(0xFF8B5CF6).withOpacity(0.3),
                    ],
                  ),
                  border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.4), width: 1.5),
                ),
                child: const Icon(Icons.stadium_rounded, color: Colors.white70, size: 20),
              ),
            );
          },
        ),
      ],
    );
  }

  // ── Backend Status Indicator ──
  Widget _buildBackendStatus() {
    final Color dotColor;
    final String statusText;

    if (_checkingHealth) {
      dotColor = const Color(0xFFF59E0B);
      statusText = 'Connecting to backend...';
    } else if (_backendOnline) {
      dotColor = const Color(0xFF10B981);
      statusText = AppConfig.isProduction ? 'Connected to cloud' : 'Connected (local)';
    } else {
      dotColor = const Color(0xFFEF4444);
      statusText = 'Backend offline — check server';
    }

    return Row(
      children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: dotColor,
            boxShadow: [BoxShadow(color: dotColor.withOpacity(0.5), blurRadius: 6)],
          ),
        ),
        const SizedBox(width: 8),
        Text(
          statusText,
          style: TextStyle(color: Colors.white.withOpacity(0.35), fontSize: 12),
        ),
      ],
    );
  }

  // ── Venue Info Card ──
  Widget _buildVenueInfoCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF1E293B).withOpacity(0.6),
            const Color(0xFF0F172A).withOpacity(0.8),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF3B82F6), Color(0xFF8B5CF6)],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.location_on_rounded, color: Colors.white, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Section 202 — Lower Level',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'VenueFlow Demo Stadium • IPL T20',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.4),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'LIVE',
              style: TextStyle(
                color: Color(0xFF10B981),
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Section Title ──
  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: TextStyle(
        color: Colors.white.withOpacity(0.7),
        fontSize: 13,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.2,
      ),
    );
  }

  // ── Match Context Card ──
  Widget _buildMatchContextCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.sports_cricket, color: Color(0xFFF59E0B), size: 18),
              const SizedBox(width: 8),
              Text(
                'MATCH CONTEXT',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.5),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildMatchStat('Sport', 'IPL T20'),
              _buildMatchStat('Quarter', 'Q2'),
              _buildMatchStat('Time Left', '4:00'),
              _buildMatchStat('Crowd', '78%'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMatchStat(String label, String value) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.35),
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  // ── Quick Actions ──
  Widget _buildQuickActions() {
    return Row(
      children: [
        _buildQuickAction(Icons.emergency_rounded, 'SOS', const Color(0xFFEF4444)),
        const SizedBox(width: 10),
        _buildQuickAction(Icons.map_rounded, 'Map', const Color(0xFF3B82F6)),
        const SizedBox(width: 10),
        _buildQuickAction(Icons.info_outline_rounded, 'Info', const Color(0xFF6B7280)),
      ],
    );
  }

  Widget _buildQuickAction(IconData icon, String label, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.15)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
