/// Wiring of the Claude usage feature: its composition root.
library;

import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/engines/claude/usage/data/datasources/http_usage_repository.dart';
import 'package:remote_claude/engines/claude/usage/domain/repositories/usage_repository.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'usage_providers.g.dart';

/// The account's rate-limit windows, over the backend.
@riverpod
UsageRepository usageRepository(Ref ref) => HttpUsageRepository(ref.watch(apiClientProvider));
