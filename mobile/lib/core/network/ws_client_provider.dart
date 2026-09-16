/// The WebSocket client, as a provider.
library;

import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'ws_client_provider.g.dart';

/// The one socket. Kept alive: it outlives every screen that watches it.
@Riverpod(keepAlive: true)
WsClient wsClient(Ref ref) {
  final AppConfig config = ref.watch(appConfigProvider);

  final WsClient client = WsClient(
    url: Uri.parse(config.wsUrl),
    credentials: ref.watch(credentialsProvider),
    logger: ref.watch(appLoggerProvider),
    appVersion: config.appVersion,
  );

  ref.onDispose(client.dispose);

  return client;
}

/// Where the connection stands, for a screen to show.
@riverpod
Stream<ConnectionStatus> connectionStatus(Ref ref) => ref.watch(wsClientProvider).statuses;
