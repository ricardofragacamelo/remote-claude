import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/files/data/mappers/tree_mapper.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';

void main() {
  test('S-18 · reads every field of a level, of every kind', () {
    final FileListing listing = listingFrom(<String, Object?>{
      'folder': '/w',
      'path': 'docs',
      'truncated': true,
      'entries': <Object?>[
        <String, Object?>{
          'name': 'plans',
          'path': 'docs/plans',
          'kind': 'directory',
          'size': 4096,
          'mtime': '2026-10-09T10:00:00.000Z',
          'hidden': false,
          'unreadableName': false,
          'outside': false,
          'targetKind': null,
        },
        <String, Object?>{'name': 'a.md', 'path': 'docs/a.md', 'kind': 'file', 'size': 12.0},
        <String, Object?>{
          'name': 'out',
          'path': 'docs/out',
          'kind': 'symlink',
          'outside': true,
          'targetKind': null,
        },
        <String, Object?>{
          'name': 'gone',
          'path': 'docs/gone',
          'kind': 'symlink',
          'targetKind': 'missing',
        },
        <String, Object?>{
          'name': 'in',
          'path': 'docs/in',
          'kind': 'symlink',
          'targetKind': 'directory',
        },
        <String, Object?>{'name': 'f', 'path': 'docs/f', 'kind': 'symlink', 'targetKind': 'file'},
        <String, Object?>{'name': 'd', 'path': 'docs/d', 'kind': 'symlink', 'targetKind': 'other'},
        <String, Object?>{'name': 'fifo', 'path': 'docs/fifo', 'kind': 'other', 'hidden': true},
        <String, Object?>{'name': 'x', 'path': 'docs/x', 'kind': 'weird', 'unreadableName': true},
      ],
    });

    expect(listing.folder, '/w');
    expect(listing.path, 'docs');
    expect(listing.truncated, isTrue);
    expect(listing.entries.map((FileEntry e) => e.kind), <EntryKind>[
      EntryKind.directory,
      EntryKind.file,
      EntryKind.symlink,
      EntryKind.symlink,
      EntryKind.symlink,
      EntryKind.symlink,
      EntryKind.symlink,
      EntryKind.other,
      EntryKind.other,
    ]);
    expect(listing.entries.first.size, 4096);
    expect(listing.entries.first.modifiedAt, DateTime.utc(2026, 10, 9, 10));
    expect(listing.entries[1].size, 12);
    expect(listing.entries[1].modifiedAt, isNull);
    expect(listing.entries[2].outside, isTrue);
    expect(listing.entries.map((FileEntry e) => e.targetKind), <TargetKind?>[
      null,
      null,
      null,
      TargetKind.missing,
      TargetKind.directory,
      TargetKind.file,
      TargetKind.other,
      null,
      null,
    ]);
    expect(listing.entries[7].hidden, isTrue);
    expect(listing.entries[8].unreadableName, isTrue);
  });

  test('an unreadable row costs that row, and an unreadable answer is an empty level', () {
    final FileListing listing = listingFrom(<String, Object?>{
      'entries': <Object?>[
        'nonsense',
        <String, Object?>{'name': 'no path'},
        <String, Object?>{'name': 'ok', 'path': 'ok', 'kind': 'file'},
      ],
    });

    expect(listing.entries.single.name, 'ok');
    expect(listing.truncated, isFalse);
    expect(listingFrom('nonsense').entries, isEmpty);
    expect(listingFrom(<String, Object?>{'entries': 'no'}).entries, isEmpty);
  });

  test('reads the ceilings, a missing one refusing rather than promising', () {
    expect(
      limitsFrom(<String, Object?>{
        'maxEditBytes': 10485760,
        'largeFileBytes': 1048576,
        'downloadMaxBytes': 209715200,
      }),
      const FileLimits(
        maxTextBytes: 10485760,
        largeFileBytes: 1048576,
        downloadMaxBytes: 209715200,
      ),
    );
    expect(
      limitsFrom(null),
      const FileLimits(maxTextBytes: 0, largeFileBytes: 0, downloadMaxBytes: 0),
    );
  });
}
