/// Reading the allowlist off the wire.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/workspace/data/mappers/workspace_mapper.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

void main() {
  group('workspaceFrom', () {
    test('reads a root with the date this user last opened something under it', () {
      final Workspace? workspace = workspaceFrom(<String, Object?>{
        'path': '/home/someone/project',
        'label': 'project',
        'lastUsedAt': '2026-09-19T10:00:00.000Z',
      });

      expect(workspace?.path, '/home/someone/project');
      expect(workspace?.label, 'project');
      expect(workspace?.lastUsedAt, DateTime.utc(2026, 9, 19, 10));
    });

    test('a root nobody has opened has no date, which is not an error', () {
      final Workspace? workspace = workspaceFrom(<String, Object?>{
        'path': '/p',
        'label': 'p',
        'lastUsedAt': null,
      });

      expect(workspace?.lastUsedAt, isNull);
    });

    test('a date that is not one is read as no date rather than throwing', () {
      expect(
        workspaceFrom(<String, Object?>{
          'path': '/p',
          'label': 'p',
          'lastUsedAt': 'yesterday',
        })?.lastUsedAt,
        isNull,
      );
    });

    test('an entry missing what makes it a workspace is not one', () {
      expect(workspaceFrom(<String, Object?>{'label': 'p'}), isNull);
      expect(workspaceFrom(<String, Object?>{'path': '/p'}), isNull);
      expect(workspaceFrom(<String, Object?>{'path': 1, 'label': 'p'}), isNull);
      expect(workspaceFrom('a string'), isNull);
    });
  });

  group('workspacesFrom', () {
    test('keeps the order the backend gave', () {
      final List<Workspace> workspaces = workspacesFrom(<String, Object?>{
        'workspaces': <Object?>[
          <String, Object?>{'path': '/b', 'label': 'b'},
          <String, Object?>{'path': '/a', 'label': 'a'},
        ],
      });

      expect(workspaces.map((Workspace w) => w.label), <String>['b', 'a']);
    });

    test('one malformed row costs that row, not the screen', () {
      final List<Workspace> workspaces = workspacesFrom(<String, Object?>{
        'workspaces': <Object?>[
          <String, Object?>{'path': '/a', 'label': 'a'},
          <String, Object?>{'label': 'broken'},
          'not even a map',
        ],
      });

      expect(workspaces, hasLength(1));
    });

    test('an answer that is not a listing is an empty one', () {
      expect(workspacesFrom(null), isEmpty);
      expect(workspacesFrom(<String, Object?>{}), isEmpty);
      expect(workspacesFrom(<String, Object?>{'workspaces': 'nope'}), isEmpty);
    });
  });
}
