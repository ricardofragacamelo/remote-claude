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
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_store.dart';
import 'package:remote_claude/core/device/device_identity_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/device/device.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final BuildConfig build = BuildConfig.from(appDefines);
  final AppLogger logger = buildLogger(
    appVersion: build.appVersion,
    platform: defaultTargetPlatform.name,
    isRelease: kReleaseMode,
  );

  installErrorHandlers(logger);

  // The address the phone was told to use, before anything talks to the server (plan 10, D-18).
  final ConnectionChoice? saved = await ConnectionStore(
    const SecureCredentialStore(),
    logger: logger,
  ).read();

  final ProviderContainer container = ProviderContainer(
    overrides: bootstrapOverrides(build: build, logger: logger, saved: saved),
  );

  // Before the socket opens, and before the first request goes out: both stamp the installation
  // id, and one that is not there yet is a handshake the backend cannot tie to a device.
  await container.read(deviceIdentityProvider).ensure();

  keepConnected(container);
  SocketLifecycle(client: () => currentSocket(container), logger: logger);
  ForegroundRecheck(
    recheck: () => container.read(deviceControllerProvider.notifier).recheckIfPending(),
  );

  runApp(UncontrolledProviderScope(container: container, child: const RemoteClaudeApp()));
}
