/// Brings back the session stored on this device.
library;

import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

/// Answers the stored session, renewing it when it is spent.
///
/// The rule lives here rather than in a provider because it is an application rule: an expired
/// token is not a session, and a session close to expiry is renewed before anybody uses it.
class RestoreSession {
  const RestoreSession(this._repository, this._now);

  final AuthRepository _repository;
  final DateTime Function() _now;

  /// The usable session, or `null` when there is none.
  Future<AuthSession?> call() async {
    final AuthSession? stored = await _repository.restore();

    if (stored == null) {
      return null;
    }

    if (!stored.shouldRenewAt(_now())) {
      return stored;
    }

    return _repository.renew(stored);
  }
}
