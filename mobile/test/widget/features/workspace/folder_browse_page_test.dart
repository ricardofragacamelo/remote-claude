/// One level of a folder in the picker — plan 10, B-39.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_workspace_api.dart';
import '../../../support/pump_app.dart';

Map<String, Object?> listing({
  String path = '/w/a',
  String? parent = '/w',
  List<String> entries = const <String>['src', 'docs'],
  bool truncated = false,
}) => <String, Object?>{
  'path': path,
  'root': <String, Object?>{'path': '/w', 'label': 'work'},
  'parent': parent,
  'entries': <Object?>[
    for (final String name in entries) <String, Object?>{'name': name, 'path': '$path/$name'},
  ],
  'truncated': truncated,
};

void main() {
  late AppLocalizations l10n;
  late FakeWorkspaceApi api;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpBrowse(WidgetTester tester, Map<String, Object?> answer) async {
    api = FakeWorkspaceApi(
      answers: <String, Object?>{
        'directories': answer,
        'openFolder': <String, Object?>{'path': '/w/a', 'state': 'available'},
        'openFolders': <String, Object?>{'folders': <Object?>[]},
        'recent': <String, Object?>{'folders': <Object?>[]},
      },
    );

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: sessionRoute,
          builder: (BuildContext context, GoRouterState state) =>
              const Scaffold(body: Text('home')),
          routes: <RouteBase>[
            GoRoute(
              path: 'folder',
              builder: (BuildContext context, GoRouterState state) => Scaffold(
                body: Text('folder ${state.uri.queryParameters[workspacePathParameter]}'),
              ),
            ),
          ],
        ),
        GoRoute(
          path: folderBrowseRoute,
          builder: (BuildContext context, GoRouterState state) =>
              FolderBrowsePage(path: state.uri.queryParameters[browsePathParameter] ?? ''),
        ),
      ],
      initialLocation: folderBrowseRouteFor('/w/a'),
      overrides: <Override>[
        workspaceApiDataSourceProvider.overrideWithValue(api as WorkspaceApiDataSource),
      ],
    );
    await tester.pumpAndSettle();
  }

  // S-145
  testWidgets('S-145 · says where it is, lists one level, and walks into a subfolder', (
    WidgetTester tester,
  ) async {
    await pumpBrowse(tester, listing());

    expect(find.text('work'), findsOneWidget);
    expect(find.text('/w/a'), findsOneWidget);
    expect(find.text('src'), findsOneWidget);
    expect(find.text(l10n.folderPickerUp), findsOneWidget);

    api.answers['directories'] = listing(path: '/w/a/src', entries: const <String>[]);
    await tester.tap(find.text('src'));
    await tester.pumpAndSettle();

    expect(api.asked, contains('directories:/w/a/src'));
    expect(find.text(l10n.folderPickerEmpty), findsOneWidget);
  });

  testWidgets('S-145 · at the root there is no "up"; a cut listing says so', (
    WidgetTester tester,
  ) async {
    await pumpBrowse(tester, listing(path: '/w', parent: null, truncated: true));

    expect(find.text(l10n.folderPickerUp), findsNothing);
    expect(find.text(l10n.folderPickerTruncated), findsOneWidget);
  });

  testWidgets('S-145 · "up" goes to the parent', (WidgetTester tester) async {
    await pumpBrowse(tester, listing());
    api.answers['directories'] = listing(path: '/w', parent: null);

    await tester.tap(find.text(l10n.folderPickerUp));
    await tester.pumpAndSettle();

    expect(api.asked, contains('directories:/w'));
  });

  testWidgets('opening this folder opens it as a tab and goes to it, the home behind', (
    WidgetTester tester,
  ) async {
    await pumpBrowse(tester, listing());

    await tester.tap(find.text(l10n.folderPickerOpenThis));
    await tester.pumpAndSettle();

    expect(api.asked, contains('openFolder:/w/a'));
    expect(find.text('folder /w/a'), findsOneWidget);
  });

  // S-143
  testWidgets('S-143 · past the ceiling, opening says the ceiling and stays', (
    WidgetTester tester,
  ) async {
    await pumpBrowse(tester, listing());
    api.failure = const ServerFailure(
      code: 'OPEN_FOLDERS_LIMIT_REACHED',
      messageKey: 'workspace.error.openFoldersLimitReached',
      traceId: 't',
      params: <String, String>{'limit': '8'},
    );

    await tester.tap(find.text(l10n.folderPickerOpenThis));
    await tester.pumpAndSettle();

    expect(find.text(l10n.foldersLimitReached('8')), findsOneWidget);
    expect(find.text(l10n.folderPickerOpenThis), findsOneWidget);
  });

  testWidgets('a folder this computer cannot read says so, with a retry', (
    WidgetTester tester,
  ) async {
    api = FakeWorkspaceApi();
    await pumpBrowse(tester, listing());
    api.failure = const ServerFailure(
      code: 'WORKSPACE_DIRECTORY_UNREADABLE',
      messageKey: 'workspace.error.directoryUnreadable',
      traceId: 't',
      params: <String, String>{'path': '/w/a/secret'},
    );

    await tester.tap(find.text('src'));
    await tester.pumpAndSettle();

    expect(find.text(l10n.workspaceErrorDirectoryUnreadable('/w/a/secret')), findsOneWidget);
    expect(find.text(l10n.commonActionRetry), findsOneWidget);
  });
}
