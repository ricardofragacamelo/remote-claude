/// The logger, as a provider.
library;

import 'package:flutter/foundation.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'logger_provider.g.dart';

/// The app's logger.
///
/// Built at boot, where the destination and the level are decided, and overridden here. A test
/// overrides it with one whose writer it can read.
@Riverpod(keepAlive: true)
AppLogger appLogger(Ref ref) => throw StateError('appLoggerProvider must be overridden at boot');

/// Whether this is a release build: what decides the level the logger falls back to when the
/// diagnostics screen lets go of `debug`. A provider so a test can be either.
@Riverpod(keepAlive: true)
bool releaseBuild(Ref ref) => kReleaseMode;
