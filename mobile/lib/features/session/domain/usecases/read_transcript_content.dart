/// Opening what a conversation's timeline only marks.
library;

import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';

/// The whole output of a tool, and the image of a prompt — each when the person opens it.
class ReadTranscriptContent {
  const ReadTranscriptContent(this._content);

  final TranscriptContentRepository _content;

  /// The whole output of the tool [toolUseId] of [conversationId].
  Future<ToolOutput> toolResult(String conversationId, String toolUseId) =>
      _content.toolResult(conversationId, toolUseId);

  /// The image of the block [blockId] of a prompt of [conversationId].
  Future<PromptImageBytes> promptImage(String conversationId, String blockId) =>
      _content.promptImage(conversationId, blockId);
}
