/// Reading a subagent's own messages. One use case, one thing it does.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/domain/repositories/subagent_repository.dart';

/// What a subagent said, read from the conversation it ran in.
class ReadSubagentMessages {
  const ReadSubagentMessages(this._subagents);

  final SubagentRepository _subagents;

  Future<SubagentPage> call(ConversationKey conversation, String toolUseId, {String? cursor}) =>
      _subagents.page(conversation, toolUseId, cursor: cursor);
}
