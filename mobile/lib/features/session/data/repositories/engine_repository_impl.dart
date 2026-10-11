/// The engines of the installation, over HTTP: a question with an answer.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/engine_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/engine_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/domain/repositories/engine_repository.dart';

/// [EngineRepository] over the backend's HTTP API.
class EngineRepositoryImpl implements EngineRepository {
  const EngineRepositoryImpl(this._api);

  final EngineApiDataSource _api;

  @override
  Future<EngineCatalogue> list() async =>
      engineCatalogueFrom(await _api.engines()) ??
      (throw const UnexpectedFailure(traceId: unknownTraceId));
}
