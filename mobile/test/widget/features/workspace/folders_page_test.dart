/// The folders home — plan 10, B-39 and B-40.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_workspace_api.dart';
import '../../../support/fakes/recording_writer.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/fakes/stub_push_controller.dart';
import '../../../support/pump_app.dart';

/// The live sessions of each folder, or a failure for the folders in [failing].
class StubLiveSessions implements LiveSessionRepository {
  StubLiveSessions(this.sessions, {this.failing = const <String>{}});

  final Map<String, List<LiveSessionSummary>> sessions;
  final Set<String> failing;

  @override
  Future<List<LiveSessionSummary>> list(String workspacePath) async {
    if (failing.contains(workspacePath)) {
      throw const NetworkFailure(traceId: 't');
    }
    return sessions[workspacePath] ?? const <LiveSessionSummary>[];
  }
}

LiveSessionSummary aLive(String id, {int pending = 0}) => LiveSessionSummary(
  sessionId: id,
  workspacePath: '/w/a',
  status: SessionStatus.running,
  model: 'opus',
  permissionMode: 'default',
  startedAt: DateTime.utc(2026, 10, 4),
  openedFrom: SessionOrigin.web,
  pendingPermissions: pending,
);

Map<String, Object?> open(String path, {String state = 'available'}) => <String, Object?>{
  'path': path,
  'rootLabel': 'work',
  'state': state,
};

Map<String, Object?> recent(String path, {bool pinned = false, bool available = true}) =>
    <String, Object?>{
      'path': path,
      'lastOpenedAt': '2026-10-04T10:00:00Z',
      'pinned': pinned,
      'available': available,
    };

void main() {
  late AppLocalizations l10n;
  late FakeWorkspaceApi api;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  /// A screen that names where a tap went.
  GoRoute marker(String path, String said) => GoRoute(
    path: path,
    builder: (BuildContext context, GoRouterState state) =>
        Scaffold(body: Text('$said ${state.uri.queryParameters.values.join()}')),
  );

  Future<void> pumpHome(
    WidgetTester tester, {
    List<Map<String, Object?>> opened = const <Map<String, Object?>>[],
    List<Map<String, Object?>> recents = const <Map<String, Object?>>[],
    StubLiveSessions? live,
    Failure? failure,
  }) async {
    api = FakeWorkspaceApi(
      answers: <String, Object?>{
        'openFolders': <String, Object?>{'folders': opened},
        'recent': <String, Object?>{'folders': recents},
        'openFolder': open('/w/b'),
      },
    )..failure = failure;

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: sessionRoute,
          builder: (BuildContext context, GoRouterState state) => const FoldersPage(),
        ),
        marker(folderRoute, 'folder'),
        marker(workspacesRoute, 'picker'),
        marker(rulesRoute, 'the rules'),
        marker(connectionRoute, 'the address'),
        marker(diagnosticsRoute, 'diagnostics'),
      ],
      overrides: <Override>[
        workspaceApiDataSourceProvider.overrideWithValue(api as WorkspaceApiDataSource),
        liveSessionRepositoryProvider.overrideWithValue(
          (live ?? StubLiveSessions(const <String, List<LiveSessionSummary>>{}))
              as LiveSessionRepository,
        ),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
        appLoggerProvider.overrideWithValue(
          AppLogger(
            context: const LogContext(appVersion: '0.0.1', platform: 'android'),
            writer: RecordingWriter().writer,
          ),
        ),
      ],
    );
    await tester.pumpAndSettle();
  }

  // S-147
  testWidgets('S-147 · the open folders first, then the recent ones that are not open', (
    WidgetTester tester,
  ) async {
    await pumpHome(
      tester,
      opened: <Map<String, Object?>>[open('/w/a')],
      recents: <Map<String, Object?>>[recent('/w/a'), recent('/w/c', pinned: true)],
    );

    expect(find.text(l10n.foldersOpenSection), findsOneWidget);
    expect(find.text('a'), findsOneWidget);
    expect(find.text('c'), findsOneWidget);
    expect(find.byIcon(Icons.push_pin), findsOneWidget);
    // What this installation may do is above the lists, not hidden behind them.
    expect(find.byType(DeviceStatusBanner), findsOneWidget);
    expect(find.byType(PushReachBanner), findsOneWidget);
  });

  testWidgets('S-147 · with nothing open and nothing recent, it says what to do', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester);

    expect(find.text(l10n.foldersNoneOpenTitle), findsOneWidget);
    expect(find.text(l10n.foldersNoRecent), findsOneWidget);
    expect(find.text(l10n.foldersOpenAnother), findsOneWidget);
  });

  // S-151
  testWidgets('S-151 · each open folder says what runs in it; a failed count is "—" alone', (
    WidgetTester tester,
  ) async {
    await pumpHome(
      tester,
      opened: <Map<String, Object?>>[open('/w/a'), open('/w/x')],
      live: StubLiveSessions(
        <String, List<LiveSessionSummary>>{
          '/w/a': <LiveSessionSummary>[aLive('s-1', pending: 2), aLive('s-2')],
        },
        failing: <String>{'/w/x'},
      ),
    );

    expect(find.text('${l10n.foldersSessions(2)} · ${l10n.foldersPending(2)}'), findsOneWidget);
    expect(find.text('—'), findsOneWidget);
    expect(find.byTooltip(l10n.foldersLoadFailed), findsOneWidget);
  });

  // S-148
  testWidgets('S-148 · a folder gone or out of the roots says why, and does not open', (
    WidgetTester tester,
  ) async {
    await pumpHome(
      tester,
      opened: <Map<String, Object?>>[
        open('/w/gone', state: 'missing'),
        open('/x/out', state: 'notAllowed'),
      ],
    );

    expect(find.text(l10n.foldersMissing), findsOneWidget);
    expect(find.text(l10n.foldersNotAllowed), findsOneWidget);

    await tester.tap(find.text('gone'));
    await tester.pumpAndSettle();
    expect(find.text('folder /w/gone'), findsNothing);
  });

  testWidgets('a tap on an open folder goes to it', (WidgetTester tester) async {
    await pumpHome(tester, opened: <Map<String, Object?>>[open('/w/a')]);

    await tester.tap(find.text('a'));
    await tester.pumpAndSettle();

    expect(find.text('folder /w/a'), findsOneWidget);
  });

  // S-149
  testWidgets('S-149 · closing a folder says that no session was ended', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester, opened: <Map<String, Object?>>[open('/w/a')]);

    await tester.tap(find.byTooltip(l10n.foldersActions('a')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.foldersClose));
    await tester.pumpAndSettle();

    expect(api.asked, contains('closeFolder:/w/a'));
    expect(find.text(l10n.foldersClosed), findsOneWidget);
  });

  testWidgets('S-149 · a tap on a recent folder opens it — a tab here and in the browser', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester, recents: <Map<String, Object?>>[recent('/w/b')]);

    await tester.tap(find.text('b'));
    await tester.pumpAndSettle();

    expect(api.asked, contains('openFolder:/w/b'));
    expect(find.text('folder /w/b'), findsOneWidget);
  });

  testWidgets('a recent folder is pinned and forgotten from its menu', (WidgetTester tester) async {
    await pumpHome(tester, recents: <Map<String, Object?>>[recent('/w/b')]);

    await tester.tap(find.byTooltip(l10n.foldersActions('b')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.foldersPin));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip(l10n.foldersActions('b')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.foldersForget));
    await tester.pumpAndSettle();

    expect(api.asked, containsAll(<String>['pinRecent:/w/b=true', 'forgetRecent:/w/b']));
  });

  testWidgets('S-143 · a refused opening says why', (WidgetTester tester) async {
    await pumpHome(tester, recents: <Map<String, Object?>>[recent('/w/b')]);
    api.failure = const ServerFailure(
      code: 'OPEN_FOLDERS_LIMIT_REACHED',
      messageKey: 'workspace.error.openFoldersLimitReached',
      traceId: 't',
      params: <String, String>{'limit': '8'},
    );

    await tester.tap(find.text('b'));
    await tester.pumpAndSettle();

    expect(find.text(l10n.foldersLimitReached('8')), findsOneWidget);
  });

  // S-150
  testWidgets('S-150 · a failure is said with a way out, and the help is one tap away', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester, failure: const NetworkFailure(traceId: 'trace-5'));

    expect(find.textContaining('trace-5'), findsOneWidget);
    expect(find.text(l10n.commonActionRetry), findsOneWidget);

    await tester.tap(find.byTooltip(l10n.foldersHelpOpen));
    await tester.pumpAndSettle();
    expect(find.text(l10n.foldersHelpBody), findsOneWidget);
  });

  // D-04 of plan 03 and S-108 of plan 10, moved here with the actions.
  testWidgets('the rules, the address and the diagnostics are one tap away; so is the picker', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester);

    for (final (String tooltip, String said) in <(String, String)>[
      (l10n.rulesOpen, 'the rules'),
      (l10n.connectionTitle, 'the address'),
      (l10n.diagnosticsTitle, 'diagnostics'),
    ]) {
      await tester.tap(find.byTooltip(tooltip));
      await tester.pumpAndSettle();
      expect(find.textContaining(said), findsOneWidget);
      GoRouter.of(tester.element(find.textContaining(said))).pop();
      await tester.pumpAndSettle();
    }

    await tester.tap(find.text(l10n.foldersOpenAnother));
    await tester.pumpAndSettle();
    expect(find.textContaining('picker'), findsOneWidget);
  });

  // S-150 · at 200 % on a small phone the home keeps its targets, labels and contrast.
  testWidgets('S-150 · the home meets the guidelines at 200 % on 360×640', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    tester.view
      ..physicalSize = const Size(360, 640)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await pumpHome(
      tester,
      opened: <Map<String, Object?>>[open('/w/a')],
      recents: <Map<String, Object?>>[recent('/w/b')],
    );

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
