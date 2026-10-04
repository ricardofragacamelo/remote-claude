/// The side panel of a folder's sessions, on the session screen — plan 10, B-45 and B-46.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/builders/permissions.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/pump_app.dart';
import '../../../support/session_screen.dart';

/// The folder `sessionStarted` opens in, unless told otherwise.
const String folder = '/tmp/work';

void main() {
  late AppLocalizations l10n;
  late SessionScreen screen;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => screen = SessionScreen());

  ProviderContainer container(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.byType(SessionPage)));

  /// Mounts `session-1`, routed, with `session-2` of the same folder open in the app beside it.
  Future<void> pumpTwo(WidgetTester tester) async {
    await screen.pump(tester, routed: true);
    container(tester).read(openSessionsProvider.notifier).open(folder, 'session-2');
    // Built once, as its own screen would have built it, and kept alive by the registry since.
    container(tester).read(liveSessionControllerProvider('session-2'));
    await tester.pumpAndSettle();
    screen.sessions.emit(arrivalOf(sessionStarted(sessionId: 'session-2', model: 'sonnet')));
    await tester.pumpAndSettle();
  }

  Future<void> openPanel(WidgetTester tester) async {
    await tester.tap(find.byTooltip(l10n.folderPanelOpen));
    await tester.pumpAndSettle();
  }

  // S-167
  testWidgets('S-167 · the screen puts its session in its folder, and the panel lists it', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester, routed: true);

    expect(container(tester).read(openSessionsProvider.notifier).of(folder), <String>['session-1']);

    await openPanel(tester);

    expect(find.text(l10n.folderPanelTitle('work')), findsOneWidget);
    expect(find.text(l10n.folderNewSession), findsOneWidget);
    expect(find.textContaining(l10n.folderPanelCurrent), findsOneWidget);
    expect(find.text(l10n.folderPanelAll), findsOneWidget);
  });

  // S-168
  testWidgets('S-168 · a tap on another session switches to it and closes the panel', (
    WidgetTester tester,
  ) async {
    await pumpTwo(tester);
    await openPanel(tester);

    await tester.tap(find.text('sonnet'));
    await tester.pumpAndSettle();

    expect(find.byType(Drawer), findsNothing);
    expect(tester.widget<SessionPage>(find.byType(SessionPage)).sessionId, 'session-2');
  });

  // S-169
  testWidgets('S-169 · closing in the app takes it off the panel and ends nothing', (
    WidgetTester tester,
  ) async {
    await pumpTwo(tester);
    await openPanel(tester);

    await tester.longPress(find.text('sonnet'));
    await tester.pumpAndSettle();
    expect(find.text(l10n.sessionCloseInAppNote), findsOneWidget);
    await tester.tap(find.text(l10n.sessionCloseInApp));
    await tester.pumpAndSettle();

    expect(container(tester).read(openSessionsProvider.notifier).contains('session-2'), isFalse);
    expect(
      screen.sessions.commands.where(((String, Map<String, Object?>) c) => c.$1 == 'session.close'),
      isEmpty,
    );
  });

  testWidgets('S-169 · ending from the panel asks first, as the ⋯ menu does', (
    WidgetTester tester,
  ) async {
    await pumpTwo(tester);
    await openPanel(tester);

    await tester.longPress(find.text('sonnet'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.sessionMenuEnd));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsOneWidget);
  });

  testWidgets('S-169 · New session opens the draft of the folder; All sessions, the folder', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester, routed: true);
    await openPanel(tester);

    await tester.tap(find.text(l10n.folderNewSession));
    await tester.pumpAndSettle();
    expect(find.textContaining('at /draft'), findsOneWidget);
  });

  testWidgets('S-169 · All sessions of the folder goes to the folder screen', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester, routed: true);
    await openPanel(tester);

    await tester.tap(find.text(l10n.folderPanelAll));
    await tester.pumpAndSettle();
    expect(find.textContaining('at /folder'), findsOneWidget);
  });

  // S-171
  testWidgets('S-171 · a question in another session lights the folder icon and its row', (
    WidgetTester tester,
  ) async {
    await pumpTwo(tester);

    screen.permissions.feeds
        .lastWhere((FakePermissionFeed feed) => feed.sessionId == 'session-2')
        .emit(
          PermissionAsked(
            request: aPermissionRequest(requestId: 'request-2', sessionId: 'session-2'),
            frameId: 'frame-2',
          ),
        );
    await tester.pumpAndSettle();

    expect(find.byTooltip(l10n.folderPanelWaitingElsewhere), findsOneWidget);
    await tester.tap(find.byTooltip(l10n.folderPanelWaitingElsewhere));
    await tester.pumpAndSettle();
    expect(find.textContaining(l10n.foldersPending(1)), findsOneWidget);
  });

  // S-170 · ten sessions open: the panel scrolls, and at 200 % on 360×640 it keeps the guidelines.
  testWidgets('S-170 · ten sessions open, at 200 % on 360×640, the panel scrolls and holds', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    tester.view
      ..physicalSize = const Size(360, 640)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await screen.pump(tester, routed: true);
    for (int index = 2; index <= 10; index++) {
      container(tester).read(openSessionsProvider.notifier).open(folder, 'session-$index');
      container(tester).read(liveSessionControllerProvider('session-$index'));
    }
    await tester.pumpAndSettle();
    await openPanel(tester);

    await tester.scrollUntilVisible(
      find.text(l10n.folderPanelAll),
      200,
      scrollable: find.descendant(of: find.byType(Drawer), matching: find.byType(Scrollable)).first,
    );
    expect(find.text(l10n.folderPanelAll), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
