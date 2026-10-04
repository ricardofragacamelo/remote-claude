/// The command and checkpoint repositories: the wire, as the entities, or a failure.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';
import 'package:remote_claude/features/session/data/repositories/live_session_repository_impl.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/checkpoint_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/insight_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
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

  @override
  Future<Object?> catalog(String workspacePath) async {
    asked.add('catalog:$workspacePath');
    return body;
  }

  @override
  Future<Object?> models(String sessionId) async {
    asked.add('models:$sessionId');
    return body;
  }

  @override
  Future<Object?> context(String sessionId) async {
    asked.add('context:$sessionId');
    return body;
  }

  @override
  Future<Object?> liveSessions(String workspacePath) async {
    asked.add('live:$workspacePath');
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

  group('what the composer reads — plan 10, B-11, B-14', () {
    test('the catalogue of a folder, the models of a session and its context', () async {
      final InsightRepositoryImpl insight = InsightRepositoryImpl(api);

      api.body = <String, Object?>{
        'cliVersion': '2.1.277',
        'commands': <Object?>[],
        'models': <Object?>[
          <String, Object?>{'value': 'sonnet'},
        ],
        'limits': <String, Object?>{},
      };
      final InstallationCatalog catalog = await insight.catalogOf('/w');

      api.body = <String, Object?>{'current': 'sonnet', 'models': <Object?>[]};
      final SessionModels models = await insight.modelsOf('s-1');

      api.body = <String, Object?>{'totalTokens': 10, 'maxTokens': 100, 'percentage': 10};
      final ContextUse use = await insight.contextOf('s-1');

      expect(api.asked, <String>['catalog:/w', 'models:s-1', 'context:s-1']);
      expect(catalog.models.single.value, 'sonnet');
      expect(models.current, 'sonnet');
      expect(use.percentage, 10);
    });

    test('a body this build cannot read is a failure, never an empty answer', () async {
      final InsightRepositoryImpl insight = InsightRepositoryImpl(api);
      api.body = '<html>';

      await expectLater(insight.catalogOf('/w'), throwsA(isA<UnexpectedFailure>()));
      await expectLater(insight.modelsOf('s'), throwsA(isA<UnexpectedFailure>()));
      await expectLater(insight.contextOf('s'), throwsA(isA<UnexpectedFailure>()));
    });
  });

  // Plan 10, B-41.
  group('the live sessions of a folder', () {
    test('S-153 · read from the folder asked about', () async {
      final ScriptedSessionApi api = ScriptedSessionApi()
        ..body = <String, Object?>{
          'sessions': <Object?>[
            <String, Object?>{
              'sessionId': 's-1',
              'workspacePath': '/w/a',
              'status': 'idle',
              'startedAt': '2026-10-04T10:00:00Z',
            },
          ],
        };

      final List<LiveSessionSummary> sessions = await LiveSessionRepositoryImpl(api).list('/w/a');

      expect(sessions.single.sessionId, 's-1');
      expect(api.asked, <String>['live:/w/a']);
    });

    test('S-154 · an answer that is not a list of sessions is a failure, not a crash', () async {
      final ScriptedSessionApi api = ScriptedSessionApi()..body = 'nope';

      await expectLater(
        LiveSessionRepositoryImpl(api).list('/w/a'),
        throwsA(isA<UnexpectedFailure>()),
      );
    });
  });
}
