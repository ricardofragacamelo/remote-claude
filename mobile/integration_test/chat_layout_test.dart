/// Plan 10, B-32 and B-33 — the chat layout on the emulator, against the scripted backend.
///
/// What the widget tests prove piece by piece, proved here whole, on a device, with the turns the
/// backend replays: the box that never leaves the screen, the draft that opens a session with what
/// was chosen, the turn inline from the prompt to its summary, the pill, a question answered in the
/// browser, the background and back — and the guidelines in every state, and the cycle in 200 % type.
///
/// The phone's size and its keyboard are set on the test's view (`tester.view`): the size of the
/// matrix is a 360×640 phone, whatever the emulator is, and the keyboard is the inset the system
/// reports — what the screen lays itself out around — rather than an IME whose height changes with
/// the image.
library;

import 'package:flutter/material.dart';

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/lifecycle.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/working_indicator.dart';
import 'package:remote_claude/features/session/session.dart';

import 'support/e2e_environment.dart';
import 'support/session_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final E2eScenario layout = E2eScenario.named('mobile-chat-layout');
  final BuildConfig config = e2eConfig();
  final Map<String, Object?> phone = layout.expect['phone']! as Map<String, Object?>;
  final double width = (phone['width']! as int).toDouble();
  final double height = (phone['height']! as int).toDouble();
  final double keyboard = layout.integer('keyboard').toDouble();

  String turnOf(String fixture) => 'do the work [fixture:$fixture]';

  /// How many turns of [sessionId] have ended — each leaves its summary.
  int turnsOf(SignedInApp app, String sessionId) =>
      app.conversationOf(sessionId).entries.whereType<TurnSummary>().length;

  /// Sends [fixture] as a turn and waits for its summary.
  Future<void> aTurn(WidgetTester tester, SignedInApp app, String sessionId, String fixture) async {
    final int before = turnsOf(app, sessionId);
    await app.robot(tester).prompt(turnOf(fixture));
    await pumpUntil(tester, () => turnsOf(app, sessionId) > before);
  }

  /// A session of the first folder, opened through its draft with a plain turn, and ended once the
  /// test is over.
  Future<String> aSession(WidgetTester tester, SignedInApp app) async {
    final String sessionId = await app
        .robot(tester)
        .startSession(app.container, turnOf(layout.text('turn')));
    app.endsAfterTheTest(config, sessionId);
    await pumpUntil(
      tester,
      () => turnsOf(app, sessionId) == 1,
      what: () => 'the first turn of $sessionId to end: ${app.conversationOf(sessionId).entries}',
    );

    return sessionId;
  }

  /// A session of the first folder with as many plain turns as the matrix asks — long enough to
  /// scroll.
  Future<String> aLongConversation(WidgetTester tester, SignedInApp app) async {
    final String sessionId = await aSession(tester, app);
    for (int turn = 1; turn < layout.integer('turns'); turn += 1) {
      await aTurn(tester, app, sessionId, layout.text('turn'));
    }
    return sessionId;
  }

  /// The phone of the matrix — 360×640 — with its keyboard open or closed.
  void onAPhone(WidgetTester tester, {required bool keyboardOpen}) {
    final double ratio = tester.view.devicePixelRatio;
    tester.view.physicalSize = Size(width * ratio, height * ratio);
    tester.view.viewInsets = keyboardOpen
        ? FakeViewPadding(bottom: keyboard * ratio)
        : FakeViewPadding.zero;
    addTearDown(tester.view.reset);
  }

  /// Whether the box is whole inside what is seen: below the top, above the keyboard.
  void boxWhole(WidgetTester tester, SessionRobot robot) {
    final Rect box = tester.getRect(robot.box);
    final double seen =
        tester.view.physicalSize.height / tester.view.devicePixelRatio -
        tester.view.viewInsets.bottom / tester.view.devicePixelRatio;

    expect(box.top, greaterThanOrEqualTo(0), reason: 'the box starts on screen: $box');
    expect(box.bottom, lessThanOrEqualTo(seen + 0.5), reason: 'the box ends above $seen: $box');
  }

  /// The scroller of the conversation.
  ScrollableState conversationScroller(WidgetTester tester) => tester.state<ScrollableState>(
    find.descendant(of: find.byType(ConversationView), matching: find.byType(Scrollable)).first,
  );

  /// Waits for the card of the question of [sessionId] in the conversation, buys time on it, and
  /// answers the request's id.
  Future<String> aCardOnScreen(WidgetTester tester, SignedInApp app, String sessionId) async {
    final SessionRobot robot = app.robot(tester);
    await pumpUntil(tester, () => app.queueOf(sessionId).pending.isNotEmpty);
    await pumpUntil(tester, () => robot.cardInConversation.evaluate().isNotEmpty);
    final String requestId = app.queueOf(sessionId).pending.single.requestId;
    await extendedOnTheCard(tester, app, sessionId, requestId);

    return requestId;
  }

  /// Allows the question on screen once — through the deliberate second step when it is
  /// destructive — and waits for the server to settle it.
  Future<void> allowedOnce(
    WidgetTester tester,
    SignedInApp app, {
    required String sessionId,
    required String requestId,
  }) async {
    await app.robot(tester).answer(app.l10n.permissionScopeOnce);
    await tester.pump(const Duration(milliseconds: 300));
    final Finder secondStep = find.text(app.l10n.permissionConfirmAction);
    if (secondStep.evaluate().isNotEmpty) {
      await tapOnScreen(tester, secondStep);
    }
    await pumpUntil(tester, () => app.queueOf(sessionId).outcomeOf(requestId) != null);
  }

  /// [target] inside the conversation.
  Finder said(Finder target) =>
      find.descendant(of: find.byType(ConversationView), matching: target);

  testWidgets('${layout.id} — S-115: in 360×640 with the keyboard open, the box stays whole at the '
      'top and at the end of a long conversation, and only the conversation scrolls', (
    WidgetTester tester,
  ) async {
    final SignedInApp app = await signedInApp(tester, config, layout);
    final SessionRobot robot = app.robot(tester);
    onAPhone(tester, keyboardOpen: true);

    await aLongConversation(tester, app);
    await tester.pumpAndSettle();

    final ScrollableState scroller = conversationScroller(tester);
    expect(
      scroller.position.maxScrollExtent,
      greaterThan(0),
      reason: 'a conversation that scrolls',
    );

    // At the top.
    scroller.position.jumpTo(scroller.position.minScrollExtent);
    await tester.pumpAndSettle();
    boxWhole(tester, robot);
    final Rect boxAtTheTop = tester.getRect(robot.box);
    final Rect barAtTheTop = tester.getRect(find.byType(AppBar).last);

    // At the end — the list builds what is near the view, so its extent settles as it goes.
    for (int step = 0; step < 5; step += 1) {
      scroller.position.jumpTo(scroller.position.maxScrollExtent);
      await tester.pumpAndSettle();
    }
    boxWhole(tester, robot);

    // Nothing but the conversation moved.
    expect(tester.getRect(robot.box), boxAtTheTop);
    expect(tester.getRect(find.byType(AppBar).last), barAtTheTop);
  });

  testWidgets('${layout.id} — S-116: the draft opens the session with the model, the mode and the '
      'effort chosen in it', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, layout);
    final SessionRobot robot = app.robot(tester);

    await robot.openDraft(app.container);
    await robot.pick(app.l10n.modelLabel, layout.text('modelLabel'));
    await robot.pick(app.l10n.modeLabel, app.l10n.modePlan);
    await robot.pick(app.l10n.effortLabel, app.l10n.effortHigh);

    final String sessionId = await robot.sentFromTheDraft(turnOf(layout.text('turn')));
    app.endsAfterTheTest(config, sessionId);
    await pumpUntil(tester, () => turnsOf(app, sessionId) == 1);

    // The server opened it with them...
    final Map<String, Object?> live = (await app.browser.liveSessions(
      await app.browser.firstWorkspace(),
    )).singleWhere((Map<String, Object?> each) => each['sessionId'] == sessionId);
    expect(live['model'], layout.text('model'));
    expect(live['permissionMode'], layout.text('mode'));

    // ...and the bar of the session says so — the effort too, which only the phone that chose it
    // knows (the server never says it back).
    await tester.pumpAndSettle();
    expect(await robot.valueOf(app.l10n.modeLabel), app.l10n.modePlan);
    expect(await robot.valueOf(app.l10n.effortLabel), app.l10n.effortHigh);
    expect(await robot.valueOf(app.l10n.modelLabel), contains(layout.text('modelLabel')));
  });

  testWidgets(
    '${layout.id} — S-117: the turn inline, from the prompt to its summary — the line that '
    'works, the card, the decision, the thought — with the box whole at every step',
    (WidgetTester tester) async {
      final SignedInApp app = await anApprovedApp(tester, config, layout);
      final SessionRobot robot = app.robot(tester);
      onAPhone(tester, keyboardOpen: false);
      final String sessionId = await aSession(tester, app);
      final int before = turnsOf(app, sessionId);

      await robot.prompt(turnOf(layout.text('thoughtTurn')));
      await pumpUntil(tester, () => find.byType(WorkingIndicator).evaluate().isNotEmpty);
      boxWhole(tester, robot);

      // The card, and the line under the conversation saying who is waited on.
      final String requestId = await aCardOnScreen(tester, app, sessionId);
      await pumpUntil(
        tester,
        () => find
            .descendant(
              of: find.byType(WorkingIndicator),
              matching: find.textContaining(app.l10n.sessionWorkingWaiting),
            )
            .evaluate()
            .isNotEmpty,
      );
      boxWhole(tester, robot);

      // Allowed: the card leaves, and the line of its tool says how it was decided.
      await allowedOnce(tester, app, sessionId: sessionId, requestId: requestId);
      await pumpUntil(tester, () => turnsOf(app, sessionId) > before);
      await pumpUntil(tester, () => robot.cardInConversation.evaluate().isEmpty);
      await tester.pumpAndSettle();
      expect(find.byType(WorkingIndicator), findsNothing);
      boxWhole(tester, robot);

      // The settlement, as the phone has it: answered here, and about a tool of the conversation.
      final PermissionOutcome outcome = app.queueOf(sessionId).outcomeOf(requestId)!;
      expect(
        (outcome.origin, outcome.decision, outcome.expired),
        (AnswerOrigin.mobile, PermissionDecision.allow, false),
      );
      expect(
        app.conversationOf(sessionId).tools.map((ToolExecution tool) => tool.toolUseId),
        contains(outcome.toolUseId),
        reason: 'the tool the card was about, ${outcome.toolUseId}, among the lines',
      );
      await robot.seeInConversation(said(find.text(app.l10n.permissionOutcomeAllowedPhone)));
      boxWhole(tester, robot);
      await robot.seeInConversation(said(find.textContaining(app.l10n.thinkingDone)));
      boxWhole(tester, robot);
    },
  );

  testWidgets(
    '${layout.id} — S-118: scrolled up with a question open, the pill leads to the card; a '
    'question answered in the browser becomes the line that says so; the background and back '
    'keep the card, once',
    (WidgetTester tester) async {
      final SignedInApp app = await anApprovedApp(tester, config, layout);
      final SessionRobot robot = app.robot(tester);
      final String sessionId = await aLongConversation(tester, app);

      // The pill: away from the card, it says Claude waits; tapped, it brings the card back.
      await robot.prompt(turnOf(layout.text('inlineTurn')));
      final String first = await aCardOnScreen(tester, app, sessionId);
      final ScrollableState scroller = conversationScroller(tester);
      scroller.position.jumpTo(scroller.position.minScrollExtent);
      await tester.pump(const Duration(milliseconds: 300));
      await pumpUntil(tester, () => robot.pill.evaluate().isNotEmpty);
      await tester.tap(robot.pill.first);
      await robot.cardOnScreen();
      await allowedOnce(tester, app, sessionId: sessionId, requestId: first);
      await pumpUntil(tester, () => turnsOf(app, sessionId) == layout.integer('turns') + 1);

      // Answered in the browser: the card leaves the phone, and the line says where it was answered.
      final BrowserSocket browser = await BrowserSocket.open(config, app.accessToken);
      addTearDown(browser.close);
      browser.attach(sessionId);
      await robot.prompt(turnOf(layout.text('inlineTurn')));
      final String second = await aCardOnScreen(tester, app, sessionId);
      final Map<String, Object?> asked = await browser.waitFor(
        (Map<String, Object?> frame) =>
            frame['type'] == 'permission.requested' &&
            (frame['payload']! as Map<String, Object?>)['requestId'] == second,
      );
      browser.respond(asked, <String, Object?>{'decision': 'allow', 'scope': 'once'});
      await pumpUntil(tester, () => app.queueOf(sessionId).outcomeOf(second) != null);
      await pumpUntil(tester, () => robot.cardInConversation.evaluate().isEmpty);
      await robot.seeInConversation(said(find.text(app.l10n.permissionOutcomeAllowedWeb)));
      await pumpUntil(tester, () => turnsOf(app, sessionId) == layout.integer('turns') + 2);

      // Away in the middle of a question, and back: the socket replays, the card is there once, and
      // nothing of the conversation is twice.
      await robot.prompt(turnOf(layout.text('inlineTurn')));
      final String third = await aCardOnScreen(tester, app, sessionId);
      final List<String> before = app
          .conversationOf(sessionId)
          .entries
          .map((ConversationEntry entry) => entry.entryId)
          .toList();
      final WsClient socket = app.container.read(wsClientProvider);
      await applyLifecycle(AppLifecycleState.paused, socket, app.container.read(appLoggerProvider));
      await pumpUntil(tester, () => socket.status != ConnectionStatus.ready);
      await applyLifecycle(
        AppLifecycleState.resumed,
        socket,
        app.container.read(appLoggerProvider),
      );
      await pumpUntil(tester, () => socket.status == ConnectionStatus.ready);
      await tester.pump(const Duration(milliseconds: 500));

      final List<String> after = app
          .conversationOf(sessionId)
          .entries
          .map((ConversationEntry entry) => entry.entryId)
          .toList();
      expect(after, before);
      expect(after.toSet(), hasLength(after.length));
      expect(app.queueOf(sessionId).pending, hasLength(1));
      expect(robot.cardInConversation, findsOneWidget);
      await allowedOnce(tester, app, sessionId: sessionId, requestId: third);
    },
  );

  testWidgets('${layout.id} — S-119: no guideline broken — tap targets and labels — in the draft, '
      'running, asking and ended', (WidgetTester tester) async {
    // Released in the body: the binding checks for a live handle before the tear-downs run.
    final SemanticsHandle semantics = tester.ensureSemantics();
    final SignedInApp app = await anApprovedApp(tester, config, layout);
    final SessionRobot robot = app.robot(tester);

    // Tap targets and labels, which do not depend on how the screen is captured. Contrast is
    // proved in the widget tests of these four states (D-31): `textContrastGuideline` captures the
    // screen at logical resolution, and on a device with real fonts the anti-aliased glyphs it
    // averages read as greys the text never was — measured at 1.7:1 for a 16:1 text.
    Future<void> guidelinesHold(String state) async {
      for (final AccessibilityGuideline guideline in <AccessibilityGuideline>[
        androidTapTargetGuideline,
        labeledTapTargetGuideline,
      ]) {
        await expectLater(tester, meetsGuideline(guideline), reason: state);
      }
    }

    // The draft.
    await robot.openDraft(app.container);
    await guidelinesHold('draft');

    // Running: a turn held open until it is stopped.
    final String sessionId = await robot.sentFromTheDraft(
      'hold on [fixture:${layout.text('turn')}] [hold]',
    );
    await pumpUntil(tester, () => find.byType(WorkingIndicator).evaluate().isNotEmpty);
    await guidelinesHold('running');
    await tester.tap(robot.stop);
    // The conversation says when the turn ended — the line that works may only be out of the part
    // of the list that is built.
    await pumpUntil(tester, () => !app.conversationOf(sessionId).isTurnRunning);

    // Asking — with every extension bought, since the checks take their time.
    final int before = turnsOf(app, sessionId);
    await robot.prompt(turnOf(layout.text('inlineTurn')));
    final String requestId = await aCardOnScreen(tester, app, sessionId);
    await app.robot(tester).answer(app.l10n.permissionExtend);
    await tester.pump(const Duration(milliseconds: 300));
    await guidelinesHold('asking');
    await allowedOnce(tester, app, sessionId: sessionId, requestId: requestId);
    await pumpUntil(tester, () => turnsOf(app, sessionId) > before);
    await pumpUntil(tester, () => !app.conversationOf(sessionId).isTurnRunning);

    // Ended, from the menu.
    await tester.pumpAndSettle();
    await robot.endSession();
    await pumpUntil(
      tester,
      () => robot.canOnlyResume,
      what: () =>
          'only resuming, with the session ${app.conversationOf(sessionId).status} and the bar '
          'offering ${tester.widgetList<Tooltip>(find.byType(Tooltip)).map((Tooltip tip) => tip.message).join(', ')}',
    );
    await guidelinesHold('ended');
    semantics.dispose();
  });

  testWidgets('${layout.id} — S-120: the cycle in 200 % type, the command of the card whole', (
    WidgetTester tester,
  ) async {
    final SignedInApp app = await anApprovedApp(tester, config, layout);
    final SessionRobot robot = app.robot(tester);
    onAPhone(tester, keyboardOpen: false);
    tester.platformDispatcher.textScaleFactorTestValue = (layout.expect['textScale']! as num)
        .toDouble();
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    final String sessionId = await aSession(tester, app);
    final int before = turnsOf(app, sessionId);
    await robot.prompt(turnOf(layout.text('inlineTurn')));
    final String requestId = await aCardOnScreen(tester, app, sessionId);
    boxWhole(tester, robot);

    // The command exactly as it will run — in its box, which scrolls rather than cuts.
    final Finder command = find.descendant(
      of: robot.cardInConversation,
      matching: find.byWidgetPredicate(
        (Widget widget) => widget is SelectableText && widget.data == layout.text('command'),
      ),
    );
    expect(command, findsOneWidget);

    await allowedOnce(tester, app, sessionId: sessionId, requestId: requestId);
    await pumpUntil(tester, () => turnsOf(app, sessionId) > before);
    await robot.seeInConversation(said(find.text(app.l10n.permissionOutcomeAllowedPhone)));
    boxWhole(tester, robot);
  });
}
