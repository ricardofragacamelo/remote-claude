/// Reading what the composer shows about an installation and a session.
///
/// One class rather than three one-line ones, for the reason [DriveSession] gives: they are the
/// same act — "ask the backend about this installation" — and the routes are what carry the
/// meaning.
library;

import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';

/// The catalogue of a folder, and the models and context of a session.
class ReadInsight {
  const ReadInsight(this._insight);

  final InsightRepository _insight;

  /// What a draft of [workspacePath] can start with.
  Future<InstallationCatalog> catalog(String workspacePath) => _insight.catalogOf(workspacePath);

  /// What [sessionId] can switch to.
  Future<SessionModels> models(String sessionId) => _insight.modelsOf(sessionId);

  /// How full [sessionId]'s context window is.
  Future<ContextUse> context(String sessionId) => _insight.contextOf(sessionId);
}
