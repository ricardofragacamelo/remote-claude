/// `changesFileText` — whether a diff is worth reading for a call, by the op the backend
/// normalised, never by its name (plan 26, B-16).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';

FileChange _changeOf(String op) => FileChange(path: '/a.ts', op: op);

void main() {
  test('edit and write are worth a diff', () {
    expect(changesFileText(<FileChange>[_changeOf('edit')]), isTrue);
    expect(changesFileText(<FileChange>[_changeOf('write')]), isTrue);
  });

  test('delete and move touch no text a diff would show', () {
    expect(changesFileText(<FileChange>[_changeOf('delete')]), isFalse);
    expect(changesFileText(<FileChange>[_changeOf('move')]), isFalse);
  });

  test('no changes at all is nothing to diff', () {
    expect(changesFileText(const <FileChange>[]), isFalse);
  });

  test('one diffable change among several is enough', () {
    expect(changesFileText(<FileChange>[_changeOf('delete'), _changeOf('edit')]), isTrue);
  });
}
