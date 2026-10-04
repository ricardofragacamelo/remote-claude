/// What has to exist before the first frame.
///
/// Configuration, the logger, the crash handlers and the provider overrides. Every piece is a
/// function that takes what it needs, so a test can build the same world without a device.
library;

import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_level.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';

export 'package:remote_claude/core/logging/log_level.dart' show levelFor;

/// Writes a formatted line to the platform's developer console.
///
/// `dart:developer` rather than `print`: `print` has no level, no structure and no correlation,
/// and the analyzer fails the build over it.
LogWriter consoleWriter() =>
    (String line, String level) => developer.log(line, name: 'remote_claude');

/// Builds the app's logger.
AppLogger buildLogger({
  required String appVersion,
  required String platform,
  required bool isRelease,
  bool debugRequested = false,
  LogWriter? writer,
}) => AppLogger(
  context: LogContext(appVersion: appVersion, platform: platform),
  writer: writer ?? consoleWriter(),
  level: levelFor(isRelease: isRelease, debugRequested: debugRequested),
);

/// Routes every uncaught error to the logger at `fatal`.
///
/// A silent crash in a published app is a debt nobody pays: the one report that would have
/// explained it is the one that never left the device.
void installErrorHandlers(AppLogger logger) {
  FlutterError.onError = (FlutterErrorDetails details) {
    logger.fatal(
      'uncaught flutter error',
      op: LogOp.lifecycleChanged,
      err: details.exception,
      fields: <String, Object?>{'library': details.library},
    );
  };

  PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
    logger.fatal('uncaught platform error', op: LogOp.lifecycleChanged, err: error);
    return true;
  };
}

/// The overrides the container needs to hold a real app: what the build was compiled with, the
/// address the phone had saved — read before the first frame —, and the logger.
List<Override> bootstrapOverrides({
  required BuildConfig build,
  required AppLogger logger,
  ConnectionChoice? saved,
}) => <Override>[
  buildConfigProvider.overrideWithValue(build),
  savedConnectionProvider.overrideWithValue(saved),
  appLoggerProvider.overrideWithValue(logger),
];
