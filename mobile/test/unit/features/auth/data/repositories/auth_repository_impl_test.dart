import 'dart:convert';

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';

import '../../../../../support/fakes/fake_oidc_data_source.dart';
import '../../../../../support/fakes/recording_writer.dart';

String idToken(String subject) {
  String segment(Map<String, Object?> value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');

  return '${segment(<String, Object?>{'alg': 'RS256'})}'
      '.${segment(<String, Object?>{'sub': subject})}.signature';
}

TokenResponse tokens({
  String? accessToken = 'access',
  String? refreshToken = 'refresh',
  String? subject = 'user-1',
  DateTime? expiresAt,
}) => TokenResponse(
  accessToken,
  refreshToken,
  expiresAt,
  subject == null ? null : idToken(subject),
  'Bearer',
  <String>['openid'],
  null,
);

void main() {
  late FakeOidcDataSource oidc;
  late InMemoryCredentialStore store;
  late RecordingWriter recorder;
  late AppLogger logger;
  late AuthRepositoryImpl repository;

  final DateTime now = DateTime.utc(2026, 9, 14, 12);

  setUp(() {
    oidc = FakeOidcDataSource();
    store = InMemoryCredentialStore();
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
    repository = AuthRepositoryImpl(
      oidc: oidc,
      store: store,
      logger: logger,
      traceIds: TraceIds(),
      now: () => now,
    );
  });

  tearDown(() => logger.dispose());

  group('signIn', () {
    test('answers the session and stores the credential', () async {
      oidc.response = tokens(expiresAt: DateTime.utc(2026, 9, 14, 13));

      final AuthSession session = await repository.signIn();

      expect(session.userId, 'user-1');
      expect(session.accessToken, 'access');
      expect(session.expiresAt, DateTime.utc(2026, 9, 14, 13));
      expect(store.values[CredentialKeys.accessToken], 'access');
      expect(store.values[CredentialKeys.refreshToken], 'refresh');
      expect(store.values[CredentialKeys.userId], 'user-1');
    });

    test('logs the subject and the expiry, never the token', () async {
      oidc.response = tokens(expiresAt: DateTime.utc(2026, 9, 14, 13));

      await repository.signIn();

      final Map<String, Object?> line = recorder.withOp(LogOp.authToken).single;
      expect(line['userId'], 'user-1');
      expect(line['exp'], isA<String>());
      expect(recorder.lines.join(), isNot(contains('access')));
    });

    test('assumes a short life when the provider did not say', () async {
      oidc.response = tokens();

      final AuthSession session = await repository.signIn();

      expect(session.expiresAt, now.add(assumedTokenLifetime));
    });

    test('a cancelled sign-in is an authentication failure, not a crash', () async {
      oidc.failure = FlutterAppAuthUserCancelledException(
        code: 'cancelled',
        platformErrorDetails: FlutterAppAuthPlatformErrorDetails(),
      );

      await expectLater(repository.signIn(), throwsA(isA<AuthenticationFailure>()));
      expect(store.values, isEmpty);
    });

    test('a provider that refused is an authentication failure, and is logged', () async {
      oidc.failure = FlutterAppAuthPlatformException(
        code: 'invalid_grant',
        platformErrorDetails: FlutterAppAuthPlatformErrorDetails(),
      );

      await expectLater(repository.signIn(), throwsA(isA<AuthenticationFailure>()));
      expect(recorder.withOp(LogOp.authToken).single['err'], 'invalid_grant');
    });

    test('a response with no access token is refused rather than half stored', () async {
      oidc.response = tokens(accessToken: null);

      await expectLater(repository.signIn(), throwsA(isA<AuthenticationFailure>()));
      expect(store.values, isEmpty);
    });

    test('a response with no subject is refused', () async {
      oidc.response = tokens(subject: null);

      await expectLater(repository.signIn(), throwsA(isA<AuthenticationFailure>()));
    });

    test('a provider that issued no refresh token stores none', () async {
      oidc.response = tokens(refreshToken: null);

      await repository.signIn();

      expect(store.values.containsKey(CredentialKeys.refreshToken), isFalse);
    });
  });

  group('restore', () {
    test('answers nothing on a device nobody signed in on', () async {
      expect(await repository.restore(), isNull);
    });

    test('answers what was stored', () async {
      oidc.response = tokens(expiresAt: DateTime.utc(2026, 9, 14, 13));
      await repository.signIn();

      final AuthSession? restored = await repository.restore();

      expect(restored!.userId, 'user-1');
      expect(restored.accessToken, 'access');
      expect(restored.expiresAt, DateTime.utc(2026, 9, 14, 13));
    });

    test('answers nothing when the store holds only half a session', () async {
      store.values[CredentialKeys.accessToken] = 'access';

      expect(await repository.restore(), isNull);
    });

    test('answers nothing when a stored instant is not one', () async {
      store.values
        ..[CredentialKeys.accessToken] = 'access'
        ..[CredentialKeys.userId] = 'user-1'
        ..[CredentialKeys.issuedAt] = 'whenever'
        ..[CredentialKeys.expiresAt] = 'whenever';

      expect(await repository.restore(), isNull);
    });
  });

  group('renew', () {
    test('exchanges the refresh token for a new pair', () async {
      oidc.response = tokens(accessToken: 'fresh', expiresAt: DateTime.utc(2026, 9, 14, 14));

      final AuthSession renewed = await repository.renew(
        AuthSession(
          accessToken: 'old',
          refreshToken: 'refresh',
          userId: 'user-1',
          issuedAt: now,
          expiresAt: now,
        ),
      );

      expect(oidc.lastRefreshToken, 'refresh');
      expect(renewed.accessToken, 'fresh');
    });

    test('keeps the user of the session when the provider sent no id token', () async {
      oidc.response = tokens(subject: null, accessToken: 'fresh');

      final AuthSession renewed = await repository.renew(
        AuthSession(
          accessToken: 'old',
          refreshToken: 'refresh',
          userId: 'user-1',
          issuedAt: now,
          expiresAt: now,
        ),
      );

      expect(renewed.userId, 'user-1');
    });

    test('a session with no refresh token cannot be renewed', () async {
      await expectLater(
        repository.renew(
          AuthSession(
            accessToken: 'old',
            refreshToken: null,
            userId: 'user-1',
            issuedAt: now,
            expiresAt: now,
          ),
        ),
        throwsA(isA<AuthenticationFailure>()),
      );

      expect(oidc.refreshes, 0);
    });
  });

  group('signOut', () {
    test('clears the credential before telling the provider', () async {
      oidc.response = tokens();
      await repository.signIn();

      await repository.signOut(null);

      expect(store.values, isEmpty);
      expect(store.clears, 1);
      expect(oidc.endSessions, 1);
    });

    test('passes the id token so the provider knows whose session to end', () async {
      oidc.response = tokens();
      await repository.signIn();
      final String stored = store.values[CredentialKeys.idToken]!;

      await repository.signOut(null);

      expect(oidc.lastIdTokenHint, stored);
    });

    test('a provider that refuses does not un-sign-out the device', () async {
      oidc.failure = const FormatException('provider is down');

      await repository.signOut(null);

      expect(store.clears, 1);
      expect(
        recorder.withOp(LogOp.authToken).first['msg'],
        'the provider refused to end the session',
      );
    });
  });
}
