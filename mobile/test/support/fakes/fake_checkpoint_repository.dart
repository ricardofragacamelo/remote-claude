/// A checkpoint repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';

/// Answers the points the test set, and records every reading.
class FakeCheckpointRepository implements CheckpointRepository {
  /// What [list] answers.
  List<Checkpoint> answer = const <Checkpoint>[];

  /// What [list] throws instead of answering, when the test wants the error state.
  Object? failure;

  /// Held open while a test wants to look at the loading state, or answer out of order.
  Completer<void>? gate;

  /// Every session read, in order.
  final List<String> reads = <String>[];

  @override
  Future<List<Checkpoint>> list(String sessionId) async {
    reads.add(sessionId);
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return answer;
  }
}
