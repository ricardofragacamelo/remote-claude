/// The logger, as a provider.
library;

import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'logger_provider.g.dart';

/// The app's logger.
///
/// Built at boot, where the destination and the level are decided, and overridden here. A test
/// overrides it with one whose writer it can read.
@Riverpod(keepAlive: true)
AppLogger appLogger(Ref ref) => throw StateError('appLoggerProvider must be overridden at boot');
