/// The content repository: the routes of a conversation's content, read into entities.
library;

import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_content_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/transcript_content_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';

/// [TranscriptContentRepository] over the backend's HTTP API.
class TranscriptContentRepositoryImpl implements TranscriptContentRepository {
  const TranscriptContentRepositoryImpl(this._api);

  final TranscriptContentApiDataSource _api;

  @override
  Future<ToolOutput> toolResult(String conversationId, String toolUseId) async =>
      toolOutputFrom(await _api.toolResult(conversationId, toolUseId));

  @override
  Future<PromptImageBytes> promptImage(String conversationId, String blockId) async {
    final ByteAnswer answer = await _api.promptImage(conversationId, blockId);

    return PromptImageBytes(bytes: answer.bytes, mediaType: answer.contentType);
  }
}
