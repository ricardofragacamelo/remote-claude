/// The engines endpoint, as the app calls it (plan 28, B-13).
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/features/session/data/datasources/engine_api_data_source.dart';

import '../../../../../support/builders/conversations.dart';
import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = jsonEncode(<String, Object?>{
      'defaultEngine': anEngine,
      'engines': <Object?>[engineJson()],
    });
  });

  tearDown(() => http.dispose());

  EngineApiDataSource source() => HttpEngineApiDataSource(http.client);

  test('asks the backend for its engines, and answers the decoded body', () async {
    final Object? answered = await source().engines();

    expect(http.adapter.requests.single.method, 'GET');
    expect(http.adapter.requests.single.uri.path, '/engines');
    expect(http.adapter.requests.single.uri.queryParameters, isEmpty);
    expect((answered! as Map<String, Object?>)['defaultEngine'], anEngine);
  });

  test('both edges are logged by the client', () async {
    await source().engines();

    expect(http.recorder.withOp(LogOp.httpRequest), hasLength(1));
    expect(http.recorder.withOp(LogOp.httpResponse), hasLength(1));
  });

  test('a refusal arrives as a Failure, never as a transport exception', () async {
    http.adapter
      ..status = 401
      ..body =
          '{"error":{"code":"UNAUTHENTICATED","messageKey":"auth.error.unauthenticated","traceId":"t"}}';

    await expectLater(source().engines(), throwsA(isA<Failure>()));
  });
}
