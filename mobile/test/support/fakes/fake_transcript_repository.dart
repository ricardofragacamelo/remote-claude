/// A transcript repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/transcript.dart';

/// Answers the pages the test set, and records every page it was asked for.
class FakeTranscriptRepository implements TranscriptRepository {
  final Map<String, ConversationList> _pages = <String, ConversationList>{};

  /// Every page asked for, as `(workspacePath, cursor)`, in order.
  final List<(String, String?)> reads = <(String, String?)>[];

  /// What [list] throws instead of answering, when the test wants the error state.
  Object? failure;

  /// Held open while a test wants to look at the loading state, or answer out of order.
  Completer<void>? gate;

  /// Sets what the page of [workspacePath] at [cursor] answers.
  void answer(String workspacePath, ConversationList page, {String? cursor}) =>
      _pages['$workspacePath|${cursor ?? ''}'] = page;

  @override
  Future<ConversationList> list(String workspacePath, {String? cursor}) async {
    reads.add((workspacePath, cursor));
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return _pages['$workspacePath|${cursor ?? ''}'] ?? const ConversationList();
  }
}
