/// The session's edge of the socket.
///
/// It turns frames into updates and commands into frames, and nothing else: the socket itself,
/// its handshake and its reconnection belong to [WsClient], which is `core/`.
library;

import 'dart:async';

import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/data/mappers/command_answer_mapper.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';

/// Reads and writes the session's frames.
class SessionWsDataSource implements SessionSubscriber {
  SessionWsDataSource(this._client, {this._logger}) {
    // The very first ping opens the session, so its pong arrives before anything could have
    // attached to it. Observing is what catches that one.
    _cancelObserve = _client.observe(_onFrame);
  }

  final WsClient _client;

  /// Says, in `debug`, what of a frame the app chose not to draw. The socket already logs the frame
  /// itself; this is the decision about it.
  final AppLogger? _logger;
  final StreamController<SessionUpdate> _updates = StreamController<SessionUpdate>.broadcast();

  late final void Function() _cancelObserve;

  /// The sessions being followed, each with its own resume point: several at once, because the app
  /// keeps every session open in it attached — its stream and its questions keep arriving with
  /// another one on screen (plan 10, F9, D-26).
  final Map<String, _Following> _following = <String, _Following>{};

  /// Every update of every session being followed — each event names its session, and so does a
  /// gap, for each screen to keep its own (S-172).
  Stream<SessionUpdate> get updates => _updates.stream;

  /// The resume point of a frame that reached this source directly — no session's.
  @override
  int get lastSeq => 0;

  /// Starts following [sessionId], resuming from what [lastSeq] answers. Another session being
  /// followed stays followed; following the same one again replaces the first following.
  ///
  /// @returns what stops this following — a no-op once another one of the same session took its
  ///   place
  void Function() follow(String sessionId, int Function() lastSeq) {
    _following.remove(sessionId)?.stop();

    final _Following following = _Following(sessionId, lastSeq, this);
    following.stop = _client.attach(sessionId, following);
    _following[sessionId] = following;

    return () {
      if (identical(_following[sessionId], following)) {
        _following.remove(sessionId);
        following.stop();
      }
    };
  }

  /// Stops following every session.
  void unfollow() {
    for (final _Following following in _following.values.toList(growable: false)) {
      following.stop();
    }
    _following.clear();
  }

  /// Sends a ping.
  bool ping({String? sessionId, required String nonce}) =>
      _client.command('diag.ping', <String, Object?>{'sessionId': ?sessionId, 'nonce': nonce});

  /// Sends one of the session's commands, with [payload] exactly as the contract carries it.
  bool send(String type, Map<String, Object?> payload) => _client.command(type, payload);

  /// Sends one of the session's commands and answers the id it left with, or `null`.
  String? issue(String type, Map<String, Object?> payload) => _client.send(type, payload);

  @override
  void onEvent(Envelope frame) => _onFrame(frame);

  @override
  void onGap(String? claudeSessionId) => _emit(StreamGap(claudeSessionId: claudeSessionId));

  /// A gap of [sessionId] — that session's screen reloads, and no other.
  void _gapOf(String sessionId, String? claudeSessionId) =>
      _emit(StreamGap(sessionId: sessionId, claudeSessionId: claudeSessionId));

  /// Releases the subscription and closes the stream.
  Future<void> dispose() async {
    unfollow();
    _cancelObserve();
    await _updates.close();
  }

  void _onFrame(Envelope frame) {
    final SessionEvent? event = sessionEventFrom(frame);

    if (event is UnreadEvent && frame.type == messageDeltaType) {
      _ignored(frame);
    }

    // A frame with no `seq` is not part of a session's history — a question is asked, not
    // recorded — and belongs to the permission queue rather than here. Three of them are this
    // feature's, though: joining a session that was already live, a refusal, and a failure the
    // session reports without naming a command.
    final SessionUpdate? update = event == null
        ? sessionJoinedFrom(frame) ??
              commandAcceptedFrom(frame) ??
              commandRefusedFrom(frame) ??
              sessionFailedFrom(frame)
        : EventReceived(event, sessionId: frame.sessionId);

    if (update != null) {
      _emit(update);
    }
  }

  /// A fragment this build does not draw — a block kind it does not know, or a subagent's text —
  /// is ignored, and the reason is logged: its `seq` still moves past it (S-09).
  void _ignored(Envelope frame) => _logger?.debug(
    'session fragment not drawn',
    op: 'session.fragment.ignored',
    fields: <String, Object?>{
      'sessionId': frame.sessionId,
      'seq': frame.seq,
      'blockType': blockTypeOf(frame.payload ?? const <String, Object?>{}),
      'subagent': frame.payload?['parentToolUseId'] != null,
    },
  );

  void _emit(SessionUpdate update) {
    if (!_updates.isClosed) {
      _updates.add(update);
    }
  }
}

/// One session being followed: its frames go to the source, its gap names it, and its resume point
/// is its own.
class _Following implements SessionSubscriber {
  _Following(this.sessionId, this._lastSeq, this._source);

  final String sessionId;
  final int Function() _lastSeq;
  final SessionWsDataSource _source;

  /// Detaches it from the socket; set once attached.
  late void Function() stop;

  @override
  int get lastSeq => _lastSeq();

  @override
  void onEvent(Envelope frame) => _source.onEvent(frame);

  @override
  void onGap(String? claudeSessionId) => _source._gapOf(sessionId, claudeSessionId);
}
