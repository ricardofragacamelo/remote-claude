import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/services/visible_entries.dart';

import '../../../../support/builders/files.dart';

void main() {
  group('what an entry is', () {
    test('a folder, and a link inside to one, are entered; a file is opened', () {
      expect(aFolder('docs').isFolder, isTrue);
      expect(aLink('alias', target: TargetKind.directory).isFolder, isTrue);
      expect(aFile('a.md').isFolder, isFalse);
      expect(aLink('to-file', target: TargetKind.file).isFolder, isFalse);
      expect(aFile('a.md').inert, isNull);
      expect(aLink('to-file', target: TargetKind.file).inert, isNull);
    });

    test('S-36 · a link out, a broken one, a name unread and a device are shown and inert', () {
      expect(aLink('out', outside: true).inert, Inert.outsideLink);
      expect(aLink('out', outside: true).isFolder, isFalse);
      expect(aLink('gone', target: TargetKind.missing).inert, Inert.brokenLink);
      expect(
        const FileEntry(name: '?', path: '?', kind: EntryKind.file, unreadableName: true).inert,
        Inert.unreadableName,
      );
      expect(
        const FileEntry(name: 'fifo', path: 'fifo', kind: EntryKind.other).inert,
        Inert.notAFile,
      );
      expect(aLink('dev', target: TargetKind.other).inert, Inert.notAFile);
    });
  });

  test('two entries with the same fields are the same entry', () {
    expect(aFile('a.md'), aFile('a.md'));
    expect(aFile('a.md'), isNot(aFile('b.md')));
    expect(aFile('a.md').hashCode, aFile('a.md').hashCode);
  });

  group('S-19 · visibleEntries', () {
    final FileListing listing = FileListing(
      folder: '/w',
      path: '',
      entries: <FileEntry>[
        aFolder('.git', hidden: true),
        aFolder('src'),
        aFile('.DS_Store', hidden: true),
        aFile('README.md'),
      ],
    );

    test('hides the hidden names by default, in the order the server gave', () {
      expect(visibleEntries(listing, showHidden: false).map((FileEntry e) => e.name), <String>[
        'src',
        'README.md',
      ]);
    });

    test('shows them, in the same order, when asked', () {
      expect(visibleEntries(listing, showHidden: true).map((FileEntry e) => e.name), <String>[
        '.git',
        'src',
        '.DS_Store',
        'README.md',
      ]);
    });
  });

  group('S-31 · the levels above', () {
    test('the root has none; a level has the one above it', () {
      expect(parentOf(''), isNull);
      expect(parentOf('docs'), '');
      expect(parentOf('docs/plans'), 'docs');
    });

    test('the breadcrumb goes from the root to the level, each step its path', () {
      expect(breadcrumbOf(''), <({String name, String path})>[(name: '', path: '')]);
      expect(breadcrumbOf('docs/plans'), <({String name, String path})>[
        (name: '', path: ''),
        (name: 'docs', path: 'docs'),
        (name: 'plans', path: 'docs/plans'),
      ]);
    });
  });
}
