/// What opening the content of a conversation needs from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';

/// The content a conversation's timeline only marks, read on demand.
abstract interface class TranscriptContentRepository {
  /// The whole output of the tool [toolUseId] of the main conversation [conversationId].
  ///
  /// @throws [Failure] never an exception of the transport — `NOT_FOUND` for a tool the main chain
  ///   has no result of, or a conversation the caller does not read
  Future<ToolOutput> toolResult(String conversationId, String toolUseId);

  /// The image of the block [blockId] of a prompt of [conversationId].
  ///
  /// @throws [Failure] `UNSUPPORTED_MEDIA_TYPE` (415) for a type the server never serves,
  ///   `PAYLOAD_TOO_LARGE` (413) above its ceiling, `NOT_FOUND` for a block that is no image of it
  Future<PromptImageBytes> promptImage(String conversationId, String blockId);
}
