/// The session's edge of the socket.
///
/// It turns frames into updates and commands into frames, and nothing else: the socket itself,
/// its handshake and its reconnection belong to [WsClient], which is `core/`.
library;

import 'dart:async';

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/data/mappers/pong_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';

/// Reads and writes the session's frames.
class SessionWsDataSource implements SessionSubscriber {
  SessionWsDataSource(this._client) {
    // The very first ping opens the session, so its pong arrives before anything could have
    // attached to it. Observing is what catches that one.
    _cancelObserve = _client.observe(_onFrame);
  }

  final WsClient _client;
  final StreamController<SessionUpdate> _updates = StreamController<SessionUpdate>.broadcast();

  late final void Function() _cancelObserve;
  void Function()? _detach;
  int Function() _lastSeq = _noSeq;

  static int _noSeq() => 0;

  /// Every update of whichever session is being followed.
  Stream<SessionUpdate> get updates => _updates.stream;

  @override
  int get lastSeq => _lastSeq();

  /// Starts following [sessionId], resuming from what [lastSeq] answers.
  void follow(String sessionId, int Function() lastSeq) {
    unfollow();
    _lastSeq = lastSeq;
    _detach = _client.attach(sessionId, this);
  }

  /// Stops following.
  void unfollow() {
    _detach?.call();
    _detach = null;
    _lastSeq = _noSeq;
  }

  /// Sends a ping.
  bool ping({String? sessionId, required String nonce}) =>
      _client.command('session.ping', <String, Object?>{'sessionId': ?sessionId, 'nonce': nonce});

  @override
  void onEvent(Envelope frame) => _onFrame(frame);

  @override
  void onGap() => _emit(const StreamGap());

  /// Releases the subscription and closes the stream.
  Future<void> dispose() async {
    unfollow();
    _cancelObserve();
    await _updates.close();
  }

  void _onFrame(Envelope frame) {
    final Pong? pong = pongFrom(frame);
    if (pong != null) {
      _emit(PongReceived(pong));
    }
  }

  void _emit(SessionUpdate update) {
    if (!_updates.isClosed) {
      _updates.add(update);
    }
  }
}
