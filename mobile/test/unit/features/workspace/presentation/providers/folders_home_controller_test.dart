/// The folders home — plan 10, B-39.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/presentation/providers/directory_controller.dart';
import 'package:remote_claude/features/workspace/presentation/providers/folders_home_controller.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';

import '../../../../../support/fakes/fake_workspace_api.dart';

Map<String, Object?> openOf(List<String> paths) => <String, Object?>{
  'folders': <Object?>[
    for (final String path in paths) <String, Object?>{'path': path, 'state': 'available'},
  ],
};

Map<String, Object?> recentOf(List<String> paths) => <String, Object?>{
  'folders': <Object?>[
    for (final String path in paths)
      <String, Object?>{
        'path': path,
        'lastOpenedAt': '2026-10-04T10:00:00Z',
        'pinned': false,
        'available': true,
      },
  ],
};

void main() {
  late FakeWorkspaceApi api;

  ProviderContainer build() {
    api = FakeWorkspaceApi(
      answers: <String, Object?>{
        'openFolders': openOf(<String>['/w/a']),
        'recent': recentOf(<String>['/w/a', '/w/b']),
      },
    );
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        workspaceApiDataSourceProvider.overrideWithValue(api as WorkspaceApiDataSource),
      ],
    );
    addTearDown(container.dispose);
    container.listen(foldersHomeControllerProvider, (_, _) {});
    return container;
  }

  // S-147 · a recent folder that is open is listed with the open ones, not twice.
  test('S-147 · the open folders, and the recent ones that are not open', () async {
    final ProviderContainer container = build();

    final FoldersHome home = await container.read(foldersHomeControllerProvider.future);

    expect(home.open.map((OpenFolderEntry f) => f.path), <String>['/w/a']);
    expect(home.recent.map((RecentFolder f) => f.path), <String>['/w/b']);
  });

  // S-149 and S-143 — opening, and its refusal — are `openFolderAndGo`'s, proven where it is used:
  // folders_page_test.dart and folder_browse_page_test.dart.

  test('closing, pinning and forgetting write, read again, and answer no failure', () async {
    final ProviderContainer container = build();
    await container.read(foldersHomeControllerProvider.future);
    final FoldersHomeController home = container.read(foldersHomeControllerProvider.notifier);

    expect(await home.close('/w/a'), isNull);
    expect(await home.pin('/w/b', pinned: true), isNull);
    expect(await home.forget('/w/b'), isNull);

    expect(api.asked, containsAll(<String>['closeFolder:/w/a', 'pinRecent:/w/b=true']));
    expect(api.asked.where((String call) => call == 'openFolders'), hasLength(4));
  });

  test('a refused change answers its failure', () async {
    final ProviderContainer container = build();
    await container.read(foldersHomeControllerProvider.future);
    api.failure = const NetworkFailure(traceId: 't');

    expect(
      await container.read(foldersHomeControllerProvider.notifier).close('/w/a'),
      isA<NetworkFailure>(),
    );
  });

  test('S-145 · a level of the picker reads again on retry', () async {
    final ProviderContainer container = build();
    api.answers['directories'] = <String, Object?>{
      'path': '/w',
      'root': <String, Object?>{'label': 'work'},
      'entries': <Object?>[],
    };
    container.listen(directoryControllerProvider('/w'), (_, _) {});
    await container.read(directoryControllerProvider('/w').future);

    await container.read(directoryControllerProvider('/w').notifier).reload();

    expect(api.asked.where((String call) => call == 'directories:/w'), hasLength(2));
    expect(container.read(directoryControllerProvider('/w')).requireValue.rootLabel, 'work');
  });
}
