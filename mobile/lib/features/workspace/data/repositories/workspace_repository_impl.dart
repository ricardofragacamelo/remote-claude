/// The workspace repository: the wire, turned into the entities the screen works with.
library;

import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/data/mappers/workspace_mapper.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';

/// [WorkspaceRepository] over the backend's HTTP API.
class WorkspaceRepositoryImpl implements WorkspaceRepository {
  const WorkspaceRepositoryImpl(this._api);

  final WorkspaceApiDataSource _api;

  @override
  Future<List<Workspace>> list() async => workspacesFrom(await _api.list());
}
