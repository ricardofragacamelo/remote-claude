import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';

import '../../../support/fakes/fake_credentials.dart';
import '../../../support/fakes/recording_writer.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter({this.status = 200, this.body = '{"ok":true}', this.fail = false});

  int status;
  String body;
  bool fail;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;

    if (fail) {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    }

    return ResponseBody.fromString(
      body,
      status,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late RecordingWriter recorder;
  late AppLogger logger;

  setUp(() {
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
  });

  tearDown(() => logger.dispose());

  ApiClient clientWith(_Adapter adapter) {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );
    dio.httpClientAdapter = adapter;
    return ApiClient(dio, TraceIds());
  }

  test('answers the decoded body of a GET', () async {
    expect(await clientWith(_Adapter()).get('/health'), <String, Object?>{'ok': true});
  });

  test('sends the body of a POST', () async {
    final _Adapter adapter = _Adapter();
    await clientWith(adapter).post('/auth/session', body: <String, Object?>{'code': 'c'});

    expect(adapter.lastRequest!.method, 'POST');
    expect(adapter.lastRequest!.data, <String, Object?>{'code': 'c'});
  });

  test('a refusal reaches the caller as a Failure, never as a DioException', () async {
    final _Adapter adapter = _Adapter(
      status: 404,
      body:
          '{"error":{"code":"SESSION_NOT_FOUND","messageKey":"session.error.notFound",'
          '"traceId":"t-1"}}',
    );

    await expectLater(
      clientWith(adapter).get('/sessions/x'),
      throwsA(isA<ServerFailure>().having((Failure f) => f.code, 'code', 'SESSION_NOT_FOUND')),
    );
  });

  test('a network that is not there reaches the caller as a NetworkFailure', () async {
    await expectLater(
      clientWith(_Adapter(fail: true)).get('/health'),
      throwsA(isA<NetworkFailure>()),
    );
  });

  test('the request carries a deadline', () {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );

    expect(dio.options.connectTimeout, requestTimeout);
    expect(dio.options.receiveTimeout, requestTimeout);
  });
}
