/// What the composer reads about an installation and a session: the catalogue of a draft, the
/// models of a session, and how full its context window is.
///
/// Each is a question with an answer, read over HTTP, and none of them stands between the person and
/// the prompt box: one that fails says why in its sheet, and sending goes on (S-21, S-45).
library;

import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/providers/session_updates.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'insight_controllers.g.dart';

/// Never asked again on its own.
///
/// Riverpod retries a failed provider by default, and here that is wrong: a catalogue refused for
/// want of a slot would be asked again and again of a machine that is full — each question opens a
/// query that counts against the ceiling — and the sheets already offer the person a retry of their
/// own (S-21, S-45).
Duration? _neverRetry(int retryCount, Object error) => null;

/// The catalogue of a folder's installation, for its draft.
@Riverpod(retry: _neverRetry)
class CatalogController extends _$CatalogController {
  @override
  Future<InstallationCatalog> build(String workspacePath) =>
      ref.watch(readInsightProvider).catalog(workspacePath);

  /// Reads it again, after it could not be read.
  void reload() => ref.invalidateSelf();
}

/// The models a live session can switch to, and the one it runs.
@Riverpod(retry: _neverRetry)
class SessionModelsController extends _$SessionModelsController {
  @override
  Future<SessionModels> build(String sessionId) => ref.watch(readInsightProvider).models(sessionId);

  /// Reads them again, after they could not be read.
  void reload() => ref.invalidateSelf();
}

/// How full a live session's context window is.
///
/// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
/// conversation was compacted — it shrank (B-14).
@Riverpod(retry: _neverRetry)
class SessionContextController extends _$SessionContextController {
  @override
  Future<ContextUse> build(String sessionId) {
    listenToUpdates(ref, _apply);
    return ref.watch(readInsightProvider).context(sessionId);
  }

  /// Reads it again.
  void reload() => ref.invalidateSelf();

  void _apply(SessionUpdate update) {
    if (update case EventReceived(event: TurnFinished() || ContextCompacted())) {
      reload();
    }
  }
}
