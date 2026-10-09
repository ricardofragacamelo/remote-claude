import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/files/data/datasources/stored_viewer_preferences.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/providers/file_view_controllers.dart';

import '../../../../support/fakes/fake_credential_store.dart';
import '../../../../support/fakes/fake_files_repository.dart';

void main() {
  late FakeFilesRepository files;
  late FakeCredentialStore store;
  late ProviderContainer container;

  setUp(() {
    files = FakeFilesRepository()
      ..texts['a.md'] = const TextDocument(path: 'a.md', content: 'one', etag: '"v1"');
    store = FakeCredentialStore();
    container = ProviderContainer(
      overrides: <Override>[
        filesRepositoryProvider.overrideWithValue(files),
        credentialStoreProvider.overrideWithValue(store),
      ],
    );
    addTearDown(container.dispose);
  });

  TextView view() => container.read(textFileControllerProvider('/w', 'a.md'));
  TextFileController controller() =>
      container.read(textFileControllerProvider('/w', 'a.md').notifier);

  /// Keeps the controller alive, as the screen does, and lets its first read land.
  Future<void> open() async {
    container.listen(textFileControllerProvider('/w', 'a.md'), (_, _) {});
    await Future<void>.delayed(Duration.zero);
  }

  test('reads the text, without naming a version the first time', () async {
    await open();

    expect(view().document?.content, 'one');
    expect(files.reads, <String>['a.md|']);
  });

  test(
    'S-74 · read again with its version: unchanged keeps the same text, nothing marked',
    () async {
      await open();
      final TextDocument before = view().document!;

      await controller().reload();

      expect(files.reads.last, 'a.md|"v1"');
      expect(identical(view().document, before), isTrue);
      expect(view().changed, isFalse);
      expect(view().loading, isFalse);
    },
  );

  test(
    'S-75 · another version replaces the text and says it changed; read, the strip goes',
    () async {
      await open();
      files.texts['a.md'] = const TextDocument(path: 'a.md', content: 'two', etag: '"v2"');

      await controller().reload();
      expect(view().document?.content, 'two');
      expect(view().changed, isTrue);

      controller().dismissChanged();
      expect(view().changed, isFalse);
      expect(view().document?.content, 'two');
    },
  );

  test(
    'S-77 · two reads with different versions: the newest one asked is the one that counts',
    () async {
      await open();
      files.holdReads = true;
      files.texts['a.md'] = const TextDocument(path: 'a.md', content: 'two', etag: '"v2"');
      final Future<void> older = controller().reload();
      files.texts['a.md'] = const TextDocument(path: 'a.md', content: 'three', etag: '"v3"');
      final Future<void> newer = controller().reload();

      files.held.last.complete();
      await newer;
      files.held.first.complete();
      await older;

      expect(view().document?.content, 'three');
    },
  );

  test('a refusal keeps what was on screen, and says why', () async {
    await open();
    files.failures['a.md'] = const NetworkFailure(traceId: 't');

    await controller().reload();

    expect(view().document?.content, 'one');
    expect(view().failure, isA<NetworkFailure>());
  });

  test('the bytes of a file, asked again on retry', () async {
    files.raws['a.png'] = const RawFile(bytes: <int>[1, 2], contentType: 'image/png');
    container.listen(rawFileControllerProvider('/w', 'a.png'), (_, _) {});
    final ({List<int> bytes, String? contentType}) raw = await container.read(
      rawFileControllerProvider('/w', 'a.png').future,
    );
    expect(raw.contentType, 'image/png');

    await container.read(rawFileControllerProvider('/w', 'a.png').notifier).retry();
    expect(files.reads.where((String read) => read == 'raw:a.png'), hasLength(2));
  });

  test('S-56 · the wrap is the same for every file, and outlives the app', () async {
    container.listen(wrapSettingProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    expect(container.read(wrapSettingProvider), isTrue);

    await container.read(wrapSettingProvider.notifier).toggle();
    expect(store.values[viewerWrapKey], 'false');

    final ProviderContainer restarted = ProviderContainer(
      overrides: <Override>[credentialStoreProvider.overrideWithValue(store)],
    );
    addTearDown(restarted.dispose);
    restarted.listen(wrapSettingProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    expect(restarted.read(wrapSettingProvider), isFalse);
  });
}
