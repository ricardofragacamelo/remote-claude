/// The root a session can be opened in.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

void main() {
  test('compares by value, so a reload is not a change', () {
    final DateTime used = DateTime.utc(2026, 9, 19);

    expect(
      Workspace(path: '/p', label: 'p', lastUsedAt: used),
      Workspace(path: '/p', label: 'p', lastUsedAt: used),
    );
    expect(const Workspace(path: '/p', label: 'p'), isNot(const Workspace(path: '/q', label: 'p')));
    expect(
      const Workspace(path: '/p', label: 'p'),
      isNot(Workspace(path: '/p', label: 'p', lastUsedAt: used)),
    );
  });
}
