/// The Claude usage endpoint of the backend, over the one HTTP client.
library;

import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/engines/claude/usage/data/mappers/rate_limit_mapper.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/domain/repositories/usage_repository.dart';

/// [UsageRepository] over the one HTTP client.
class HttpUsageRepository implements UsageRepository {
  const HttpUsageRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<RateLimitWindow>> rateLimits() async =>
      rateLimitWindowsFrom(await _api.get('/engines/claude/usage/rate-limits'));
}
