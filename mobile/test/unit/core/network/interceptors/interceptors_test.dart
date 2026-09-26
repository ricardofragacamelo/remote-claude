import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/interceptors/auth_interceptor.dart';
import 'package:remote_claude/core/network/interceptors/trace_interceptor.dart';
import 'package:remote_claude/core/network/trace.dart';

import '../../../../support/fakes/fake_credentials.dart';
import '../../../../support/fakes/recording_writer.dart';

/// An adapter that answers what the test told it to, and remembers what it was asked.
class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this._statuses);

  final List<int> _statuses;
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final int status = _statuses.isEmpty ? 200 : _statuses.removeAt(0);

    return ResponseBody.fromString(
      status == 200 ? '{"ok":true}' : '{"error":{"code":"X","messageKey":"y","traceId":"t"}}',
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
  late FakeCredentials credentials;
  late RecordingWriter recorder;
  late AppLogger logger;

  setUp(() {
    credentials = FakeCredentials();
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
  });

  tearDown(() => logger.dispose());

  Dio build(_ScriptedAdapter adapter, {InstallIdSource? installIds}) {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: credentials,
      logger: logger,
      traceIds: TraceIds(),
      installIds: installIds,
    );
    dio.httpClientAdapter = adapter;
    return dio;
  }

  test('stamps a trace and the language on every request', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter).get<Object?>('/health');

    final RequestOptions sent = adapter.requests.single;
    expect(sent.headers['x-trace-id'], isA<String>());
    expect(sent.headers['accept-language'], 'en');
  });

  // A header rather than a body field, because it is a property of the caller and has to be
  // readable on a GET too. A browser never sends it, and that absence is what the backend's
  // approval rule reads (D-02).
  test('names the installation on every request, once there is one', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter, installIds: _StubInstallId('install-1')).get<Object?>('/health');

    expect(adapter.requests.single.headers[installIdHeader], 'install-1');
  });

  test('sends no installation header before the id has been loaded', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter, installIds: _StubInstallId(null)).get<Object?>('/health');

    expect(adapter.requests.single.headers.containsKey(installIdHeader), isFalse);
  });

  // An empty header would be worse than none: the backend reads its **presence**.
  test('sends no installation header for an empty id', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter, installIds: _StubInstallId('')).get<Object?>('/health');

    expect(adapter.requests.single.headers.containsKey(installIdHeader), isFalse);
  });

  test('sends no installation header when the client has no source for one', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter).get<Object?>('/health');

    expect(adapter.requests.single.headers.containsKey(installIdHeader), isFalse);
  });

  test('carries the credential when there is one', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter).get<Object?>('/health');

    expect(adapter.requests.single.headers['authorization'], 'Bearer token');
  });

  test('sends no authorization header while nobody is signed in', () async {
    credentials.accessToken = null;
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);
    await build(adapter).get<Object?>('/health');

    expect(adapter.requests.single.headers.containsKey('authorization'), isFalse);
  });

  test('logs both edges with the same trace and a duration', () async {
    await build(_ScriptedAdapter(<int>[200])).get<Object?>('/health');

    final Map<String, Object?> request = recorder.withOp(LogOp.httpRequest).single;
    final Map<String, Object?> response = recorder.withOp(LogOp.httpResponse).single;

    expect(request['traceId'], response['traceId']);
    expect(response['httpStatus'], 200);
    expect(response['durationMs'], isA<int>());
  });

  test('renews once on a 401 and retries with the fresh token', () async {
    credentials.renewal = 'fresh';
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[401, 200]);

    await build(adapter).get<Object?>('/health');

    expect(credentials.renewals, 1);
    expect(adapter.requests, hasLength(2));
    expect(adapter.requests.last.headers['authorization'], 'Bearer fresh');
    expect(adapter.requests.last.extra[retriedExtra], isTrue);
  });

  test('a second 401 is not a renewal loop', () async {
    credentials.renewal = 'fresh';
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[401, 401]);

    await expectLater(build(adapter).get<Object?>('/health'), throwsA(isA<DioException>()));

    expect(credentials.renewals, 1);
    expect(adapter.requests, hasLength(2));
  });

  test('a 401 nobody could renew is passed on as it is', () async {
    credentials.renewal = null;
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[401]);

    await expectLater(build(adapter).get<Object?>('/health'), throwsA(isA<DioException>()));

    expect(adapter.requests, hasLength(1));
  });

  test('a failure that is not a 401 is not retried', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[403]);

    await expectLater(build(adapter).get<Object?>('/health'), throwsA(isA<DioException>()));

    expect(credentials.renewals, 0);
    expect(recorder.withOp(LogOp.httpResponse).single['err'], isA<String>());
  });

  test('a trace already on the request is the one that travels', () async {
    final _ScriptedAdapter adapter = _ScriptedAdapter(<int>[200]);

    await build(adapter).get<Object?>(
      '/health',
      options: Options(extra: <String, Object?>{traceIdExtra: 'given-trace'}),
    );

    expect(adapter.requests.single.headers['x-trace-id'], 'given-trace');
  });
}

/// An installation identity fixed by the test.
class _StubInstallId implements InstallIdSource {
  _StubInstallId(this.installId);

  @override
  final String? installId;
}
