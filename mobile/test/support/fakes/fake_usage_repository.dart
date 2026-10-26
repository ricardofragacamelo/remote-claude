/// A usage repository a test drives: the account's rate-limit windows.
library;

import 'dart:async';

import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/domain/repositories/usage_repository.dart';

/// Answers what the test set, and counts how many times it was asked.
class FakeUsageRepository implements UsageRepository {
  List<RateLimitWindow> windows = const <RateLimitWindow>[];

  /// What the next read throws instead of answering, while set.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  int reads = 0;

  @override
  Future<List<RateLimitWindow>> rateLimits() async {
    reads += 1;
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return windows;
  }
}
