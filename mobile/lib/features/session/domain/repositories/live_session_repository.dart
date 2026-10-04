/// What listing the live sessions of a folder needs from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';

/// The live sessions of a folder and of the folders below it.
abstract interface class LiveSessionRepository {
  /// @throws [Failure] never an exception of the transport — `WORKSPACE_NOT_ALLOWED`,
  ///   `WORKSPACE_NOT_FOUND` or `WORKSPACE_NOT_A_DIRECTORY` for a folder that cannot be asked about
  Future<List<LiveSessionSummary>> list(String workspacePath);
}
