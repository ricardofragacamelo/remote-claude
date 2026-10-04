/// The insight repository: the catalogue, the models and the context, as entities.
library;

import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/insight_mapper.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';

/// [InsightRepository] over the backend's HTTP API.
class InsightRepositoryImpl implements InsightRepository {
  const InsightRepositoryImpl(this._api);

  final SessionApiDataSource _api;

  @override
  Future<InstallationCatalog> catalogOf(String workspacePath) async =>
      catalogFrom(await _api.catalog(workspacePath)) ?? (throw unreadableAnswer());

  @override
  Future<SessionModels> modelsOf(String sessionId) async =>
      sessionModelsFrom(await _api.models(sessionId)) ?? (throw unreadableAnswer());

  @override
  Future<ContextUse> contextOf(String sessionId) async =>
      contextUseFrom(await _api.context(sessionId)) ?? (throw unreadableAnswer());
}
