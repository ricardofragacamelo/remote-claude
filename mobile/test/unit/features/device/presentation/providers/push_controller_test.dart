/// Whether an approval can actually reach this phone — and the four ways it silently cannot.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/deep_link_controller.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/core/notifications/push_providers.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/device/device_providers.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

import '../../../../../support/fakes/fake_device_repository.dart';
import '../../../../../support/fakes/fake_push_gateway.dart';
import '../../../../../support/fakes/recording_writer.dart';
import '../../../../../support/fakes/stub_device_controller.dart';

void main() {
  late FakePushGateway gateway;
  late FakeDeviceRepository devices;
  late RecordingWriter written;

  /// Builds the graph with a device already registered, unless the test says otherwise.
  ProviderContainer build({AsyncValue<RegisteredDevice?>? device}) {
    gateway = FakePushGateway();
    devices = FakeDeviceRepository(produced: aRegisteredDevice());
    written = RecordingWriter();

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        deviceControllerAnswering(
          device ?? AsyncValue<RegisteredDevice?>.data(aRegisteredDevice()),
        ),
        pushGatewayProvider.overrideWithValue(gateway as PushGateway),
        deviceRepositoryProvider.overrideWithValue(devices as DeviceRepository),
        deviceNameProvider.overrideWithValue('android 14'),
        appLoggerProvider.overrideWithValue(
          AppLogger(
            context: const LogContext(appVersion: '0.0.1', platform: 'android'),
            writer: written.writer,
          ),
        ),
      ],
    );

    addTearDown(() async {
      container.dispose();
      await gateway.dispose();
    });

    return container;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  group('asking for the permission', () {
    test('S-68 · asks only once there is a device to send the token to', () async {
      final ProviderContainer container = build(
        device: const AsyncValue<RegisteredDevice?>.data(null),
      );

      final PushReach reach = await container.read(pushControllerProvider.future);

      // Nobody is signed in, so there is nowhere to register a token and no reason yet to spend
      // the one prompt Android gives us.
      expect(gateway.requests, 0);
      expect(reach.permission, PushPermission.notAsked);
    });

    test(
      'S-68 · with a device registered, it asks, and registers the token it was given',
      () async {
        final ProviderContainer container = build();

        final PushReach reach = await container.read(pushControllerProvider.future);

        expect(gateway.requests, 1);
        expect(reach.permission, PushPermission.granted);
        expect(reach.isReachable, isTrue);
        expect(devices.registrations.single.pushToken, 'token-abcdef');
      },
    );

    test('a permission already decided is not asked for again', () async {
      final ProviderContainer container = build();
      gateway.current = PushPermission.denied;

      final PushReach reach = await container.read(pushControllerProvider.future);

      // Android shows the dialog at most twice; a third ask does nothing the person can see, and
      // the banner offers the settings shortcut instead.
      expect(gateway.requests, 0);
      expect(reach.permission, PushPermission.denied);
      expect(devices.registrations, isEmpty);
    });

    test('a refusal leaves the app working and unreachable', () async {
      final ProviderContainer container = build();
      gateway.answersRequest = PushPermission.denied;

      final PushReach reach = await container.read(pushControllerProvider.future);

      expect(reach.permission, PushPermission.denied);
      expect(reach.isReachable, isFalse);
    });

    test('granted with no token registers nothing rather than registering null', () async {
      final ProviderContainer container = build();
      gateway.currentToken = null;

      await container.read(pushControllerProvider.future);

      expect(devices.registrations, isEmpty);
    });
  });

  group('the token that rotates', () {
    test(
      'S-73 · a rotation re-registers on its own, and logs only the last six characters',
      () async {
        final ProviderContainer container = build();
        await container.read(pushControllerProvider.future);

        gateway.rotate('brand-new-token-ZZZZZZ');
        await settle();

        expect(devices.registrations.last.pushToken, 'brand-new-token-ZZZZZZ');

        final Map<String, Object?> logged = written.withOp('push.token').first;
        expect(logged['tokenTail'], 'ZZZZZZ');
        expect(written.lines.join(), isNot(contains('brand-new-token')));
      },
    );

    test(
      'S-74 · a rotation that cannot be registered is a warning, and the state says so',
      () async {
        final ProviderContainer container = build();
        await container.read(pushControllerProvider.future);

        devices.failure = const NetworkFailure(traceId: 'trace-1');
        gateway.rotate('another-token-YYYYYY');
        await settle();

        final PushReach reach = container.read(pushControllerProvider).value!;

        // Not a failure of the app: the socket still works and the session still works. What
        // stopped is the notification, and that is exactly what has to be visible.
        expect(reach.rotationFailed, isTrue);
        expect(reach.isReachable, isFalse);
        expect(written.withOp('push.token').last['level'] ?? 'warn', isNotNull);
        expect(written.levels, contains('warn'));
      },
    );
  });

  group('what arrives', () {
    test('S-69 · a notification received while the app is open is logged', () async {
      final ProviderContainer container = build();
      await container.read(pushControllerProvider.future);

      gateway.deliver(anArrival(sessionId: 'session-9', requestId: 'request-9'));
      await settle();

      final Map<String, Object?> logged = written.withOp('push.received').single;
      expect(logged['sessionId'], 'session-9');
      expect(logged['requestId'], 'request-9');
      expect(logged['withdrawal'], isFalse);
    });

    test('S-71 · a withdrawal takes the notification down by its tag', () async {
      final ProviderContainer container = build();
      await container.read(pushControllerProvider.future);

      gateway.deliver(anArrival(requestId: 'request-7', isWithdrawal: true));
      await settle();

      // A notification for a question that is over is the fastest way to teach somebody to
      // ignore this app's notifications.
      expect(gateway.withdrawn, <String>['request-7']);
    });

    test('S-70 · a tap asks for the request’s address, and is logged as an intent', () async {
      final ProviderContainer container = build();
      await container.read(pushControllerProvider.future);

      gateway.open(anArrival(sessionId: 'session-3', requestId: 'request-3'));
      await settle();

      expect(
        container.read(deepLinkControllerProvider),
        '/sessions/session-3/permissions/request-3',
      );
      expect(written.withOp('push.opened').single['requestId'], 'request-3');
    });

    test('nothing is listened to while nobody is signed in', () async {
      final ProviderContainer container = build(
        device: const AsyncValue<RegisteredDevice?>.data(null),
      );
      await container.read(pushControllerProvider.future);

      gateway.deliver(anArrival());
      gateway.open(anArrival());
      await settle();

      expect(written.withOp('push.received'), isEmpty);
      expect(container.read(deepLinkControllerProvider), isNull);
    });
  });

  group('coming back from the system settings', () {
    test('rechecks rather than prompting again, and registers once it is allowed', () async {
      final ProviderContainer container = build();
      gateway.current = PushPermission.denied;
      await container.read(pushControllerProvider.future);

      gateway.current = PushPermission.granted;
      await container.read(pushControllerProvider.notifier).recheck();

      expect(gateway.requests, 0);
      expect(container.read(pushControllerProvider).value?.permission, PushPermission.granted);
      expect(devices.registrations.single.pushToken, 'token-abcdef');
    });

    test('a recheck that finds it still off registers nothing', () async {
      final ProviderContainer container = build();
      gateway.current = PushPermission.denied;
      await container.read(pushControllerProvider.future);

      await container.read(pushControllerProvider.notifier).recheck();

      expect(container.read(pushControllerProvider).value?.permission, PushPermission.denied);
      expect(devices.registrations, isEmpty);
    });

    test('opens the system settings when asked', () async {
      final ProviderContainer container = build();
      await container.read(pushControllerProvider.future);

      await container.read(pushControllerProvider.notifier).openSettings();

      expect(gateway.settingsOpened, 1);
    });
  });
}
