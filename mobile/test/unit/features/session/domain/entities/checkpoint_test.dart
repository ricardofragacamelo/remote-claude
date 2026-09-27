/// An undo point as the domain has it: whether undoing it would change anything, and its reach.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';

import '../../../../../support/builders/undo.dart';

void main() {
  test('a point with files to put back can be undone, and counts every file it reaches', () {
    final Checkpoint point = aCheckpoint();

    expect(point.canRevert, isTrue);
    expect(point.fileCount, 4);
  });

  test('a point where nothing would go back has nothing to confirm', () {
    final Checkpoint point = aCheckpoint(toRevert: const <RevertedFile>[]);

    expect(point.canRevert, isFalse);
    expect(point.fileCount, 2);
  });

  test('points, files and outcomes compare by value', () {
    expect(aCheckpoint(), aCheckpoint());
    expect(aCheckpoint(label: null), isNot(aCheckpoint()));
    expect(anOutcome(), anOutcome());
    expect(anOutcome(failed: const <String>['/x']), isNot(anOutcome()));
    expect(
      const PreservedFile(path: '/a', reason: PreserveReason.other),
      const PreservedFile(path: '/a', reason: PreserveReason.other),
    );
  });

  test('an outcome with nothing said about it lists nothing', () {
    const RewindOutcome empty = RewindOutcome(promptId: 'p');

    expect(empty.reverted, isEmpty);
    expect(empty.preserved, isEmpty);
    expect(empty.unchanged, isEmpty);
    expect(empty.failed, isEmpty);
  });
}
