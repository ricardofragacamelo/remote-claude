import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/session/sign_out_hooks.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/device/device_providers.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

import '../../../../../support/fakes/fake_auth_repository.dart';
import '../../../../../support/fakes/fake_device_repository.dart';
import '../../../../../support/fakes/recording_writer.dart';

final DateTime _issuedAt = DateTime.now().toUtc();

AuthSession session() => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'user-1',
  issuedAt: _issuedAt,
  expiresAt: _issuedAt.add(const Duration(hours: 1)),
);

const RegisteredDevice pending = RegisteredDevice(
  id: 'dev_1',
  name: 'android 14',
  status: DeviceStatus.pending,
  pushEnabled: false,
);

void main() {
  late FakeAuthRepository auth;
  late FakeDeviceRepository devices;
  late AppLogger logger;

  ProviderContainer build({AuthSession? signedIn}) {
    auth = FakeAuthRepository(stored: signedIn);
    devices = FakeDeviceRepository(produced: pending);
    // The auth controller stamps the signed-in user onto the logger's ambient context, so the
    // real graph reaches it even in a test that is not about logging.
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        authRepositoryProvider.overrideWithValue(auth as AuthRepository),
        appLoggerProvider.overrideWithValue(logger),
        deviceRepositoryProvider.overrideWithValue(devices as DeviceRepository),
        deviceNameProvider.overrideWithValue('android 14'),
      ],
    );

    addTearDown(() async {
      container.dispose();
      await logger.dispose();
    });

    return container;
  }

  // S-50 — skipping this leaves the phone notified for an account it has left.
  test('signing out forgets the push token, before anything else', () async {
    final ProviderContainer container = build(signedIn: session());
    await container.read(deviceControllerProvider.future);

    await container.read(authControllerProvider.notifier).signOut();

    expect(devices.registrations, hasLength(2));
    expect(devices.registrations.last.name, 'android 14');
    expect(devices.registrations.last.pushToken, isNull);
  });

  test('with nobody signed in there is no push token to forget', () async {
    final ProviderContainer container = build();
    await container.read(deviceControllerProvider.future);

    await container.read(signOutHooksProvider).run(logger);

    expect(devices.registrations, isEmpty);
  });

  // S-56 — a refused socket has the status asked for again; a revoked phone stops saying approved.
  group('asking again where this device stands', () {
    test('reads the status without registering anything', () async {
      final ProviderContainer container = build(signedIn: session());
      await container.read(deviceControllerProvider.future);
      devices.checkedAs = const RegisteredDevice(
        id: 'dev_1',
        name: 'android 14',
        status: DeviceStatus.revoked,
        pushEnabled: false,
      );

      await container.read(deviceControllerProvider.notifier).recheck();

      expect(container.read(deviceControllerProvider).value?.status, DeviceStatus.revoked);
      expect(devices.registrations, hasLength(1));
    });

    test('a backend that will not answer lands in the state, for the banner to say', () async {
      final ProviderContainer container = build(signedIn: session());
      await container.read(deviceControllerProvider.future);
      devices.failure = const ServerFailure(
        code: 'DEVICE_REVOKED',
        messageKey: 'auth.error.deviceRevoked',
        traceId: 't',
      );

      await container.read(deviceControllerProvider.notifier).recheck();

      expect(container.read(deviceControllerProvider).error, isA<ServerFailure>());
    });

    test('with no device known there is nothing to ask about', () async {
      final ProviderContainer container = build();
      await container.read(deviceControllerProvider.future);

      await container.read(deviceControllerProvider.notifier).recheck();

      expect(devices.checks, 0);
    });
  });

  // Plan 17, D-16: back in the foreground, a phone that waits for approval asks again.
  group('coming back to the foreground', () {
    // S-130
    test('asks again while the phone waits for approval, and shows the answer', () async {
      final ProviderContainer container = build(signedIn: session());
      await container.read(deviceControllerProvider.future);
      devices.checkedAs = const RegisteredDevice(
        id: 'dev_1',
        name: 'android 14',
        status: DeviceStatus.approved,
        pushEnabled: false,
      );

      await container.read(deviceControllerProvider.notifier).recheckIfPending();

      expect(devices.checks, 1);
      expect(container.read(deviceControllerProvider).value?.canDecide, isTrue);
    });

    // S-130 · approved, there is nothing an approval could change.
    test('asks nothing once the phone is approved', () async {
      final ProviderContainer container = build(signedIn: session());
      await container.read(deviceControllerProvider.future);
      devices.checkedAs = const RegisteredDevice(
        id: 'dev_1',
        name: 'android 14',
        status: DeviceStatus.approved,
        pushEnabled: false,
      );
      await container.read(deviceControllerProvider.notifier).recheck();

      await container.read(deviceControllerProvider.notifier).recheckIfPending();

      expect(devices.checks, 1);
    });

    // S-131 · the push and the return to the foreground together end in the same state.
    test('two asks at once end in the same state', () async {
      final ProviderContainer container = build(signedIn: session());
      await container.read(deviceControllerProvider.future);
      devices.checkedAs = const RegisteredDevice(
        id: 'dev_1',
        name: 'android 14',
        status: DeviceStatus.approved,
        pushEnabled: false,
      );
      final DeviceController controller = container.read(deviceControllerProvider.notifier);

      await Future.wait(<Future<void>>[controller.recheck(), controller.recheckIfPending()]);

      expect(container.read(deviceControllerProvider).value?.status, DeviceStatus.approved);
      expect(container.read(deviceControllerProvider).hasError, isFalse);
    });

    test('with nobody signed in there is nothing to ask', () async {
      final ProviderContainer container = build();
      await container.read(deviceControllerProvider.future);

      await container.read(deviceControllerProvider.notifier).recheckIfPending();

      expect(devices.checks, 0);
    });
  });

  test('registers nothing while nobody is signed in', () async {
    final ProviderContainer container = build();

    expect(await container.read(deviceControllerProvider.future), isNull);
    expect(devices.registrations, isEmpty);
  });

  // 05 · S-79 — a renewal refused in the middle of a turn signs the person out; the device has no
  // session to register under, and the refusal is the sign-in screen's to say, not an error here.
  test('a refused renewal is nobody signed in, and registers nothing more', () async {
    final ProviderContainer container = build(signedIn: session());
    expect(await container.read(deviceControllerProvider.future), pending);

    auth.failure = const ServerFailure(
      code: 'UNAUTHENTICATED',
      messageKey: 'auth.error.unauthenticated',
      traceId: 'trace-1',
    );
    expect(await container.read(credentialsProvider).renew(), isNull);

    expect(container.read(authControllerProvider).hasError, isTrue);
    expect(await container.read(deviceControllerProvider.future), isNull);
    expect(devices.registrations, hasLength(1));
  });

  // It runs as soon as there is a credential to register under: the screen has to be able to say
  // "waiting for approval" on its first frame, not after somebody taps a control that does
  // nothing.
  test('registers as soon as there is a session, under the name of this device', () async {
    final ProviderContainer container = build(signedIn: session());

    final RegisteredDevice? device = await container.read(deviceControllerProvider.future);

    expect(device, pending);
    expect(devices.registrations.single.name, 'android 14');
    expect(devices.registrations.single.pushToken, isNull);
  });

  test('keeps the failure in the state rather than throwing it at the widget', () async {
    final ProviderContainer container = build(signedIn: session());
    devices.failure = const NetworkFailure(traceId: 'trace-1');

    // Listened to rather than awaited: a provider whose **first** build fails has no future to
    // await — the widget subscribes and reads the error off the state, and so does this.
    final List<AsyncValue<RegisteredDevice?>> seen = <AsyncValue<RegisteredDevice?>>[];
    container.listen(deviceControllerProvider, (
      AsyncValue<RegisteredDevice?>? previous,
      AsyncValue<RegisteredDevice?> next,
    ) {
      seen.add(next);
    }, fireImmediately: true);

    await pumpEventQueue();

    expect(container.read(deviceControllerProvider).hasError, isTrue);
    expect(container.read(deviceControllerProvider).error, isA<NetworkFailure>());
    expect(seen.last.hasError, isTrue);
  });

  // D-13: the provider rotates the token without asking, and a token that dies quietly is
  // approval-from-away silently ceasing to arrive.
  test('re-registers with a fresh push token', () async {
    final ProviderContainer container = build(signedIn: session());
    await container.read(deviceControllerProvider.future);

    devices.produced = const RegisteredDevice(
      id: 'dev_1',
      name: 'android 14',
      status: DeviceStatus.approved,
      pushEnabled: true,
    );
    await container.read(deviceControllerProvider.notifier).refresh(pushToken: 'fcm-token');

    expect(devices.registrations.last.pushToken, 'fcm-token');
    expect(container.read(deviceControllerProvider).value?.pushEnabled, isTrue);
  });

  test('a re-registration that fails lands in the state, not in an exception', () async {
    final ProviderContainer container = build(signedIn: session());
    await container.read(deviceControllerProvider.future);

    devices.failure = const NetworkFailure(traceId: 'trace-1');
    await container.read(deviceControllerProvider.notifier).refresh();

    expect(container.read(deviceControllerProvider).hasError, isTrue);
  });
}
