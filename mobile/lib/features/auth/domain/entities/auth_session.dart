/// The signed-in session, as the app's own rule sees it.
///
/// Pure Dart: no `flutter/*`, no `dio`, no OIDC package. That is what makes every rule below
/// testable without a widget or a network. See docs/architecture/mobile/01-architecture.md.
library;

import 'package:equatable/equatable.dart';

/// Fraction of a token's life after which it is renewed.
///
/// Proactive, not reactive: renewing only after a rejection turns every expiry into a visible
/// failure, and on a phone that lands on top of a permission that is about to expire.
const double renewalThreshold = 0.8;

/// A session with the provider.
class AuthSession extends Equatable {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.issuedAt,
    required this.expiresAt,
  });

  /// The credential sent to the backend. Never logged, not even truncated.
  final String accessToken;

  /// Used once to get the next pair, then replaced. `null` when the provider issued none.
  final String? refreshToken;

  /// `sub` of the token. Never the e-mail.
  final String userId;

  /// When the provider issued this token.
  final DateTime issuedAt;

  /// When it stops being accepted.
  final DateTime expiresAt;

  /// Whether the token is already past its expiry at [now].
  ///
  /// Time arrives as a parameter rather than being read inside: a rule that reads the clock is a
  /// rule that cannot be tested.
  bool isExpiredAt(DateTime now) => !now.isBefore(expiresAt);

  /// Whether renewal is due at [now] — at [renewalThreshold] of the token's life.
  bool shouldRenewAt(DateTime now) {
    final int lifetimeMs = expiresAt.difference(issuedAt).inMilliseconds;

    if (lifetimeMs <= 0) {
      return true;
    }

    final int elapsedMs = now.difference(issuedAt).inMilliseconds;
    return elapsedMs >= lifetimeMs * renewalThreshold;
  }

  @override
  List<Object?> get props => <Object?>[accessToken, refreshToken, userId, issuedAt, expiresAt];
}
