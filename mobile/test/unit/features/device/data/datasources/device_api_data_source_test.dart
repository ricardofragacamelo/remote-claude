import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/device/data/datasources/device_api_data_source.dart';

import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/recording_writer.dart';
import '../../../../../support/fakes/scripted_adapter.dart';

void main() {
  late RecordingWriter recorder;
  late AppLogger logger;
  late ScriptedAdapter adapter;

  setUp(() {
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
    adapter = ScriptedAdapter()
      ..status = 201
      ..body = '{"id":"dev_1"}';
  });

  tearDown(() => logger.dispose());

  DeviceApiDataSource build() {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );
    dio.httpClientAdapter = adapter;

    return HttpDeviceApiDataSource(ApiClient(dio, TraceIds()));
  }

  test('posts the registration to the one endpoint there is', () async {
    await build().register(<String, Object?>{'installId': 'install-1'});

    expect(adapter.requests.single.path, '/devices');
    expect(adapter.requests.single.method, 'POST');
    expect(adapter.requests.single.data, <String, Object?>{'installId': 'install-1'});
  });

  test('lists the devices of this user from the same endpoint', () async {
    await build().list();

    expect(adapter.requests.single.path, '/devices');
    expect(adapter.requests.single.method, 'GET');
  });

  test('answers the decoded body, which is the device the backend recorded', () async {
    final Object? answered = await build().register(<String, Object?>{'installId': 'install-1'});

    expect(answered, <String, Object?>{'id': 'dev_1'});
  });

  // The client turns a refusal into a [Failure] before anybody above `data/` sees it: a data
  // source that let a `DioException` through would make every caller know what Dio is.
  test('lets a refusal through as a Failure, never as a transport exception', () async {
    adapter.status = 403;
    adapter.body =
        '{"error":{"code":"FORBIDDEN","messageKey":"common.error.forbidden","traceId":"t"}}';

    await expectLater(
      build().register(<String, Object?>{'installId': 'install-1'}),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'FORBIDDEN')),
    );
  });
}
