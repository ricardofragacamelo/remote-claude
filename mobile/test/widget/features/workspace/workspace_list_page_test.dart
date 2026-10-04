/// The picker's first level: the roots, in their four states, each walked into (plan 10, F7).
///
/// What this screen used to also do — the rules and the address one tap away, the device banners,
/// the history and the draft of a folder — moved to the folders home and the folder screen, and
/// their scenarios are proven there (`folders_page_test.dart`, `folder_page_test.dart`).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_workspace_repository.dart';
import '../../../support/pump_app.dart';

const Workspace project = Workspace(path: '/home/someone/project', label: 'project');

void main() {
  late AppLocalizations l10n;
  late FakeWorkspaceRepository workspaces;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  /// Mounts the roots with a router whose browse route is a marker.
  Future<void> pumpList(
    WidgetTester tester, {
    List<Workspace>? available,
    Object? failure,
    bool pumpOnce = true,
    bool waiting = false,
  }) async {
    workspaces = FakeWorkspaceRepository(
      workspaces: available ?? <Workspace>[project],
      failure: failure,
    );

    if (waiting) {
      workspaces.gate = Completer<void>();
    }

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: workspacesRoute,
          builder: (BuildContext context, GoRouterState state) => const WorkspaceListPage(),
          routes: <RouteBase>[
            GoRoute(
              path: 'browse',
              builder: (BuildContext context, GoRouterState state) => Scaffold(
                body: Text('browsing ${state.uri.queryParameters[browsePathParameter]}'),
              ),
            ),
          ],
        ),
      ],
      initialLocation: workspacesRoute,
      overrides: <Override>[
        workspaceRepositoryProvider.overrideWithValue(workspaces as WorkspaceRepository),
      ],
      pumpOnce: pumpOnce,
    );

    if (pumpOnce) {
      await tester.pumpAndSettle();
    }
  }

  group('S-37 · the four states', () {
    testWidgets('says it is loading before the allowlist answers', (WidgetTester tester) async {
      await pumpList(tester, waiting: true, pumpOnce: false);
      await tester.pump();

      expect(find.text(l10n.workspaceListLoading), findsOneWidget);
    });

    testWidgets('shows the failure with its trace, and a way out', (WidgetTester tester) async {
      await pumpList(tester, failure: const NetworkFailure(traceId: 'trace-77'));

      expect(find.textContaining('trace-77'), findsOneWidget);
      expect(find.text(l10n.commonActionRetry), findsOneWidget);
    });

    testWidgets('the retry asks again, and shows what it found', (WidgetTester tester) async {
      await pumpList(tester, failure: const NetworkFailure(traceId: 'trace-77'));

      workspaces.failure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text('project'), findsOneWidget);
    });

    testWidgets('an empty allowlist says where roots come from', (WidgetTester tester) async {
      await pumpList(tester, available: <Workspace>[]);

      expect(find.text(l10n.workspaceListEmptyTitle), findsOneWidget);
      expect(find.text(l10n.workspaceListEmptyBody), findsOneWidget);
    });

    testWidgets('shows each root by its label and its path, under what the list is', (
      WidgetTester tester,
    ) async {
      await pumpList(tester);

      expect(find.text(l10n.folderPickerTitle), findsOneWidget);
      expect(find.text(l10n.folderPickerRoots), findsOneWidget);
      expect(find.text('project'), findsOneWidget);
      expect(find.text('/home/someone/project'), findsOneWidget);
    });
  });

  // S-145 · a root is walked, one level at a time, rather than opened at once.
  testWidgets('S-145 · a tap on a root walks into it', (WidgetTester tester) async {
    await pumpList(tester);

    await tester.tap(find.text('project'));
    await tester.pumpAndSettle();

    expect(find.text('browsing /home/someone/project'), findsOneWidget);
  });
}
