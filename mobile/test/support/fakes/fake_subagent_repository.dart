/// A subagent repository a test drives: what a subagent said, from the history.
library;

import 'dart:async';

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/domain/repositories/subagent_repository.dart';

/// Answers what the test set, and records every read it was asked for.
class FakeSubagentRepository implements SubagentRepository {
  /// The page of each subagent, by its `toolUseId`.
  final Map<String, SubagentPage> pages = <String, SubagentPage>{};

  /// Every read asked for, as `(conversation, toolUseId)`, in order.
  final List<(ConversationKey, String)> reads = <(ConversationKey, String)>[];

  /// What the next read throws instead of answering, while set.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  @override
  Future<SubagentPage> page(
    ConversationKey conversation,
    String toolUseId, {
    String? cursor,
  }) async {
    reads.add((conversation, toolUseId));
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return pages[toolUseId] ?? (throw const UnexpectedFailure(traceId: 't-missing'));
  }
}
