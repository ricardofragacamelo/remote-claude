/// `debug` logging in a release build, switched on from the diagnostics screen — plan 05, B-11.
///
/// It lives exactly as long as the screen that shows it: the provider is disposed when the screen
/// goes, and disposing it puts the logger back to the level of the build. A raised level forgotten
/// on is a slow leak — every I/O edge, with payloads, shipped for as long as the app runs.
library;

import 'package:logging/logging.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_level.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'debug_logging_controller.g.dart';

/// Whether `debug` is on right now.
@riverpod
class DebugLogging extends _$DebugLogging {
  @override
  bool build() {
    final AppLogger logger = ref.watch(appLoggerProvider);
    final bool isRelease = ref.watch(releaseBuildProvider);

    // Leaving the screen is the only "off" that cannot be forgotten.
    ref.onDispose(() => logger.level = levelFor(isRelease: isRelease, debugRequested: false));

    return logger.level <= Level.FINE;
  }

  /// Whether the switch does anything: in a debug build the logger is always at `debug`.
  bool get canSwitch => ref.read(releaseBuildProvider);

  /// Turns `debug` on or off, for as long as the screen stays open.
  void request({required bool on}) {
    final AppLogger logger = ref.read(appLoggerProvider);
    logger.level = levelFor(isRelease: ref.read(releaseBuildProvider), debugRequested: on);
    state = logger.level <= Level.FINE;
  }
}
