/// Signs in.
library;

import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

/// Opens the provider and answers the session it produced.
class SignIn {
  const SignIn(this._repository);

  final AuthRepository _repository;

  /// @throws [Failure] when the sign-in did not complete
  Future<AuthSession> call() => _repository.signIn();
}
