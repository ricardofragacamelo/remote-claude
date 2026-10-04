/// The folder payloads, read as entities — plan 10, B-38.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/workspace/data/mappers/folder_mapper.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';

void main() {
  group('the open folders', () {
    // S-141
    test('S-141 · read in order, with the root and the state', () {
      final List<OpenFolderEntry> folders = openFoldersFrom(<String, Object?>{
        'folders': <Object?>[
          <String, Object?>{'path': '/w/a', 'rootLabel': 'work', 'state': 'available'},
          <String, Object?>{'path': '/w/gone', 'rootLabel': null, 'state': 'missing'},
          <String, Object?>{'path': '/x/out', 'state': 'notAllowed'},
        ],
      });

      expect(folders, const <OpenFolderEntry>[
        OpenFolderEntry(path: '/w/a', rootLabel: 'work', state: FolderState.available),
        OpenFolderEntry(path: '/w/gone', state: FolderState.missing),
        OpenFolderEntry(path: '/x/out', state: FolderState.notAllowed),
      ]);
      expect(folders.first.name, 'a');
      expect(folders.first.usable, isTrue);
      expect(folders[1].usable, isFalse);
    });

    // S-142
    test('S-142 · a row out of the format is dropped; a body that is not a list is no folder', () {
      expect(
        openFoldersFrom(<String, Object?>{
          'folders': <Object?>[
            <String, Object?>{'path': '/w/a', 'state': 'available'},
            <String, Object?>{'path': '/w/b', 'state': 'somethingNew'},
            <String, Object?>{'state': 'available'},
            'not a row',
          ],
        }),
        hasLength(1),
      );
      expect(openFoldersFrom(<String, Object?>{'folders': 'nope'}), isEmpty);
      expect(openFoldersFrom(null), isEmpty);
      expect(openFolderFrom('nope'), isNull);
    });
  });

  group('the recent folders', () {
    test('S-141 · read with the date, the pin and whether they can still be used', () {
      final List<RecentFolder> recent = recentFoldersFrom(<String, Object?>{
        'folders': <Object?>[
          <String, Object?>{
            'path': '/w/a',
            'rootLabel': 'work',
            'lastOpenedAt': '2026-10-04T10:00:00.000Z',
            'pinned': true,
            'available': true,
          },
        ],
      });

      expect(recent.single.path, '/w/a');
      expect(recent.single.rootLabel, 'work');
      expect(recent.single.lastOpenedAt, DateTime.utc(2026, 10, 4, 10));
      expect(recent.single.pinned, isTrue);
      expect(recent.single.name, 'a');
    });

    test('S-142 · a row with a bad date, or a missing flag, is dropped', () {
      expect(
        recentFoldersFrom(<String, Object?>{
          'folders': <Object?>[
            <String, Object?>{
              'path': '/w/a',
              'lastOpenedAt': 'yesterday',
              'pinned': true,
              'available': true,
            },
            <String, Object?>{'path': '/w/b', 'lastOpenedAt': '2026-10-04T10:00:00Z'},
            7,
          ],
        }),
        isEmpty,
      );
    });
  });

  group('one level of a folder', () {
    test('S-145 · its path, its root, where up goes, and its subfolders', () {
      final DirectoryListing? listing = directoryListingFrom(<String, Object?>{
        'path': '/w/a',
        'root': <String, Object?>{'path': '/w', 'label': 'work'},
        'parent': '/w',
        'entries': <Object?>[
          <String, Object?>{'name': 'src', 'path': '/w/a/src', 'hidden': false},
          <String, Object?>{'name': '.git', 'path': '/w/a/.git', 'hidden': true},
          <String, Object?>{'name': 'broken'},
        ],
        'truncated': true,
      });

      expect(listing?.rootLabel, 'work');
      expect(listing?.parent, '/w');
      expect(listing?.truncated, isTrue);
      expect(listing?.entries, const <DirectoryEntry>[
        DirectoryEntry(name: 'src', path: '/w/a/src'),
        DirectoryEntry(name: '.git', path: '/w/a/.git', hidden: true),
      ]);
    });

    test('S-145 · at the root there is no "up"; an answer that is not a listing is none', () {
      final DirectoryListing? root = directoryListingFrom(<String, Object?>{
        'path': '/w',
        'root': <String, Object?>{'label': 'work'},
        'parent': null,
        'entries': <Object?>[],
      });

      expect(root?.parent, isNull);
      expect(root?.truncated, isFalse);
      expect(directoryListingFrom(<String, Object?>{'path': '/w'}), isNull);
      expect(directoryListingFrom('nope'), isNull);
    });
  });

  test('a folder is named by its last segment, a root by itself', () {
    expect(folderNameOf('/home/someone/project/'), 'project');
    expect(folderNameOf('/'), '/');
  });
}
