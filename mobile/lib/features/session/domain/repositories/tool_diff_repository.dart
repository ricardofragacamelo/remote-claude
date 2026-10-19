/// What drawing a tool's diff needs to read from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';

/// The diff of a file one tool of a session wrote.
abstract interface class ToolDiffRepository {
  /// The diff of [toolUseId]'s file, in [sessionId].
  ///
  /// @throws [Failure] never an exception of the transport — `DIFF_NOT_APPLICABLE` for a call that
  ///   changes no file, `FILE_NOT_TEXT` for one this build cannot show as lines
  Future<ToolDiff> diff(String sessionId, String toolUseId);
}
