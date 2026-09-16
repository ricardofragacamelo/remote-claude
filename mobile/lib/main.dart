/// Entry point.
///
/// It does the four things nothing else can do — read the defines, build the logger, install the
/// crash handlers, and run the app — and holds no logic of its own. That is why it is the one
/// file excluded from the coverage measurement: everything it calls is covered where it lives.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/app/app.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/app/lifecycle.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final AppConfig config = AppConfig.from(appDefines);
  final AppLogger logger = buildLogger(
    config: config,
    platform: defaultTargetPlatform.name,
    isRelease: kReleaseMode,
  );

  installErrorHandlers(logger);

  final ProviderContainer container = ProviderContainer(
    overrides: bootstrapOverrides(config: config, logger: logger),
  );

  final WsClient client = container.read(wsClientProvider)..connect();
  SocketLifecycle(client: client, logger: logger);

  runApp(UncontrolledProviderScope(container: container, child: const RemoteClaudeApp()));
}
