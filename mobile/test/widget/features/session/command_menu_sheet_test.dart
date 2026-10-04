/// The slash command menu, opened from the composer of the session screen (B-15, D-05).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/undo.dart';
import '../../../support/pump_app.dart';
import '../../../support/session_screen.dart';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'session.error.claudeUnavailable',
  traceId: 'trace-7',
);

void main() {
  late AppLocalizations l10n;
  late SessionScreen screen;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => screen = SessionScreen()..commands.answer = aMenu);

  Finder composer() => find.widgetWithText(TextField, l10n.composerBoxLabel);
  Finder search() => find.widgetWithText(TextField, l10n.sessionCommandsSearch);

  /// Types a command into the empty box. The `/` opens the menu (D-07); closing it keeps the text.
  Future<void> typeCommand(WidgetTester tester, String text) async {
    await tester.enterText(composer(), text);
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
  }

  Future<void> openMenu(WidgetTester tester) async {
    await tester.tap(find.byTooltip(l10n.composerSlash));
    await tester.pumpAndSettle();
  }

  testWidgets('S-29 · lists what the installation offers, suggested on top', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openMenu(tester);

    expect(screen.commands.reads, <String>['session-1']);
    expect(find.text(l10n.sessionCommandsTitle), findsOneWidget);
    expect(find.text(l10n.sessionCommandsDescription), findsOneWidget);
    expect(find.text(l10n.sessionCommandsSuggested), findsOneWidget);
    expect(find.text(l10n.sessionCommandsAll), findsOneWidget);

    // Each item says how it is typed, how its argument is written, and what it does.
    expect(find.text('/init'), findsOneWidget);
    expect(find.text('/review [pr-number]'), findsOneWidget);
    expect(find.text('Review a pull request'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('/review [pr-number]')).dy,
      lessThan(tester.getTopLeft(find.text(l10n.sessionCommandsAll)).dy),
    );
    expect(
      tester.getTopLeft(find.text(l10n.sessionCommandsAll)).dy,
      lessThan(tester.getTopLeft(find.text('/compact')).dy),
    );
  });

  testWidgets('S-30 · an installation with fewer commands shows fewer, and no empty group', (
    WidgetTester tester,
  ) async {
    screen.commands.answer = const CommandMenu(
      commands: <SlashCommand>[SlashCommand(name: 'compact')],
    );
    await screen.pump(tester);
    await openMenu(tester);

    expect(find.text('/compact'), findsOneWidget);
    expect(find.text('/init'), findsNothing);
    expect(find.text(l10n.sessionCommandsSuggested), findsNothing);
  });

  group('the search', () {
    testWidgets('filters by name, by alias and by description', (WidgetTester tester) async {
      await screen.pump(tester);
      await openMenu(tester);

      await tester.enterText(search(), '/rev');
      await tester.pumpAndSettle();
      expect(find.text('/review [pr-number]'), findsOneWidget);
      expect(find.text('/init'), findsNothing);

      await tester.enterText(search(), 'squash');
      await tester.pumpAndSettle();
      expect(find.text('/compact'), findsOneWidget);
      expect(find.text(l10n.sessionCommandsSuggested), findsNothing);

      await tester.enterText(search(), 'CODEBASE');
      await tester.pumpAndSettle();
      expect(find.text('/init'), findsOneWidget);
      expect(find.text(l10n.sessionCommandsAll), findsNothing);
    });

    testWidgets('that finds nothing says so, with what was typed', (WidgetTester tester) async {
      await screen.pump(tester);
      await openMenu(tester);

      await tester.enterText(search(), 'heapdump');
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionCommandsNoMatch('heapdump')), findsOneWidget);
    });
  });

  testWidgets('B-16 · picking a command puts it in the composer, ready for its argument', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openMenu(tester);

    await tester.tap(find.text('/init'));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionCommandsTitle), findsNothing);
    final TextEditingController? box = tester.widget<TextField>(composer()).controller;
    expect(box?.text, '/init ');
    expect(box?.selection.baseOffset, '/init '.length);

    // Sending it is sending a prompt: no shortcut and no privilege.
    await tester.tap(find.byTooltip(l10n.sessionPromptAction));
    await tester.pumpAndSettle();
    expect(screen.sessions.commands.single.$1, 'session.prompt');
    expect(screen.sessions.commands.single.$2['text'], '/init');
  });

  testWidgets('closing the menu without picking leaves the composer as it was', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await tester.enterText(composer(), 'half a thought');
    await openMenu(tester);

    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(tester.widget<TextField>(composer()).controller?.text, 'half a thought');
  });

  testWidgets('says it is loading while the installation is asked', (WidgetTester tester) async {
    screen.commands.gate = Completer<void>();
    await screen.pump(tester);
    await tester.tap(find.byTooltip(l10n.composerSlash));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text(l10n.sessionCommandsLoading), findsOneWidget);

    screen.commands.gate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('/init'), findsOneWidget);
  });

  testWidgets('an installation with no commands says so, and what can still be done', (
    WidgetTester tester,
  ) async {
    screen.commands.answer = const CommandMenu();
    await screen.pump(tester);
    await openMenu(tester);

    expect(find.text(l10n.sessionCommandsEmptyTitle), findsOneWidget);
    expect(find.text(l10n.sessionCommandsEmptyBody), findsOneWidget);
  });

  testWidgets('S-31 · a menu that could not be read says why, retries, and blocks nothing', (
    WidgetTester tester,
  ) async {
    screen.commands.failure = unavailable;
    await screen.pump(tester);
    await openMenu(tester);

    expect(find.text(l10n.sessionErrorClaudeUnavailable), findsOneWidget);

    screen.commands.failure = null;
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();
    expect(find.text('/init'), findsOneWidget);

    // Closed, the composer sends whatever was typed — the menu was never a boundary.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    await typeCommand(tester, '/anything-at-all');
    await tester.tap(find.byTooltip(l10n.sessionPromptAction));
    await tester.pumpAndSettle();
    expect(screen.sessions.commands.single.$2['text'], '/anything-at-all');
  });

  testWidgets('a composer that cannot send cannot open the menu either', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester, connection: ConnectionStatus.closed);

    expect(
      tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.terminal)).onPressed,
      isNull,
    );
  });

  group('S-34 · a command the installation does not have', () {
    const Failure unknown = ServerFailure(
      code: 'INVALID_INPUT',
      messageKey: 'session.error.unknownCommand',
      traceId: 'trace-3',
      params: <String, String>{'command': '/heapdumb'},
    );

    testWidgets('is refused in words near the composer, and the next send clears it', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await typeCommand(tester, '/heapdumb');
      await tester.tap(find.byTooltip(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      screen.sessions.emit(const CommandRefused(commandId: 'command-1', failure: unknown));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorUnknownCommand('/heapdumb')), findsOneWidget);

      await typeCommand(tester, '/init');
      await tester.tap(find.byTooltip(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorUnknownCommand('/heapdumb')), findsNothing);
    });

    testWidgets('a refusal of somebody else’s command is not shown here', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await typeCommand(tester, '/init');
      await tester.tap(find.byTooltip(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      screen.sessions.emit(const CommandRefused(commandId: 'command-42', failure: unknown));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorUnknownCommand('/heapdumb')), findsNothing);
    });
  });

  testWidgets('the menu meets the tap-target and label guidelines', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await screen.pump(tester);
    await openMenu(tester);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });

  testWidgets('S-36 · a / typed at the start of the box opens the menu, searching what follows', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);

    await tester.enterText(composer(), '/rev');
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionCommandsTitle), findsOneWidget);
    expect(tester.widget<TextField>(search()).controller?.text, 'rev');
    expect(find.text('/review [pr-number]'), findsOneWidget);
    expect(find.text('/init'), findsNothing);

    await tester.tap(find.text('/review [pr-number]'));
    await tester.pumpAndSettle();

    // Nothing is sent: the box holds the command, ready for its argument.
    expect(tester.widget<TextField>(composer()).controller?.text, '/review ');
    expect(screen.sessions.commands, isEmpty);
  });

  testWidgets('a / typed after something else is only a character', (WidgetTester tester) async {
    await screen.pump(tester);

    await tester.enterText(composer(), 'path a');
    await tester.enterText(composer(), 'path a/b');
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionCommandsTitle), findsNothing);
  });
}
