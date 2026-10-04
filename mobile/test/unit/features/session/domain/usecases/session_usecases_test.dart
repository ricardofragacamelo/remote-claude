/// The use cases of the menu and the undo, over fakes of their repositories.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/domain/usecases/list_checkpoints.dart';
import 'package:remote_claude/features/session/domain/usecases/list_commands.dart';
import 'package:remote_claude/features/session/domain/usecases/read_insight.dart';

import '../../../../../support/builders/undo.dart';
import '../../../../../support/fakes/fake_checkpoint_repository.dart';
import '../../../../../support/fakes/fake_command_repository.dart';
import '../../../../../support/fakes/fake_insight_repository.dart';
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

    test('S-81 · a fork continues the conversation from before the prompt, with an id', () {
      final String? id = DriveSession(sessions).fork('/work', 'conv-1', 'u1');

      expect(id, isNotNull);
      expect(sessions.commands.single.$1, 'session.start');
      expect(
        sessions.commands.single.$2,
        equals(<String, Object?>{
          'workspacePath': '/work',
          'resumeSessionId': 'conv-1',
          'forkAt': 'u1',
        }),
      );
    });

    test('a socket that is not ready answers no id for either', () {
      sessions.accepts = false;

      expect(DriveSession(sessions).prompt('s-1', '/init'), isNull);
      expect(DriveSession(sessions).rewindFiles('s-1', 'p'), isNull);
    });

    test('S-19 · a draft opens its session with what was chosen, and nothing it left alone', () {
      final DriveSession drive = DriveSession(sessions);

      drive.start(
        '/w',
        choices: const SessionChoices(model: 'opus', permissionMode: 'plan', effort: 'high'),
      );
      drive.start('/w');

      expect(sessions.commands.first.$2, <String, Object?>{
        'workspacePath': '/w',
        'model': 'opus',
        'permissionMode': 'plan',
        'effort': 'high',
      });
      expect(sessions.commands.last.$2, <String, Object?>{'workspacePath': '/w'});
    });

    test('S-32 · S-39 · the model, the mode and the queue each leave with an id', () {
      final DriveSession drive = DriveSession(sessions);

      expect(drive.setModel('s-1', 'opus'), isNotNull);
      expect(drive.setPermissionMode('s-1', 'acceptEdits'), isNotNull);
      expect(drive.cancelQueuedPrompt('s-1', 'q-1'), isNotNull);

      expect(sessions.commands.map(((String, Map<String, Object?>) c) => c.$1), <String>[
        'session.setModel',
        'session.setPermissionMode',
        'session.cancelQueuedPrompt',
      ]);
      expect(sessions.commands.map(((String, Map<String, Object?>) c) => c.$2), <Object?>[
        <String, Object?>{'sessionId': 's-1', 'model': 'opus'},
        <String, Object?>{'sessionId': 's-1', 'mode': 'acceptEdits'},
        <String, Object?>{'sessionId': 's-1', 'queueId': 'q-1'},
      ]);
    });
  });

  test('reading the insight asks about the folder or the session it is given', () async {
    final FakeInsightRepository insight = FakeInsightRepository();
    final ReadInsight read = ReadInsight(insight);

    expect((await read.catalog('/w')).models, insight.catalog.models);
    expect((await read.models('s-1')).current, 'sonnet');
    expect((await read.context('s-1')).percentage, 25);
    expect(insight.asked, <String>['catalog:/w', 'models:s-1', 'context:s-1']);
  });
}
