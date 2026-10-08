/// The edge of the socket that follows conversations of the history (plan 22, B-24).
///
/// It sends `transcript.follow` and `transcript.unfollow`, and turns `transcript.following`,
/// `transcript.appended`, `transcript.reset` and the refusals into [FollowUpdate]s — and nothing
/// else. The socket, its handshake and its reconnection belong to [WsClient]; a subscription does
/// not survive a reconnection, and following again is the screen's to decide (05 §Acompanhar).
///
/// None of these frames names a session, so they reach the observers of the socket, never a
/// session's subscriber: their `seq` belongs to the `followId`, and touching a session's resume
/// point with it would skip events the session never sent.
library;

import 'dart:async';

import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/data/mappers/transcript_follow_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

/// Reads and writes the frames of followed conversations.
class TranscriptFollowWsDataSource {
  TranscriptFollowWsDataSource(this._client, {this._logger}) {
    _cancelObserve = _client.observe(_onFrame);
  }

  final WsClient _client;

  /// Says, in `debug`, what of each frame was read — how many entries, never what they say. The
  /// socket already logs the frame itself; this is the decision about it.
  final AppLogger? _logger;

  final StreamController<FollowUpdate> _updates = StreamController<FollowUpdate>.broadcast();

  late final void Function() _cancelObserve;

  /// Every update of every subscription of this connection.
  Stream<FollowUpdate> get updates => _updates.stream;

  /// Sends `transcript.follow`. Answers the id it left with, or `null` when nothing left.
  String? follow(String conversationId, {String? afterMessageId}) {
    final String? commandId = _client.send(
      transcriptFollowType,
      TranscriptFollowPayload(
        conversationId: conversationId,
        afterMessageId: afterMessageId,
      ).toJson(),
    );

    _logger?.debug(
      'transcript follow sent',
      op: LogOp.transcriptFollow,
      fields: <String, Object?>{
        'conversationId': conversationId,
        'afterMessageId': afterMessageId,
        'sent': commandId != null,
      },
    );

    return commandId;
  }

  /// Sends `transcript.unfollow`. Answers whether it left.
  bool unfollow(String followId) {
    final bool sent = _client.command(
      transcriptUnfollowType,
      TranscriptUnfollowPayload(followId: followId).toJson(),
    );

    _logger?.debug(
      'transcript unfollow sent',
      op: LogOp.transcriptFollow,
      fields: <String, Object?>{'followId': followId, 'sent': sent},
    );

    return sent;
  }

  /// Stops observing the socket and closes the stream.
  Future<void> dispose() async {
    _cancelObserve();
    await _updates.close();
  }

  void _onFrame(Envelope frame) {
    final bool ours = frame.type.startsWith(transcriptStreamPrefix);

    if (!ours && frame.kind != errorKind) {
      return;
    }

    final FollowUpdate? update = followUpdateFrom(frame);

    if (update == null) {
      // An error frame that answers no command is the session's to report, not a refusal of ours.
      if (ours) {
        _logger?.debug(
          'transcript frame not read',
          op: LogOp.transcriptFollow,
          fields: <String, Object?>{'type': frame.type, 'seq': frame.seq},
        );
      }
      return;
    }

    if (ours) {
      _logger?.debug(
        'transcript frame received',
        op: LogOp.transcriptFollow,
        fields: followLogFieldsOf(update),
      );
    }

    if (!_updates.isClosed) {
      _updates.add(update);
    }
  }
}
