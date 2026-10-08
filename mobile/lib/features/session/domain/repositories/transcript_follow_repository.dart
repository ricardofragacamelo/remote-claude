/// What following a conversation of the history needs from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

/// The subscriptions to conversations of Claude's store, over the one socket.
abstract interface class TranscriptFollowRepository {
  /// Everything that happens to any subscription of this connection — each update names its own,
  /// and a screen keeps only what is its.
  Stream<FollowUpdate> get updates;

  /// Follows [conversationId] from after [afterMessageId] — the last entry the screen has; absent
  /// when it has none, and then everything is new.
  ///
  /// @returns the id the command left with — what its ack and its refusal name — or `null` when
  ///   the socket is not ready and nothing left
  String? follow(String conversationId, {String? afterMessageId});

  /// Stops following [followId]. Idempotent on the server: an ended subscription is acknowledged
  /// all the same.
  ///
  /// @returns whether the command left
  bool unfollow(String followId);
}
