/// Ends the session on this device.
library;

import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

/// Clears the credential and ends the session at the provider.
class SignOut {
  const SignOut(this._repository);

  final AuthRepository _repository;

  Future<void> call(AuthSession? current) => _repository.signOut(current);
}
