/// What the composer needs to know about an installation and a session, from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/insight.dart';

/// The models, the context and the catalogue, behind one door.
abstract interface class InsightRepository {
  /// What the installation of [workspacePath] offers a draft: its commands and its models.
  ///
  /// @throws [Failure] — `SESSION_LIMIT_REACHED` when there is no slot for the question, the
  ///   refusals of a folder, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT`. None of them stops a send: the
  ///   draft goes on with the installation's default (S-21)
  Future<InstallationCatalog> catalogOf(String workspacePath);

  /// The models of [sessionId]'s installation, and the one it runs. @throws as [catalogOf]
  Future<SessionModels> modelsOf(String sessionId);

  /// The use of [sessionId]'s context window. @throws as [catalogOf]
  Future<ContextUse> contextOf(String sessionId);
}
