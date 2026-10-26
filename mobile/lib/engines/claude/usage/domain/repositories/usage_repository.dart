/// Asking the backend for the Claude account's rate-limit windows.
library;

import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';

/// Reads the account's rate-limit windows (plan 16, D-09) — never real-time, only what the backend
/// last observed. The account is the machine's, shared by every session of every user.
abstract interface class UsageRepository {
  Future<List<RateLimitWindow>> rateLimits();
}
