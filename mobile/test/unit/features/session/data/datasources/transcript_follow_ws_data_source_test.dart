/// The socket's edge for following a conversation of the history (plan 22, B-24, S-90): the
/// commands that leave, the frames that arrive, and what is logged about them.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_follow_ws_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/transcript_follow_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/usecases/follow_transcript.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/fake_frame_socket.dart';
import '../../../../../support/fakes/recording_writer.dart';

void main() {
  late List<FakeFrameSocket> opened;
  late AppLogger logger;
  late WsClient client;
  late TranscriptFollowWsDataSource source;
  late FollowTranscript follow;
  late RecordingWriter written;

  setUp(() {
    opened = <FakeFrameSocket>[];
    written = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: written.writer,
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

    source = TranscriptFollowWsDataSource(client, logger: logger);
    follow = FollowTranscript(TranscriptFollowRepositoryImpl(source));
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

  /// The commands the client sent after the handshake, decoded.
  List<Map<String, Object?>> commands() => socket().sent
      .map((String raw) => jsonDecode(raw)! as Map<String, Object?>)
      .where((Map<String, Object?> frame) => frame['type'] != 'connection.authenticate')
      .toList(growable: false);

  Future<List<FollowUpdate>> collect(void Function() deliver) async {
    final List<FollowUpdate> seen = <FollowUpdate>[];
    final StreamSubscription<FollowUpdate> subscription = follow.updates.listen(seen.add);
    deliver();
    await settle();
    await subscription.cancel();
    return seen;
  }

  test('S-90 · follow sends transcript.follow from the last entry, and answers its id', () async {
    await ready();

    final String? commandId = follow.follow('conv-1', afterMessageId: 'u-41');

    final Map<String, Object?> sent = commands().single;
    expect(sent['type'], 'transcript.follow');
    expect(sent['kind'], 'command');
    expect(sent['id'], commandId);
    expect(sent['payload'], <String, Object?>{
      'conversationId': 'conv-1',
      'afterMessageId': 'u-41',
    });
  });

  test('S-89 · a conversation with no entry is followed with no point to start after', () async {
    await ready();

    follow.follow('conv-1');

    expect(commands().single['payload'], <String, Object?>{'conversationId': 'conv-1'});
  });

  test('unfollow sends transcript.unfollow with the subscription', () async {
    await ready();

    expect(follow.unfollow('t-1'), isTrue);

    expect(commands().single['type'], 'transcript.unfollow');
    expect(commands().single['payload'], <String, Object?>{'followId': 't-1'});
  });

  test('a socket that is not ready sends nothing, and says so', () async {
    expect(follow.follow('conv-1'), isNull);
    expect(follow.unfollow('t-1'), isFalse);
    expect(
      written.withOp(LogOp.transcriptFollow).map((Map<String, Object?> r) => r['sent']),
      <Object?>[false, false],
    );
  });

  test('S-90 · the ack, what was appended and the reset arrive as follow updates', () async {
    await ready();
    final String commandId = follow.follow('conv-1', afterMessageId: 'u-41')!;

    final List<FollowUpdate> seen = await collect(() {
      socket()
        ..deliver(transcriptFollowing(correlationId: commandId))
        ..deliver(
          transcriptAppended(
            seq: 1,
            raws: <String>[messageCompleted(messageId: 'm5', text: 'done', seq: 1)],
            lastMessageId: 'u-44',
            working: true,
          ),
        )
        ..deliver(transcriptReset(seq: 2, reason: 'gone'));
    });

    expect(seen, hasLength(3));
    expect(seen[0], isA<FollowStarted>().having((FollowStarted s) => s.commandId, 'id', commandId));
    expect(
      seen[1],
      isA<FollowAppended>().having((FollowAppended a) => a.events, 'events', hasLength(1)),
    );
    expect(
      seen[2],
      isA<FollowReset>().having((FollowReset r) => r.reason, 'reason', FollowResetReason.gone),
    );
  });

  test('S-100 · a refusal of a command arrives, with the reason', () async {
    await ready();
    final String commandId = follow.follow('conv-1')!;

    final List<FollowUpdate> seen = await collect(
      () => socket().deliver(
        commandError(
          correlationId: commandId,
          code: 'TRANSCRIPT_FOLLOW_LIMIT',
          messageKey: 'transcript.error.followLimit',
          params: <String, Object?>{'limit': 8, 'scope': 'server'},
        ),
      ),
    );

    final FollowRefused refused = seen.single as FollowRefused;
    expect(refused.commandId, commandId);
    expect(refused.failure.messageKey, 'transcript.error.followLimit');
  });

  test(
    'frames that are not the follow\'s are left alone, and an unreadable one is logged',
    () async {
      await ready();

      final List<FollowUpdate> seen = await collect(() {
        socket()
          ..deliver(commandAccepted(correlationId: 'cmd-1'))
          ..deliver(commandError(correlationId: null))
          ..deliver(
            frame(
              kind: 'event',
              type: 'transcript.appended',
              seq: 1,
              payload: <String, Object?>{'followId': 't-1'},
            ),
          );
      });

      expect(seen, isEmpty);
      expect(
        written.withOp(LogOp.transcriptFollow).map((Map<String, Object?> r) => r['msg']),
        contains('transcript frame not read'),
      );
    },
  );

  test('every edge is logged in debug — ids and counts, never what an entry says', () async {
    await ready();
    final String commandId = follow.follow('conv-1', afterMessageId: 'u-41')!;
    await collect(() {
      socket()
        ..deliver(transcriptFollowing(correlationId: commandId))
        ..deliver(
          transcriptAppended(
            seq: 1,
            raws: <String>[messageCompleted(messageId: 'm5', text: 'a secret', seq: 1)],
          ),
        );
    });
    follow.unfollow('t-1');

    final List<Map<String, Object?>> lines = written.withOp(LogOp.transcriptFollow);
    expect(lines.map((Map<String, Object?> r) => r['msg']), <String>[
      'transcript follow sent',
      'transcript frame received',
      'transcript frame received',
      'transcript unfollow sent',
    ]);
    expect(lines.every((Map<String, Object?> r) => r['level'] == 'debug'), isTrue);
    expect(written.lines.where((String line) => line.contains('a secret')), isEmpty);
  });

  test('the frames of a followed conversation never reach a session as its events', () async {
    await ready();
    final SessionWsDataSource sessions = SessionWsDataSource(client, logger: logger);
    addTearDown(sessions.dispose);
    final List<SessionUpdate> updates = <SessionUpdate>[];
    final StreamSubscription<SessionUpdate> subscription = sessions.updates.listen(updates.add);
    addTearDown(subscription.cancel);

    socket()
      ..deliver(transcriptAppended(seq: 1))
      ..deliver(transcriptReset(seq: 2))
      ..deliver(transcriptFollowing(correlationId: 'cmd-1'));
    await settle();

    expect(updates, isEmpty);
  });

  test('after dispose, nothing more is delivered', () async {
    await ready();
    final List<FollowUpdate> seen = <FollowUpdate>[];
    follow.updates.listen(seen.add);

    await source.dispose();
    socket().deliver(transcriptReset(seq: 1));
    await settle();

    expect(seen, isEmpty);
  });
}
