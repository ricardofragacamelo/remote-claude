import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';

AuthSession session({DateTime? issuedAt, DateTime? expiresAt, String? refreshToken = 'refresh'}) =>
    AuthSession(
      accessToken: 'token',
      refreshToken: refreshToken,
      userId: 'user-1',
      issuedAt: issuedAt ?? DateTime.utc(2026, 9, 14, 12),
      expiresAt: expiresAt ?? DateTime.utc(2026, 9, 14, 13),
    );

void main() {
  group('isExpiredAt', () {
    test('a token before its expiry is alive', () {
      expect(session().isExpiredAt(DateTime.utc(2026, 9, 14, 12, 59)), isFalse);
    });

    test('a token exactly at its expiry is already gone', () {
      expect(session().isExpiredAt(DateTime.utc(2026, 9, 14, 13)), isTrue);
    });

    test('a token past its expiry is gone', () {
      expect(session().isExpiredAt(DateTime.utc(2026, 9, 14, 14)), isTrue);
    });
  });

  group('shouldRenewAt', () {
    test('nothing to do in the first four fifths of the life', () {
      expect(session().shouldRenewAt(DateTime.utc(2026, 9, 14, 12, 47)), isFalse);
    });

    test('renews exactly at the threshold', () {
      expect(session().shouldRenewAt(DateTime.utc(2026, 9, 14, 12, 48)), isTrue);
    });

    test('renews after the threshold', () {
      expect(session().shouldRenewAt(DateTime.utc(2026, 9, 14, 12, 59)), isTrue);
    });

    test('a token with no life at all is renewed immediately', () {
      final AuthSession spent = session(
        issuedAt: DateTime.utc(2026, 9, 14, 13),
        expiresAt: DateTime.utc(2026, 9, 14, 13),
      );

      expect(spent.shouldRenewAt(DateTime.utc(2026, 9, 14, 12)), isTrue);
    });
  });

  group('renewalDelayAt', () {
    test('waits until four fifths of the life', () {
      expect(
        session().renewalDelayAt(DateTime.utc(2026, 9, 14, 12, 40)),
        const Duration(minutes: 8),
      );
    });

    test('is due now exactly at the threshold', () {
      expect(session().renewalDelayAt(DateTime.utc(2026, 9, 14, 12, 48)), Duration.zero);
    });

    test('never answers a negative delay past the threshold, or past the expiry', () {
      expect(session().renewalDelayAt(DateTime.utc(2026, 9, 14, 12, 59)), Duration.zero);
      expect(session().renewalDelayAt(DateTime.utc(2026, 9, 14, 14)), Duration.zero);
    });
  });

  test('two sessions with the same fields are equal', () {
    expect(session(), session());
  });

  test('the renewal threshold is four fifths of the life', () {
    expect(renewalThreshold, 0.8);
  });
}
