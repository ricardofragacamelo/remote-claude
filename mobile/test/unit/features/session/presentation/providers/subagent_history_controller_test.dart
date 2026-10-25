/// A subagent's own messages, read once when its card opens in the history (plan 26, B-20).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/domain/repositories/subagent_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/subagent_history_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/fakes/fake_subagent_repository.dart';

const ConversationKey conversation = ConversationKey(engine: 'claude', id: 'c1');

void main() {
  late FakeSubagentRepository repo;

  ProviderContainer build() {
    repo = FakeSubagentRepository();
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        subagentRepositoryProvider.overrideWithValue(repo as SubagentRepository),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('reads the page of the conversation and the tool asked about', () async {
    final ProviderContainer container = build();
    repo.pages['agent-1'] = const SubagentPage(events: <SessionEvent>[]);

    final SubagentPage page = await container.read(
      subagentHistoryControllerProvider(conversation, 'agent-1', null).future,
    );

    expect(page.events, isEmpty);
    expect(repo.reads, <(ConversationKey, String)>[(conversation, 'agent-1')]);
  });

  test('a failure stays on screen — asking again reads it once more', () async {
    final ProviderContainer container = build();
    repo.failure = const NetworkFailure(traceId: 't');

    await expectLater(
      container.read(subagentHistoryControllerProvider(conversation, 'agent-1', null).future),
      throwsA(isA<NetworkFailure>()),
    );

    repo.failure = null;
    repo.pages['agent-1'] = const SubagentPage(events: <SessionEvent>[]);
    container.read(subagentHistoryControllerProvider(conversation, 'agent-1', null).notifier).retry();

    await container.read(subagentHistoryControllerProvider(conversation, 'agent-1', null).future);
    expect(repo.reads, hasLength(2));
  });
}
