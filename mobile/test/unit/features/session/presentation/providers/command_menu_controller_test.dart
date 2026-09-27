/// The command menu of one session: read when opened, read again on retry (B-15).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/command_menu_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/undo.dart';
import '../../../../../support/fakes/fake_command_repository.dart';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'session.error.claudeUnavailable',
  traceId: 'trace-1',
);

void main() {
  late FakeCommandRepository commands;
  late ProviderContainer container;

  setUp(() {
    commands = FakeCommandRepository()..answer = aMenu;
    container = ProviderContainer(
      overrides: <Override>[
        commandRepositoryProvider.overrideWithValue(commands as CommandRepository),
      ],
    );
    addTearDown(container.dispose);
  });

  CommandMenuControllerProvider menuOf(String sessionId) =>
      commandMenuControllerProvider(sessionId);

  void hold(String sessionId) {
    final ProviderSubscription<AsyncValue<CommandMenu>> subscription = container.listen(
      menuOf(sessionId),
      (AsyncValue<CommandMenu>? previous, AsyncValue<CommandMenu> next) {},
    );
    addTearDown(subscription.close);
  }

  test('S-29 · reads what the installation of that session offers', () async {
    hold('s-1');

    expect(await container.read(menuOf('s-1').future), aMenu);
    expect(commands.reads, <String>['s-1']);
  });

  test('S-31 · a menu that could not be read is a failure, and a retry reads it again', () async {
    commands.failure = unavailable;
    hold('s-1');

    await Future<void>.delayed(Duration.zero);
    expect(container.read(menuOf('s-1')).error, unavailable);

    commands.failure = null;
    container.read(menuOf('s-1').notifier).reload();

    expect(await container.read(menuOf('s-1').future), aMenu);
    expect(container.read(menuOf('s-1')).error, isNull);
  });
}
