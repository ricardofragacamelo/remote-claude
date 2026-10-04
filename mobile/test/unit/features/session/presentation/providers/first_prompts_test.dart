/// The first prompt of a session this app just opened, and what crosses to that session's screen.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/presentation/providers/owned_sessions.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/fakes/fake_session_repository.dart';

void main() {
  late FakeSessionRepository sessions;
  late ProviderContainer container;

  setUp(() {
    sessions = FakeSessionRepository();
    container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(sessions as SessionRepository),
      ],
    );
  });

  tearDown(() async {
    container.dispose();
    await sessions.dispose();
  });

  FirstPrompts prompts() => container.read(firstPromptsProvider.notifier);

  test('sends the prompt to the session, and keeps its id for the session’s screen, once', () {
    expect(prompts().send('s-1', 'hello', effort: 'high'), isTrue);

    expect(sessions.commands.single.$2, <String, Object?>{'sessionId': 's-1', 'text': 'hello'});
    expect(container.read(firstPromptsProvider), <String, String?>{'s-1': 'high'});
    expect(prompts().takeCommand('s-1'), 'command-1');
    expect(prompts().takeCommand('s-1'), isNull);
    expect(prompts().takeText('s-1'), isNull);
  });

  test('a prompt that could not leave waits for the session’s box, once', () {
    sessions.accepts = false;

    expect(prompts().send('s-1', 'do not lose this'), isFalse);

    expect(prompts().takeText('s-1'), 'do not lose this');
    expect(prompts().takeText('s-1'), isNull);
    expect(prompts().takeCommand('s-1'), isNull);
  });

  test('a resume remembers no effort: it was not chosen here', () {
    prompts().send('s-2', 'go on', remembersEffort: false);

    expect(container.read(firstPromptsProvider), isEmpty);
  });

  test('every session sent a first prompt from here is this app’s to end — once in the list', () {
    prompts().send('s-1', 'hello');
    prompts().send('s-2', 'go on', remembersEffort: false);
    container.read(ownedSessionsProvider.notifier).claim('s-1');

    expect(container.read(ownedSessionsProvider), <String>{'s-1', 's-2'});
  });
}
