/// Reading what runs in a folder. One use case, one thing it does.
library;

import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';

/// The live sessions of a folder, from every device of this person.
class ListLiveSessions {
  const ListLiveSessions(this._sessions);

  final LiveSessionRepository _sessions;

  Future<List<LiveSessionSummary>> call(String workspacePath) => _sessions.list(workspacePath);
}
