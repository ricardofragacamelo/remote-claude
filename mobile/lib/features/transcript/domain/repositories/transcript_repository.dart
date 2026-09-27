/// What listing the history needs from the outside world.
library;

import 'package:remote_claude/features/transcript/domain/entities/conversation_summary.dart';

/// The conversations of Claude's store, one workspace and one page at a time.
abstract interface class TranscriptRepository {
  /// The conversations that ran in [workspacePath], newest first, from [cursor] on.
  ///
  /// @throws [Failure] never an exception of the transport — `WORKSPACE_NOT_ALLOWED` for a folder
  ///   outside the allowlist, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the machine could not
  ///   read its store
  Future<ConversationList> list(String workspacePath, {String? cursor});
}
