/// The transcript repository: the wire, turned into the entities the screen works with.
library;

import 'package:remote_claude/features/transcript/data/datasources/transcript_api_data_source.dart';
import 'package:remote_claude/features/transcript/data/mappers/conversation_mapper.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_summary.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';

/// [TranscriptRepository] over the backend's HTTP API.
class TranscriptRepositoryImpl implements TranscriptRepository {
  const TranscriptRepositoryImpl(this._api);

  final TranscriptApiDataSource _api;

  @override
  Future<ConversationList> list(String workspacePath, {String? cursor}) async =>
      conversationListFrom(await _api.list(workspacePath, cursor: cursor));
}
