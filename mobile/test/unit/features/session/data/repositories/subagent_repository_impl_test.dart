/// The subagent repository: a subagent's own messages, as the entities its card draws.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/subagent_api_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/subagent_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';

const ConversationKey conversation = ConversationKey(engine: 'claude', id: 'c1');

/// Answers whatever the test set, and remembers who asked.
class _ScriptedApi implements SubagentApiDataSource {
  Object? body;
  final List<(ConversationKey, String, String?, String?)> asked =
      <(ConversationKey, String, String?, String?)>[];

  @override
  Future<Object?> messages(
    ConversationKey conversation,
    String toolUseId, {
    String? cursor,
    String? workspacePath,
  }) async {
    asked.add((conversation, toolUseId, cursor, workspacePath));
    return body;
  }
}

void main() {
  late _ScriptedApi api;

  setUp(() => api = _ScriptedApi());

  test(
    'reads the page the body describes, for the conversation and the tool asked about',
    () async {
      api.body = <String, Object?>{
        'events': <Object?>[
          <String, Object?>{
            'type': 'message.completed',
            'payload': <String, Object?>{
              'messageId': 'm1',
              'role': 'assistant',
              'content': <Object?>[],
            },
          },
        ],
        'nextCursor': null,
      };

      final SubagentPage page = await SubagentRepositoryImpl(api).page(conversation, 'agent-1');

      expect(page.events, hasLength(1));
      expect(page.events.single, isA<MessageFinished>());
      expect(api.asked, <(ConversationKey, String, String?, String?)>[
        (conversation, 'agent-1', null, null),
      ]);
    },
  );

  test('carries the folder it already knows, as a hint — S-163', () async {
    api.body = <String, Object?>{'events': <Object?>[], 'nextCursor': null};

    await SubagentRepositoryImpl(
      api,
    ).page(conversation, 'agent-1', workspacePath: '/home/someone/project');

    expect(api.asked.single, (conversation, 'agent-1', null, '/home/someone/project'));
  });

  test('a body this build cannot read is a failure, not a crash', () async {
    api.body = 'nope';

    await expectLater(
      SubagentRepositoryImpl(api).page(conversation, 'agent-1'),
      throwsA(isA<UnexpectedFailure>()),
    );
  });
}
