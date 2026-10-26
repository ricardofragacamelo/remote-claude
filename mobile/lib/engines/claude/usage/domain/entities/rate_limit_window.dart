/// One rate-limit window of the Claude account, as last observed (plan 16, D-09).
///
/// Pure Dart: no `flutter/*`, no `dio`. See docs/architecture/mobile/01-architecture.md.
library;

import 'package:equatable/equatable.dart';

/// The three outcomes a window can be in, read off the server's own words — never real-time.
enum RateLimitStatus { allowed, allowedWarning, rejected }

/// One window: its own name, what it reports, and when.
class RateLimitWindow extends Equatable {
  const RateLimitWindow({
    required this.kind,
    required this.status,
    required this.utilizationPercent,
    required this.resetsAt,
    required this.observedAt,
    this.displayName,
  });

  /// The window's own name — `five_hour`, `seven_day`, `seven_day_opus`… — forwarded exactly as the
  /// backend names it, so a window a future release adds shows up before this app knows its label.
  final String kind;

  final RateLimitStatus status;

  /// 0–100, or `null` when nothing has reported a reading for this window yet.
  final int? utilizationPercent;

  /// When the window resets, or `null` when it was not said.
  final DateTime? resetsAt;

  /// When the backend last observed this window.
  final DateTime observedAt;

  /// The server's own label for a per-model window (`"Fable"`, say) — `null` for every other
  /// window, which this app already has a translated label for by [kind].
  final String? displayName;

  @override
  List<Object?> get props => <Object?>[
    kind,
    status,
    utilizationPercent,
    resetsAt,
    observedAt,
    displayName,
  ];
}
