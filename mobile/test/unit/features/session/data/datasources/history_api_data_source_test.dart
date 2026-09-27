/// The history endpoint, as the app calls it.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/features/session/data/datasources/history_api_data_source.dart';

import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = '{"session":{"sessionId":"c/1"},"events":[],"nextCursor":null}';
  });

  tearDown(() => http.dispose());

  HistoryApiDataSource source() => HttpHistoryApiDataSource(http.client);

  test('reads the latest page of one conversation, with no cursor', () async {
    final Object? answered = await source().messages('c/1');

    expect(http.adapter.requests.single.method, 'GET');
    // The id is a path segment, so a character that would split it is encoded.
    expect(http.adapter.requests.single.uri.path, '/transcripts/c%2F1/messages');
    expect(http.adapter.requests.single.uri.queryParameters, isEmpty);
    expect(answered, isA<Map<String, Object?>>());
  });

  test('asks for the page before a cursor by passing it back as it came', () async {
    await source().messages('c-1', cursor: 'msg-9');

    expect(http.adapter.requests.single.uri.queryParameters, <String, String>{'cursor': 'msg-9'});
  });

  test('both edges are logged by the client, and what was said never is', () async {
    http.adapter.body =
        '{"session":{"sessionId":"c-1"},"events":[{"type":"message.completed",'
        '"payload":{"messageId":"m1","content":[{"type":"text","text":"a secret plan"}]}}]}';

    await source().messages('c-1');

    expect(http.recorder.withOp(LogOp.httpRequest), hasLength(1));
    expect(http.recorder.withOp(LogOp.httpResponse), hasLength(1));
    expect(http.recorder.lines.join('\n'), isNot(contains('a secret plan')));
  });

  test('S-17 · a refusal arrives as a Failure, never as a transport exception', () async {
    http.adapter
      ..status = 502
      ..body =
          '{"error":{"code":"CLAUDE_UNAVAILABLE","messageKey":"transcript.error.claudeUnavailable","traceId":"t"}}';

    await expectLater(
      source().messages('c-1'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'CLAUDE_UNAVAILABLE')),
    );
  });
}
