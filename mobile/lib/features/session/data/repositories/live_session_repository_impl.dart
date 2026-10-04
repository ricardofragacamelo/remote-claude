/// The live sessions of a folder, over HTTP: a question with an answer, never a stream of its own.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/live_session_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';

/// [LiveSessionRepository] over the backend's HTTP API.
class LiveSessionRepositoryImpl implements LiveSessionRepository {
  const LiveSessionRepositoryImpl(this._api);

  final SessionApiDataSource _api;

  @override
  Future<List<LiveSessionSummary>> list(String workspacePath) async =>
      liveSessionsFrom(await _api.liveSessions(workspacePath)) ??
      (throw const UnexpectedFailure(traceId: unknownTraceId));
}
