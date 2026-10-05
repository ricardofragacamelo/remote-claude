/// What happens in a turn, inside the conversation (plan 10, F4): the line that moves while it runs,
/// the thinking, the question in the place of its tool and the plan to approve, the pill over the
/// box, the keyboard that stays, the task list, the quiet lines, and what a prompt offers.
library;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/message_actions.dart';
import 'package:remote_claude/features/session/presentation/widgets/pending_pill.dart';
import 'package:remote_claude/features/session/presentation/widgets/task_strip.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/features/session/presentation/widgets/working_indicator.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/builders/permissions.dart';
import '../../../support/builders/undo.dart';
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

  Future<void> ask(WidgetTester tester, PermissionRequest request) async {
    screen.permissions.feed.emit(asked(request));
    await tester.pumpAndSettle();
  }

  /// The order of what the conversation draws, by the key of each row.
  List<String> rows(WidgetTester tester) => tester
      .widgetList<Padding>(
        find.descendant(of: find.byType(ConversationView), matching: find.byType(Padding)),
      )
      .map((Padding row) => row.key)
      .whereType<ValueKey<String>>()
      .map((ValueKey<String> key) => key.value)
      .toList();

  Finder working() => find.byType(WorkingIndicator);

  /// A window tall enough for every row of a short conversation to be built.
  void tall(WidgetTester tester) {
    tester.view
      ..physicalSize = const Size(1080, 6000)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  /// A request asking about [toolUseId], answerable — read-only, so one tap is a yes.
  PermissionRequest about(String toolUseId, {String requestId = 'request-1'}) => aPermissionRequest(
    requestId: requestId,
    toolUseId: toolUseId,
    riskHint: RiskHint.read,
    defaultToNo: false,
    input: const <String, Object?>{'command': 'cat notes.txt'},
    description: 'cat notes.txt',
  );

  testWidgets('S-119 · running, asking and ended, the screen meets the tap-target, label and '
      'contrast guidelines', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    Future<void> guidelinesHold() async {
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    }

    await screen.pump(tester);
    await emit(tester, messageCompleted(messageId: 'u1', text: 'go', role: 'user', seq: 2));
    await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 3));
    await emit(tester, sessionStatusChanged(status: 'running', seq: 4));
    expect(working(), findsOneWidget);
    await guidelinesHold();

    await ask(tester, about('toolu-1'));
    await emit(tester, sessionStatusChanged(status: 'waitingPermission', seq: 5));
    expect(find.text(l10n.sessionWorkingWaiting), findsOneWidget);
    await guidelinesHold();

    await emit(tester, sessionClosed(seq: 6, reason: 'idleTimeout'));
    expect(working(), findsNothing);
    await guidelinesHold();
    semantics.dispose();
  });

  group('the line of the turn — B-18', () {
    testWidgets(
      'S-54 · a turn running ends the conversation with its line; its end takes it away',
      (WidgetTester tester) async {
        await screen.pump(tester);
        await emit(tester, messageCompleted(messageId: 'u1', text: 'go', role: 'user', seq: 2));
        await emit(
          tester,
          sessionStatusChanged(
            status: 'thinking',
            seq: 3,
            ts: DateTime.now().toUtc().toIso8601String(),
          ),
        );

        expect(rows(tester).last, 'working');
        final String verb = verbText(l10n, verbOf(turnKeyOf('session-1', const Conversation())));
        expect(find.text(verb), findsOneWidget);
        expect(find.text(l10n.sessionWorkingSeconds('0')), findsOneWidget);

        await emit(tester, turnCompleted(seq: 4));
        await emit(tester, sessionStatusChanged(status: 'idle', seq: 5));

        expect(working(), findsNothing);
        expect(rows(tester).last, 'turn:turn-1');
      },
    );

    testWidgets('S-54 · interrupted, or failing, the line goes with the turn', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(tester, sessionStatusChanged(status: 'running', seq: 2));
      expect(working(), findsOneWidget);

      await emit(tester, sessionClosed(seq: 3, reason: 'failed'));

      expect(working(), findsNothing);
    });

    testWidgets('S-55 · a tool running says which; a question says it waits, and leads to it', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(400, 640)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2, toolName: 'Grep'));
      await emit(tester, sessionStatusChanged(status: 'running', seq: 3));

      expect(find.text(l10n.sessionWorkingRunningTool('Grep')), findsOneWidget);

      await ask(tester, about('toolu-1'));
      await emit(tester, sessionStatusChanged(status: 'waitingPermission', seq: 4));

      expect(find.text(l10n.sessionWorkingWaiting), findsOneWidget);

      await tester.tap(find.text(l10n.sessionWorkingWaiting));
      await tester.pumpAndSettle();

      expect(find.text('cat notes.txt'), findsWidgets);
    });

    testWidgets('S-57 · with less motion asked for, the glyph stands still; the clock goes on', (
      WidgetTester tester,
    ) async {
      DateTime now = t0;
      Widget line() => WorkingIndicator(label: 'Brewing…', since: t0, clock: () => now);

      await tester.pumpApp(line());
      now = t0.add(const Duration(seconds: 3));
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(tester.widget<AnimatedRotation>(find.byType(AnimatedRotation)).turns, greaterThan(0));

      await tester.pumpApp(
        Builder(
          builder: (BuildContext context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: line(),
          ),
        ),
      );
      now = t0.add(const Duration(seconds: 6));
      await tester.pump(const Duration(seconds: 3));

      expect(tester.widget<AnimatedRotation>(find.byType(AnimatedRotation)).turns, 0);
      expect(find.text(l10n.sessionWorkingSeconds('6')), findsOneWidget);
    });
  });

  testWidgets(
    'S-119 · the line that waits for an answer, a link to the card, is legible and named',
    (WidgetTester tester) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      final DateTime t0 = DateTime.utc(2026, 10, 4, 12);

      await tester.pumpApp(
        Scaffold(
          body: WorkingIndicator(
            label: l10n.sessionWorkingWaiting,
            since: t0,
            clock: () => t0,
            onGoToRequest: () {},
          ),
        ),
      );

      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      // Its own node, the sentence alone — not the row with the glyph and the clock.
      final SemanticsData node = tester
          .getSemantics(find.text(l10n.sessionWorkingWaiting))
          .getSemanticsData();
      expect(node.label, l10n.sessionWorkingWaiting);
      expect(node.flagsCollection.isLiveRegion, isTrue);
      semantics.dispose();
    },
  );

  group('thinking — B-19', () {
    testWidgets('S-59 · "Thinking…" while it arrives; "Thought for n s", folded, once it stopped', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(
        tester,
        thinkingDelta(messageId: 'm1', delta: 'let me see', seq: 2, ts: '2026-09-14T12:00:00.000Z'),
      );
      expect(find.text(l10n.thinkingLive), findsOneWidget);

      await emit(
        tester,
        messageDelta(messageId: 'm1', delta: 'Done.', seq: 3, ts: '2026-09-14T12:00:02.400Z'),
      );

      expect(find.text(l10n.thinkingTook('2')), findsOneWidget);
      expect(find.text('let me see'), findsNothing);

      await tester.tap(find.text(l10n.thinkingTook('2')));
      await tester.pumpAndSettle();
      expect(find.text('let me see'), findsOneWidget);
    });

    testWidgets('S-60 · three thinkings between two tools are five rows, in their order', (
      WidgetTester tester,
    ) async {
      tall(tester);
      await screen.pump(tester);
      await emit(tester, thinkingDelta(messageId: 'm1', delta: 'a', seq: 2));
      await emit(tester, toolStarted(toolUseId: 't1', seq: 3));
      await emit(tester, thinkingDelta(messageId: 'm2', delta: 'b', seq: 4));
      await emit(tester, messageDelta(messageId: 'm2', delta: '', seq: 5));
      await emit(tester, thinkingDelta(messageId: 'm2', delta: 'c', seq: 6));
      await emit(tester, toolStarted(toolUseId: 't2', seq: 7));

      expect(rows(tester).where((String key) => key != 'message:m2'), <String>[
        'thinking:m1:0',
        'tool:t1',
        'thinking:m2:0',
        'thinking:m2:1',
        'tool:t2',
      ]);
    });
  });

  group('the question in the place of its tool — B-20', () {
    testWidgets('S-62 · the card stands where the line of its tool was', (
      WidgetTester tester,
    ) async {
      tall(tester);
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      await emit(tester, messageCompleted(messageId: 'm9', text: 'after', seq: 3));

      await ask(tester, about('toolu-1'));

      expect(rows(tester), <String>['tool:toolu-1', 'message:m9']);
      expect(find.byType(PermissionPanel), findsOneWidget);
      expect(find.byType(ToolCard), findsNothing);
    });

    testWidgets('S-63 · asked before its line: at the tail, then in its place — never twice', (
      WidgetTester tester,
    ) async {
      tall(tester);
      await screen.pump(tester);
      await emit(tester, messageCompleted(messageId: 'm1', text: 'first', seq: 2));
      await ask(tester, about('toolu-1'));

      expect(rows(tester), <String>['message:m1', 'question:request-1']);

      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 3));

      expect(rows(tester), <String>['message:m1', 'tool:toolu-1']);
      expect(find.byType(PermissionPanel), findsOneWidget);
    });

    testWidgets('S-64 · the exact command, uncut at 200 %, the risk in words, time and more time', (
      WidgetTester tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      tester.view
        ..physicalSize = const Size(360, 1600)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      const String long = 'find . -name "*.tmp" -mtime +30 -exec rm -rf {} + && echo cleaned';
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));

      await ask(
        tester,
        aPermissionRequest(
          toolUseId: 'toolu-1',
          input: const <String, Object?>{'command': long},
          description: long,
        ),
      );

      expect(find.text(long), findsOneWidget);
      expect(find.text(l10n.permissionRiskDestructive), findsOneWidget);
      expect(find.text(l10n.permissionExtend), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('S-65 · destructive: one tap is not a yes; the second step says so', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      await ask(tester, aPermissionRequest(toolUseId: 'toolu-1'));

      await tester.ensureVisible(find.text(l10n.permissionScopeOnce));
      await tester.tap(find.text(l10n.permissionScopeOnce));
      await tester.pumpAndSettle();

      expect(screen.permissions.feed.answers, isEmpty);
      expect(find.text(l10n.permissionConfirmTitle), findsOneWidget);
    });

    testWidgets('S-66 · the deadline passes: the card becomes the line, refused, and stays', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      await ask(tester, about('toolu-1'));

      screen.permissions.feed.emit(const PermissionSettled(PermissionOutcome.expired('request-1')));
      await tester.pumpAndSettle();

      expect(find.byType(PermissionPanel), findsNothing);
      expect(find.byType(ToolCard), findsOneWidget);
      expect(find.text(l10n.permissionOutcomeExpired), findsOneWidget);
    });

    testWidgets('S-67 · answered in the browser: the line says it, with where', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      await ask(tester, about('toolu-1'));

      screen.permissions.feed.emit(settled('request-1'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.permissionOutcomeAllowedWeb), findsOneWidget);
      expect(find.byType(ToolCard), findsOneWidget);
    });

    testWidgets('a request a rule answered, never asked here, still says so on its tool’s line', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-7', seq: 2));

      screen.permissions.feed.emit(
        const PermissionSettled(
          PermissionOutcome(
            requestId: 'request-9',
            decision: PermissionDecision.allow,
            auto: true,
            toolUseId: 'toolu-7',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.permissionOutcomeAllowedByRule), findsOneWidget);
    });

    testWidgets('S-68 · two taps on a yes are one answer', (WidgetTester tester) async {
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      await ask(tester, about('toolu-1'));

      await tester.ensureVisible(find.text(l10n.permissionScopeOnce));
      await tester.tap(find.text(l10n.permissionScopeOnce));
      await tester.tap(find.text(l10n.permissionScopeOnce), warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(screen.permissions.feed.answers, hasLength(1));
    });
  });

  group('the plan — B-21', () {
    PermissionRequest plan() => aPermissionRequest(
      toolUseId: 'toolu-plan',
      toolName: 'ExitPlanMode',
      riskHint: RiskHint.read,
      input: const <String, Object?>{'plan': '1. Read the code\n2. Fix the bug'},
      description: null,
    );

    testWidgets('S-70 · approved in a mode: allowed, and the chip of the mode follows', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(600, 2400)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-plan', seq: 2, toolName: 'ExitPlanMode'));
      await ask(tester, plan());

      expect(find.text('1. Read the code\n2. Fix the bug'), findsOneWidget);
      await tester.tap(find.text(l10n.permissionPlanModeAcceptEdits));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.permissionPlanApprove));
      await tester.pumpAndSettle();

      expect(screen.permissions.feed.answers.single.decision, PermissionDecision.allow);
      expect(screen.sessions.commands.single.$1, 'session.setPermissionMode');
      expect(screen.sessions.commands.single.$2, <String, Object?>{
        'sessionId': 'session-1',
        'mode': 'acceptEdits',
      });
    });

    testWidgets('S-70 · sent back: refused, with what to change as the reason', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(600, 2400)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await screen.pump(tester);
      await ask(tester, plan());

      await tester.enterText(find.byType(TextField).first, 'skip step 2');
      await tester.tap(find.text(l10n.permissionPlanKeepPlanning));
      await tester.pumpAndSettle();

      expect(screen.permissions.feed.answers.single.decision, PermissionDecision.deny);
      expect(screen.permissions.feed.answers.single.reason, 'skip step 2');
      expect(screen.sessions.commands, isEmpty);
    });
  });

  group('never out of view — B-22', () {
    Future<void> longConversation(WidgetTester tester) async {
      tester.view
        ..physicalSize = const Size(360, 640)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      for (int i = 0; i < 30; i += 1) {
        screen.sessions.emit(
          arrivalOf(messageCompleted(messageId: 'm$i', text: 'line $i', seq: 3 + i)),
        );
      }
      await tester.pumpAndSettle();
      await ask(tester, about('toolu-1'));
    }

    testWidgets('S-71 · the card out of view: the pill; it takes the person there, and goes', (
      WidgetTester tester,
    ) async {
      await longConversation(tester);

      final Finder pill = find.text(l10n.sessionPendingPill('1'));
      expect(pill, findsOneWidget);

      await tester.tap(pill);
      await tester.pumpAndSettle();

      expect(find.byType(PermissionPanel), findsOneWidget);
      expect(pill, findsNothing);
      expect(Focus.of(tester.element(find.byType(PermissionPanel))).hasFocus, isTrue);
    });

    testWidgets('S-71 · away again, past what the list keeps drawn: the pill comes back, and the '
        'card the list let go of is not measured', (WidgetTester tester) async {
      await longConversation(tester);
      await tester.tap(find.text(l10n.sessionPendingPill('1')));
      await tester.pumpAndSettle();
      expect(find.byType(PermissionPanel), findsOneWidget);

      // To the end: the card's row leaves the lazy list, and its node stays behind.
      final ScrollableState scroller = tester.state<ScrollableState>(
        find.descendant(of: find.byType(ConversationView), matching: find.byType(Scrollable)).first,
      );
      scroller.position.jumpTo(scroller.position.maxScrollExtent);
      await tester.pumpAndSettle();
      scroller.position.jumpTo(scroller.position.maxScrollExtent);
      await tester.pumpAndSettle();

      expect(find.byType(PermissionPanel), findsNothing);
      expect(tester.takeException(), isNull);
      expect(find.text(l10n.sessionPendingPill('1')), findsOneWidget);
    });

    testWidgets('S-73 · sending, scrolling and the pill never answer the question', (
      WidgetTester tester,
    ) async {
      await longConversation(tester);

      await tester.drag(find.byType(ConversationView), const Offset(0, 300));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.sessionPendingPill('1')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'meanwhile');
      await tester.pump();
      await tester.tap(find.byTooltip(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      expect(screen.permissions.feed.answers, isEmpty);
      expect(screen.sessions.commands.single.$1, 'session.prompt');
    });

    testWidgets('S-72 · a question arriving keeps the box focused, and send sends the prompt', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(tester, toolStarted(toolUseId: 'toolu-1', seq: 2));
      await tester.showKeyboard(find.byType(TextField));
      await tester.enterText(find.byType(TextField), 'half a thought');

      await ask(tester, about('toolu-1'));

      final EditableTextState box = tester.state<EditableTextState>(
        find.descendant(of: find.byType(TextField), matching: find.byType(EditableText)),
      );
      expect(box.widget.focusNode.hasFocus, isTrue);

      await tester.tap(find.byTooltip(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      expect(screen.permissions.feed.answers, isEmpty);
      expect(screen.sessions.commands.single.$1, 'session.prompt');
      expect(screen.sessions.commands.single.$2, <String, Object?>{
        'sessionId': 'session-1',
        'text': 'half a thought',
      });
    });

    testWidgets('S-76 · the session on screen is said to the platform, and unsaid on leaving', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      expect(screen.push.shown, <String?>['session-1']);

      await tester.pumpWidget(const SizedBox());

      expect(screen.push.shown.last, isNull);
    });

    testWidgets('S-76 · in the background, no session is on screen; back, it is again', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      expect(screen.push.shown.last, isNull);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(screen.push.shown.last, 'session-1');
    });
  });

  group('the tasks and the quiet lines — B-23', () {
    String todos(List<Map<String, String>> items, {required String id, required int seq}) =>
        toolStarted(
          toolUseId: id,
          seq: seq,
          toolName: 'TodoWrite',
          input: <String, Object?>{'todos': items},
        );

    testWidgets('S-77 · one line over the box — "done/total · what is being done" — that opens', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      expect(find.byType(TaskStrip), findsOneWidget);
      expect(find.text(l10n.sessionTasksLabel), findsNothing);

      await emit(
        tester,
        todos(
          <Map<String, String>>[
            <String, String>{'content': 'Read', 'status': 'completed', 'activeForm': 'Reading'},
            <String, String>{'content': 'Test', 'status': 'in_progress', 'activeForm': 'Testing'},
            <String, String>{'content': 'Ship', 'status': 'pending', 'activeForm': 'Shipping'},
          ],
          id: 'td1',
          seq: 2,
        ),
      );

      expect(find.text(l10n.sessionTasksHeadline('1', '3', 'Testing')), findsOneWidget);
      expect(find.text('Ship'), findsNothing);

      await tester.tap(find.text(l10n.sessionTasksHeadline('1', '3', 'Testing')));
      await tester.pumpAndSettle();
      expect(find.text('Ship'), findsOneWidget);
    });

    testWidgets('S-77 · all done says so; an empty list leaves nothing', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(
        tester,
        todos(
          <Map<String, String>>[
            <String, String>{'content': 'Read', 'status': 'completed', 'activeForm': 'Reading'},
          ],
          id: 'td1',
          seq: 2,
        ),
      );
      expect(find.text(l10n.sessionTasksAllDone('1', '1')), findsOneWidget);

      await emit(tester, todos(<Map<String, String>>[], id: 'td2', seq: 3));
      expect(find.text(l10n.sessionTasksAllDone('1', '1')), findsNothing);
    });

    testWidgets('S-78 · the list changing never moves what is being read', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(360, 640)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await screen.pump(tester);
      for (int i = 0; i < 30; i += 1) {
        screen.sessions.emit(
          arrivalOf(messageCompleted(messageId: 'm$i', text: 'line $i', seq: 2 + i)),
        );
      }
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ConversationView), const Offset(0, 400));
      await tester.pumpAndSettle();
      // A line the person is reading now, wherever the scroll put it.
      final Finder reading = find.text(
        <String>[
          for (int i = 0; i < 30; i += 1)
            if (find.text('line $i').hitTestable().evaluate().isNotEmpty) 'line $i',
        ].first,
      );
      final double before = tester.getTopLeft(reading).dy;

      await emit(
        tester,
        todos(
          <Map<String, String>>[
            <String, String>{'content': 'Test', 'status': 'in_progress', 'activeForm': 'Testing'},
          ],
          id: 'td1',
          seq: 40,
        ),
      );
      await emit(
        tester,
        todos(
          <Map<String, String>>[
            <String, String>{'content': 'Test', 'status': 'completed', 'activeForm': 'Testing'},
          ],
          id: 'td2',
          seq: 41,
        ),
      );

      expect(tester.getTopLeft(reading).dy, before);
    });

    testWidgets('an undo is a line in the conversation, where it happened', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(
        tester,
        sessionRewound(
          seq: 2,
          payload: <String, Object?>{
            'promptId': 'p-1',
            'reverted': <Object?>[
              <String, Object?>{'path': 'a.txt', 'action': 'restore'},
            ],
            'preserved': <Object?>[],
            'unchanged': <Object?>[],
            'failed': <Object?>[],
          },
        ),
      );

      expect(find.text(l10n.sessionRewoundSummary('1', '0')), findsOneWidget);
    });
  });

  group('from a prompt — B-24', () {
    Future<void> withPrompt(WidgetTester tester, {bool routed = false}) async {
      await screen.pump(tester, routed: routed);
      await emit(tester, sessionStarted(sessionId: 'session-1', claudeSessionId: 'conv-1', seq: 2));
      await emit(tester, messageCompleted(messageId: 'u1', text: 'fix it', role: 'user', seq: 3));
    }

    testWidgets('S-80 · press and hold a prompt: edit, fork, undo to here', (
      WidgetTester tester,
    ) async {
      await withPrompt(tester);

      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionMessageActions), findsOneWidget);
      expect(find.text(l10n.sessionMessageEdit), findsOneWidget);
      expect(find.text(l10n.sessionMessageForkFrom), findsOneWidget);
      expect(find.text(l10n.sessionMessageUndo), findsOneWidget);
    });

    testWidgets('an answer of Claude offers nothing on a long press', (WidgetTester tester) async {
      await withPrompt(tester);
      await emit(tester, messageCompleted(messageId: 'a1', text: 'done', seq: 4));

      await tester.longPress(find.text('done'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionMessageActions), findsNothing);
    });

    testWidgets('S-81 · editing: the strip, the text in the box; sending forks and moves there', (
      WidgetTester tester,
    ) async {
      await withPrompt(tester, routed: true);
      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.sessionMessageEdit));
      await tester.pumpAndSettle();

      expect(find.textContaining(l10n.sessionEditEditing), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'fix it');

      await tester.enterText(find.byType(TextField), 'fix it properly');
      await tester.tap(find.byTooltip(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      expect(screen.sessions.commands.single.$1, 'session.start');
      expect(screen.sessions.commands.single.$2, <String, Object?>{
        'workspacePath': '/tmp/work',
        'resumeSessionId': 'conv-1',
        'forkAt': 'u1',
      });

      screen.sessions.emit(
        arrivalOf(
          sessionStarted(sessionId: 'session-2', correlationId: 'command-1', resumedFrom: 'conv-1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(screen.sessions.commands.last.$1, 'session.prompt');
      expect(screen.sessions.commands.last.$2, <String, Object?>{
        'sessionId': 'session-2',
        'text': 'fix it properly',
      });
      expect(tester.widget<SessionPage>(find.byType(SessionPage)).sessionId, 'session-2');
    });

    testWidgets('leaving the edit puts nothing on the wire', (WidgetTester tester) async {
      await withPrompt(tester);
      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.sessionMessageEdit));
      await tester.pumpAndSettle();

      await tester.tap(find.text(l10n.sessionEditCancel));
      await tester.pumpAndSettle();

      expect(find.textContaining(l10n.sessionEditEditing), findsNothing);
      expect(screen.sessions.commands, isEmpty);
    });

    testWidgets('S-82 · a point that is not a prompt is refused, translated', (
      WidgetTester tester,
    ) async {
      await withPrompt(tester);
      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.sessionMessageForkFrom));
      await tester.pumpAndSettle();

      screen.sessions.emit(
        const CommandRefused(
          commandId: 'command-1',
          failure: ServerFailure(
            code: 'INVALID_INPUT',
            messageKey: 'session.error.forkPointUnknown',
            traceId: 'trace-1',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorForkPointUnknown), findsOneWidget);
    });

    testWidgets('S-82 · the CLI refusing the fork offers the plain resume instead', (
      WidgetTester tester,
    ) async {
      await screen.pump(tester);
      await emit(
        tester,
        sessionStarted(
          sessionId: 'session-1',
          claudeSessionId: 'conv-2',
          resumedFrom: 'conv-1',
          seq: 2,
        ),
      );

      screen.sessions.emit(
        const SessionFailed(
          ServerFailure(
            code: 'SESSION_FORK_REJECTED',
            messageKey: 'session.error.forkRejected',
            traceId: 'trace-1',
          ),
          sessionId: 'session-1',
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorForkRejected), findsOneWidget);

      await tester.tap(find.text(l10n.sessionEditResumeInstead));
      await tester.pumpAndSettle();

      expect(screen.sessions.commands.single.$1, 'session.start');
      expect(screen.sessions.commands.single.$2, <String, Object?>{
        'workspacePath': '/tmp/work',
        'resumeSessionId': 'conv-1',
      });
    });

    testWidgets('S-83 · a turn running: the undo is off, saying why; ended: it is not there', (
      WidgetTester tester,
    ) async {
      await withPrompt(tester);
      await emit(tester, sessionStatusChanged(status: 'running', seq: 4));
      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();

      expect(
        tester.widget<ListTile>(find.widgetWithText(ListTile, l10n.sessionMessageUndoBusy)).enabled,
        isFalse,
      );

      Navigator.of(tester.element(find.text(l10n.sessionMessageActions))).pop();
      await tester.pumpAndSettle();
      await emit(tester, sessionClosed(seq: 5));
      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionMessageUndo), findsNothing);
      expect(find.text(l10n.sessionMessageUndoBusy), findsNothing);
      expect(find.text(l10n.sessionMessageEdit), findsOneWidget);
    });

    testWidgets('undo to here opens the undo on the point of that prompt', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(1080, 4000)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      screen.checkpoints.answer = <Checkpoint>[
        aCheckpoint(promptId: 'p-other', label: 'something else'),
        aCheckpoint(promptId: 'p-fix', label: 'fix it'),
      ];
      await withPrompt(tester);
      await tester.longPress(find.text('fix it'));
      await tester.pumpAndSettle();

      await tester.tap(find.text(l10n.sessionMessageUndo));
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionUndoConfirmTitle('fix it')), findsOneWidget);
    });

    testWidgets('S-84 · the three are actions of the message for a screen reader', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await withPrompt(tester);

      final SemanticsData data = tester.getSemantics(find.byType(PromptHold)).getSemanticsData();
      // Named by its own words, on the node that acts (S-119).
      expect(data.label, 'fix it');
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      final List<String> labels = <String>[
        for (final int id in data.customSemanticsActionIds ?? const <int>[])
          CustomSemanticsAction.getAction(id)!.label!,
      ];

      expect(
        labels,
        containsAll(<String>[
          l10n.sessionMessageEdit,
          l10n.sessionMessageForkFrom,
          l10n.sessionMessageUndo,
        ]),
      );
      semantics.dispose();
    });
  });

  testWidgets('the pill is announced, empty, before anything is asked', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(PendingPill(count: 0, outOfView: true, onGoTo: () {}));

    expect(find.byType(ActionChip), findsNothing);
  });

  test('where the cards are is only said when it changes', () {
    final QuestionsInView inView = QuestionsInView();
    int heard = 0;
    inView.addListener(() => heard += 1);

    inView
      ..report(outOfView: true)
      ..report(outOfView: true)
      ..report(outOfView: false);

    expect(heard, 2);
    inView.goTo('nothing');
    inView.dispose();
  });
}
