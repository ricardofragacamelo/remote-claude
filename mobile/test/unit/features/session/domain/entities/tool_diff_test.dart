/// The diff of a file-writing call, as the domain has it: its hunks, and how many lines they hold
/// together (plan 26, B-16).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';

void main() {
  test('a line compares by its kind, its text and the sides it belongs to', () {
    expect(
      const DiffLine(kind: DiffLineKind.added, text: 'a', newLine: 1),
      const DiffLine(kind: DiffLineKind.added, text: 'a', newLine: 1),
    );
    expect(
      const DiffLine(kind: DiffLineKind.added, text: 'a', newLine: 1),
      isNot(const DiffLine(kind: DiffLineKind.added, text: 'a', newLine: 2)),
    );
  });

  test('a hunk compares by its id and its lines', () {
    const List<DiffLine> lines = <DiffLine>[
      DiffLine(kind: DiffLineKind.context, text: 'x', oldLine: 1, newLine: 1),
    ];

    expect(const DiffHunk(id: 'h1', lines: lines), const DiffHunk(id: 'h1', lines: lines));
    expect(const DiffHunk(id: 'h1', lines: lines), isNot(const DiffHunk(id: 'h2', lines: lines)));
  });

  test('the line count is every line of every hunk, summed', () {
    const List<DiffHunk> hunks = <DiffHunk>[
      DiffHunk(
        id: 'h1',
        lines: <DiffLine>[
          DiffLine(kind: DiffLineKind.removed, text: 'a', oldLine: 1),
          DiffLine(kind: DiffLineKind.added, text: 'A', newLine: 1),
        ],
      ),
      DiffHunk(
        id: 'h2',
        lines: <DiffLine>[DiffLine(kind: DiffLineKind.context, text: 'b', oldLine: 5, newLine: 5)],
      ),
    ];

    expect(const ToolDiff(path: '/w/a.ts', hunks: hunks).lineCount, 3);
    expect(
      const ToolDiff(path: '/w/a.ts', hunks: hunks),
      const ToolDiff(path: '/w/a.ts', hunks: hunks),
    );
    expect(
      const ToolDiff(path: '/w/a.ts', hunks: hunks),
      isNot(const ToolDiff(path: '/w/other.ts', hunks: hunks)),
    );
  });

  test('a diff with no hunks has nothing to count', () {
    expect(const ToolDiff(path: '/w/a.ts', hunks: <DiffHunk>[]).lineCount, 0);
  });
}
