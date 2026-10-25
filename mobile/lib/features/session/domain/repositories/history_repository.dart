/// What reading a conversation's history needs from the outside world.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';

/// The history of the engines' stores, page by page.
abstract interface class HistoryRepository {
  /// The latest messages of [conversation], or the page before [cursor].
  ///
  /// [workspacePath] is the folder the caller already believes the conversation runs in, when it
  /// knows one — a hint the engine uses to find a transcript too large for its own id-only lookup
  /// to resolve a folder from (S-163). Never trusted on its own.
  ///
  /// @throws [Failure] never an exception of the transport — `NOT_FOUND` for a conversation that
  ///   does not exist or is not the caller's, `AGENT_UNAVAILABLE` / `AGENT_TIMEOUT` when the
  ///   machine could not read it
  Future<HistoryPage> page(ConversationKey conversation, {String? cursor, String? workspacePath});
}
