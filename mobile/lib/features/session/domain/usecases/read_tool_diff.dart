/// Reading the diff of a tool that wrote a file. One use case, one thing it does.
library;

import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';
import 'package:remote_claude/features/session/domain/repositories/tool_diff_repository.dart';

/// What one file-writing call did, read from the disk, never from the call's own input.
class ReadToolDiff {
  const ReadToolDiff(this._diffs);

  final ToolDiffRepository _diffs;

  Future<ToolDiff> call(String sessionId, String toolUseId) => _diffs.diff(sessionId, toolUseId);
}
