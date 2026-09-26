/// Who is signed in decides whether the socket is open, and whose data is on screen.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/session_scope.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/notifications/push_providers.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/device/device_providers.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/permission.dart';

import '../../support/fakes/fake_auth_repository.dart';
import '../../support/fakes/fake_device_repository.dart';
import '../../support/fakes/fake_frame_socket.dart';
import '../../support/fakes/fake_push_gateway.dart';
import '../../support/fakes/fake_permission_repository.dart';
import '../../support/fakes/recording_writer.dart';

final DateTime _issuedAt = DateTime.now().toUtc();

AuthSession signedInAs(String userId, String token) => AuthSession(
  accessToken: token,
  refreshToken: 'refresh',
  userId: userId,
  issuedAt: _issuedAt,
  expiresAt: _issuedAt.add(const Duration(hours: 1)),
);

void main() {
  late FakeAuthRepository auth;
  late FakePermissionRepository permissions;
  late FakeDeviceRepository devices;
  late FakePushGateway push;
  late List<FakeFrameSocket> opened;

  ProviderContainer build({AuthSession? stored}) {
    auth = FakeAuthRepository(stored: stored);
    permissions = FakePermissionRepository();
    devices = FakeDeviceRepository(
      produced: const RegisteredDevice(
        id: 'dev_1',
        name: 'android 14',
        status: DeviceStatus.approved,
        pushEnabled: false,
      ),
    );
    opened = <FakeFrameSocket>[];
    push = FakePushGateway();

    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        ...permissionOverrides(repository: permissions),
        authRepositoryProvider.overrideWithValue(auth as AuthRepository),
        appLoggerProvider.overrideWithValue(logger),
        deviceRepositoryProvider.overrideWithValue(devices as DeviceRepository),
        pushGatewayProvider.overrideWithValue(push),
        deviceNameProvider.overrideWithValue('android 14'),
        wsClientProvider.overrideWith(
          (Ref ref) => WsClient(
            url: Uri.parse('ws://localhost/ws'),
            credentials: ref.watch(credentialsProvider),
            logger: logger,
            appVersion: '0.0.1',
            connect: (Uri url) {
              final FakeFrameSocket socket = FakeFrameSocket();
              opened.add(socket);
              return socket;
            },
            schedule: (void Function() body, Duration delay) => () {},
            random: Random(1),
            traceIds: TraceIds(random: Random(1)),
          ),
        ),
      ],
    );

    addTearDown(() async {
      container.dispose();
      await logger.dispose();
    });

    container.listen<void>(sessionScopeProvider, (void previous, void next) {});
    return container;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  String tokenOf(FakeFrameSocket socket) {
    final Map<String, Object?> frame = jsonDecode(socket.sent.first)! as Map<String, Object?>;
    return (frame['payload']! as Map<String, Object?>)['token']! as String;
  }

  test('a session brought back from the store opens the socket with its credential', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));

    await container.read(authControllerProvider.future);

    expect(opened, hasLength(1));
    expect(tokenOf(opened.single), 'token-1');
  });

  test('with nobody signed in, nothing is opened', () async {
    final ProviderContainer container = build();

    await container.read(authControllerProvider.future);

    expect(opened, isEmpty);
  });

  // S-50 — the socket closes and what the previous user had on screen goes.
  test('signing out closes the socket and drops the permission queue', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));
    await container.read(authControllerProvider.future);
    container.listen<PermissionQueue>(
      permissionQueueControllerProvider('session-1'),
      (PermissionQueue? previous, PermissionQueue next) {},
    );

    await container.read(authControllerProvider.notifier).signOut();
    await settle();

    expect(opened.single.closeCode, 1000);
    expect(container.read(wsClientProvider).status, ConnectionStatus.closed);
    // Dropped and built again, empty: the first feed was closed with the state it held.
    expect(permissions.feeds.first.closed, isTrue);
  });

  // S-89 — the next person signs in on a socket of their own.
  test('signing in again opens the socket with the new credential', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));
    await container.read(authControllerProvider.future);
    await container.read(authControllerProvider.notifier).signOut();

    auth.produced = signedInAs('user-2', 'token-2');
    await container.read(authControllerProvider.notifier).signIn();

    expect(opened, hasLength(2));
    expect(tokenOf(opened.last), 'token-2');
  });

  test('a different user without a sign-out in between still gets a socket of their own', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));
    await container.read(authControllerProvider.future);

    auth.produced = signedInAs('user-2', 'token-2');
    await container.read(authControllerProvider.notifier).signIn();
    await settle();

    expect(opened.first.closeCode, 1000);
    expect(tokenOf(opened.last), 'token-2');
  });

  // S-56 — the server closed the socket with 4401: the device's status is asked for again.
  test('a refused socket has the device status asked for again', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));
    await container.read(authControllerProvider.future);
    await container.read(deviceControllerProvider.future);

    await opened.single.drop(closeAuthenticationFailed);
    await settle();

    expect(devices.checks, 1);
  });

  // S-68, from the app's side: the permission is asked once the device exists — on whatever screen
  // the app is showing, not only on the ones that carry the push banner.
  test('once the device exists, the operating system is asked, with no screen involved', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));
    await container.read(authControllerProvider.future);
    await container.read(deviceControllerProvider.future);

    // The push controller is never read here: only the scope keeps it alive. A few turns of the
    // event loop are what its build takes — the device, the permission, the request.
    for (int turn = 0; turn < 10 && push.requests == 0; turn += 1) {
      await settle();
    }

    expect(push.requests, 1);
  });

  test('the same user signing in again does not reopen anything', () async {
    final ProviderContainer container = build(stored: signedInAs('user-1', 'token-1'));
    await container.read(authControllerProvider.future);

    auth.produced = signedInAs('user-1', 'token-1b');
    await container.read(authControllerProvider.notifier).signIn();

    expect(opened, hasLength(1));
  });
}
