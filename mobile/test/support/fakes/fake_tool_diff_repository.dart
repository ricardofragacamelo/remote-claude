/// A diff repository a test drives: what one file-writing call did.
library;

import 'dart:async';

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';
import 'package:remote_claude/features/session/domain/repositories/tool_diff_repository.dart';

/// Answers what the test set, and records every read it was asked for.
class FakeToolDiffRepository implements ToolDiffRepository {
  /// The diff of each tool, by `toolUseId`.
  final Map<String, ToolDiff> diffs = <String, ToolDiff>{};

  /// Every diff asked for, as `(sessionId, toolUseId)`, in order.
  final List<(String, String)> reads = <(String, String)>[];

  /// What the next read throws instead of answering, while set.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  @override
  Future<ToolDiff> diff(String sessionId, String toolUseId) async {
    reads.add((sessionId, toolUseId));
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return diffs[toolUseId] ?? (throw const UnexpectedFailure(traceId: 't-missing'));
  }
}
