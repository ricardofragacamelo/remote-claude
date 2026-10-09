/// The bar of the session screen (plan 10, F3): the title, the status chip and its sheet, the
/// history of the folder, and the `⋯` menu — ending the session asked first and its owner's alone,
/// the undo, the rules, the help and the id — with nothing of the loose icons that were there.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/presentation/providers/owned_sessions.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_help.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/recording_writer.dart';
import '../../../support/pump_app.dart';
import '../../../support/session_screen.dart';

void main() {
  late AppLocalizations l10n;
  late SessionScreen screen;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => screen = SessionScreen());

  Future<void> emit(WidgetTester tester, String raw) async {
    screen.sessions.emit(arrivalOf(raw));
    await tester.pumpAndSettle();
  }

  ProviderContainer container(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.byType(SessionPage)));

  /// The clipboard of the platform, answering as [answer] says, and what it was given.
  List<String> clipboard(WidgetTester tester, {bool refuses = false}) {
    final List<String> copied = <String>[];

    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
      MethodCall call,
    ) async {
      if (call.method == 'Clipboard.setData') {
        if (refuses) {
          throw PlatformException(code: 'denied');
        }
        copied.add((call.arguments as Map<Object?, Object?>)['text']! as String);
      }
      return null;
    });
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );

    return copied;
  }

  Future<void> openMenu(WidgetTester tester) async {
    await tester.tap(find.byTooltip(l10n.sessionMenuOpen));
    await tester.pumpAndSettle();
  }

  group('the bar — B-15', () {
    // Plan 10, F9 added the folder's panel to the bar: three buttons since.
    testWidgets('S-46 · the title, the status, the folder panel, the history and the ⋯ — only', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);

      final Finder bar = find.byType(AppBar);
      expect(find.descendant(of: bar, matching: find.text(l10n.sessionTitle)), findsOneWidget);
      expect(
        find.descendant(of: bar, matching: find.text(l10n.sessionStandingConnected)),
        findsOneWidget,
      );
      expect(find.byTooltip(l10n.sessionMenuOpen), findsOneWidget);
      expect(find.byTooltip(l10n.folderPanelOpen), findsOneWidget);
      // Plan 25, D-02: the files' panel came in and the history went to the `⋯` — four icons left no
      // room for the title and the chip at 360 dp (S-27).
      expect(find.byTooltip(l10n.filesPanelOpen), findsOneWidget);
      expect(find.byTooltip(l10n.sessionHistoryOpen), findsNothing);
      expect(find.descendant(of: bar, matching: find.byType(IconButton)), findsNWidgets(3));
      expect(find.byIcon(Icons.stop_circle_outlined), findsNothing);
      expect(find.byIcon(Icons.undo), findsNothing);
    });

    testWidgets('the chip says how it stands, by word, as the session moves', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);

      await emit(tester, sessionStatusChanged(status: 'running', seq: 2));
      expect(find.text(l10n.sessionStandingRunning), findsOneWidget);

      await emit(tester, sessionStatusChanged(status: 'waitingPermission', seq: 3));
      expect(find.text(l10n.sessionStandingWaiting), findsOneWidget);

      final SemanticsHandle semantics = tester.ensureSemantics();
      await emit(tester, sessionClosed(seq: 4));
      expect(find.text(l10n.sessionStandingEnded), findsOneWidget);
      expect(
        find.bySemanticsLabel(l10n.sessionStandingOpen(l10n.sessionStandingEnded)),
        findsOneWidget,
      );
      semantics.dispose();
    });

    testWidgets('S-47 · the status opens the sheet: how it stands, the id, and no "\$0"', (
      WidgetTester tester,
    ) async {
      final List<String> copied = clipboard(tester);
      await screen.pump(tester);

      await tester.tap(find.text(l10n.sessionStandingConnected));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionDotConnected), findsOneWidget);
      expect(find.text(l10n.sessionDotSession('session-1')), findsOneWidget);
      expect(find.text(l10n.sessionStatusNoCost), findsOneWidget);
      expect(find.textContaining(r'$0'), findsNothing);

      await tester.tap(find.byTooltip(l10n.sessionMenuCopyId));
      await tester.pumpAndSettle();

      expect(copied, <String>['session-1']);
      expect(find.text(l10n.sessionMenuCopied), findsOneWidget);
    });

    testWidgets('S-47 · what it cost, each turn once, added exactly', (WidgetTester tester) async {
      await screen.pump(tester);
      await emit(tester, turnCompleted(seq: 2, turnId: 't1', costUsd: '0.1000'));
      await emit(tester, turnCompleted(seq: 3, turnId: 't2', costUsd: '0.2000'));
      // A replay of the first turn adds nothing.
      await emit(tester, turnCompleted(seq: 2, turnId: 't1', costUsd: '0.1000'));

      await tester.tap(find.text(l10n.sessionStandingConnected));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionStatusCost(r'$0.30', '2')), findsOneWidget);
    });

    testWidgets('the id the clipboard refused is said, so it can be copied by hand', (
      WidgetTester tester,
    ) async {
      clipboard(tester, refuses: true);
      final RecordingWriter log = RecordingWriter();
      await screen.pump(
        tester,
        extra: <Override>[
          appLoggerProvider.overrideWithValue(
            AppLogger(
              context: const LogContext(appVersion: '1.0.0', platform: 'android'),
              writer: log.writer,
            ),
          ),
        ],
      );
      await tester.tap(find.text(l10n.sessionStandingConnected));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip(l10n.sessionMenuCopyId));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionMenuCopyFailed('session-1')), findsOneWidget);
      expect(log.withOp('session.copyId').single['platformError'], 'denied');
    });

    testWidgets('S-48 · the history opens the folder’s conversations; back keeps the box', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester, routed: true);
      await tester.enterText(find.byType(TextField), 'half a thought');

      await openMenu(tester);
      await tester.tap(find.text(l10n.sessionHistoryOpen));
      await tester.pumpAndSettle();

      expect(find.text('at ${historyRouteFor('/tmp/work')}'), findsOneWidget);

      GoRouter.of(tester.element(find.textContaining('at /history'))).pop();
      await tester.pumpAndSettle();

      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'half a thought');
    });

    testWidgets('S-24 · the files button waits for the folder of the session, then appears', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester, opened: false);
      expect(find.byTooltip(l10n.filesPanelOpen), findsNothing);

      await emit(tester, sessionStarted(sessionId: 'session-1'));

      expect(find.byTooltip(l10n.filesPanelOpen), findsOneWidget);
    });

    testWidgets('the history is off until the folder of the session is known', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester, opened: false);
      await openMenu(tester);

      expect(find.text(l10n.sessionHistoryUnknown), findsOneWidget);
      expect(
        tester.widget<ListTile>(find.widgetWithText(ListTile, l10n.sessionHistoryOpen)).enabled,
        isFalse,
      );
    });
  });

  group('the menu — B-16', () {
    testWidgets('S-49 · its owner ends it: asked first, the focus on keeping it, one close', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      container(tester).read(ownedSessionsProvider.notifier).claim('session-1');
      await openMenu(tester);

      await tester.tap(find.text(l10n.sessionMenuEnd));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionCloseTitle), findsOneWidget);
      expect(find.text(l10n.sessionCloseDescription), findsOneWidget);
      // The way out first: the focus starts on keeping it running.
      expect(Focus.of(tester.element(find.text(l10n.sessionCloseKeep))).hasFocus, isTrue);

      await tester.tap(find.text(l10n.sessionCloseConfirm));
      await tester.tap(find.text(l10n.sessionCloseConfirm), warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(
        screen.sessions.commands.where(
          ((String, Map<String, Object?>) c) => c.$1 == 'session.close',
        ),
        hasLength(1),
      );
    });

    testWidgets('S-49 · keeping it running sends nothing', (WidgetTester tester) async {
      await screen.pump(tester);
      container(tester).read(ownedSessionsProvider.notifier).claim('session-1');
      await openMenu(tester);
      await tester.tap(find.text(l10n.sessionMenuEnd));
      await tester.pumpAndSettle();

      await tester.tap(find.text(l10n.sessionCloseKeep));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionCloseTitle), findsNothing);
      expect(screen.sessions.commands, isEmpty);
    });

    testWidgets('S-50 · not its owner: "End session" is off, and says why', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await openMenu(tester);

      final ListTile end = tester.widget<ListTile>(
        find.widgetWithText(ListTile, l10n.sessionMenuEnd),
      );
      expect(end.enabled, isFalse);
      expect(find.text(l10n.sessionMenuEndNotOwner), findsOneWidget);

      await tester.tap(find.text(l10n.sessionMenuEnd), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.text(l10n.sessionCloseTitle), findsNothing);
    });

    testWidgets('a session that ended has nothing left to end, and says so', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      container(tester).read(ownedSessionsProvider.notifier).claim('session-1');
      await emit(tester, sessionClosed(seq: 2));
      await openMenu(tester);

      expect(find.text(l10n.sessionMenuEndEnded), findsOneWidget);
      expect(
        tester.widget<ListTile>(find.widgetWithText(ListTile, l10n.sessionMenuEnd)).enabled,
        isFalse,
      );
    });

    testWidgets('S-51 · the undo, the rules, the help and the id are there', (
      WidgetTester tester,
    ) async {
      final List<String> copied = clipboard(tester);
      await screen.pump(tester, routed: true);
      await openMenu(tester);

      expect(find.text(l10n.sessionMenuUndo), findsOneWidget);
      expect(find.text(l10n.sessionMenuRules), findsOneWidget);
      expect(find.text(l10n.sessionMenuHelp), findsOneWidget);

      await tester.tap(find.text(l10n.sessionMenuCopyId));
      await tester.pumpAndSettle();
      expect(copied, <String>['session-1']);

      await openMenu(tester);
      await tester.tap(find.text(l10n.sessionMenuRules));
      await tester.pumpAndSettle();
      expect(find.text('at $rulesRoute'), findsOneWidget);
    });

    testWidgets('S-51 · the undo opens the undo sheet', (WidgetTester tester) async {
      await screen.pump(tester);
      await openMenu(tester);

      await tester.tap(find.text(l10n.sessionMenuUndo));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionUndoTitle), findsOneWidget);
    });

    testWidgets('S-49 · confirmed, and the close arrives while the question leaves: the session '
        'stays on screen, ended', (WidgetTester tester) async {
      await screen.pump(tester, routed: true);
      container(tester).read(ownedSessionsProvider.notifier).claim('session-1');
      await openMenu(tester);
      await tester.tap(find.text(l10n.sessionMenuEnd));
      await tester.pumpAndSettle();

      await tester.tap(find.text(l10n.sessionCloseConfirm));
      await tester.pump();
      // The server is fast: the close lands before the question has finished leaving.
      screen.sessions.emit(arrivalOf(sessionClosed(seq: 2, reason: 'closedByUser')));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(SessionPage), findsOneWidget);
      expect(find.textContaining(l10n.sessionEndedResumes), findsOneWidget);
    });

    testWidgets('S-52 · ended elsewhere with the question up: it closes, and nothing is sent', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      container(tester).read(ownedSessionsProvider.notifier).claim('session-1');
      await openMenu(tester);
      await tester.tap(find.text(l10n.sessionMenuEnd));
      await tester.pumpAndSettle();

      await emit(tester, sessionClosed(seq: 2, reason: 'closedByUser'));

      expect(find.text(l10n.sessionCloseTitle), findsNothing);
      expect(find.textContaining(l10n.sessionEndedResumes), findsOneWidget);
      expect(screen.sessions.commands, isEmpty);
    });
  });

  group('the help — B-17', () {
    testWidgets('S-53 · describes every new place, in the person’s words', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(1080, 6000)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await screen.pump(tester);
      await openMenu(tester);

      await tester.tap(find.text(l10n.sessionMenuHelp));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionHelpTitle), findsOneWidget);
      for (final String text in <String>[
        l10n.sessionHelpBar,
        l10n.sessionHelpMenu,
        l10n.sessionHelpStatus,
        l10n.sessionHelpWorking,
        l10n.sessionHelpInline,
        l10n.sessionHelpPill,
        l10n.sessionHelpTasks,
        l10n.sessionHelpActions,
      ]) {
        expect(find.text(text), findsOneWidget);
      }
    });

    testWidgets('S-53 · in Portuguese too — no literal anywhere', (WidgetTester tester) async {
      final AppLocalizations pt = await AppLocalizations.delegate.load(const Locale('pt'));
      tester.view
        ..physicalSize = const Size(1080, 6000)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpApp(const SessionHelp(), locale: const Locale('pt'));
      await tester.pumpAndSettle();

      expect(find.text(pt.sessionHelpTitle), findsOneWidget);
      expect(find.text(pt.sessionHelpActions), findsOneWidget);
    });
  });
}
