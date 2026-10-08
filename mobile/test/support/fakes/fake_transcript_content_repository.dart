/// A content repository a test drives: a tool's whole output, a prompt's image.
library;

import 'dart:async';

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';

/// Answers what the test set, and records every read it was asked for.
class FakeTranscriptContentRepository implements TranscriptContentRepository {
  /// The whole output of each tool, by `toolUseId`.
  final Map<String, ToolOutput> outputs = <String, ToolOutput>{};

  /// The image of each block, by `blockId`.
  final Map<String, PromptImageBytes> images = <String, PromptImageBytes>{};

  /// Every output asked for, as `(conversationId, toolUseId)`, in order.
  final List<(String, String)> toolReads = <(String, String)>[];

  /// Every image asked for, as `(conversationId, blockId)`, in order.
  final List<(String, String)> imageReads = <(String, String)>[];

  /// What the next reads throw instead of answering, while set.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  @override
  Future<ToolOutput> toolResult(String conversationId, String toolUseId) async {
    toolReads.add((conversationId, toolUseId));
    await _wait();
    return outputs[toolUseId] ?? (throw const UnexpectedFailure(traceId: 't-missing'));
  }

  @override
  Future<PromptImageBytes> promptImage(String conversationId, String blockId) async {
    imageReads.add((conversationId, blockId));
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
