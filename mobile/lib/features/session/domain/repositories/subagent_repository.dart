/// What reading a subagent's own history needs from the outside world.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';

/// The messages of one subagent, in one conversation of the history.
abstract interface class SubagentRepository {
  /// The page of [toolUseId]'s own messages, in [conversation] — the page after [cursor], or the
  /// first when it is `null`.
  ///
  /// @throws [Failure] never an exception of the transport
  Future<SubagentPage> page(ConversationKey conversation, String toolUseId, {String? cursor});
}
