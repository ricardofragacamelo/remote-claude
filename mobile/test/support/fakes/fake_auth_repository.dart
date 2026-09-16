/// An auth repository a test scripts.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

/// Answers what the test set, and records what it was asked to do.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.stored, this.produced});

  /// What [restore] answers.
  AuthSession? stored;

  /// What [signIn] and [renew] answer.
  AuthSession? produced;

  /// When set, [signIn] and [renew] throw it instead.
  Failure? failure;

  /// How many times each call was made.
  int signIns = 0;
  int renewals = 0;
  int signOuts = 0;

  @override
  Future<AuthSession> signIn() async {
    signIns += 1;
    return _answer();
  }

  @override
  Future<AuthSession?> restore() async => stored;

  @override
  Future<AuthSession> renew(AuthSession current) async {
    renewals += 1;
    return _answer();
  }

  @override
  Future<void> signOut(AuthSession? current) async => signOuts += 1;

  AuthSession _answer() {
    final Failure? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
    return produced!;
  }
}
