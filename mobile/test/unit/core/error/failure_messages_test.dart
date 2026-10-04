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
      'session.error.claudeUnavailable',
      'workspace.error.forbidden',
      // Plan 10, F7: the folder screens' refusals.
      'workspace.error.notFound',
      'workspace.error.notADirectory',
      'transcript.error.notFound',
      'transcript.error.claudeUnavailable',
      'transcript.error.claudeTimeout',
      'transcript.error.cursorStale',
      'session.error.claudeTimeout',
      'session.error.locked',
      'session.error.rewindTargetUnknown',
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

  // S-17, S-23 and S-26 of plan 04 — the refusals of reading and resuming, said in words and
  // with what they are about.
  test('the refusals of the history and of a resume interpolate what they are about', () {
    const Map<String, (String, Map<String, String>)> cases =
        <String, (String, Map<String, String>)>{
          'session.error.limitReached': ('4', <String, String>{'limit': '4'}),
          'workspace.error.notAllowed': ('/etc', <String, String>{'path': '/etc'}),
          'workspace.error.directoryUnreadable': ('/w/x', <String, String>{'path': '/w/x'}),
          'workspace.error.openFoldersLimitReached': ('8', <String, String>{'limit': '8'}),
          'transcript.error.invalidSessionId': ('abc', <String, String>{'sessionId': 'abc'}),
          // Plan 04, F3 and F4: a command the installation lacks (S-34), and an undo that could
          // not put every file back (S-44).
          'session.error.unknownCommand': ('/heapdumb', <String, String>{'command': '/heapdumb'}),
          'session.error.rewindIncomplete': ('2', <String, String>{'failed': '2'}),
        };

    cases.forEach((String key, (String, Map<String, String>) expected) {
      for (final AppLocalizations l10n in <AppLocalizations>[en, pt]) {
        final String message = translateFailure(
          l10n,
          ServerFailure(code: 'X', messageKey: key, traceId: 't', params: expected.$2),
        );

        expect(message, contains(expected.$1), reason: key);
        expect(message, isNot(l10n.commonErrorUnexpected), reason: key);
      }
    });
  });

  test('a history refusal has its own sentence, not the generic one', () {
    expect(
      translateFailure(
        en,
        const ServerFailure(
          code: 'CLAUDE_UNAVAILABLE',
          messageKey: 'transcript.error.claudeUnavailable',
          traceId: 't',
        ),
      ),
      en.transcriptErrorClaudeUnavailable,
    );
  });

  test('a param the server forgot does not crash the screen', () {
    for (final String key in <String>[
      'session.error.invalidSessionId',
      'session.error.limitReached',
      'workspace.error.notAllowed',
      'transcript.error.invalidSessionId',
      'session.error.unknownCommand',
      'session.error.rewindIncomplete',
    ]) {
      expect(
        translateFailure(en, ServerFailure(code: 'X', messageKey: key, traceId: 't')),
        isNotEmpty,
        reason: key,
      );
    }
  });

  // S-43 of plan 04 — the refusal of an undo during a turn says what is going on.
  test('a locked session has its own sentence in both languages', () {
    const Failure locked = ServerFailure(
      code: 'SESSION_LOCKED',
      messageKey: 'session.error.locked',
      traceId: 't',
    );

    expect(translateFailure(en, locked), en.sessionErrorLocked);
    expect(translateFailure(pt, locked), pt.sessionErrorLocked);
    expect(pt.sessionErrorLocked, isNot(en.sessionErrorLocked));
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
