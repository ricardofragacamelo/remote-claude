/// The tool diff repository: a file's change, as the entity the tool card draws.
library;

import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/tool_diff_mapper.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';
import 'package:remote_claude/features/session/domain/repositories/tool_diff_repository.dart';

/// [ToolDiffRepository] over the backend's HTTP API.
class ToolDiffRepositoryImpl implements ToolDiffRepository {
  const ToolDiffRepositoryImpl(this._api);

  final SessionApiDataSource _api;

  @override
  Future<ToolDiff> diff(String sessionId, String toolUseId) async =>
      toolDiffFrom(await _api.toolDiff(sessionId, toolUseId)) ?? (throw unreadableAnswer());
}
