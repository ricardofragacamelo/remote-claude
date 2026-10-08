/// Following a conversation of the history while another client writes it (plan 22, F4).
library;

import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';

/// Follows and stops following conversations, and says what arrives for them.
class FollowTranscript {
  const FollowTranscript(this._follows);

  final TranscriptFollowRepository _follows;

  /// What arrives for every subscription of this connection.
  Stream<FollowUpdate> get updates => _follows.updates;

  /// Follows [conversationId] from after [afterMessageId]. Answers the id the command left with.
  String? follow(String conversationId, {String? afterMessageId}) =>
      _follows.follow(conversationId, afterMessageId: afterMessageId);

  /// Stops following [followId].
  bool unfollow(String followId) => _follows.unfollow(followId);
}
