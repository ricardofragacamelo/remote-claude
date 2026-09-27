/// What reading a conversation's history needs from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/history_page.dart';

/// The history of Claude's store, page by page.
abstract interface class HistoryRepository {
  /// The latest messages of [conversationId], or the page before [cursor].
  ///
  /// @throws [Failure] never an exception of the transport — `NOT_FOUND` for a conversation that
  ///   does not exist or is not the caller's, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the
  ///   machine could not read it
  Future<HistoryPage> page(String conversationId, {String? cursor});
}
