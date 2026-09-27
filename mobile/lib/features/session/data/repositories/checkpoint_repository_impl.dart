/// The checkpoint repository: the undo points, as the entities the undo screen uses.
library;

import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/rewind_mapper.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';

/// [CheckpointRepository] over the backend's HTTP API.
class CheckpointRepositoryImpl implements CheckpointRepository {
  const CheckpointRepositoryImpl(this._api);

  final SessionApiDataSource _api;

  @override
  Future<List<Checkpoint>> list(String sessionId) async =>
      checkpointsIn(await _api.checkpoints(sessionId)) ?? (throw unreadableAnswer());
}
