/// The two wires of the undo: the points and the outcome (B-18, B-19).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/rewind_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';

import '../../../../../support/builders/undo.dart';

Map<String, Object?> pointWire({
  Object? promptId = 'prompt-1',
  Object? label = 'refactor the parser',
  Object? at = '2026-09-26T12:00:00.000Z',
  Object? files,
}) => <String, Object?>{
  'promptId': promptId,
  'label': label,
  'at': at,
  'files':
      files ??
      <Object?>[
        <String, Object?>{
          'path': '/home/someone/project/a.ts',
          'outcome': 'revert',
          'action': 'restore',
        },
        <String, Object?>{
          'path': '/home/someone/project/new.ts',
          'outcome': 'revert',
          'action': 'delete',
        },
        <String, Object?>{
          'path': '/home/someone/project/b.ts',
          'outcome': 'preserve',
          'reason': 'modifiedOutside',
        },
        <String, Object?>{'path': '/home/someone/project/c.ts', 'outcome': 'unchanged'},
      ],
};

void main() {
  group('the points', () {
    test('S-38 · every file of a point, split by what going back does to it', () {
      final List<Checkpoint>? points = checkpointsIn(<String, Object?>{
        'checkpoints': <Object?>[pointWire()],
      });

      expect(points, <Checkpoint>[aCheckpoint()]);
    });

    test('a point whose turn had no prompt has no label, and newest-first order is kept', () {
      final List<Checkpoint>? points = checkpointsIn(<String, Object?>{
        'checkpoints': <Object?>[
          pointWire(promptId: 'p-2', label: null),
          pointWire(promptId: 'p-1'),
        ],
      });

      expect(points?.map((Checkpoint p) => p.promptId), <String>['p-2', 'p-1']);
      expect(points?.first.label, isNull);
    });

    test('every reason a file stays is read, and one this build does not know still stays', () {
      final Checkpoint? point = checkpointFrom(
        pointWire(
          files: <Object?>[
            for (final String reason in <String>[
              'modifiedOutside',
              'notRestorable',
              'unsafePath',
              'noBaseline',
              'somethingNew',
            ])
              <String, Object?>{'path': '/$reason', 'outcome': 'preserve', 'reason': reason},
          ],
        ),
      );

      expect(point?.toPreserve.map((PreservedFile f) => f.reason), <PreserveReason>[
        PreserveReason.modifiedOutside,
        PreserveReason.notRestorable,
        PreserveReason.unsafePath,
        PreserveReason.noBaseline,
        PreserveReason.other,
      ]);
      expect(point?.canRevert, isFalse);
    });

    test('a point that cannot say what happens to every file is dropped, not shortened', () {
      final List<Object?> unreadable = <Object?>[
        pointWire(
          files: <Object?>[
            <String, Object?>{'path': '/a', 'outcome': 'teleport'},
          ],
        ),
        pointWire(
          files: <Object?>[
            <String, Object?>{'path': '/a', 'outcome': 'revert', 'action': 'x'},
          ],
        ),
        pointWire(
          files: <Object?>[
            <String, Object?>{'outcome': 'preserve'},
          ],
        ),
        pointWire(
          files: <Object?>[
            <String, Object?>{'outcome': 'unchanged'},
          ],
        ),
        pointWire(files: <Object?>['not a file']),
        pointWire(promptId: 3),
        pointWire(at: 'yesterday'),
        pointWire(at: null),
        pointWire(files: 'none'),
        'not a point',
      ];

      expect(checkpointsIn(<String, Object?>{'checkpoints': unreadable}), isEmpty);
    });

    test('a body that is not the listing is not a list with nothing in it', () {
      expect(checkpointsIn(null), isNull);
      expect(checkpointsIn(<String, Object?>{'checkpoints': 'none'}), isNull);
      expect(checkpointsIn(<Object?>[]), isNull);
    });
  });

  group('the outcome', () {
    test('reads what went back, what stayed and why, what was there, and what failed', () {
      expect(
        rewindOutcomeFrom(rewoundPayload(failed: const <String>['/home/someone/project/d.ts'])),
        anOutcome(failed: const <String>['/home/someone/project/d.ts']),
      );
    });

    test('anything unreadable makes the whole outcome unreadable', () {
      final List<Map<String, Object?>> broken = <Map<String, Object?>>[
        <String, Object?>{...rewoundPayload(), 'promptId': null},
        <String, Object?>{...rewoundPayload(), 'reverted': null},
        <String, Object?>{...rewoundPayload(), 'preserved': 'x'},
        <String, Object?>{...rewoundPayload(), 'unchanged': null},
        <String, Object?>{...rewoundPayload(), 'failed': null},
        <String, Object?>{
          ...rewoundPayload(),
          'failed': <Object?>[
            <String, Object?>{'path': 4},
          ],
        },
      ];

      for (final Map<String, Object?> payload in broken) {
        expect(rewindOutcomeFrom(payload), isNull, reason: '$payload');
      }
    });
  });
}
