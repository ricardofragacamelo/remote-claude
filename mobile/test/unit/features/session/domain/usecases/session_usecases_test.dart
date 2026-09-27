/// The use cases of the menu and the undo, over fakes of their repositories.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/domain/usecases/list_checkpoints.dart';
import 'package:remote_claude/features/session/domain/usecases/list_commands.dart';

import '../../../../../support/builders/undo.dart';
import '../../../../../support/fakes/fake_checkpoint_repository.dart';
import '../../../../../support/fakes/fake_command_repository.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

void main() {
  test('listing the commands asks about the session it is given', () async {
    final FakeCommandRepository commands = FakeCommandRepository()..answer = aMenu;

    final CommandMenu menu = await ListCommands(commands)('s-1');

    expect(menu, aMenu);
    expect(commands.reads, <String>['s-1']);
  });

  test('listing the undo points asks about the session it is given', () async {
    final FakeCheckpointRepository points = FakeCheckpointRepository()
      ..answer = <Checkpoint>[aCheckpoint()];

    expect(await ListCheckpoints(points)('s-1'), <Checkpoint>[aCheckpoint()]);
    expect(points.reads, <String>['s-1']);
  });

  group('driving the session', () {
    late FakeSessionRepository sessions;

    setUp(() => sessions = FakeSessionRepository());
    tearDown(() => sessions.dispose());

    test('S-32 · a slash command is a prompt like any other, and leaves with an id', () {
      final String? id = DriveSession(sessions).prompt('s-1', '/init');

      expect(id, isNotNull);
      expect(sessions.commands.single.$1, 'session.prompt');
      expect(
        sessions.commands.single.$2,
        equals(<String, Object?>{'sessionId': 's-1', 'text': '/init'}),
      );
    });

    test('B-18 · undoing names the session and the point, and leaves with an id', () {
      final String? id = DriveSession(sessions).rewindFiles('s-1', 'prompt-1');

      expect(id, isNotNull);
      expect(sessions.commands.single.$1, 'session.rewindFiles');
      expect(
        sessions.commands.single.$2,
        equals(<String, Object?>{'sessionId': 's-1', 'promptId': 'prompt-1'}),
      );
    });

    test('a socket that is not ready answers no id for either', () {
      sessions.accepts = false;

      expect(DriveSession(sessions).prompt('s-1', '/init'), isNull);
      expect(DriveSession(sessions).rewindFiles('s-1', 'p'), isNull);
    });
  });
}
