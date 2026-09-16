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
abstract interface class SessionSubscriber {
  /// One event, already validated against the envelope.
  void onEvent(Envelope frame);

  /// The buffer no longer holds what this subscriber missed: drop local state and reload.
  void onGap();

  /// The highest `seq` already applied, so a reconnect can resume from it.
  int get lastSeq;
}

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
  final FrameSocketFactory _connect;
  final Scheduler _schedule;
  final Random _random;
  final TraceIds _traceIds;

  final Map<String, SessionSubscriber> _subscribers = <String, SessionSubscriber>{};
  final Set<void Function(Envelope)> _observers = <void Function(Envelope)>{};
  final StreamController<ConnectionStatus> _statuses =
      StreamController<ConnectionStatus>.broadcast();

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
    _move(ConnectionStatus.closed);
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
    _move(ConnectionStatus.closed);
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

  /// Subscribes to a session's events. Answers the detach.
  ///
  /// The detach is not optional: without it, moving between sessions accumulates subscriptions
  /// and the screen starts receiving events for a session it no longer shows.
  void Function() attach(String sessionId, SessionSubscriber subscriber) {
    _subscribers[sessionId] = subscriber;

    if (_status == ConnectionStatus.ready) {
      _requestAttach(sessionId, subscriber);
    }

    return () {
      _subscribers.remove(sessionId);
      if (_status == ConnectionStatus.ready) {
        command('session.detach', <String, Object?>{'sessionId': sessionId});
      }
    };
  }

  /// Watches events that belong to no attached session. Answers the unsubscribe.
  ///
  /// A command may **open** the session it is about — the first ping of the walking skeleton
  /// does — so the event announcing it arrives before anything could have attached to it.
  void Function() observe(void Function(Envelope frame) listener) {
    _observers.add(listener);
    return () => _observers.remove(listener);
  }

  /// Sends a command. A socket that is not ready sends nothing, and says so.
  bool command(String type, Map<String, Object?> payload) {
    final FrameSocket? socket = _socket;
    if (socket == null || _status != ConnectionStatus.ready) {
      return false;
    }

    final Envelope frame = _frame(type, payload, traceId: _traceIds.next());

    _logger.debug(
      'ws frame sent',
      op: LogOp.wsOutbound,
      fields: <String, Object?>{'kind': frame.kind, 'type': type},
    );

    socket.send(encodeEnvelope(frame));
    return true;
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
  }

  Envelope _frame(String type, Map<String, Object?> payload, {String? traceId}) => Envelope(
    v: protocolVersion,
    id: _traceIds.next(),
    kind: 'command',
    type: type,
    ts: DateTime.now().toUtc().toIso8601String(),
    traceId: traceId,
    payload: payload,
  );

  void _handshake() {
    final String? token = _credentials.accessToken;

    if (token == null) {
      unawaited(_teardown(1000, 'not authenticated'));
      _move(ConnectionStatus.closed);
      return;
    }

    final Envelope frame = _frame('connection.authenticate', <String, Object?>{
      'token': token,
      'locale': _credentials.locale,
      'client': <String, Object?>{'kind': 'mobile', 'version': _appVersion},
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

    if (frame.kind == 'event') {
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
    _subscribers.forEach(_requestAttach);
  }

  void _requestAttach(String sessionId, SessionSubscriber subscriber) {
    final int resumeFromSeq = subscriber.lastSeq;

    command('session.attach', <String, Object?>{
      'sessionId': sessionId,
      if (resumeFromSeq > 0) 'resumeFromSeq': resumeFromSeq,
    });
  }

  void _attached(Envelope frame) {
    final Object? sessionId = frame.payload?['sessionId'];
    final SessionSubscriber? subscriber = sessionId is String ? _subscribers[sessionId] : null;

    if (subscriber != null && frame.payload?['gap'] == true) {
      _logger.warn(
        'replay gap — reloading the transcript',
        op: LogOp.wsConnection,
        fields: <String, Object?>{'sessionId': sessionId},
      );
      subscriber.onGap();
    }
  }

  void _deliver(Envelope frame) {
    final String? sessionId = frame.sessionId;
    final SessionSubscriber? subscriber = sessionId == null ? null : _subscribers[sessionId];

    if (subscriber != null) {
      subscriber.onEvent(frame);
      return;
    }

    for (final void Function(Envelope) observer in _observers.toList(growable: false)) {
      observer(frame);
    }
  }

  void _dropped(int code) {
    _socket = null;
    _inbound = null;

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
