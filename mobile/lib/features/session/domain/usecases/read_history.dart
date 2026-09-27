/// Reading one page of a conversation's history.
library;

import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';

/// A page of history, the latest one unless a cursor says otherwise.
class ReadHistory {
  const ReadHistory(this._history);

  final HistoryRepository _history;

  /// The latest messages of [conversationId], or the page before [cursor].
  Future<HistoryPage> call(String conversationId, {String? cursor}) =>
      _history.page(conversationId, cursor: cursor);
}
