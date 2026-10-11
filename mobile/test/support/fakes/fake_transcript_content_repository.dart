/// A content repository a test drives: a tool's whole output, a prompt's image.
library;

import 'dart:async';

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';

/// Answers what the test set, and records every read it was asked for.
class FakeTranscriptContentRepository implements TranscriptContentRepository {
  /// The whole output of each tool, by `toolUseId`.
  final Map<String, ToolOutput> outputs = <String, ToolOutput>{};

  /// The image of each block, by `blockId`.
  final Map<String, PromptImageBytes> images = <String, PromptImageBytes>{};

  /// Every output asked for, as `(conversation, toolUseId)`, in order.
  final List<(ConversationKey, String)> toolReads = <(ConversationKey, String)>[];

  /// Every image asked for, as `(conversation, blockId)`, in order.
  final List<(ConversationKey, String)> imageReads = <(ConversationKey, String)>[];

  /// What the next reads throw instead of answering, while set.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  @override
  Future<ToolOutput> toolResult(ConversationKey conversation, String toolUseId) async {
    toolReads.add((conversation, toolUseId));
    await _wait();
    return outputs[toolUseId] ?? (throw const UnexpectedFailure(traceId: 't-missing'));
  }

  @override
  Future<PromptImageBytes> promptImage(ConversationKey conversation, String blockId) async {
    imageReads.add((conversation, blockId));
    await _wait();
    return images[blockId] ?? (throw const UnexpectedFailure(traceId: 't-missing'));
  }

  Future<void> _wait() async {
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
  }
}
