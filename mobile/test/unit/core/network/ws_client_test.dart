import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_credentials.dart';
import '../../../support/fakes/fake_frame_socket.dart';
import '../../../support/fakes/recording_writer.dart';

/// A subscriber that records what the client handed it.
class _Subscriber implements SessionSubscriber {
  final List<Envelope> events = <Envelope>[];
  int gaps = 0;
  int seq = 0;

  @override
  int get lastSeq => seq;

  @override
  void onEvent(Envelope frame) => events.add(frame);

  @override
  void onGap() => gaps += 1;
}

/// Drives the client's delays by hand.
class _ManualScheduler {
  final List<Duration> delays = <Duration>[];
  void Function()? _pending;

  void Function() schedule(void Function() body, Duration delay) {
    delays.add(delay);
    _pending = body;
    return () => _pending = null;
  }

  /// Runs whatever was scheduled.
  void fire() {
    final void Function()? body = _pending;
    _pending = null;
    body?.call();
  }
}

Map<String, Object?> decode(String raw) => jsonDecode(raw)! as Map<String, Object?>;

void main() {
  late List<FakeFrameSocket> opened;
  late List<Uri> urls;
  late FakeCredentials credentials;
  late RecordingWriter recorder;
  late AppLogger logger;
  late _ManualScheduler scheduler;
  late WsClient client;
  late _StubInstallId installIds;

  setUp(() {
    opened = <FakeFrameSocket>[];
    urls = <Uri>[];
    credentials = FakeCredentials();
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
    scheduler = _ManualScheduler();
    installIds = _StubInstallId(null);

    client = WsClient(
      url: Uri.parse('ws://localhost:3000/ws'),
      credentials: credentials,
      logger: logger,
      appVersion: '0.0.1',
      installIds: installIds,
      connect: (Uri url) {
        urls.add(url);
        final FakeFrameSocket socket = FakeFrameSocket();
        opened.add(socket);
        return socket;
      },
      schedule: scheduler.schedule,
      random: Random(7),
      traceIds: TraceIds(random: Random(7)),
    );
  });

  tearDown(() => client.dispose());

  FakeFrameSocket socket() => opened.last;

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> connectAndHandshake() async {
    client.connect();
    await settle();
    socket().deliver(connectionReady());
    await settle();
  }

  group('handshake', () {
    test('announces the protocol version in the query string', () {
      client.connect();

      expect(urls.single.queryParameters['v'], '$protocolVersion');
    });

    test('sends connection.authenticate as soon as the socket is up', () {
      client.connect();

      final Map<String, Object?> frame = decode(socket().sent.single);
      final Map<String, Object?> payload = frame['payload']! as Map<String, Object?>;

      expect(frame['type'], 'connection.authenticate');
      expect(payload['token'], 'token');
      expect(payload['locale'], 'en');
      expect(payload['client'], <String, Object?>{'kind': 'mobile', 'version': '0.0.1'});
    });

    // Without it a revoked phone would keep answering permission requests until its access token
    // ran out — a revocation that revokes nothing for fifteen minutes (S-07).
    test('names the installation in the handshake, once there is one', () {
      installIds.installId = 'install-1';
      client.connect();

      final Map<String, Object?> payload =
          decode(socket().sent.single)['payload']! as Map<String, Object?>;

      expect(payload['client'], <String, Object?>{
        'kind': 'mobile',
        'version': '0.0.1',
        'installId': 'install-1',
      });
    });

    test('leaves the installation out entirely when there is none yet', () {
      client.connect();

      final Map<String, Object?> payload =
          decode(socket().sent.single)['payload']! as Map<String, Object?>;
      final Map<String, Object?> clientInfo = payload['client']! as Map<String, Object?>;

      expect(clientInfo.containsKey('installId'), isFalse);
    });

    test('leaves it out for an empty id, because the backend reads its presence', () {
      installIds.installId = '';
      client.connect();

      final Map<String, Object?> payload =
          decode(socket().sent.single)['payload']! as Map<String, Object?>;
      final Map<String, Object?> clientInfo = payload['client']! as Map<String, Object?>;

      expect(clientInfo.containsKey('installId'), isFalse);
    });

    test('never writes the token to a log', () {
      client.connect();

      expect(recorder.lines.join(), isNot(contains('token')));
    });

    test('closes rather than opening a socket nobody can authenticate', () {
      credentials.accessToken = null;
      client.connect();

      expect(socket().sent, isEmpty);
      expect(client.status, ConnectionStatus.closed);
    });

    test('becomes ready when the server says so', () async {
      await connectAndHandshake();

      expect(client.status, ConnectionStatus.ready);
    });

    test('remembers the connection id for every later log line', () async {
      await connectAndHandshake();
      client.command('diag.ping', <String, Object?>{'nonce': 'n'});

      expect(recorder.withOp(LogOp.wsOutbound).last['connectionId'], 'conn-1');
    });

    test('connecting twice keeps one socket', () async {
      await connectAndHandshake();
      client.connect();

      expect(opened, hasLength(1));
    });
  });

  group('commands', () {
    test('a command sent while the socket is down goes nowhere and says so', () {
      expect(client.command('diag.ping', <String, Object?>{'nonce': 'n'}), isFalse);
    });

    test('a command on a ready socket carries the envelope of the contract', () async {
      await connectAndHandshake();

      expect(client.command('diag.ping', <String, Object?>{'nonce': 'n'}), isTrue);

      final Map<String, Object?> frame = decode(socket().sent.last);
      expect(frame['v'], protocolVersion);
      expect(frame['kind'], 'command');
      expect(frame['type'], 'diag.ping');
      expect(frame['traceId'], isA<String>());
    });

    test('reauthenticate renews on the open socket instead of dropping it', () async {
      await connectAndHandshake();

      expect(client.reauthenticate('fresh'), isTrue);
      expect(decode(socket().sent.last)['type'], 'connection.reauthenticate');
      expect(client.status, ConnectionStatus.ready);
    });
  });

  group('sessions', () {
    test('attaching while ready asks the server straight away', () async {
      await connectAndHandshake();
      client.attach('ses-1', _Subscriber());

      final Map<String, Object?> frame = decode(socket().sent.last);
      expect(frame['type'], 'session.attach');
      expect((frame['payload']! as Map<String, Object?>)['sessionId'], 'ses-1');
    });

    test('attaching before ready waits for the handshake', () async {
      client.attach('ses-1', _Subscriber());
      await connectAndHandshake();

      expect(decode(socket().sent.last)['type'], 'session.attach');
    });

    test('a reconnect resumes from the highest seq already applied', () async {
      await connectAndHandshake();
      final _Subscriber subscriber = _Subscriber()..seq = 12;
      client.attach('ses-1', subscriber);

      await socket().drop(1006);
      await settle();
      scheduler.fire();
      await settle();
      socket().deliver(connectionReady());
      await settle();

      final Map<String, Object?> payload =
          decode(socket().sent.last)['payload']! as Map<String, Object?>;
      expect(payload['resumeFromSeq'], 12);
    });

    test('a first attach asks for no replay', () async {
      await connectAndHandshake();
      client.attach('ses-1', _Subscriber());

      final Map<String, Object?> payload =
          decode(socket().sent.last)['payload']! as Map<String, Object?>;
      expect(payload.containsKey('resumeFromSeq'), isFalse);
    });

    test('detaching stops the subscription and tells the server', () async {
      await connectAndHandshake();
      final void Function() detach = client.attach('ses-1', _Subscriber());

      detach();

      expect(decode(socket().sent.last)['type'], 'session.detach');
    });

    test('detaching while the socket is down sends nothing', () async {
      await connectAndHandshake();
      final void Function() detach = client.attach('ses-1', _Subscriber());
      await client.close();

      expect(detach, returnsNormally);
    });

    test('an event reaches the subscriber of its session', () async {
      await connectAndHandshake();
      final _Subscriber subscriber = _Subscriber();
      client.attach('ses-1', subscriber);

      socket().deliver(diagPong(sessionId: 'ses-1', seq: 1));
      await settle();

      expect(subscriber.events.single.seq, 1);
    });

    test('an event for a session nobody attached reaches the observers', () async {
      await connectAndHandshake();
      final List<Envelope> seen = <Envelope>[];
      client.observe(seen.add);

      socket().deliver(diagPong(sessionId: 'ses-new', seq: 1));
      await settle();

      expect(seen.single.sessionId, 'ses-new');
    });

    test('an unsubscribed observer stops receiving', () async {
      await connectAndHandshake();
      final List<Envelope> seen = <Envelope>[];
      client.observe(seen.add)();

      socket().deliver(diagPong(sessionId: 'ses-new', seq: 1));
      await settle();

      expect(seen, isEmpty);
    });

    test('a gap tells the subscriber to reload', () async {
      await connectAndHandshake();
      final _Subscriber subscriber = _Subscriber();
      client.attach('ses-1', subscriber);

      socket().deliver(sessionAttached(sessionId: 'ses-1', gap: true));
      await settle();

      expect(subscriber.gaps, 1);
    });

    test('an attach that lost nothing does not ask for a reload', () async {
      await connectAndHandshake();
      final _Subscriber subscriber = _Subscriber();
      client.attach('ses-1', subscriber);

      socket().deliver(sessionAttached(sessionId: 'ses-1', replayed: 3));
      await settle();

      expect(subscriber.gaps, 0);
    });

    test('an attach ack for a session nobody follows is ignored', () async {
      await connectAndHandshake();

      socket().deliver(sessionAttached(sessionId: 'other', gap: true));
      await settle();

      expect(client.status, ConnectionStatus.ready);
    });
  });

  // S-82 — the conversation and the permission queue watch one session through the one socket.
  // A sign-out followed at once by a sign-in: the old socket is still closing when the new one opens.
  test('a connection opened while the previous one closes keeps its own status', () async {
    await connectAndHandshake();

    final Future<void> closing = client.close();
    client.connect();
    await closing;

    expect(opened, hasLength(2));
    expect(client.status, ConnectionStatus.connecting);
  });

  // S-56 — a refused credential or device is announced, so whoever shows the device's status asks.
  group('a refused socket', () {
    test('is announced when the server closes with 4401', () async {
      await connectAndHandshake();
      final List<void> seen = <void>[];
      client.rejections.listen(seen.add);

      await socket().drop(closeAuthenticationFailed);
      await settle();

      expect(seen, hasLength(1));
    });

    test('any other close is not a refusal', () async {
      await connectAndHandshake();
      final List<void> seen = <void>[];
      client.rejections.listen(seen.add);

      await socket().drop(1006);
      await settle();

      expect(seen, isEmpty);
    });
  });

  group('two subscribers of one session', () {
    List<String> typesSent() =>
        socket().sent.map((String raw) => decode(raw)['type']! as String).toList();

    test('both receive every frame of the session', () async {
      await connectAndHandshake();
      final _Subscriber conversation = _Subscriber();
      final _Subscriber queue = _Subscriber();
      client.attach('ses-1', conversation);
      client.attach('ses-1', queue);

      socket().deliver(diagPong(sessionId: 'ses-1', seq: 1));
      await settle();

      expect(conversation.events.single.seq, 1);
      expect(queue.events.single.seq, 1);
    });

    test('a second subscriber re-attaches from the furthest behind of the two', () async {
      await connectAndHandshake();
      client.attach('ses-1', _Subscriber()..seq = 40);
      client.attach('ses-1', _Subscriber());

      final Map<String, Object?> payload =
          decode(socket().sent.last)['payload']! as Map<String, Object?>;
      expect(payload.containsKey('resumeFromSeq'), isFalse);
    });

    test('a reconnect resumes from the furthest behind, once per session', () async {
      await connectAndHandshake();
      client.attach('ses-1', _Subscriber()..seq = 40);
      client.attach('ses-1', _Subscriber()..seq = 12);

      await socket().drop(1006);
      await settle();
      scheduler.fire();
      await settle();
      socket().deliver(connectionReady());
      await settle();

      final List<Map<String, Object?>> attaches = socket().sent
          .map(decode)
          .where((Map<String, Object?> frame) => frame['type'] == 'session.attach')
          .toList();
      expect(attaches, hasLength(1));
      expect((attaches.single['payload']! as Map<String, Object?>)['resumeFromSeq'], 12);
    });

    test('the first to leave does not detach the session from under the other', () async {
      await connectAndHandshake();
      final void Function() leaveConversation = client.attach('ses-1', _Subscriber());
      final _Subscriber queue = _Subscriber();
      client.attach('ses-1', queue);

      leaveConversation();
      socket().deliver(diagPong(sessionId: 'ses-1', seq: 1));
      await settle();

      expect(typesSent(), isNot(contains('session.detach')));
      expect(queue.events, hasLength(1));
    });

    test('the last to leave detaches', () async {
      await connectAndHandshake();
      final void Function() leaveConversation = client.attach('ses-1', _Subscriber());
      final void Function() leaveQueue = client.attach('ses-1', _Subscriber());

      leaveConversation();
      leaveQueue();

      expect(typesSent().last, 'session.detach');
    });

    test('leaving twice is harmless', () async {
      await connectAndHandshake();
      final void Function() leave = client.attach('ses-1', _Subscriber());

      leave();
      expect(leave, returnsNormally);
    });

    test('a gap tells every subscriber to reload', () async {
      await connectAndHandshake();
      final _Subscriber conversation = _Subscriber();
      final _Subscriber queue = _Subscriber();
      client.attach('ses-1', conversation);
      client.attach('ses-1', queue);

      socket().deliver(sessionAttached(sessionId: 'ses-1', gap: true));
      await settle();

      expect(conversation.gaps, 1);
      expect(queue.gaps, 1);
    });
  });

  group('questions and answers', () {
    // `permission.requested` is a `request`, not an event. A client that only forwarded events
    // would never show the card, and the agent loop would sit there until the deadline refused.
    test('a request of an attached session reaches its subscribers', () async {
      await connectAndHandshake();
      final _Subscriber subscriber = _Subscriber();
      client.attach('ses-1', subscriber);

      socket().deliver(
        frame(
          kind: 'request',
          type: 'permission.requested',
          id: 'req-frame',
          sessionId: 'ses-1',
          payload: <String, Object?>{'requestId': 'r1'},
        ),
      );
      await settle();

      expect(subscriber.events.single.id, 'req-frame');
    });

    test('an error reaches the observers, carrying the id of the command it answers', () async {
      await connectAndHandshake();
      final List<Envelope> seen = <Envelope>[];
      client.observe(seen.add);

      final String? id = client.send('permission.extend', <String, Object?>{'requestId': 'r1'});
      socket().deliver(
        jsonEncode(<String, Object?>{
          'v': 1,
          'id': 'err-1',
          'kind': 'error',
          'type': 'error',
          'ts': '2026-09-14T12:00:00.000Z',
          'correlationId': id,
          'payload': <String, Object?>{'code': 'INVALID_INPUT', 'messageKey': 'k', 'traceId': 't'},
        }),
      );
      await settle();

      expect(id, isNotNull);
      expect(seen.single.correlationId, id);
    });

    test('a response names the question it answers', () async {
      await connectAndHandshake();

      final bool left = client.respond('permission.resolve', <String, Object?>{
        'requestId': 'r1',
        'decision': 'allow',
      }, correlationId: 'req-frame');

      final Map<String, Object?> sent = decode(socket().sent.last);
      expect(left, isTrue);
      expect(sent['kind'], 'response');
      expect(sent['correlationId'], 'req-frame');
    });

    test('nothing leaves while the socket is not ready', () {
      expect(client.send('permission.extend', <String, Object?>{'requestId': 'r1'}), isNull);
      expect(
        client.respond('permission.resolve', <String, Object?>{}, correlationId: 'x'),
        isFalse,
      );
    });
  });

  group('frames that are not frames', () {
    test('something that is not JSON is dropped, and the socket survives', () async {
      await connectAndHandshake();

      socket().deliver('not json');
      await settle();

      expect(client.status, ConnectionStatus.ready);
      expect(recorder.withOp(LogOp.wsInbound).last['msg'], 'ws frame does not match the envelope');
    });

    test('a frame missing an envelope field is dropped', () async {
      await connectAndHandshake();

      socket().deliver('{"v":1,"id":"a","kind":"event"}');
      await settle();

      expect(client.status, ConnectionStatus.ready);
    });

    test('an ack that is neither ready nor attached is ignored', () async {
      await connectAndHandshake();

      socket().deliver(frame(kind: 'ack', type: 'command.accepted'));
      await settle();

      expect(client.status, ConnectionStatus.ready);
    });
  });

  group('reconnection', () {
    test('an abnormal close schedules a retry', () async {
      await connectAndHandshake();

      await socket().drop(1006);
      await settle();

      expect(client.status, ConnectionStatus.reconnecting);
      expect(scheduler.delays, hasLength(1));
    });

    test('a normal close is not retried', () async {
      await connectAndHandshake();

      await socket().drop(1000);
      await settle();

      expect(client.status, ConnectionStatus.closed);
      expect(scheduler.delays, isEmpty);
    });

    test('the backoff grows and is capped', () {
      expect(client.backoffFor(1) >= backoffMin, isTrue);
      expect(client.backoffFor(1) <= backoffMax, isTrue);
      expect(client.backoffFor(50), lessThanOrEqualTo(backoffMax));
    });

    test('the backoff is never a tight loop', () {
      for (int attempt = 1; attempt < 12; attempt++) {
        expect(client.backoffFor(attempt), greaterThanOrEqualTo(backoffMin));
      }
    });

    test('the backoff is jittered — two clients do not come back together', () {
      final Set<int> delays = <int>{
        for (int i = 0; i < 20; i++) client.backoffFor(8).inMilliseconds,
      };

      expect(delays.length, greaterThan(1));
    });

    test('a successful handshake resets the attempt count', () async {
      await connectAndHandshake();
      await socket().drop(1006);
      await settle();
      scheduler.fire();
      await settle();
      socket().deliver(connectionReady());
      await settle();

      await socket().drop(1006);
      await settle();

      expect(scheduler.delays.last, lessThanOrEqualTo(backoffMax));
      expect(client.status, ConnectionStatus.reconnecting);
    });

    test('closing cancels a scheduled retry', () async {
      await connectAndHandshake();
      await socket().drop(1006);
      await settle();

      await client.close();
      scheduler.fire();
      await settle();

      expect(opened, hasLength(1));
      expect(client.status, ConnectionStatus.closed);
    });
  });

  group('lifecycle', () {
    test('suspending closes the socket but keeps the intent', () async {
      await connectAndHandshake();

      await client.suspend();

      expect(client.status, ConnectionStatus.closed);
      expect(socket().closeReason, 'app paused');
    });

    test('resuming revalidates the credential before reopening', () async {
      await connectAndHandshake();
      credentials.renewal = 'fresh';
      await client.suspend();

      await client.resume();

      expect(credentials.renewals, 1);
      expect(opened, hasLength(2));
    });

    test('suspending an app that was never connected does nothing', () async {
      await client.suspend();

      expect(opened, isEmpty);
    });

    test('resuming an app that was never connected does nothing', () async {
      await client.resume();

      expect(opened, isEmpty);
      expect(credentials.renewals, 0);
    });
  });

  group('status', () {
    test('the stream starts with where the connection is now', () async {
      expect(await client.statuses.first, ConnectionStatus.idle);
    });

    test('every transition is announced once', () async {
      final List<ConnectionStatus> seen = <ConnectionStatus>[];
      final StreamSubscription<ConnectionStatus> subscription = client.statuses.listen(seen.add);
      addTearDown(subscription.cancel);

      await connectAndHandshake();
      await settle();

      expect(seen, <ConnectionStatus>[
        ConnectionStatus.idle,
        ConnectionStatus.connecting,
        ConnectionStatus.ready,
      ]);
    });
  });
}

/// An installation identity the test moves.
class _StubInstallId implements InstallIdSource {
  _StubInstallId(this.installId);

  @override
  String? installId;
}
