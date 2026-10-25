/// A history repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';

/// Answers the pages the test set, and records every page it was asked for.
class FakeHistoryRepository implements HistoryRepository {
  final Map<(ConversationKey, String?), HistoryPage> _pages =
      <(ConversationKey, String?), HistoryPage>{};

  /// Every page asked for, as `(conversation, cursor)`, in order.
  final List<(ConversationKey, String?)> reads = <(ConversationKey, String?)>[];

  /// What [page] throws instead of answering, when the test wants the error state.
  Object? failure;

  /// Held open while a test wants to look at the loading state, or answer out of order.
  Completer<void>? gate;

  /// Sets what the page of its conversation at [cursor] answers.
  void answer(HistoryPage page, {String? cursor}) => _pages[(page.conversation, cursor)] = page;

  @override
  Future<HistoryPage> page(
    ConversationKey conversation, {
    String? cursor,
    String? workspacePath,
  }) async {
    reads.add((conversation, cursor));
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return _pages[(conversation, cursor)] ??
        HistoryPage(conversation: conversation, workspacePath: '/home/someone/project');
  }
}
