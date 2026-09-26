import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

void main() {
  late AppLocalizations en;
  late AppLocalizations pt;

  setUpAll(() async {
    en = await AppLocalizations.delegate.load(const Locale('en'));
    pt = await AppLocalizations.delegate.load(const Locale('pt'));
  });

  test('every key the backend can send has a sentence', () {
    const List<String> keys = <String>[
      'common.error.offline',
      'common.error.invalidInput',
      'common.error.notFound',
      'common.error.forbidden',
      'common.error.payloadTooLarge',
      'common.error.rateLimited',
      'auth.error.unauthenticated',
      'auth.error.tokenExpired',
      'auth.error.invalidState',
      'connection.error.unsupportedVersion',
      'session.error.notFound',
      'auth.error.deviceNotRegistered',
      'auth.error.deviceRevoked',
      'auth.error.deviceNotFound',
      'auth.error.deviceApprovalForbidden',
    ];

    for (final String key in keys) {
      final String message = translateFailure(
        en,
        ServerFailure(code: 'X', messageKey: key, traceId: 't'),
      );

      expect(message, isNotEmpty, reason: key);
      expect(message, isNot(contains(key)), reason: key);
    }
  });

  // S-21 of plan 03 — a failed revocation is said in words, not as a code.
  test('a rule that is gone by the time it is revoked has its own sentence', () {
    expect(
      translateFailure(
        en,
        const ServerFailure(
          code: 'PERMISSION_RULE_NOT_FOUND',
          messageKey: 'permission.error.ruleNotFound',
          traceId: 't',
        ),
      ),
      en.permissionErrorRuleNotFound,
    );
  });

  test('interpolates the params the key declares', () {
    final String message = translateFailure(
      en,
      const ServerFailure(
        code: 'INVALID_SESSION_ID',
        messageKey: 'session.error.invalidSessionId',
        traceId: 't',
        params: <String, String>{'sessionId': 'abc'},
      ),
    );

    expect(message, contains('abc'));
  });

  test('a param the server forgot does not crash the screen', () {
    expect(
      translateFailure(
        en,
        const ServerFailure(
          code: 'INVALID_SESSION_ID',
          messageKey: 'session.error.invalidSessionId',
          traceId: 't',
        ),
      ),
      isNotEmpty,
    );
  });

  test('a key nobody mapped falls back rather than showing the key', () {
    final String message = translateFailure(
      en,
      const ServerFailure(code: 'FUTURE', messageKey: 'future.error.unknown', traceId: 't'),
    );

    expect(message, en.commonErrorUnexpected);
  });

  test('the other language answers its own sentence', () {
    expect(
      translateFailure(pt, const NetworkFailure(traceId: 't')),
      isNot(translateFailure(en, const NetworkFailure(traceId: 't'))),
    );
  });
}
