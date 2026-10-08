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

  test('sends a DELETE to the path it was given', () async {
    final _Adapter adapter = _Adapter();
    await clientWith(adapter).delete('/permission-rules/rule_1');

    expect(adapter.lastRequest!.method, 'DELETE');
    expect(adapter.lastRequest!.path, '/permission-rules/rule_1');
  });

  test('sends the body of a PUT, and a DELETE with its query', () async {
    final _Adapter adapter = _Adapter();
    final ApiClient client = clientWith(adapter);

    await client.put('/workspaces/recent/pin', body: <String, Object?>{'pinned': true});
    expect(adapter.lastRequest!.method, 'PUT');
    expect(adapter.lastRequest!.data, <String, Object?>{'pinned': true});

    await client.delete('/workspaces/open-folders', query: <String, Object?>{'path': '/w/a'});
    expect(adapter.lastRequest!.method, 'DELETE');
    expect(adapter.lastRequest!.queryParameters, <String, Object?>{'path': '/w/a'});
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

  group('a GET of bytes — plan 22, B-33', () {
    test('answers the bytes as they came, and their type', () async {
      final _Adapter adapter = _Adapter(body: 'PNGDATA');

      final ByteAnswer answer = await clientWith(adapter).bytes('/transcripts/c/images/b');

      expect(String.fromCharCodes(answer.bytes), 'PNGDATA');
      expect(answer.contentType, Headers.jsonContentType);
      expect(adapter.lastRequest!.responseType, ResponseType.bytes);
      expect(adapter.lastRequest!.headers['accept'], '*/*');
    });

    test(
      'a refusal is read from the bytes it came in, and reaches the caller as a Failure',
      () async {
        final _Adapter adapter = _Adapter(
          status: 413,
          body:
              '{"error":{"code":"PAYLOAD_TOO_LARGE","messageKey":"transcript.error.imageTooLarge",'
              '"traceId":"t-9"}}',
        );

        await expectLater(
          clientWith(adapter).bytes('/transcripts/c/images/b'),
          throwsA(
            isA<ServerFailure>()
                .having((Failure f) => f.code, 'code', 'PAYLOAD_TOO_LARGE')
                .having((Failure f) => f.traceId, 'traceId', 't-9'),
          ),
        );
      },
    );

    test('a refusal whose bytes are not the envelope is the generic failure', () async {
      await expectLater(
        clientWith(_Adapter(status: 502, body: '<html>bad gateway</html>')).bytes('/x'),
        throwsA(isA<UnexpectedFailure>()),
      );
    });

    test('a network that is not there reaches the caller as a NetworkFailure', () async {
      await expectLater(
        clientWith(_Adapter(fail: true)).bytes('/x'),
        throwsA(isA<NetworkFailure>()),
      );
    });
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
