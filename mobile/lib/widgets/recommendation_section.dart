/// VenueFlow AI — Recommendation Section UI
/// Production-ready recommendation cards with:
/// - AnimatedSwitcher for smooth fade transitions
/// - Shimmer loading states
/// - Proper scroll handling (no overflow)
/// - Human-readable ETA formatting
/// - Glow effects and interactive elements

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';
import 'recommendation_provider.dart';

class RecommendationSection extends StatelessWidget {
  const RecommendationSection({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => RecommendationProvider()..setIntent('restroom'),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          IntentSelectors(),
          SizedBox(height: 16),
          RecommendationCardWrapper(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Intent Selection Row (Restroom / Food / Exit / Seat)
// ─────────────────────────────────────────────
class IntentSelectors extends StatelessWidget {
  const IntentSelectors({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RecommendationProvider>();
    final intents = [
      {'id': 'restroom', 'icon': Icons.wc_rounded, 'label': 'RESTROOM', 'color': const Color(0xFF3B82F6)},
      {'id': 'food', 'icon': Icons.fastfood_rounded, 'label': 'FOOD', 'color': const Color(0xFFF59E0B)},
      {'id': 'exit', 'icon': Icons.exit_to_app_rounded, 'label': 'EXIT', 'color': const Color(0xFF10B981)},
      {'id': 'seat', 'icon': Icons.event_seat_rounded, 'label': 'MY SEAT', 'color': const Color(0xFF8B5CF6)},
    ];

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: intents.map((intent) {
        final isActive = provider.currentIntent == intent['id'];
        final color = intent['color'] as Color;

        return Expanded(
          child: GestureDetector(
            onTap: () => provider.setIntent(intent['id'] as String),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                gradient: isActive
                    ? LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          color.withOpacity(0.25),
                          color.withOpacity(0.08),
                        ],
                      )
                    : null,
                color: isActive ? null : const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isActive ? color.withOpacity(0.6) : Colors.white10,
                  width: isActive ? 1.5 : 1.0,
                ),
                boxShadow: isActive
                    ? [
                        BoxShadow(
                          color: color.withOpacity(0.25),
                          blurRadius: 12,
                          spreadRadius: -2,
                        )
                      ]
                    : [],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedScale(
                    scale: isActive ? 1.15 : 1.0,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      intent['icon'] as IconData,
                      size: 26,
                      color: isActive ? color : Colors.white38,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    intent['label'] as String,
                    style: TextStyle(
                      color: isActive ? Colors.white : Colors.white54,
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                      fontSize: 10,
                      letterSpacing: 1.2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ─────────────────────────────────────────────
// Animated Card Wrapper (handles state transitions)
// ─────────────────────────────────────────────
class RecommendationCardWrapper extends StatelessWidget {
  const RecommendationCardWrapper({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RecommendationProvider>();

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 450),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (Widget child, Animation<double> animation) {
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.0, 0.05),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        );
      },
      child: _buildStateCard(provider),
    );
  }

  Widget _buildStateCard(RecommendationProvider provider) {
    switch (provider.state) {
      case RecommendationState.loading:
      case RecommendationState.initial:
        return const ShimmerLoadingCard(key: ValueKey('shimmer_loading'));
      case RecommendationState.error:
        return ErrorCard(
          key: const ValueKey('error_card'),
          message: provider.errorMessage ?? 'An unexpected error occurred',
          onRetry: () => provider.refresh(),
        );
      case RecommendationState.loaded:
        return RecommendationCard(
          key: ValueKey('card_${provider.currentIntent}_${provider.recommendationData?.hashCode}'),
          data: provider.recommendationData!,
        );
    }
  }
}

// ─────────────────────────────────────────────
// Main Recommendation Card — Full UI
// ─────────────────────────────────────────────
class RecommendationCard extends StatelessWidget {
  final Map<String, dynamic> data;

  const RecommendationCard({Key? key, required this.data}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final actionType = (data['action_type'] as String?)?.toUpperCase() ?? 'INFO';
    final confidence = ((data['confidence_score'] as num?)?.toDouble() ?? 0.0) * 100;
    final etaSeconds = (data['eta_seconds'] as num?)?.toInt() ?? 0;
    final waitMinutes = (data['wait_time_at_destination'] as num?)?.toInt() ?? 0;
    final isAccessible = data['accessibility_compliant'] == true;
    final isGeminiEnhanced = data['gemini_enhanced'] == true;
    final crowdPrediction = data['crowd_prediction'] as String? ?? '';
    final sport = data['sport'] as String? ?? 'ipl';

    // Prefer Gemini AI text, fallback to rule-based
    final displayMessage = (isGeminiEnhanced && data['recommendation_ai'] != null)
        ? data['recommendation_ai'] as String
        : (data['recommendation'] as String?) ?? 'Finding nearest options...';

    // Color based on action type
    final accentColor = _getAccentColor(actionType);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF0F1423),
            const Color(0xFF131A2E),
          ],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accentColor.withOpacity(0.15)),
        boxShadow: [
          BoxShadow(
            color: accentColor.withOpacity(0.08),
            blurRadius: 20,
            spreadRadius: -4,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Header: Action Badge + Confidence ──
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [accentColor, accentColor.withOpacity(0.7)],
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      actionType,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  if (isGeminiEnhanced) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF7C3AED).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF7C3AED).withOpacity(0.3)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.auto_awesome, size: 12, color: Color(0xFFA78BFA)),
                          SizedBox(width: 4),
                          Text('AI', style: TextStyle(color: Color(0xFFA78BFA), fontSize: 10, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
              _ConfidenceMeter(confidence: confidence),
            ],
          ),

          const SizedBox(height: 16),

          // ── Recommendation Text ──
          Text(
            displayMessage,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              height: 1.6,
              fontWeight: FontWeight.w400,
            ),
          ),

          const SizedBox(height: 18),

          // ── Stats Row: ETA / Wait / Accessible ──
          Row(
            children: [
              _StatChip(
                icon: Icons.directions_walk_rounded,
                label: 'ETA',
                value: _formatETA(etaSeconds),
                color: const Color(0xFF3B82F6),
              ),
              const SizedBox(width: 8),
              _StatChip(
                icon: Icons.hourglass_bottom_rounded,
                label: 'WAIT',
                value: '$waitMinutes min',
                color: const Color(0xFFF59E0B),
              ),
              const SizedBox(width: 8),
              _StatChip(
                icon: Icons.accessible_rounded,
                label: 'ACCESS',
                value: isAccessible ? 'Yes' : 'No',
                color: isAccessible ? const Color(0xFF10B981) : const Color(0xFFEF4444),
              ),
            ],
          ),

          // ── Crowd Prediction Bar ──
          if (crowdPrediction.isNotEmpty && crowdPrediction != 'normal') ...[
            const SizedBox(height: 14),
            _CrowdPredictionBadge(level: crowdPrediction),
          ],

          // ── Game Context ──
          if (data['game_context'] != null && data['game_context'].toString().isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.04),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withOpacity(0.06)),
              ),
              child: Row(
                children: [
                  Icon(
                    sport == 'ipl' ? Icons.sports_cricket : Icons.sports,
                    size: 18,
                    color: Colors.white38,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      data['game_context'],
                      style: const TextStyle(
                        color: Colors.white60,
                        fontStyle: FontStyle.italic,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          // ── IPL Context ──
          if (data['ipl_context'] != null && data['ipl_context'].toString().isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.lightbulb_outline, size: 14, color: Color(0xFFFBBF24)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    data['ipl_context'],
                    style: const TextStyle(
                      color: Color(0xFFFBBF24),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Color _getAccentColor(String actionType) {
    switch (actionType) {
      case 'RESTROOM':
        return const Color(0xFF3B82F6);
      case 'FOOD':
        return const Color(0xFFF59E0B);
      case 'NAVIGATION':
      case 'EXIT':
        return const Color(0xFF10B981);
      case 'SAFETY':
        return const Color(0xFFEF4444);
      default:
        return const Color(0xFF6366F1);
    }
  }

  /// Format seconds into human-readable ETA like "2m 22s"
  String _formatETA(int totalSeconds) {
    if (totalSeconds <= 0) return '—';
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    if (minutes > 0) {
      return '${minutes}m ${seconds}s';
    }
    return '${seconds}s';
  }
}

// ─────────────────────────────────────────────
// Confidence Meter (animated ring with %)
// ─────────────────────────────────────────────
class _ConfidenceMeter extends StatelessWidget {
  final double confidence;
  const _ConfidenceMeter({required this.confidence});

  @override
  Widget build(BuildContext context) {
    final color = confidence >= 85
        ? const Color(0xFF10B981)
        : confidence >= 60
            ? const Color(0xFFF59E0B)
            : const Color(0xFFEF4444);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'CONFIDENCE',
          style: TextStyle(
            color: Colors.white.withOpacity(0.4),
            fontSize: 9,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          '${confidence.toInt()}%',
          style: TextStyle(
            color: color,
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────
// Stat Chip (ETA / Wait / Access)
// ─────────────────────────────────────────────
class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _StatChip({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.12)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withOpacity(0.4),
                fontSize: 9,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Crowd Prediction Badge
// ─────────────────────────────────────────────
class _CrowdPredictionBadge extends StatelessWidget {
  final String level;
  const _CrowdPredictionBadge({required this.level});

  @override
  Widget build(BuildContext context) {
    final config = _getConfig(level);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: config.color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: config.color.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, size: 16, color: config.color),
          const SizedBox(width: 8),
          Text(
            config.label,
            style: TextStyle(
              color: config.color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  _CrowdConfig _getConfig(String level) {
    switch (level) {
      case 'extreme':
        return _CrowdConfig(Icons.warning_amber_rounded, 'Extreme crowd surge expected', const Color(0xFFEF4444));
      case 'high':
        return _CrowdConfig(Icons.trending_up_rounded, 'High crowd activity', const Color(0xFFF59E0B));
      case 'very_low':
        return _CrowdConfig(Icons.trending_down_rounded, 'Very low foot traffic — queues empty', const Color(0xFF10B981));
      case 'low':
        return _CrowdConfig(Icons.trending_flat_rounded, 'Low crowd levels', const Color(0xFF10B981));
      default:
        return _CrowdConfig(Icons.people_outline_rounded, 'Moderate crowd', const Color(0xFF6B7280));
    }
  }
}

class _CrowdConfig {
  final IconData icon;
  final String label;
  final Color color;
  _CrowdConfig(this.icon, this.label, this.color);
}

// ─────────────────────────────────────────────
// Shimmer Loading Card
// ─────────────────────────────────────────────
class ShimmerLoadingCard extends StatelessWidget {
  const ShimmerLoadingCard({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF151A28),
      highlightColor: const Color(0xFF1E293B),
      period: const Duration(milliseconds: 1500),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(width: 80, height: 28, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14))),
                Container(width: 50, height: 32, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8))),
              ],
            ),
            const SizedBox(height: 20),
            Container(width: double.infinity, height: 14, color: Colors.white),
            const SizedBox(height: 10),
            Container(width: 260, height: 14, color: Colors.white),
            const SizedBox(height: 10),
            Container(width: 180, height: 14, color: Colors.white),
            const SizedBox(height: 24),
            Row(
              children: List.generate(
                3,
                (_) => Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    height: 72,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Error Card with Retry
// ─────────────────────────────────────────────
class ErrorCard extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const ErrorCard({Key? key, required this.message, this.onRetry}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF2D1515),
            const Color(0xFF1A0F0F),
          ],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off_rounded, color: Color(0xFFEF4444), size: 42),
          const SizedBox(height: 14),
          const Text(
            'Recommendation Unavailable',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 13, height: 1.5),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 18),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Retry'),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: BorderSide(color: const Color(0xFFEF4444).withOpacity(0.3)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
