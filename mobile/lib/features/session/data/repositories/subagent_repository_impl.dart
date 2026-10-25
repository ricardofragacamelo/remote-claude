/// The subagent repository: a subagent's own messages, as the entities its card draws.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/subagent_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/subagent_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/domain/repositories/subagent_repository.dart';

/// [SubagentRepository] over the backend's HTTP API.
class SubagentRepositoryImpl implements SubagentRepository {
  const SubagentRepositoryImpl(this._api);

  final SubagentApiDataSource _api;

  @override
  Future<SubagentPage> page(
    ConversationKey conversation,
    String toolUseId, {
    String? cursor,
    String? workspacePath,
  }) async =>
      subagentPageFrom(
        await _api.messages(conversation, toolUseId, cursor: cursor, workspacePath: workspacePath),
      ) ??
      (throw const UnexpectedFailure(traceId: unknownTraceId));
}
