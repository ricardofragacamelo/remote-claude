/// The HTTP client, as a provider.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/device/device_identity_provider.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'api_client_provider.g.dart';

/// The transport of the HTTP client, on the origin in use — built again on a new address, and the
/// one of the old address closed, so nothing of it answers any more (plan 10, S-101, S-102).
@Riverpod(keepAlive: true)
Dio httpTransport(Ref ref) {
  final Dio dio = buildDio(
    baseUrl: ref.watch(appConfigProvider).apiBaseUrl,
    credentials: ref.watch(credentialsProvider),
    logger: ref.watch(appLoggerProvider),
    traceIds: ref.watch(traceIdsProvider),
    installIds: ref.watch(deviceIdentityProvider),
  );

  ref.onDispose(dio.close);

  return dio;
}

/// The one HTTP client. A second one in the project means something escaped the chain.
///
/// It does **not** follow the address: it asks for the transport on each request. When the client
/// itself was built again on a new address, every data source, repository and controller over it
/// was left to be built again too, lazily — the first time a screen read one, in the middle of its
/// build — and Riverpod then marked the provider scope dirty during the frame (found by the e2e of
/// plan 10, S-111). The transport has no one watching it, so rebuilding it moves nothing else.
@Riverpod(keepAlive: true)
ApiClient apiClient(Ref ref) =>
    ApiClient.over(() => ref.read(httpTransportProvider), ref.watch(traceIdsProvider));
