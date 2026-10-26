/// The account's rate-limit windows, read for the usage screen (plan 16, D-09).
library;

import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/presentation/providers/usage_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'usage_controller.g.dart';

/// The screen's one read: every window the backend has last observed, in no particular order —
/// the screen itself decides how to lay them out.
@riverpod
class UsageController extends _$UsageController {
  @override
  Future<List<RateLimitWindow>> build() => ref.watch(usageRepositoryProvider).rateLimits();

  /// Reads the windows again.
  void retry() => ref.invalidateSelf();
}
