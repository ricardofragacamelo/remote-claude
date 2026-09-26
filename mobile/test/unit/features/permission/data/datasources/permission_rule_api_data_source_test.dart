import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_rule_api_data_source.dart';

import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/recording_writer.dart';
import '../../../../../support/fakes/scripted_adapter.dart';

void main() {
  late AppLogger logger;
  late ScriptedAdapter adapter;

  setUp(() {
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
    adapter = ScriptedAdapter()
      ..status = 200
      ..body = '{"rules":[]}';
  });

  tearDown(() => logger.dispose());

  PermissionRuleApiDataSource build() {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );
    dio.httpClientAdapter = adapter;

    return HttpPermissionRuleApiDataSource(ApiClient(dio, TraceIds()));
  }

  test('lists from the one endpoint there is', () async {
    expect(await build().list(), <String, Object?>{'rules': <Object?>[]});
    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.path, '/permission-rules');
  });

  test('revokes by deleting the rule', () async {
    await build().revoke('rule_1');

    expect(adapter.requests.single.method, 'DELETE');
    expect(adapter.requests.single.path, '/permission-rules/rule_1');
  });

  test('escapes an id, so nothing a backend answered can build a path of its own', () async {
    await build().revoke('rule/../other');

    expect(adapter.requests.single.path, '/permission-rules/rule%2F..%2Fother');
  });
}
