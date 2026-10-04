/// Wiring of the connection feature: its composition root.
library;

import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/connection/data/datasources/http_connection_probe.dart';
import 'package:remote_claude/features/connection/domain/repositories/connection_probe.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'connection_providers.g.dart';

/// The test of an address.
@riverpod
ConnectionProbe connectionProbe(Ref ref) =>
    HttpConnectionProbe(logger: ref.watch(appLoggerProvider));
