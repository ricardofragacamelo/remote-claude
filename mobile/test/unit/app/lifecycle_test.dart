import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/lifecycle.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';

import '../../support/builders/frames.dart';
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
    final SocketLifecycle lifecycle = SocketLifecycle(client: client, logger: logger);
    addTearDown(lifecycle.dispose);

    WidgetsBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await settle();

    expect(recorder.withOp(LogOp.lifecycleChanged).last['state'], 'inactive');
    expect(client.status, ConnectionStatus.ready);
  });
}
