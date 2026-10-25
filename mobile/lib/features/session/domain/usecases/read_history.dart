/// Reading one page of a conversation's history.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';

/// A page of history, the latest one unless a cursor says otherwise.
class ReadHistory {
  const ReadHistory(this._history);

  final HistoryRepository _history;

  /// The latest messages of [conversation], or the page before [cursor].
  ///
  /// [workspacePath] is the folder the caller already believes the conversation runs in, when it
  /// knows one (S-163).
  Future<HistoryPage> call(ConversationKey conversation, {String? cursor, String? workspacePath}) =>
      _history.page(conversation, cursor: cursor, workspacePath: workspacePath);
}
