/// Renews the credential.
library;

import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

/// Exchanges the refresh token for a new pair.
class RenewSession {
  const RenewSession(this._repository);

  final AuthRepository _repository;

  /// @throws [Failure] when the refresh token is gone, reused or rejected
  Future<AuthSession> call(AuthSession current) => _repository.renew(current);
}
