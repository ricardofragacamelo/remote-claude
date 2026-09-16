/// What the auth use cases need from the outside world.
///
/// An interface in `domain/`, implemented in `data/`. The direction is the whole point: the use
/// case depends on this, not on the OIDC package or on the secure store.
library;

import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';

/// The session's storage and its provider, behind one door.
abstract interface class AuthRepository {
  /// Opens the provider in the system's external tab and completes the exchange.
  ///
  /// @throws [Failure] when the user cancels, the provider refuses, or the reply fails validation
  Future<AuthSession> signIn();

  /// The stored session, or `null` when nobody is signed in on this device.
  Future<AuthSession?> restore();

  /// Exchanges the refresh token for a new pair.
  ///
  /// @throws [Failure] when the refresh token is gone, reused or rejected
  Future<AuthSession> renew(AuthSession current);

  /// Forgets the credential and ends the session at the provider.
  Future<void> signOut(AuthSession? current);
}
