import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/providers/folder_tree_controller.dart';

import '../../../../support/builders/files.dart';
import '../../../../support/fakes/fake_files_repository.dart';

void main() {
  late FakeFilesRepository files;
  late ProviderContainer container;

  setUp(() {
    files = FakeFilesRepository()
      ..levels[''] = <FileEntry>[aFolder('docs'), aFile('README.md')]
      ..levels['docs'] = <FileEntry>[aFile('docs/a.md')];
    container = ProviderContainer(
      overrides: <Override>[filesRepositoryProvider.overrideWithValue(files)],
    );
    addTearDown(container.dispose);
  });

  FolderTree tree() => container.read(folderTreeControllerProvider('/w'));
  FolderTreeController controller() => container.read(folderTreeControllerProvider('/w').notifier);

  /// Builds the panel of `/w` and lets its first read answer.
  Future<void> settle() async {
    tree();
    await Future<void>.delayed(Duration.zero);
  }

  test('starts at the root of the folder, reading it', () async {
    expect(tree().loading, isTrue);
    await Future<void>.delayed(Duration.zero);

    expect(tree().path, '');
    expect(tree().listing?.entries.map((FileEntry e) => e.name), <String>['docs', 'README.md']);
    expect(tree().loading, isFalse);
    expect(files.asked, <String>['/w|']);
  });

  test('opens a level, and the level it opened is the one it shows', () async {
    await settle();
    await controller().open('docs');

    expect(tree().path, 'docs');
    expect(tree().listing?.entries.single.path, 'docs/a.md');
  });

  test(
    'S-39 · a refresh keeps what is shown until the answer, and nothing moves when it is the same',
    () async {
      await settle();
      final FileListing before = tree().listing!;
      files.gate = Completer<void>();

      final Future<void> refreshed = controller().refresh();
      expect(tree().listing, before);
      expect(tree().loading, isTrue);

      files.gate!.complete();
      await refreshed;
      expect(tree().listing, before);
      expect(tree().loading, isFalse);
    },
  );

  test('two reads in a row: the answer of the older one is dropped', () async {
    await settle();
    files.gate = Completer<void>();
    final Future<void> first = controller().open('docs');
    final Future<void> second = controller().open('');
    files.gate!.complete();
    await Future.wait(<Future<void>>[first, second]);

    expect(tree().path, '');
    expect(tree().listing?.path, '');
  });

  test('a refusal keeps the level it was on, and says why', () async {
    await settle();
    files.failures['docs'] = const ServerFailure(
      code: 'FILE_NOT_FOUND',
      messageKey: 'files.error.notFound',
      traceId: 't',
    );

    await controller().open('docs');

    expect(tree().path, 'docs');
    expect(tree().listing, isNull);
    expect(tree().failure?.code, 'FILE_NOT_FOUND');
  });

  test('a refresh that fails keeps what was shown, beside the reason', () async {
    await settle();
    files.failures[''] = const NetworkFailure(traceId: 't');

    await controller().refresh();

    expect(tree().listing?.entries, hasLength(2));
    expect(tree().failure, isA<NetworkFailure>());
  });

  test('S-37 · the hidden names are toggled, the level kept', () async {
    await settle();
    controller().toggleHidden();
    expect(tree().showHidden, isTrue);
    expect(tree().listing?.entries, hasLength(2));
    controller().toggleHidden();
    expect(tree().showHidden, isFalse);
  });

  test('a level opened before the first read answers wins over it', () async {
    files.gate = Completer<void>();
    tree();
    final Future<void> opened = controller().open('docs');
    files.gate!.complete();
    await opened;
    await Future<void>.delayed(Duration.zero);

    expect(tree().path, 'docs');
    expect(tree().listing?.path, 'docs');
  });

  test('the ceilings come through their use case', () async {
    expect(
      (await container.read(readFileLimitsProvider)()).downloadMaxBytes,
      testLimits.downloadMaxBytes,
    );
  });

  test('S-45 · the panel is per folder: two folders, two levels', () async {
    await settle();
    await controller().open('docs');
    final FolderTree other = container.read(folderTreeControllerProvider('/other'));

    expect(other.path, '');
    expect(tree().path, 'docs');
  });
}
