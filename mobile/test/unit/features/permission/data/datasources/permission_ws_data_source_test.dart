/// The permission edge of the socket, over a real client and a socket the test drives.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_ws_data_source.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/fake_frame_socket.dart';
import '../../../../../support/fakes/recording_writer.dart';

/// Holds every delay forever: no test here reconnects, so nothing scheduled should ever run.
class _ManualScheduler {
  void Function() schedule(void Function() body, Duration delay) => () {};
}

Map<String, Object?> decode(String raw) => jsonDecode(raw)! as Map<String, Object?>;

void main() {
  late List<FakeFrameSocket> opened;
  late WsClient client;
  late List<PermissionEvent> seen;
  late List<SocketPermissionFeed> feeds;

  setUp(() {
    opened = <FakeFrameSocket>[];
    seen = <PermissionEvent>[];
    feeds = <SocketPermissionFeed>[];

    client = WsClient(
      url: Uri.parse('ws://localhost:3000/ws'),
      credentials: FakeCredentials(),
      logger: AppLogger(
        context: const LogContext(appVersion: '0.0.1', platform: 'android'),
        writer: RecordingWriter().writer,
      ),
      appVersion: '0.0.1',
      connect: (Uri url) {
        final FakeFrameSocket socket = FakeFrameSocket();
        opened.add(socket);
        return socket;
      },
      schedule: _ManualScheduler().schedule,
      random: Random(7),
      traceIds: TraceIds(random: Random(7)),
    );
  });

  tearDown(() async {
    for (final SocketPermissionFeed feed in feeds) {
      feed.close();
    }
    await client.dispose();
  });

  FakeFrameSocket socket() => opened.last;

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> connectAndHandshake() async {
    client.connect();
    await settle();
    socket().deliver(connectionReady());
    await settle();
  }

  SocketPermissionFeed watch([String sessionId = 'session-1']) {
    final SocketPermissionFeed feed = SocketPermissionFeed(client, sessionId);
    feeds.add(feed);
    feed.events.listen(seen.add);
    return feed;
  }

  List<Map<String, Object?>> sentOfType(String type) => socket().sent
      .map(decode)
      .where((Map<String, Object?> frame) => frame['type'] == type)
      .toList(growable: false);

  Future<void> deliver(String raw) async {
    socket().deliver(raw);
    await settle();
  }

  group('subscription', () {
    test('attaches the session once the socket is ready', () async {
      watch();
      client.connect();
      await settle();

      expect(sentOfType('session.attach'), isEmpty);

      socket().deliver(connectionReady());
      await settle();

      final Map<String, Object?> attach = sentOfType('session.attach').single;
      expect(attach['payload'], <String, Object?>{'sessionId': 'session-1'});
    });

    test('attaches at once when the socket is already ready', () async {
      await connectAndHandshake();
      watch();

      expect(sentOfType('session.attach'), hasLength(1));
    });

    // A question carries no seq, so the feed has no position of its own to resume from.
    test('always resumes from the beginning of the buffer', () {
      expect(watch().lastSeq, 0);
    });
  });

  group('frames in', () {
    test('a question for the session becomes PermissionAsked carrying the frame id', () async {
      await connectAndHandshake();
      watch();

      await deliver(permissionRequested(id: 'req-frame-7'));

      expect(seen, hasLength(1));
      final PermissionAsked asked = seen.single as PermissionAsked;
      expect(asked.frameId, 'req-frame-7');
      expect(asked.request.requestId, 'req-1');
      expect(asked.request.sessionId, 'session-1');
    });

    test('a settlement becomes PermissionSettled', () async {
      await connectAndHandshake();
      watch();

      await deliver(
        frame(
          kind: 'event',
          type: 'permission.resolved',
          sessionId: 'session-1',
          seq: 3,
          payload: <String, Object?>{'requestId': 'req-1', 'decision': 'deny', 'auto': true},
        ),
      );

      // Automatic, refused, and with no author: the deadline's refusal.
      expect(seen, <PermissionEvent>[const PermissionSettled(PermissionOutcome.expired('req-1'))]);
    });

    test('a moved deadline becomes PermissionDeadlineMoved', () async {
      await connectAndHandshake();
      watch();

      await deliver(
        frame(
          kind: 'event',
          type: 'permission.extended',
          sessionId: 'session-1',
          seq: 4,
          payload: <String, Object?>{
            'requestId': 'req-1',
            'expiresAt': '2026-09-14T12:10:00.000Z',
            'remainingExtensions': 1,
          },
        ),
      );

      expect(seen, <PermissionEvent>[
        PermissionDeadlineMoved(
          requestId: 'req-1',
          expiresAt: DateTime.utc(2026, 9, 14, 12, 10),
          remainingExtensions: 1,
        ),
      ]);
    });

    test('an event that is not about permissions emits nothing', () async {
      await connectAndHandshake();
      watch();

      await deliver(messageDelta(messageId: 'm-1', delta: 'hi', seq: 1));

      expect(seen, isEmpty);
    });

    test('a question for another session is not this feed', () async {
      await connectAndHandshake();
      watch();

      await deliver(permissionRequested(sessionId: 'session-2'));

      expect(seen, isEmpty);
    });

    test('a replay gap resets the feed', () async {
      await connectAndHandshake();
      watch();

      await deliver(sessionAttached(sessionId: 'session-1', gap: true));

      expect(seen, <PermissionEvent>[const PermissionFeedReset()]);
    });
  });

  group('answer', () {
    test('sends a response naming the question, without a reason when none is given', () async {
      await connectAndHandshake();

      final bool left = watch().answer(
        frameId: 'req-frame-1',
        requestId: 'req-1',
        decision: PermissionDecision.allow,
        scope: PermissionScope.session,
      );

      final Map<String, Object?> sent = sentOfType('permission.resolve').single;
      expect(left, isTrue);
      expect(sent['kind'], 'response');
      expect(sent['correlationId'], 'req-frame-1');
      expect(sent['payload'], <String, Object?>{
        'requestId': 'req-1',
        'decision': 'allow',
        'scope': 'session',
      });
    });

    test('carries the reason when one is given', () async {
      await connectAndHandshake();

      watch().answer(
        frameId: 'req-frame-1',
        requestId: 'req-1',
        decision: PermissionDecision.deny,
        scope: PermissionScope.once,
        reason: 'not now',
      );

      expect(sentOfType('permission.resolve').single['payload'], <String, Object?>{
        'requestId': 'req-1',
        'decision': 'deny',
        'scope': 'once',
        'reason': 'not now',
      });
    });

    test('says so when the socket is not ready, and sends nothing', () {
      final bool left = watch().answer(
        frameId: 'req-frame-1',
        requestId: 'req-1',
        decision: PermissionDecision.allow,
        scope: PermissionScope.once,
      );

      expect(left, isFalse);
      expect(opened, isEmpty);
    });
  });

  group('extend', () {
    Future<String> extendOnce(SocketPermissionFeed feed) async {
      expect(feed.extend('req-1'), isTrue);
      final Map<String, Object?> sent = sentOfType('permission.extend').last;
      expect(sent['kind'], 'command');
      expect(sent['payload'], <String, Object?>{'requestId': 'req-1'});
      return sent['id']! as String;
    }

    test('sends permission.extend for the request', () async {
      await connectAndHandshake();

      await extendOnce(watch());

      expect(sentOfType('permission.extend'), hasLength(1));
    });

    test('a refusal at the ceiling becomes PermissionExtensionRefused(ceiling)', () async {
      await connectAndHandshake();
      final String id = await extendOnce(watch());

      await deliver(
        commandError(
          correlationId: id,
          code: 'INVALID_STATE',
          messageKey: 'permission.error.extensionLimitReached',
        ),
      );

      expect(seen, <PermissionEvent>[
        const PermissionExtensionRefused(requestId: 'req-1', refusal: ExtensionRefusal.ceiling),
      ]);
    });

    test('S-66 a request already over becomes PermissionExtensionRefused(over)', () async {
      await connectAndHandshake();
      final String id = await extendOnce(watch());

      await deliver(commandError(correlationId: id, code: 'PERMISSION_REQUEST_NOT_FOUND'));

      expect(seen, <PermissionEvent>[
        const PermissionExtensionRefused(requestId: 'req-1', refusal: ExtensionRefusal.over),
      ]);
    });

    test("another command's refusal is not this feed's", () async {
      await connectAndHandshake();
      await extendOnce(watch());

      await deliver(
        commandError(
          correlationId: 'someone-else',
          messageKey: 'permission.error.extensionLimitReached',
        ),
      );

      expect(seen, isEmpty);
    });

    test('an error with no correlation id is nobody here', () async {
      await connectAndHandshake();
      await extendOnce(watch());

      await deliver(
        commandError(correlationId: null, messageKey: 'permission.error.extensionLimitReached'),
      );

      expect(seen, isEmpty);
    });

    test('an error for our command about something else emits nothing', () async {
      await connectAndHandshake();
      final String id = await extendOnce(watch());

      await deliver(commandError(correlationId: id));

      expect(seen, isEmpty);
    });

    test('the command id is consumed by the first error that names it', () async {
      await connectAndHandshake();
      final String id = await extendOnce(watch());

      await deliver(commandError(correlationId: id, code: 'PERMISSION_REQUEST_EXPIRED'));
      await deliver(
        commandError(
          correlationId: id,
          id: 'err-2',
          messageKey: 'permission.error.extensionLimitReached',
        ),
      );

      expect(seen, <PermissionEvent>[
        const PermissionExtensionRefused(requestId: 'req-1', refusal: ExtensionRefusal.over),
      ]);
    });

    test('a frame naming our command that is not an error emits nothing', () async {
      await connectAndHandshake();
      final String id = await extendOnce(watch());

      // A question of a session nobody attached reaches the observers, as an error does.
      await deliver(
        jsonEncode(<String, Object?>{
          ...decode(permissionRequested(sessionId: 'session-9')),
          'correlationId': id,
        }),
      );

      expect(seen, isEmpty);
    });

    test('says so when the socket is not ready, and sends nothing', () {
      expect(watch().extend('req-1'), isFalse);
      expect(opened, isEmpty);
    });
  });

  group('close', () {
    test('detaches the session when it was the only subscriber', () async {
      await connectAndHandshake();
      final SocketPermissionFeed feed = watch();

      feed.close();

      expect(sentOfType('session.detach').single['payload'], <String, Object?>{
        'sessionId': 'session-1',
      });
    });

    test('ends the stream of events', () async {
      final SocketPermissionFeed feed = SocketPermissionFeed(client, 'session-1');
      final Future<void> done = feed.events.drain<void>();

      feed.close();

      await expectLater(done, completes);
    });

    test('emits nothing after it, whatever arrives', () async {
      await connectAndHandshake();
      final SocketPermissionFeed feed = watch();
      feed.extend('req-1');
      final String id = sentOfType('permission.extend').single['id']! as String;

      feed.close();
      await deliver(permissionRequested());
      await deliver(commandError(correlationId: id, code: 'PERMISSION_REQUEST_EXPIRED'));
      feed
        ..onEvent(decodeEnvelope(permissionRequested())!)
        ..onGap();
      await settle();

      expect(seen, isEmpty);
    });
  });
}
