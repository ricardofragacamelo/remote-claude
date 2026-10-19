/// An audit repository a test drives: the trail of one session's calls of one kind.
library;

import 'dart:async';

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/features/audit/domain/repositories/audit_repository.dart';

/// Answers what the test set, and records every read it was asked for.
class FakeAuditRepository implements AuditRepository {
  /// What each page (by its own cursor, `null` for the first) answers.
  final Map<String?, AuditEntryPage> pages = <String?, AuditEntryPage>{};

  /// Every read asked for, as `(sessionId, kind, cursor)`, in order.
  final List<(String, String, String?)> reads = <(String, String, String?)>[];

  /// What the next read throws instead of answering, while set.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  @override
  Future<AuditEntryPage> page({
    required String sessionId,
    required String kind,
    String? cursor,
  }) async {
    reads.add((sessionId, kind, cursor));
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return pages[cursor] ?? (throw const UnexpectedFailure(traceId: 't-missing'));
  }
}
