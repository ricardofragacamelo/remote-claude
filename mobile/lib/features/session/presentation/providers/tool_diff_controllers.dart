/// The diff of one file-writing tool, read when its card opens (plan 26, B-16).
library;

import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'tool_diff_controllers.g.dart';

/// Never asked again on its own: a failure stays on screen with "try again", and the person decides
/// (S-115's own reasoning, ported to the diff).
Duration? _neverRetry(int retryCount, Object error) => null;

/// The diff of one tool of [sessionId], read **once** when its card is first opened.
@Riverpod(retry: _neverRetry)
class ToolDiffController extends _$ToolDiffController {
  @override
  Future<ToolDiff> build(String sessionId, String toolUseId) =>
      ref.watch(readToolDiffProvider)(sessionId, toolUseId);

  /// Asks again, after it did not arrive.
  void retry() => ref.invalidateSelf();
}
