/// A follow repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';

/// Records every follow and unfollow, and emits whatever the test pushes.
class FakeTranscriptFollowRepository implements TranscriptFollowRepository {
  final StreamController<FollowUpdate> _updates = StreamController<FollowUpdate>.broadcast();

  /// Every follow sent, as `(commandId, conversationId, afterMessageId)`, in order.
  final List<(String, String, String?)> follows = <(String, String, String?)>[];

  /// Every subscription let go, in order.
  final List<String> unfollows = <String>[];

  /// Whether a follow leaves — `false` is a socket that is not ready.
  bool accepts = true;

  @override
  Stream<FollowUpdate> get updates => _updates.stream;

  /// The id of the last follow that left.
  String get lastCommand => follows.last.$1;

  @override
  String? follow(String conversationId, {String? afterMessageId}) {
    if (!accepts) {
      return null;
    }

    final String commandId = 'follow-${follows.length + 1}';
    follows.add((commandId, conversationId, afterMessageId));
    return commandId;
  }

  @override
  bool unfollow(String followId) {
    unfollows.add(followId);
    return accepts;
  }

  /// Delivers [update] to whoever listens.
  void emit(FollowUpdate update) => _updates.add(update);

  /// Answers the last follow with its ack, naming the subscription [followId].
  void ack(String followId, {ConversationActivity? activity = ConversationActivity.idle}) => emit(
    FollowStarted(
      commandId: lastCommand,
      followId: followId,
      conversationId: follows.last.$2,
      activity: activity,
    ),
  );

  Future<void> dispose() => _updates.close();
}
