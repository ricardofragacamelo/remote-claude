import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/session/sign_out_hooks.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

import '../../../../../support/fakes/fake_auth_repository.dart';
import '../../../../../support/fakes/recording_writer.dart';

/// A session that is always **fresh**, whatever day this runs on.
///
/// The instants are relative to one `now` captured at load, never to a date written into the
/// file: these two suites build the real provider graph, where `RestoreSession` reads the wall
/// clock. A fixed 2026-09-14 12:00 stops being fresh at 12:48 that day, and the suite then fails
/// for everybody, for ever — which is exactly what it did.
final DateTime _issuedAt = DateTime.now().toUtc();

AuthSession session({
  String userId = 'user-1',
  String accessToken = 'token',
  String? refreshToken = 'refresh',
}) => AuthSession(
  accessToken: accessToken,
  refreshToken: refreshToken,
  userId: userId,
  issuedAt: _issuedAt,
  expiresAt: _issuedAt.add(const Duration(hours: 1)),
);

void main() {
  late FakeAuthRepository repository;
  late RecordingWriter recorder;
  late AppLogger logger;
  late Credentials credentials;
  late ProviderContainer container;

  setUp(() {
    repository = FakeAuthRepository();
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
    credentials = Credentials();

    container = ProviderContainer(
      overrides: <Override>[
        authRepositoryProvider.overrideWithValue(repository as AuthRepository),
        appLoggerProvider.overrideWithValue(logger),
        credentialsProvider.overrideWithValue(credentials),
      ],
    );
  });

  tearDown(() async {
    container.dispose();
    await logger.dispose();
  });

  Future<AuthSession?> build() => container.read(authControllerProvider.future);
  AuthController controller() => container.read(authControllerProvider.notifier);

  test('starts with nobody signed in when the device holds nothing', () async {
    expect(await build(), isNull);
    expect(credentials.accessToken, isNull);
  });

  test('brings back the stored session and hands the token to the transport', () async {
    repository.stored = session();

    expect(await build(), session());
    expect(credentials.accessToken, 'token');
  });

  test('stamps the user on every log line that follows', () async {
    repository.stored = session();
    await build();

    expect(logger.context.userId, 'user-1');
  });

  test('signing in publishes the session', () async {
    await build();
    repository.produced = session();

    await controller().signIn();

    expect(container.read(authControllerProvider).value, session());
    expect(credentials.accessToken, 'token');
  });

  test('a sign-in that failed lands in the state, not in the widget', () async {
    await build();
    repository.failure = const AuthenticationFailure(traceId: 't');

    await controller().signIn();

    expect(container.read(authControllerProvider).hasError, isTrue);
    expect(credentials.accessToken, isNull);
  });

  test('signing out clears the credential here and at the provider', () async {
    repository.stored = session();
    await build();

    await controller().signOut();

    expect(container.read(authControllerProvider).value, isNull);
    expect(credentials.accessToken, isNull);
    expect(repository.signOuts, 1);
  });

  // D-23 — forgetting the push token is a call to the backend, so it runs while the credential is
  // still there: before the store is cleared, before the transport forgets the token.
  test('what needs the credential runs before the credential goes', () async {
    repository.stored = session();
    await build();
    (int, String?)? seen;
    container
        .read(signOutHooksProvider)
        .register('probe', () async => seen = (repository.signOuts, credentials.accessToken));

    await controller().signOut();

    expect(seen, (0, 'token'));
    expect(repository.signOuts, 1);
  });

  // S-88 — a step that fails never keeps the credential on the phone.
  test('a step that fails does not stop the sign-out', () async {
    repository.stored = session();
    await build();
    container.read(signOutHooksProvider).register('offline', () async => throw StateError('x'));

    await controller().signOut();

    expect(container.read(authControllerProvider).value, isNull);
    expect(credentials.accessToken, isNull);
    expect(repository.signOuts, 1);
  });

  test('the transport can renew without knowing what a refresh token is', () async {
    repository.stored = session();
    await build();
    repository.produced = session(accessToken: 'fresh');

    expect(await credentials.renew(), 'fresh');
    expect(container.read(authControllerProvider).value!.accessToken, 'fresh');
  });

  test('renewal with nobody signed in answers nothing', () async {
    await build();

    expect(await credentials.renew(), isNull);
    expect(repository.renewals, 0);
  });

  test('a refresh that failed ends the session — no silent recovery', () async {
    repository.stored = session();
    await build();
    repository.failure = const AuthenticationFailure(traceId: 't');

    expect(await credentials.renew(), isNull);
    expect(container.read(authControllerProvider).hasError, isTrue);
    expect(credentials.accessToken, isNull);

    // S-86: nobody is signed in any more — not the error with the old session still inside it,
    // which the router reads as somebody signed in and keeps on a screen nobody can act on.
    expect(container.read(authControllerProvider).value, isNull);
  });

  test('renewal is deduplicated — N callers, one exchange', () async {
    repository.stored = session();
    await build();
    repository.produced = session(accessToken: 'fresh');

    await Future.wait(<Future<String?>>[
      credentials.renew(),
      credentials.renew(),
      credentials.renew(),
    ]);

    expect(repository.renewals, 1);
  });

  // S-72 — the renewal happens ahead of the expiry, on its own, and then again for the new token.
  group('proactive renewal', () {
    /// Four fifths of the hour the fixtures live for, and a margin: the delay is measured from the
    /// wall clock, which moved a little between building the session and scheduling the timer.
    const Duration dueIn = Duration(minutes: 48, seconds: 1);

    test('renews at four fifths of the life, with nobody asking', () {
      fakeAsync((FakeAsync async) {
        repository.stored = session();
        repository.produced = session(accessToken: 'fresh');
        unawaited(build());
        async.flushMicrotasks();

        async.elapse(const Duration(minutes: 47));
        expect(repository.renewals, 0);

        async.elapse(dueIn - const Duration(minutes: 47));
        async.flushMicrotasks();
        expect(repository.renewals, 1);
        expect(credentials.accessToken, 'fresh');
      });
    });

    test('schedules the next one from the renewed token', () {
      fakeAsync((FakeAsync async) {
        repository.stored = session();
        repository.produced = session(accessToken: 'fresh');
        unawaited(build());
        async.flushMicrotasks();

        async.elapse(dueIn);
        async.flushMicrotasks();
        expect(async.pendingTimers, hasLength(1));
      });
    });

    // S-77
    test('a token already due when it arrives waits the minimum gap, instead of looping', () {
      fakeAsync((FakeAsync async) {
        final DateTime past = DateTime.now().toUtc().subtract(const Duration(hours: 2));
        final AuthSession spent = AuthSession(
          accessToken: 'spent',
          refreshToken: 'refresh',
          userId: 'user-1',
          issuedAt: past,
          expiresAt: past.add(const Duration(minutes: 5)),
        );
        repository
          ..stored = spent
          ..produced = spent;
        unawaited(build());
        async.flushMicrotasks();
        // The restore renews a stored session that is already spent; counted from after it.
        final int restored = repository.renewals;

        async.elapse(minimumRenewalGap - const Duration(seconds: 1));
        expect(repository.renewals, restored);

        async.elapse(const Duration(seconds: 1));
        async.flushMicrotasks();
        expect(repository.renewals, restored + 1);

        // The renewed token is just as due, and the next renewal still waits the whole gap.
        async.elapse(minimumRenewalGap - const Duration(seconds: 1));
        expect(repository.renewals, restored + 1);
      });
    });

    test('does not schedule one for a session with nothing to renew with', () {
      fakeAsync((FakeAsync async) {
        repository.stored = session(refreshToken: null);
        unawaited(build());
        async.flushMicrotasks();

        async.elapse(const Duration(hours: 2));
        expect(repository.renewals, 0);
      });
    });

    test('stops once nobody is signed in', () {
      fakeAsync((FakeAsync async) {
        repository.stored = session();
        unawaited(build());
        async.flushMicrotasks();

        unawaited(controller().signOut());
        async.flushMicrotasks();

        async.elapse(const Duration(hours: 2));
        expect(repository.renewals, 0);
      });
    });
  });
}
