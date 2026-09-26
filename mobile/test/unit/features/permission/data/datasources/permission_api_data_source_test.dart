/// The permission endpoint, as the app calls it.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_api_data_source.dart';

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
    adapter = ScriptedAdapter()..body = '{"status":"resolved","requestId":"req-1"}';
  });

  tearDown(() => logger.dispose());

  PermissionApiDataSource build() {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );
    dio.httpClientAdapter = adapter;

    return HttpPermissionApiDataSource(ApiClient(dio, TraceIds()));
  }

  test('asks the one endpoint for that request of that session, and answers its body', () async {
    final Object? answered = await build().lookup('ses-1', 'req-1');

    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.path, '/sessions/ses-1/permissions/req-1');
    expect(answered, <String, Object?>{'status': 'resolved', 'requestId': 'req-1'});
  });

  test('encodes both ids, so neither can reach another path', () async {
    await build().lookup('ses/1 ?x', 'req#1/..');

    expect(adapter.requests.single.uri.path, '/sessions/ses%2F1%20%3Fx/permissions/req%231%2F..');
    expect(adapter.requests.single.uri.query, isEmpty);
  });

  for (final (int status, String code) in <(int, String)>[
    (404, 'PERMISSION_REQUEST_NOT_FOUND'),
    (410, 'PERMISSION_REQUEST_EXPIRED'),
    (403, 'PERMISSION_NOT_OWNED'),
  ]) {
    test('lets a $status through as a Failure carrying $code', () async {
      adapter.status = status;
      adapter.body = '{"error":{"code":"$code","messageKey":"k","traceId":"t"}}';

      await expectLater(
        build().lookup('ses-1', 'req-1'),
        throwsA(isA<Failure>().having((Failure f) => f.code, 'code', code)),
      );
    });
  }
}
