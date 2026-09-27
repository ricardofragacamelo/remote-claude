/// A history repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';

/// Answers the pages the test set, and records every page it was asked for.
class FakeHistoryRepository implements HistoryRepository {
  final Map<String, HistoryPage> _pages = <String, HistoryPage>{};

  /// Every page asked for, as `(conversationId, cursor)`, in order.
  final List<(String, String?)> reads = <(String, String?)>[];

  /// What [page] throws instead of answering, when the test wants the error state.
  Object? failure;

  /// Held open while a test wants to look at the loading state, or answer out of order.
  Completer<void>? gate;

  /// Sets what the page of [conversationId] at [cursor] answers.
  void answer(HistoryPage page, {String? cursor}) =>
      _pages[_key(page.conversationId, cursor)] = page;

  @override
  Future<HistoryPage> page(String conversationId, {String? cursor}) async {
    reads.add((conversationId, cursor));
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return _pages[_key(conversationId, cursor)] ??
        HistoryPage(conversationId: conversationId, workspacePath: '/home/someone/project');
  }

  static String _key(String conversationId, String? cursor) => '$conversationId|${cursor ?? ''}';
}
