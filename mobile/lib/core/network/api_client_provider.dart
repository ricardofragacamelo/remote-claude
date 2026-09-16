/// The HTTP client, as a provider.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'api_client_provider.g.dart';

/// The one HTTP client. A second one in the project means something escaped the chain.
@Riverpod(keepAlive: true)
ApiClient apiClient(Ref ref) {
  final Dio dio = buildDio(
    baseUrl: ref.watch(appConfigProvider).apiBaseUrl,
    credentials: ref.watch(credentialsProvider),
    logger: ref.watch(appLoggerProvider),
    traceIds: ref.watch(traceIdsProvider),
  );

  ref.onDispose(dio.close);

  return ApiClient(dio, ref.watch(traceIdsProvider));
}
