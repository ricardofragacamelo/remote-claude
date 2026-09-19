import 'dart:async';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/session_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/fake_frame_socket.dart';
import '../../../../../support/fakes/recording_writer.dart';

void main() {
  late List<FakeFrameSocket> opened;
  late AppLogger logger;
  late WsClient client;
  late SessionWsDataSource source;
  late SessionRepository repository;

  setUp(() {
    opened = <FakeFrameSocket>[];
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );

    client = WsClient(
      url: Uri.parse('ws://localhost:3000/ws'),
      credentials: FakeCredentials(),
      logger: logger,
      appVersion: '0.0.1',
      connect: (Uri url) {
        final FakeFrameSocket socket = FakeFrameSocket();
        opened.add(socket);
        return socket;
      },
      schedule: (void Function() body, Duration delay) => () {},
      random: Random(3),
      traceIds: TraceIds(random: Random(3)),
    );

    source = SessionWsDataSource(client);
    repository = SessionRepositoryImpl(source);
  });

  tearDown(() async {
    await source.dispose();
    await client.dispose();
    await logger.dispose();
  });

  FakeFrameSocket socket() => opened.last;

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> ready() async {
    client.connect();
    await settle();
    socket().deliver(connectionReady());
    await settle();
  }

  test('a pong for a session nobody follows still reaches the stream', () async {
    await ready();
    final Future<SessionUpdate> first = repository.updates.first;

    socket().deliver(diagPong(sessionId: 'ses-1', seq: 1));

    expect(await first, isA<PongReceived>());
  });

  test('a pong of a followed session reaches the stream', () async {
    await ready();
    repository.follow('ses-1', () => 0);
    final Future<SessionUpdate> first = repository.updates.first;

    socket().deliver(diagPong(sessionId: 'ses-1', seq: 2));

    expect((await first as PongReceived).pong.seq, 2);
  });

  test('a gap reaches the stream as one', () async {
    await ready();
    repository.follow('ses-1', () => 0);
    final Future<SessionUpdate> first = repository.updates.first;

    socket().deliver(sessionAttached(sessionId: 'ses-1', gap: true));

    expect(await first, isA<StreamGap>());
  });

  test('a frame that is not a pong produces no update', () async {
    await ready();
    final List<SessionUpdate> seen = <SessionUpdate>[];
    final StreamSubscription<SessionUpdate> subscription = repository.updates.listen(seen.add);
    addTearDown(subscription.cancel);

    socket().deliver(frame(kind: 'ack', type: 'command.accepted'));
    await settle();

    expect(seen, isEmpty);
  });

  test('a ping leaves as a command with the nonce', () async {
    await ready();

    expect(repository.ping(sessionId: 'ses-1', nonce: 'n-1'), isTrue);
    expect(socket().sent.last, contains('diag.ping'));
    expect(socket().sent.last, contains('n-1'));
    expect(socket().sent.last, contains('ses-1'));
  });

  test('a ping without a session opens one', () async {
    await ready();

    repository.ping(nonce: 'n-1');

    expect(socket().sent.last, isNot(contains('sessionId')));
  });

  test('a ping on a socket that is not ready goes nowhere', () {
    expect(repository.ping(nonce: 'n-1'), isFalse);
  });

  test('following twice leaves the first subscription behind', () async {
    await ready();

    repository.follow('ses-1', () => 5);
    repository.follow('ses-2', () => 0);

    expect(socket().sent.where((String frame) => frame.contains('session.detach')), hasLength(1));
  });

  test('the resume point is read at attach time, not at follow time', () async {
    await ready();
    int seq = 0;
    repository.follow('ses-1', () => seq);
    seq = 9;

    await socket().drop(1006);
    await settle();
    client.connect();
    await settle();
    socket().deliver(connectionReady());
    await settle();

    expect(socket().sent.last, contains('"resumeFromSeq":9'));
  });

  test('unfollowing stops the subscription', () async {
    await ready();
    repository.follow('ses-1', () => 0);

    repository.unfollow();

    expect(socket().sent.last, contains('session.detach'));
  });

  test('an update after disposal is dropped rather than thrown', () async {
    await ready();
    await source.dispose();

    expect(() => socket().deliver(diagPong(sessionId: 'ses-1', seq: 1)), returnsNormally);
  });
}
