/// Opening what a conversation's timeline only marks.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';

/// The whole output of a tool, and the image of a prompt — each when the person opens it.
class ReadTranscriptContent {
  const ReadTranscriptContent(this._content);

  final TranscriptContentRepository _content;

  /// The whole output of the tool [toolUseId] of [conversation].
  Future<ToolOutput> toolResult(ConversationKey conversation, String toolUseId) =>
      _content.toolResult(conversation, toolUseId);

  /// The image of the block [blockId] of a prompt of [conversation].
  Future<PromptImageBytes> promptImage(ConversationKey conversation, String blockId) =>
      _content.promptImage(conversation, blockId);
}
