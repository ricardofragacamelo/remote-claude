import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/renew_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/restore_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_in.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_out.dart';

import '../../../../../support/fakes/fake_auth_repository.dart';

AuthSession session({DateTime? issuedAt, DateTime? expiresAt}) => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'user-1',
  issuedAt: issuedAt ?? DateTime.utc(2026, 9, 14, 12),
  expiresAt: expiresAt ?? DateTime.utc(2026, 9, 14, 13),
);

void main() {
  late FakeAuthRepository repository;

  setUp(() => repository = FakeAuthRepository());

  test('a use case is built with new, without any container', () {
    expect(SignIn(repository), isA<SignIn>());
  });

  group('SignIn', () {
    test('answers the session the provider produced', () async {
      repository.produced = session();

      expect(await SignIn(repository)(), session());
      expect(repository.signIns, 1);
    });

    test('lets the failure through — the screen is where it is rendered', () async {
      repository.failure = const AuthenticationFailure(traceId: 't');

      await expectLater(SignIn(repository)(), throwsA(isA<AuthenticationFailure>()));
    });
  });

  group('RestoreSession', () {
    test('answers nothing when nobody is signed in on this device', () async {
      expect(await RestoreSession(repository, DateTime.now)(), isNull);
    });

    test('answers the stored session while it is still fresh', () async {
      repository.stored = session();

      final AuthSession? restored = await RestoreSession(
        repository,
        () => DateTime.utc(2026, 9, 14, 12, 10),
      )();

      expect(restored, session());
      expect(repository.renewals, 0);
    });

    test('renews a session past the threshold before anybody uses it', () async {
      repository.stored = session();
      repository.produced = session(
        issuedAt: DateTime.utc(2026, 9, 14, 12, 55),
        expiresAt: DateTime.utc(2026, 9, 14, 13, 55),
      );

      final AuthSession? restored = await RestoreSession(
        repository,
        () => DateTime.utc(2026, 9, 14, 12, 55),
      )();

      expect(repository.renewals, 1);
      expect(restored!.expiresAt, DateTime.utc(2026, 9, 14, 13, 55));
    });

    test('a refresh that fails reaches the caller — no silent recovery', () async {
      repository.stored = session();
      repository.failure = const AuthenticationFailure(traceId: 't');

      await expectLater(
        RestoreSession(repository, () => DateTime.utc(2026, 9, 14, 13))(),
        throwsA(isA<AuthenticationFailure>()),
      );
    });
  });

  group('RenewSession', () {
    test('asks the repository for a new pair', () async {
      repository.produced = session();

      expect(await RenewSession(repository)(session()), session());
      expect(repository.renewals, 1);
    });
  });

  group('SignOut', () {
    test('clears whatever there was', () async {
      await SignOut(repository)(session());

      expect(repository.signOuts, 1);
    });

    test('works with no session at all', () async {
      await SignOut(repository)(null);

      expect(repository.signOuts, 1);
    });
  });
}
