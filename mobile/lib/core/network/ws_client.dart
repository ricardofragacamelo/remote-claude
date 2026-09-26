/// The WebSocket client. There is exactly one in the application.
///
/// It owns the socket: it connects, authenticates in the handshake, reconnects with an
/// exponential backoff and jitter, asks for the replay it missed, validates every frame against
/// the generated contract, and renews the credential without dropping the connection. It knows
/// nothing about widgets.
///
/// The **jitter** is not decoration. Without it, every client that went down with the server
/// comes back at the same instant and takes it down again.
///
/// What is specific to a phone: `paused` closes the socket, and that is correct — holding one in
/// the background drains the battery and the operating system kills it anyway. On `resumed` the
/// credential is revalidated **before** reconnecting, because it very probably expired while the
/// app was parked. See docs/architecture/mobile/03-state-and-data.md.
library;

import 'dart:async';
import 'dart:math';

import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/frame_socket.dart';
import 'package:remote_claude/core/network/trace.dart';

/// Where a connection stands, for the UI to show and for a test to assert on.
enum ConnectionStatus {
  /// Nothing has been opened yet.
  idle,

  /// The socket is opening, or the handshake has not been answered.
  connecting,

  /// The handshake succeeded; commands leave and events arrive.
  ready,

  /// The socket went and the backoff is being waited out.
  reconnecting,

  /// Closed, and not being retried.
  closed,
}

/// What a feature needs from the stream of one session.
///
/// A subscriber receives **everything** the session produces — its `event`s and the `request` a
/// permission is — including what another subscriber of the same session has already applied.
/// That is what lets the conversation and the permission queue watch one stream without knowing
/// about each other.
abstract interface class SessionSubscriber {
  /// One frame of the session, already validated against the envelope.
  void onEvent(Envelope frame);

  /// The buffer no longer holds what this subscriber missed: drop local state and reload.
  void onGap();

  /// The highest `seq` already applied, so a reconnect can resume from it.
  int get lastSeq;
}

/// The close code of a refused credential or device (docs/architecture/shared/05-websocket-protocol.md).
const int closeAuthenticationFailed = 4401;

/// Backoff bounds. Never a tight loop, and never longer than half a minute.
const Duration backoffMin = Duration(seconds: 1);

/// Ceiling of the exponential backoff.
const Duration backoffMax = Duration(seconds: 30);

/// How a delay is scheduled. Injected so a test drives time instead of waiting for it.
typedef Scheduler = void Function() Function(void Function() body, Duration delay);

void Function() _defaultSchedule(void Function() body, Duration delay) {
  final Timer timer = Timer(delay, body);
  return timer.cancel;
}

/// The client.
class WsClient {
  WsClient({
    required this._url,
    required this._credentials,
    required this._logger,
    required this._appVersion,
    this._installIds,
    FrameSocketFactory? connect,
    Scheduler? schedule,
    Random? random,
    TraceIds? traceIds,
  }) : _connect = connect ?? ChannelFrameSocket.connect,
       _schedule = schedule ?? _defaultSchedule,
       _random = random ?? Random(),
       _traceIds = traceIds ?? TraceIds();

  final Uri _url;
  final CredentialSource _credentials;
  final AppLogger _logger;
  final String _appVersion;
  final InstallIdSource? _installIds;
  final FrameSocketFactory _connect;
  final Scheduler _schedule;
  final Random _random;
  final TraceIds _traceIds;

  final Map<String, Set<SessionSubscriber>> _subscribers = <String, Set<SessionSubscriber>>{};
  final Set<void Function(Envelope)> _observers = <void Function(Envelope)>{};
  final StreamController<ConnectionStatus> _statuses =
      StreamController<ConnectionStatus>.broadcast();
  final StreamController<void> _rejections = StreamController<void>.broadcast();

  FrameSocket? _socket;
  StreamSubscription<String>? _inbound;
  ConnectionStatus _status = ConnectionStatus.idle;
  int _attempt = 0;
  void Function()? _cancelRetry;
  bool _wanted = false;

  /// Where the connection stands right now.
  ConnectionStatus get status => _status;

  /// Every change of [status], starting with the current one.
  ///
  /// The current value is delivered when the listener subscribes, not one microtask later: a
  /// screen that renders before the first transition would otherwise show nothing at all.
  Stream<ConnectionStatus> get statuses =>
      Stream<ConnectionStatus>.multi((MultiStreamController<ConnectionStatus> controller) {
        controller.add(_status);
        final StreamSubscription<ConnectionStatus> subscription = _statuses.stream.listen(
          controller.add,
          onDone: controller.close,
        );
        controller.onCancel = subscription.cancel;
      });

  /// Every time the server closed the socket with `4401` — the credential, or the device behind
  /// it, was refused.
  ///
  /// The socket reconnects on its own after one, and that is right for a token that expired. It
  /// is not the whole story for a phone that was **revoked** while the app was open: whoever shows
  /// what this installation may do has to ask again, or the screen keeps saying "approved" about a
  /// phone that can no longer decide anything (S-56).
  Stream<void> get rejections => _rejections.stream;

  /// Opens the connection, and keeps it open until [close].
  void connect() {
    _wanted = true;

    if (_socket != null) {
      return;
    }

    _move(ConnectionStatus.connecting);

    final FrameSocket socket = _connect(
      _url.replace(queryParameters: <String, String>{'v': '$protocolVersion'}),
    );
    _socket = socket;

    _inbound = socket.frames.listen(
      _receive,
      onError: (Object error) => _logger.warn('ws error', op: LogOp.wsConnection),
      onDone: () => _dropped(socket.closeCode ?? 1006),
      cancelOnError: false,
    );

    _handshake();
  }

  /// Closes for good. A normal closure is not retried.
  Future<void> close() async {
    _wanted = false;
    await _teardown(1000, 'client closed');
    _settleClosed();
  }

  /// Drops the socket because the app went to the background, without giving up on it.
  ///
  /// The intent to be connected survives: [resume] is what brings it back, and the subscribers
  /// stay registered so the replay knows where to start from.
  Future<void> suspend() async {
    if (!_wanted) {
      return;
    }

    _logger.info('socket suspended for the background', op: LogOp.lifecycleChanged);
    await _teardown(1000, 'app paused');
    _settleClosed();
  }

  /// Reports the closure — unless a socket was opened while the old one was closing.
  ///
  /// Closing is asynchronous and connecting is not, so a sign-out immediately followed by a
  /// sign-in opens the new socket before the old one has finished going. Reporting "closed" then
  /// would overwrite the status of the connection that is actually there.
  void _settleClosed() {
    if (_socket == null) {
      _move(ConnectionStatus.closed);
    }
  }

  /// Revalidates the credential and reconnects.
  ///
  /// The order is the point. Reconnecting first would open a socket with a token that expired
  /// while the app was parked, and the server would close it straight away.
  Future<void> resume() async {
    if (!_wanted) {
      return;
    }

    await _credentials.renew();
    _attempt = 0;
    connect();
  }

  /// Renews the credential on an open socket, without dropping it.
  bool reauthenticate(String token) =>
      command('connection.reauthenticate', <String, Object?>{'token': token});

  /// Subscribes to a session's frames. Answers the detach.
  ///
  /// **Several subscribers may watch one session**, and they do: the conversation and the
  /// permission queue are different features looking at the same stream. The socket is attached
  /// once, re-attached from the furthest-behind subscriber when a new one arrives, and detached
  /// when the **last** of them goes — a `session.detach` sent while another feature is still
  /// watching would silently stop its screen updating (S-82).
  ///
  /// The detach is not optional: without it, moving between sessions accumulates subscriptions and
  /// the screen starts receiving events for a session it no longer shows.
  void Function() attach(String sessionId, SessionSubscriber subscriber) {
    (_subscribers[sessionId] ??= <SessionSubscriber>{}).add(subscriber);

    if (_status == ConnectionStatus.ready) {
      _requestAttach(sessionId);
    }

    return () {
      final Set<SessionSubscriber>? remaining = _subscribers[sessionId];
      remaining?.remove(subscriber);

      if (remaining == null || remaining.isNotEmpty) {
        return;
      }

      _subscribers.remove(sessionId);
      if (_status == ConnectionStatus.ready) {
        command('session.detach', <String, Object?>{'sessionId': sessionId});
      }
    };
  }

  /// Watches frames that belong to no attached session. Answers the unsubscribe.
  ///
  /// A command may **open** the session it is about — the first ping of the walking skeleton
  /// does — so the event announcing it arrives before anything could have attached to it. An
  /// `error` frame belongs to no session either: it answers a command, by `correlationId`, and
  /// whoever sent that command is the one listening for it.
  void Function() observe(void Function(Envelope frame) listener) {
    _observers.add(listener);
    return () => _observers.remove(listener);
  }

  /// Sends a command. A socket that is not ready sends nothing, and says so.
  bool command(String type, Map<String, Object?> payload) => send(type, payload) != null;

  /// Sends a command and answers the `id` it left with, or `null` when nothing left.
  ///
  /// The id is what an `error` frame names in `correlationId`. A caller that has to tell *its*
  /// refusal apart from anybody else's — "that request cannot be extended again" — keeps it.
  String? send(String type, Map<String, Object?> payload) => _send('command', type, payload);

  /// Answers a `request` the server is waiting on.
  ///
  /// A `response` and not a command, because that is what it is: the server asked, and
  /// [correlationId] names the question. The one case that exists is `permission.resolve`, and
  /// the agent loop on the user's machine is stopped until it arrives.
  ///
  /// @returns whether the frame left; a socket that is not ready sends nothing
  bool respond(String type, Map<String, Object?> payload, {required String correlationId}) =>
      _send('response', type, payload, correlationId: correlationId) != null;

  String? _send(String kind, String type, Map<String, Object?> payload, {String? correlationId}) {
    final FrameSocket? socket = _socket;
    if (socket == null || _status != ConnectionStatus.ready) {
      return null;
    }

    final Envelope frame = _frame(
      type,
      payload,
      kind: kind,
      traceId: _traceIds.next(),
      correlationId: correlationId,
    );

    _logger.debug(
      'ws frame sent',
      op: LogOp.wsOutbound,
      fields: <String, Object?>{'kind': frame.kind, 'type': type},
    );

    socket.send(encodeEnvelope(frame));
    return frame.id;
  }

  /// The delay before the next attempt: exponential, capped, and jittered.
  Duration backoffFor(int attempt) {
    final int ceiling = min(
      backoffMax.inMilliseconds,
      backoffMin.inMilliseconds * (1 << max(0, attempt - 1)),
    );

    return Duration(
      milliseconds:
          backoffMin.inMilliseconds +
          (_random.nextDouble() * (ceiling - backoffMin.inMilliseconds)).round(),
    );
  }

  /// Releases everything. After this the client is not reusable.
  Future<void> dispose() async {
    await close();
    await _statuses.close();
    await _rejections.close();
  }

  Envelope _frame(
    String type,
    Map<String, Object?> payload, {
    String kind = 'command',
    String? traceId,
    String? correlationId,
  }) => Envelope(
    v: protocolVersion,
    id: _traceIds.next(),
    kind: kind,
    type: type,
    ts: DateTime.now().toUtc().toIso8601String(),
    traceId: traceId,
    correlationId: correlationId,
    payload: payload,
  );

  void _handshake() {
    final String? token = _credentials.accessToken;

    if (token == null) {
      unawaited(_teardown(1000, 'not authenticated'));
      _move(ConnectionStatus.closed);
      return;
    }

    // The installation goes in the handshake, and it is what lets a revocation close this socket
    // at once with 4401. Without it a revoked phone would keep answering permission requests
    // until its access token ran out — a revocation that revokes nothing for fifteen minutes
    // (docs/architecture/shared/08-authentication.md#token-no-websocket).
    final String? installId = _installIds?.installId;

    final Envelope frame = _frame('connection.authenticate', <String, Object?>{
      'token': token,
      'locale': _credentials.locale,
      'client': <String, Object?>{
        'kind': 'mobile',
        'version': _appVersion,
        if (installId != null && installId.isNotEmpty) 'installId': installId,
      },
    });

    // The token is the one thing that never reaches a log, not even truncated.
    _logger.debug(
      'ws frame sent',
      op: LogOp.wsOutbound,
      fields: <String, Object?>{'type': frame.type},
    );

    _socket?.send(encodeEnvelope(frame));
  }

  void _receive(String raw) {
    final Envelope? frame = decodeEnvelope(raw);

    if (frame == null) {
      _logger.warn('ws frame does not match the envelope', op: LogOp.wsInbound);
      return;
    }

    _logger.debug(
      'ws frame received',
      op: LogOp.wsInbound,
      fields: <String, Object?>{'kind': frame.kind, 'type': frame.type, 'seq': frame.seq},
    );

    if (frame.type == connectionReadyType) {
      _ready(frame);
      return;
    }

    if (frame.type == sessionAttachedType) {
      _attached(frame);
      return;
    }

    // An `event` is a fact of the conversation; a `request` is the server asking a question and
    // holding the agent loop open until somebody answers — `permission.requested` is one, and a
    // client that dropped it would never show the card. An `error` answers a command.
    if (frame.kind == 'event' || frame.kind == 'request' || frame.kind == 'error') {
      _deliver(frame);
    }
  }

  void _ready(Envelope frame) {
    _attempt = 0;

    final Object? connectionId = frame.payload?['connectionId'];
    if (connectionId is String) {
      _logger.updateContext(_logger.context.copyWith(connectionId: connectionId));
    }

    _move(ConnectionStatus.ready);

    // Whatever was being watched before the socket went is watched again, from where it left off.
    _subscribers.keys.toList(growable: false).forEach(_requestAttach);
  }

  /// Asks for the session again, resuming from the **furthest behind** of its subscribers.
  ///
  /// The furthest behind, not the furthest ahead: resuming from the latter would leave the other
  /// with a hole it has no way to notice. Re-delivering what a subscriber already applied costs
  /// nothing, because discarding `seq <= lastSeq` is the first rule of every stream state.
  void _requestAttach(String sessionId) {
    final Iterable<int> applied = (_subscribers[sessionId] ?? const <SessionSubscriber>{}).map(
      (SessionSubscriber subscriber) => subscriber.lastSeq,
    );
    final int resumeFromSeq = applied.isEmpty ? 0 : applied.reduce(min);

    command('session.attach', <String, Object?>{
      'sessionId': sessionId,
      if (resumeFromSeq > 0) 'resumeFromSeq': resumeFromSeq,
    });
  }

  void _attached(Envelope frame) {
    final Object? sessionId = frame.payload?['sessionId'];
    final Set<SessionSubscriber>? watching = sessionId is String ? _subscribers[sessionId] : null;

    if (watching != null && frame.payload?['gap'] == true) {
      _logger.warn(
        'replay gap — reloading the transcript',
        op: LogOp.wsConnection,
        fields: <String, Object?>{'sessionId': sessionId},
      );

      for (final SessionSubscriber subscriber in watching.toList(growable: false)) {
        subscriber.onGap();
      }
    }
  }

  void _deliver(Envelope frame) {
    final String? sessionId = frame.sessionId;
    final Set<SessionSubscriber>? watching = sessionId == null ? null : _subscribers[sessionId];

    if (watching != null) {
      for (final SessionSubscriber subscriber in watching.toList(growable: false)) {
        subscriber.onEvent(frame);
      }
      return;
    }

    for (final void Function(Envelope) observer in _observers.toList(growable: false)) {
      observer(frame);
    }
  }

  void _dropped(int code) {
    _socket = null;
    _inbound = null;

    if (code == closeAuthenticationFailed && !_rejections.isClosed) {
      _rejections.add(null);
    }

    if (!_wanted || code == 1000) {
      _move(ConnectionStatus.closed);
      return;
    }

    _attempt += 1;
    final Duration delay = backoffFor(_attempt);
    _move(ConnectionStatus.reconnecting);

    _logger.warn(
      'ws reconnecting',
      op: LogOp.wsConnection,
      fields: <String, Object?>{
        'closeCode': code,
        'attempt': _attempt,
        'delayMs': delay.inMilliseconds,
      },
    );

    _cancelRetry = _schedule(() {
      _cancelRetry = null;
      connect();
    }, delay);
  }

  Future<void> _teardown(int code, String reason) async {
    _cancelRetry?.call();
    _cancelRetry = null;

    final FrameSocket? socket = _socket;
    final StreamSubscription<String>? inbound = _inbound;
    _socket = null;
    _inbound = null;

    await inbound?.cancel();
    await socket?.close(code, reason);
  }

  void _move(ConnectionStatus status) {
    if (_status == status || _statuses.isClosed) {
      return;
    }

    _status = status;
    _statuses.add(status);
  }
}
