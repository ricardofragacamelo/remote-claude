/// `GET /sessions/:sessionId/tools/:toolUseId/diff` — the backend's own diff, never computed from
/// the call's input (plan 26, B-16).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/tool_diff_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';

Map<String, Object?> _diffWire({List<Object?>? hunks}) => <String, Object?>{
  'path': '/home/someone/project/a.ts',
  'kind': 'file.edit',
  'pending': false,
  'scope': 'file',
  'before': <String, Object?>{'state': 'content', 'content': 'old'},
  'after': <String, Object?>{'state': 'content', 'content': 'new'},
  'hunks':
      hunks ??
      <Object?>[
        <String, Object?>{
          'id': 'h1',
          'oldStart': 10,
          'oldLines': 2,
          'newStart': 10,
          'newLines': 3,
          'lines': <Object?>[
            <String, Object?>{'kind': 'context', 'text': 'unchanged line'},
            <String, Object?>{'kind': 'removed', 'text': 'old line'},
            <String, Object?>{'kind': 'added', 'text': 'new line one'},
            <String, Object?>{'kind': 'added', 'text': 'new line two'},
          ],
        },
      ],
};

void main() {
  group('S-57 · one change, from the route', () {
    test('path and the one hunk, each line numbered by the side it belongs to', () {
      final ToolDiff? diff = toolDiffFrom(_diffWire());

      expect(diff, isNotNull);
      expect(diff!.path, '/home/someone/project/a.ts');
      expect(diff.hunks, hasLength(1));
      expect(diff.hunks.single.lines, <DiffLine>[
        const DiffLine(
          kind: DiffLineKind.context,
          text: 'unchanged line',
          oldLine: 10,
          newLine: 10,
        ),
        const DiffLine(kind: DiffLineKind.removed, text: 'old line', oldLine: 11),
        const DiffLine(kind: DiffLineKind.added, text: 'new line one', newLine: 11),
        const DiffLine(kind: DiffLineKind.added, text: 'new line two', newLine: 12),
      ]);
      expect(diff.lineCount, 4);
    });
  });

  test('S-58 · three hunks (MultiEdit) stay in order, each its own numbering', () {
    final ToolDiff? diff = toolDiffFrom(
      _diffWire(
        hunks: <Object?>[
          <String, Object?>{
            'id': 'h1',
            'oldStart': 1,
            'oldLines': 1,
            'newStart': 1,
            'newLines': 1,
            'lines': <Object?>[
              <String, Object?>{'kind': 'removed', 'text': 'a'},
              <String, Object?>{'kind': 'added', 'text': 'A'},
            ],
          },
          <String, Object?>{
            'id': 'h2',
            'oldStart': 50,
            'oldLines': 1,
            'newStart': 50,
            'newLines': 1,
            'lines': <Object?>[
              <String, Object?>{'kind': 'removed', 'text': 'b'},
              <String, Object?>{'kind': 'added', 'text': 'B'},
            ],
          },
          <String, Object?>{
            'id': 'h3',
            'oldStart': 99,
            'oldLines': 1,
            'newStart': 99,
            'newLines': 1,
            'lines': <Object?>[
              <String, Object?>{'kind': 'removed', 'text': 'c'},
              <String, Object?>{'kind': 'added', 'text': 'C'},
            ],
          },
        ],
      ),
    );

    expect(diff!.hunks.map((DiffHunk h) => h.id), <String>['h1', 'h2', 'h3']);
    expect(diff.hunks[1].lines.first.oldLine, 50);
  });

  test('a kind this build does not know is read as context — never dropped, never an error', () {
    final ToolDiff? diff = toolDiffFrom(
      _diffWire(
        hunks: <Object?>[
          <String, Object?>{
            'id': 'h1',
            'oldStart': 1,
            'oldLines': 1,
            'newStart': 1,
            'newLines': 1,
            'lines': <Object?>[
              <String, Object?>{'kind': 'moved', 'text': 'odd'},
            ],
          },
        ],
      ),
    );

    expect(diff!.hunks.single.lines.single.kind, DiffLineKind.context);
  });

  group('err · a body this build cannot read', () {
    test('not a map at all', () {
      expect(toolDiffFrom('not a diff'), isNull);
      expect(toolDiffFrom(null), isNull);
    });

    test('missing a field the shape requires', () {
      final Map<String, Object?> wire = _diffWire()..remove('hunks');

      expect(toolDiffFrom(wire), isNull);
    });
  });

  test('an empty answer — no hunks at all — is a diff with nothing to show', () {
    final ToolDiff? diff = toolDiffFrom(_diffWire(hunks: <Object?>[]));

    expect(diff!.hunks, isEmpty);
    expect(diff.lineCount, 0);
  });
}
