/// The commands and undo endpoints of a live session, as the app calls them (B-14, B-19).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';

import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = '{"cliVersion":null,"commands":[]}';
  });

  tearDown(() => http.dispose());

  SessionApiDataSource source() => HttpSessionApiDataSource(http.client);

  test('asks the session for its commands, the id encoded as a path segment', () async {
    final Object? answered = await source().commands('s/1');

    expect(http.adapter.requests.single.method, 'GET');
    expect(http.adapter.requests.single.uri.path, '/sessions/s%2F1/commands');
    expect(answered, isA<Map<String, Object?>>());
  });

  test('asks the session for its undo points', () async {
    http.adapter.body = '{"checkpoints":[]}';

    await source().checkpoints('s-1');

    expect(http.adapter.requests.single.uri.path, '/sessions/s-1/checkpoints');
  });

  test('both edges are logged by the client', () async {
    await source().commands('s-1');

    expect(http.recorder.withOp(LogOp.httpRequest), hasLength(1));
    expect(http.recorder.withOp(LogOp.httpResponse), hasLength(1));
  });

  test('S-31 · a machine that did not answer arrives as a Failure, never an exception', () async {
    http.adapter
      ..status = 504
      ..body =
          '{"error":{"code":"CLAUDE_TIMEOUT","messageKey":"session.error.claudeTimeout","traceId":"t"}}';

    await expectLater(
      source().commands('s-1'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'CLAUDE_TIMEOUT')),
    );
  });

  test('S-39 · the points of a session that is not live arrive as SESSION_NOT_FOUND', () async {
    http.adapter
      ..status = 404
      ..body =
          '{"error":{"code":"SESSION_NOT_FOUND","messageKey":"session.error.notFound","traceId":"t"}}';

    await expectLater(
      source().checkpoints('s-1'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'SESSION_NOT_FOUND')),
    );
  });
}
