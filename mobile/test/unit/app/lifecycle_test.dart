import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/lifecycle.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';

import '../../support/builders/config.dart';
import '../../support/builders/frames.dart';
import '../../support/fakes/fake_credential_store.dart';
import '../../support/fakes/fake_credentials.dart';
import '../../support/fakes/fake_frame_socket.dart';
import '../../support/fakes/recording_writer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<FakeFrameSocket> opened;
  late FakeCredentials credentials;
  late RecordingWriter recorder;
  late AppLogger logger;
  late WsClient client;

  setUp(() {
    opened = <FakeFrameSocket>[];
    credentials = FakeCredentials(renewal: 'fresh');
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );

    client = WsClient(
      url: Uri.parse('ws://localhost:3000/ws'),
      credentials: credentials,
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
    );
  });

  tearDown(() async {
    await client.dispose();
    await logger.dispose();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> ready() async {
    client.connect();
    await settle();
    opened.last.deliver(connectionReady());
    await settle();
  }

  test('every transition is logged — half the socket bugs start here', () async {
    await ready();

    await applyLifecycle(AppLifecycleState.inactive, client, logger);

    expect(recorder.withOp(LogOp.lifecycleChanged).last['state'], 'inactive');
  });

  test('going to the background closes the socket, and that is correct', () async {
    await ready();

    await applyLifecycle(AppLifecycleState.paused, client, logger);

    expect(client.status, ConnectionStatus.closed);
  });

  test('detaching releases the socket too', () async {
    await ready();

    await applyLifecycle(AppLifecycleState.detached, client, logger);

    expect(client.status, ConnectionStatus.closed);
  });

  test('going inactive keeps the socket — the app is still in front', () async {
    await ready();

    await applyLifecycle(AppLifecycleState.inactive, client, logger);

    expect(client.status, ConnectionStatus.ready);
  });

  test('hidden keeps the socket too', () async {
    await ready();

    await applyLifecycle(AppLifecycleState.hidden, client, logger);

    expect(client.status, ConnectionStatus.ready);
  });

  test('coming back revalidates the credential before reopening', () async {
    await ready();
    await applyLifecycle(AppLifecycleState.paused, client, logger);

    await applyLifecycle(AppLifecycleState.resumed, client, logger);

    expect(credentials.renewals, 1);
    expect(opened, hasLength(2));
  });

  test('the listener keeps the socket in step with the binding', () async {
    await ready();
    final SocketLifecycle lifecycle = SocketLifecycle(client: () => client, logger: logger);
    addTearDown(lifecycle.dispose);

    WidgetsBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await settle();

    expect(recorder.withOp(LogOp.lifecycleChanged).last['state'], 'inactive');
    expect(client.status, ConnectionStatus.ready);
  });

  group('the socket of the address — plan 10, B-28', () {
    /// A container whose socket is a fake one, rebuilt — as the real one is — with the address.
    ProviderContainer containerOn(BuildConfig config) {
      FlutterSecureStorage.setMockInitialValues(<String, String>{});
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          buildConfigProvider.overrideWithValue(config),
          appLoggerProvider.overrideWithValue(logger),
          credentialStoreProvider.overrideWithValue(FakeCredentialStore()),
          wsClientProvider.overrideWith((Ref ref) {
            final AppConfig app = ref.watch(appConfigProvider);
            final WsClient socket = WsClient(
              url: Uri.parse(app.wsUrl),
              credentials: credentials,
              logger: logger,
              appVersion: '0.0.1',
              connect: (Uri url) {
                final FakeFrameSocket opening = FakeFrameSocket();
                opened.add(opening);
                return opening;
              },
              schedule: (void Function() body, Duration delay) => () {},
              random: Random(1),
              traceIds: TraceIds(random: Random(1)),
            );
            ref.onDispose(socket.dispose);
            return socket;
          }),
        ],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('connects on the address of now, and again on a new one', () async {
      final ProviderContainer container = containerOn(aBuildConfig(external: 'https://x.example'));

      final ProviderSubscription<String?> kept = keepConnected(container);
      addTearDown(kept.close);
      await settle();
      expect(opened, hasLength(1));
      expect(currentSocket(container), isNotNull);

      await container
          .read(connectionControllerProvider.notifier)
          .save(const ConnectionChoice(ConnectionKind.external));
      await settle();

      expect(opened, hasLength(2));
      expect(currentSocket(container)?.status, isNot(ConnectionStatus.closed));
    });

    test('with no address there is no socket, and nothing is opened', () async {
      final ProviderContainer container = containerOn(aBuildConfig(internal: null));

      final ProviderSubscription<String?> kept = keepConnected(container);
      addTearDown(kept.close);
      await settle();

      expect(opened, isEmpty);
      expect(currentSocket(container), isNull);
    });

    test('a lifecycle with no socket to move does nothing', () async {
      final SocketLifecycle lifecycle = SocketLifecycle(client: () => null, logger: logger);
      addTearDown(lifecycle.dispose);

      WidgetsBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await settle();

      expect(recorder.withOp(LogOp.lifecycleChanged), isEmpty);
      WidgetsBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    });
  });

  // Plan 17, D-16: the foreground is when the phone asks again where it stands.
  test('coming back to the foreground runs the recheck it was given', () async {
    int asked = 0;
    final ForegroundRecheck recheck = ForegroundRecheck(
      recheck: () async {
        asked += 1;
      },
    );
    addTearDown(recheck.dispose);

    recheck.onResume();
    await settle();

    expect(asked, 1);
  });
}
