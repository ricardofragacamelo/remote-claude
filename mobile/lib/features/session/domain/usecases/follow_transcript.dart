/// Following a conversation of the history while another client writes it (plan 22, F4).
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';

/// Follows and stops following conversations, and says what arrives for them.
class FollowTranscript {
  const FollowTranscript(this._follows);

  final TranscriptFollowRepository _follows;

  /// What arrives for every subscription of this connection.
  Stream<FollowUpdate> get updates => _follows.updates;

  /// Follows [conversation] from after [afterMessageId]. Answers the id the command left with.
  String? follow(ConversationKey conversation, {String? afterMessageId}) =>
      _follows.follow(conversation, afterMessageId: afterMessageId);

  /// Stops following [followId].
  bool unfollow(String followId) => _follows.unfollow(followId);
}
