/// What reading a subagent's own history needs from the outside world.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';

/// The messages of one subagent, in one conversation of the history.
abstract interface class SubagentRepository {
  /// The page of [toolUseId]'s own messages, in [conversation] — the page after [cursor], or the
  /// first when it is `null`.
  ///
  /// [workspacePath] is the folder the caller already believes the conversation runs in, when it
  /// knows one — a hint the engine uses to find a transcript too large for its own id-only lookup
  /// to resolve a folder from (S-163). Never trusted on its own.
  ///
  /// @throws [Failure] never an exception of the transport
  Future<SubagentPage> page(
    ConversationKey conversation,
    String toolUseId, {
    String? cursor,
    String? workspacePath,
  });
}
