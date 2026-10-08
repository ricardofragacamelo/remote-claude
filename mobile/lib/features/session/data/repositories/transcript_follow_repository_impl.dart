/// The follow repository: the socket's edge for followed conversations, behind the domain's door.
library;

import 'package:remote_claude/features/session/data/datasources/transcript_follow_ws_data_source.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';

/// [TranscriptFollowRepository] over the one socket.
class TranscriptFollowRepositoryImpl implements TranscriptFollowRepository {
  const TranscriptFollowRepositoryImpl(this._source);

  final TranscriptFollowWsDataSource _source;

  @override
  Stream<FollowUpdate> get updates => _source.updates;

  @override
  String? follow(String conversationId, {String? afterMessageId}) =>
      _source.follow(conversationId, afterMessageId: afterMessageId);

  @override
  bool unfollow(String followId) => _source.unfollow(followId);
}
