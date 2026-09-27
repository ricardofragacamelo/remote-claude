/// The command and checkpoint repositories: the wire, as the entities, or a failure.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/checkpoint_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

/// Answers whatever body the test set, and remembers who asked.
class ScriptedSessionApi implements SessionApiDataSource {
  Object? body;
  final List<String> asked = <String>[];

  @override
  Future<Object?> commands(String sessionId) async {
    asked.add('commands:$sessionId');
    return body;
  }

  @override
  Future<Object?> checkpoints(String sessionId) async {
    asked.add('checkpoints:$sessionId');
    return body;
  }
}

void main() {
  late ScriptedSessionApi api;

  setUp(() => api = ScriptedSessionApi());

  group('the commands', () {
    test('are the menu the body describes', () async {
      api.body = <String, Object?>{
        'cliVersion': '2.1.277',
        'commands': <Object?>[
          <String, Object?>{'name': 'init', 'suggested': true},
        ],
      };

      final CommandMenu menu = await CommandRepositoryImpl(api).menu('s-1');

      expect(api.asked, <String>['commands:s-1']);
      expect(menu.commands.single.name, 'init');
    });

    test('a body this build cannot read is a failure, never "no commands"', () async {
      api.body = '<html>';

      await expectLater(CommandRepositoryImpl(api).menu('s-1'), throwsA(isA<UnexpectedFailure>()));
    });
  });

  group('the undo points', () {
    test('are the points the body describes', () async {
      api.body = <String, Object?>{
        'checkpoints': <Object?>[
          <String, Object?>{
            'promptId': 'p-1',
            'label': null,
            'at': '2026-09-26T12:00:00.000Z',
            'files': <Object?>[],
          },
        ],
      };

      final List<Checkpoint> points = await CheckpointRepositoryImpl(api).list('s-1');

      expect(api.asked, <String>['checkpoints:s-1']);
      expect(points.single.promptId, 'p-1');
    });

    test('a body this build cannot read is a failure, never "nothing to undo"', () async {
      api.body = <String, Object?>{'points': <Object?>[]};

      await expectLater(
        CheckpointRepositoryImpl(api).list('s-1'),
        throwsA(isA<UnexpectedFailure>()),
      );
    });
  });
}
