/// The one HTTP client of the app, over an adapter a test scripts.
///
/// Every data source test builds the same thing — the real Dio with every interceptor, answering
/// from a [ScriptedAdapter] — and one copy of that is what keeps them from drifting apart.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';

import 'fake_credentials.dart';
import 'recording_writer.dart';
import 'scripted_adapter.dart';

/// The client, the adapter it answers from, and what it logged.
class ScriptedHttp {
  ScriptedHttp() : recorder = RecordingWriter() {
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );

    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );
    dio.httpClientAdapter = adapter;
    client = ApiClient(dio, TraceIds());
  }

  final ScriptedAdapter adapter = ScriptedAdapter();
  final RecordingWriter recorder;
  late final AppLogger logger;
  late final ApiClient client;

  /// Releases the logger.
  Future<void> dispose() => logger.dispose();
}
