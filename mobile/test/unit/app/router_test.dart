import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/router.dart';
import 'package:remote_claude/features/auth/auth.dart';

AuthSession session() => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'user-1',
  issuedAt: DateTime.utc(2026, 9, 14, 12),
  expiresAt: DateTime.utc(2026, 9, 14, 13),
);

void main() {
  group('redirectFor', () {
    test('stays put while the session is still being restored', () {
      expect(
        redirectFor(session: const AsyncValue<AuthSession?>.loading(), location: sessionRoute),
        isNull,
      );
    });

    test('sends an unauthenticated visitor to sign in', () {
      expect(
        redirectFor(session: const AsyncValue<AuthSession?>.data(null), location: sessionRoute),
        signInRoute,
      );
    });

    test('leaves an unauthenticated visitor on the sign-in screen', () {
      expect(
        redirectFor(session: const AsyncValue<AuthSession?>.data(null), location: signInRoute),
        isNull,
      );
    });

    test('takes a signed-in user off the sign-in screen', () {
      expect(
        redirectFor(session: AsyncValue<AuthSession?>.data(session()), location: signInRoute),
        sessionRoute,
      );
    });

    test('leaves a signed-in user where they are', () {
      expect(
        redirectFor(session: AsyncValue<AuthSession?>.data(session()), location: sessionRoute),
        isNull,
      );
    });

    test('a failed restore is treated as not signed in', () {
      expect(
        redirectFor(
          session: AsyncValue<AuthSession?>.error(StateError('x'), StackTrace.empty),
          location: sessionRoute,
        ),
        signInRoute,
      );
    });
  });
}
