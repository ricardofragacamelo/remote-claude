/// `GET /transcripts/:engine/:id/subagents/:toolUseId/messages`, as the app calls it (plan 26, B-20).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/subagent_api_data_source.dart';

import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  const ConversationKey conversation = ConversationKey(engine: 'claude', id: 'c/1');

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = '{"events":[],"nextCursor":null}';
  });

  tearDown(() => http.dispose());

  SubagentApiDataSource source() => HttpSubagentApiDataSource(http.client);

  test('asks the subagent of a conversation, every id its own path segment', () async {
    await source().messages(conversation, 'agent/1');

    expect(http.adapter.requests.single.method, 'GET');
    expect(
      http.adapter.requests.single.uri.path,
      '/transcripts/claude/c%2F1/subagents/agent%2F1/messages',
    );
  });

  test('carries the cursor of a later page, when asked for one', () async {
    await source().messages(conversation, 'agent-1', cursor: '42');

    expect(http.adapter.requests.single.uri.queryParameters['cursor'], '42');
  });

  test('sends the folder it already knows, as a hint — S-163', () async {
    await source().messages(conversation, 'agent-1', workspacePath: '/home/someone/project');

    expect(
      http.adapter.requests.single.uri.queryParameters['workspacePath'],
      '/home/someone/project',
    );
  });

  test('a failure of the route arrives as a Failure, never an exception', () async {
    http.adapter
      ..status = 404
      ..body =
          '{"error":{"code":"NOT_FOUND","messageKey":"transcript.error.notFound","traceId":"t"}}';

    await expectLater(
      source().messages(conversation, 'agent-1'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'NOT_FOUND')),
    );
  });
}
