/// The session screen: three bands, the conversation the only scroll, the composer over the
/// keyboard, every state a line — and a session that ended resumes on send (plan 10, F1 and F2).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/builders/permissions.dart';
import '../../../support/fakes/fake_history_repository.dart';
import '../../../support/fakes/fake_insight_repository.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/fakes/stub_push_controller.dart';
import '../../../support/pump_app.dart';

/// What the transcript of the conversation says: a question and its answer.
final HistoryPage transcript = HistoryPage(
  conversationId: 'conv-1',
  workspacePath: '/home/someone/project',
  events: historyOf(<String>[
    messageCompleted(messageId: 'h1', text: 'what broke?', role: 'user', seq: 1),
    messageCompleted(messageId: 'h2', text: 'the build', seq: 2),
  ]),
);

const Failure limitReached = ServerFailure(
  code: 'SESSION_LIMIT_REACHED',
  messageKey: 'session.error.limitReached',
  traceId: 'trace-limit',
  params: <String, String>{'limit': '2'},
);

void main() {
  late AppLocalizations l10n;
  late FakeSessionRepository sessions;
  late FakePermissionRepository permissions;
  late FakeHistoryRepository history;
  late FakeInsightRepository insight;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  List<Override> overrides(
    ConnectionStatus connection, {
    DeviceStatus device = DeviceStatus.approved,
    Stream<ConnectionStatus>? statuses,
  }) => <Override>[
    // The clock of the builders, so the question the test asks is not already past its deadline.
    ...permissionOverrides(repository: permissions, clock: () => t0),
    sessionRepositoryProvider.overrideWithValue(sessions),
    historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
    insightRepositoryProvider.overrideWithValue(insight as InsightRepository),
    deviceControllerAnswering(
      AsyncValue<RegisteredDevice?>.data(aRegisteredDevice(status: device)),
    ),
    pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
    connectionStatusProvider.overrideWith(
      (Ref ref) => statuses ?? Stream<ConnectionStatus>.value(connection),
    ),
  ];

  void fakes() {
    sessions = FakeSessionRepository();
    addTearDown(sessions.dispose);
    permissions = FakePermissionRepository();
    history = FakeHistoryRepository()..answer(transcript);
    insight = FakeInsightRepository();
  }

  Future<void> pumpSession(
    WidgetTester tester, {
    ConnectionStatus connection = ConnectionStatus.ready,
    bool settle = true,
  }) async {
    fakes();
    await tester.pumpApp(
      const SessionPage(sessionId: 'session-1'),
      overrides: overrides(connection),
    );

    // A spinner never settles, so a screen showing one is pumped rather than settled.
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
    }
  }

  /// The screen inside a router, so moving to another session can be seen.
  Future<void> pumpRoutedSession(WidgetTester tester) async {
    fakes();
    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: '/sessions/:sessionId',
          builder: (BuildContext context, GoRouterState state) =>
              SessionPage(sessionId: state.pathParameters['sessionId']!),
        ),
      ],
      initialLocation: '/sessions/session-1',
      overrides: overrides(ConnectionStatus.ready),
    );
    await tester.pumpAndSettle();
  }

  Future<void> emit(WidgetTester tester, String raw) async {
    sessions.emit(arrivalOf(raw));
    await tester.pumpAndSettle();
  }

  Finder box() => find.byType(TextField);

  Future<void> type(WidgetTester tester, String text) async {
    await tester.enterText(box(), text);
    await tester.pump();
  }

  Future<void> send(WidgetTester tester, String text, {String? tooltip}) async {
    await type(tester, text);
    await tester.tap(find.byTooltip(tooltip ?? l10n.sessionPromptAction));
    await tester.pumpAndSettle();
  }

  /// A phone: [width]×[height] logical pixels, at [scale] of the system font.
  void phone(WidgetTester tester, {double width = 360, double height = 640, double scale = 1}) {
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = scale;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  }

  testWidgets('attaches to the session the route named', (WidgetTester tester) async {
    await pumpSession(tester);

    expect(sessions.followed, <String>['session-1']);
  });

  group('three bands — B-06', () {
    testWidgets('S-10 · 300 entries on 360×640: only the conversation scrolls', (
      WidgetTester tester,
    ) async {
      phone(tester);
      await pumpSession(tester);

      for (int seq = 1; seq <= 300; seq += 1) {
        sessions.emit(
          arrivalOf(messageCompleted(messageId: 'm$seq', text: 'answer $seq', seq: seq)),
        );
      }
      await tester.pumpAndSettle();

      expect(find.byType(Scrollable), findsWidgets);
      expect(find.byType(ConversationView), findsOneWidget);
      expect(find.text('answer 300'), findsOneWidget);

      final Rect bar = tester.getRect(find.byType(AppBar));
      final Rect composer = tester.getRect(box());
      expect(bar.top, greaterThanOrEqualTo(0));
      expect(composer.bottom, lessThanOrEqualTo(640));

      await tester.drag(find.byType(ConversationView), const Offset(0, 2000));
      await tester.pumpAndSettle();

      // The bar and the box did not move: the conversation scrolled, and only it.
      expect(tester.getRect(find.byType(AppBar)), bar);
      expect(tester.getRect(box()), composer);
      expect(tester.takeException(), isNull);
    });

    testWidgets('S-11 · with the keyboard open on 360×400 the box sits above it, the bar stays', (
      WidgetTester tester,
    ) async {
      phone(tester, height: 640);
      tester.view.viewInsets = const FakeViewPadding(bottom: 240);
      addTearDown(tester.view.resetViewInsets);
      await pumpSession(tester);
      await emit(tester, messageCompleted(messageId: 'm1', text: 'hello', seq: 1));

      final Rect composer = tester.getRect(box());
      expect(composer.bottom, lessThanOrEqualTo(400));
      expect(tester.getRect(find.byType(AppBar)).top, 0);
      expect(tester.getRect(find.byType(ConversationView)).height, greaterThan(0));
      expect(tester.takeException(), isNull);
    });

    testWidgets('S-24 · at 200 % of the font the bar, the strips and the box do not cut', (
      WidgetTester tester,
    ) async {
      phone(tester, scale: 2);
      await pumpSession(tester, connection: ConnectionStatus.throttled, settle: false);
      sessions.emit(arrivalOf(sessionClosed(seq: 1, reason: 'auditUnavailable')));
      await tester.pump();

      expect(tester.takeException(), isNull);

      // The long strip ends in an ellipsis, and opens whole on a tap.
      final Text line = tester.widget<Text>(
        find.textContaining(l10n.sessionClosedAuditUnavailable),
      );
      expect(line.maxLines, 1);
      expect(line.overflow, TextOverflow.ellipsis);
    });

    testWidgets('S-25 · turning the phone keeps what was written', (WidgetTester tester) async {
      phone(tester);
      await pumpSession(tester);
      await type(tester, 'half a thought');

      phone(tester, width: 640, height: 360);
      await tester.pumpAndSettle();

      expect(tester.widget<TextField>(box()).controller?.text, 'half a thought');
      expect(tester.takeException(), isNull);
    });
  });

  group('S-37 · the states of a screen with nothing on it yet', () {
    testWidgets('a socket still opening is a wait, and says which', (WidgetTester tester) async {
      await pumpSession(tester, connection: ConnectionStatus.connecting, settle: false);

      expect(find.text(l10n.connectionStatusConnecting), findsWidgets);
    });

    testWidgets('a socket that is there and a session with nothing said is empty', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);

      expect(find.text(l10n.sessionEmptyTitle), findsOneWidget);
      expect(find.text(l10n.sessionEmptyBody), findsOneWidget);
    });

    testWidgets('shows the conversation once something has been said', (WidgetTester tester) async {
      await pumpSession(tester);

      await emit(tester, messageDelta(messageId: 'm1', delta: 'Hello', seq: 1));

      expect(find.text('Hello'), findsOneWidget);
      expect(find.text(l10n.sessionEmptyTitle), findsNothing);
    });
  });

  group('the states as lines — B-07', () {
    testWidgets('S-14 · S-81 · a connection held back says why, in a line, on a narrow phone', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.625;
      addTearDown(tester.view.reset);

      await pumpSession(tester, connection: ConnectionStatus.throttled, settle: false);

      expect(find.text(l10n.connectionStatusThrottled), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'S-14 · disconnected → reconnecting → connected: the line comes and goes, the box stays',
      (WidgetTester tester) async {
        fakes();
        final StreamController<ConnectionStatus> statuses =
            StreamController<ConnectionStatus>.broadcast();
        // Not awaited: a controller closed with nobody listening any more never says it is done.
        addTearDown(() => unawaited(statuses.close()));
        await tester.pumpApp(
          const SessionPage(sessionId: 'session-1'),
          overrides: overrides(ConnectionStatus.ready, statuses: statuses.stream),
        );
        statuses.add(ConnectionStatus.ready);
        await tester.pumpAndSettle();
        await type(tester, 'half a thought');
        final Rect composer = tester.getRect(box());

        statuses.add(ConnectionStatus.reconnecting);
        await tester.pump();
        await tester.pump();
        expect(find.text(l10n.connectionStatusReconnecting), findsWidgets);

        statuses.add(ConnectionStatus.ready);
        await tester.pumpAndSettle();

        expect(find.text(l10n.connectionStatusReconnecting), findsNothing);
        expect(tester.getRect(box()), composer);
        expect(tester.widget<TextField>(box()).controller?.text, 'half a thought');
      },
    );

    testWidgets('S-14 · a connection gone keeps the text, and says nothing can be sent', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester, connection: ConnectionStatus.closed);

      expect(tester.widget<TextField>(box()).enabled, isFalse);
      expect(find.text(l10n.composerBlocked(l10n.connectionStatusClosed)), findsOneWidget);
    });

    testWidgets('S-16 · a pending phone is a line, not a card that pushes the box', (
      WidgetTester tester,
    ) async {
      fakes();
      await tester.pumpApp(
        const SessionPage(sessionId: 'session-1'),
        overrides: overrides(ConnectionStatus.ready, device: DeviceStatus.pending),
      );
      await tester.pumpAndSettle();

      expect(find.byType(DeviceStatusLine), findsOneWidget);
      expect(find.text(l10n.deviceStatusPendingBody), findsNothing);
    });

    testWidgets('S-69 · a question is in the conversation, whole — no queue above it', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);

      permissions.feed.emit(asked(aPermissionRequest()));
      await tester.pumpAndSettle();

      expect(permissions.feed.sessionId, 'session-1');
      expect(
        find.descendant(of: find.byType(ConversationView), matching: find.text('rm -rf build/')),
        findsOneWidget,
      );
    });
  });

  testWidgets('S-06 · shows a tool with the exact command it was given, in its place', (
    WidgetTester tester,
  ) async {
    await pumpSession(tester);

    await emit(
      tester,
      toolStarted(toolUseId: 't1', seq: 1, input: <String, Object?>{'command': 'rm -rf /tmp/x'}),
    );

    expect(find.textContaining('rm -rf /tmp/x'), findsOneWidget);
    expect(find.text(l10n.sessionToolStatusRunning), findsOneWidget);
  });

  testWidgets('S-08 · thinking is its own line, never the answer', (WidgetTester tester) async {
    await pumpSession(tester);

    await emit(
      tester,
      thinkingDelta(messageId: 'm1', delta: 'let me think', seq: 1, ts: '2026-09-14T12:00:00Z'),
    );
    expect(find.text(l10n.thinkingLive), findsOneWidget);

    await emit(
      tester,
      messageDelta(messageId: 'm1', delta: 'Done.', seq: 2, ts: '2026-09-14T12:00:03.600Z'),
    );

    expect(find.text('Done.'), findsOneWidget);
    expect(find.text(l10n.thinkingTook('4')), findsOneWidget);
    expect(find.text('let me think'), findsNothing);
  });

  testWidgets('says where the session is, as it moves — in the chip of the bar', (
    WidgetTester tester,
  ) async {
    await pumpSession(tester);

    await emit(tester, sessionStatusChanged(status: 'waitingPermission', seq: 1));

    expect(find.text(l10n.sessionStandingWaiting), findsOneWidget);
  });

  group('the composer — F2', () {
    testWidgets('sends a prompt and clears itself', (WidgetTester tester) async {
      await pumpSession(tester);

      await send(tester, 'do the thing');

      expect(sessions.commands.single.$1, 'session.prompt');
      expect(tester.widget<TextField>(box()).controller?.text, isEmpty);
    });

    testWidgets('S-31 · a prompt the socket refused is kept, and the screen says so', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      sessions.accepts = false;

      await send(tester, 'do not lose this');

      expect(find.text(l10n.sessionPromptRefused), findsOneWidget);
      expect(tester.widget<TextField>(box()).controller?.text, 'do not lose this');
    });

    testWidgets('S-28 · a turn running with the box empty: stop, once', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      await emit(tester, sessionStatusChanged(status: 'running', seq: 1));

      await tester.tap(find.byTooltip(l10n.composerStop));
      await tester.pump();
      await tester.tap(find.byTooltip(l10n.composerStop));
      await tester.pump();

      expect(sessions.commands.single.$1, 'session.interrupt');
    });

    testWidgets('S-29 · a turn running with text: send queues, and the queue shows it', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      await emit(tester, sessionStatusChanged(status: 'running', seq: 1));

      await send(tester, 'and the tests?', tooltip: l10n.composerQueue);
      await emit(tester, promptQueued(queueId: 'q-1', seq: 2, preview: 'and the tests?'));

      expect(sessions.commands.single.$1, 'session.prompt');
      expect(find.textContaining('and the tests?'), findsOneWidget);

      await tester.tap(find.byTooltip(l10n.queueCancel('1')));
      await tester.pumpAndSettle();
      expect(sessions.commands.last.$1, 'session.cancelQueuedPrompt');

      // S-40: it had already started — the refusal, translated, and the row leaves.
      sessions.emit(
        const CommandRefused(
          commandId: 'command-2',
          failure: ServerFailure(
            code: 'CONFLICT',
            messageKey: 'session.error.queuedPromptStarted',
            traceId: 't',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(l10n.sessionErrorQueuedPromptStarted), findsOneWidget);
      expect(find.textContaining('and the tests?'), findsNothing);

      await tester.tap(find.byTooltip(l10n.composerRefusalClose));
      await tester.pumpAndSettle();
      expect(find.text(l10n.sessionErrorQueuedPromptStarted), findsNothing);
    });

    testWidgets('S-42 · a prompt refused mid-undo: the strip, and the text kept to send again', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);

      await send(tester, 'go on');
      sessions.emit(
        const CommandRefused(
          commandId: 'command-1',
          failure: ServerFailure(
            code: 'SESSION_LOCKED',
            messageKey: 'session.error.locked',
            traceId: 't',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorLocked), findsOneWidget);
    });

    testWidgets('S-27 · the bar names the model of the session, and switching it is said', (
      WidgetTester tester,
    ) async {
      phone(tester, width: 900, height: 800);
      await pumpSession(tester);
      await emit(
        tester,
        sessionStarted(sessionId: 'session-1', model: 'sonnet', permissionMode: 'default'),
      );

      expect(find.text('Sonnet'), findsOneWidget);
      expect(find.text(l10n.modeDefault), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.tap(find.text('Sonnet'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Opus'));
      await tester.pumpAndSettle();

      expect(sessions.commands.single.$1, 'session.setModel');
      expect(find.text(l10n.composerChoicePending), findsWidgets);

      // S-32: refused — the chip goes back, and the reason is said.
      sessions.emit(
        const CommandRefused(
          commandId: 'command-1',
          failure: ServerFailure(
            code: 'INVALID_INPUT',
            messageKey: 'common.error.invalidInput',
            traceId: 't',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sonnet'), findsOneWidget);
      expect(find.text(l10n.commonErrorInvalidInput), findsOneWidget);
    });

    testWidgets('S-34 · a model that takes an effort shows it read-only, as the session started', (
      WidgetTester tester,
    ) async {
      phone(tester, width: 900, height: 800);
      await pumpSession(tester);
      await emit(tester, sessionStarted(sessionId: 'session-1', model: 'opus'));

      expect(find.text(l10n.effortUnknown), findsOneWidget);
      await tester.tap(find.text(l10n.effortUnknown));
      await tester.pumpAndSettle();
      expect(find.text(l10n.effortReadOnly), findsOneWidget);
    });

    testWidgets('S-44 · Compact sends /compact, once, and the compaction is a line', (
      WidgetTester tester,
    ) async {
      phone(tester, width: 900, height: 800);
      await pumpSession(tester);

      await tester.tap(find.byType(CircularProgressIndicator));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.contextCompact));
      await tester.pumpAndSettle();

      expect(sessions.commands.single.$2['text'], '/compact');

      await emit(tester, sessionCompacted(seq: 2));
      expect(find.text(l10n.sessionCompactedManual), findsOneWidget);
    });

    testWidgets('S-30 · on a 360 phone the model, the effort and the context go to ⋯', (
      WidgetTester tester,
    ) async {
      phone(tester);
      await pumpSession(tester);

      expect(find.byTooltip(l10n.composerMore), findsOneWidget);
      expect(find.byTooltip(l10n.composerSlash), findsOneWidget);
      expect(find.text(l10n.modeDefault), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('a session that ended — B-07, 09 · D-05', () {
    testWidgets('S-17 · says why, keeps the box, and sending resumes it in a new session', (
      WidgetTester tester,
    ) async {
      await pumpRoutedSession(tester);
      await emit(
        tester,
        sessionStarted(sessionId: 'session-1', claudeSessionId: 'conv-1', workspacePath: '/w'),
      );
      await emit(tester, sessionClosed(seq: 2, reason: 'idleTimeout'));

      expect(
        find.text('${l10n.sessionClosedIdleTimeout} ${l10n.sessionEndedResumes}'),
        findsOneWidget,
      );
      expect(find.byTooltip(l10n.composerStop), findsNothing);
      expect(tester.widget<TextField>(box()).enabled, isTrue);

      await send(tester, 'pick it up again', tooltip: l10n.sessionEndedResumeAndSend);

      expect(sessions.commands.single.$2, <String, Object?>{
        'workspacePath': '/w',
        'resumeSessionId': 'conv-1',
      });
      // The text stays while the resume is on its way.
      expect(tester.widget<TextField>(box()).controller?.text, 'pick it up again');

      sessions.emit(
        arrivalOf(
          sessionStarted(
            sessionId: 'session-2',
            seq: 1,
            claudeSessionId: 'conv-1',
            resumedFrom: 'conv-1',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(sessions.commands.last.$2, <String, Object?>{
        'sessionId': 'session-2',
        'text': 'pick it up again',
      });
      expect(sessions.followed.last, 'session-2');
    });

    testWidgets(
      'S-18 · resuming with the ceiling full says why above the box, and keeps the text',
      (WidgetTester tester) async {
        await pumpRoutedSession(tester);
        await emit(tester, sessionStarted(sessionId: 'session-1', claudeSessionId: 'conv-1'));
        await emit(tester, sessionClosed(seq: 2));

        await send(tester, 'try again', tooltip: l10n.sessionEndedResumeAndSend);
        sessions.emit(const CommandRefused(commandId: 'command-1', failure: limitReached));
        await tester.pumpAndSettle();

        expect(find.text(l10n.sessionErrorLimitReached('2')), findsOneWidget);
        expect(tester.widget<TextField>(box()).controller?.text, 'try again');

        await tester.tap(find.byTooltip(l10n.composerRefusalClose));
        await tester.pumpAndSettle();
        expect(find.text(l10n.sessionErrorLimitReached('2')), findsNothing);
      },
    );

    testWidgets('a session whose conversation nobody named cannot be resumed from here', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      await emit(tester, sessionClosed(seq: 2));

      expect(tester.widget<TextField>(box()).enabled, isFalse);
    });
  });

  group('what was said before this screen could see it', () {
    testWidgets('S-14 · a gap clears the screen and shows the transcript instead', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      await emit(tester, messageDelta(messageId: 'm1', delta: 'half a sent', seq: 40));

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pumpAndSettle();

      expect(find.text('half a sent'), findsNothing);
      expect(find.text('what broke?'), findsOneWidget);
      expect(find.text('the build'), findsOneWidget);
      expect(history.reads.single, ('conv-1', null));
    });

    testWidgets('S-15 · the replay arriving with the transcript never shows a message twice', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.gate = Completer<void>();

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pump();
      sessions
        ..emit(arrivalOf(messageCompleted(messageId: 'h2', text: 'the build', seq: 9)))
        ..emit(arrivalOf(messageCompleted(messageId: 'n1', text: 'and now?', seq: 10)));
      await tester.pump();
      history.gate!.complete();
      await tester.pumpAndSettle();

      expect(find.text('the build'), findsOneWidget);
      expect(find.text('what broke?'), findsOneWidget);
      expect(find.text('and now?'), findsOneWidget);
    });

    testWidgets('B-11 · a session that continues a conversation shows its history first', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);

      await emit(
        tester,
        sessionStarted(sessionId: 'session-1', claudeSessionId: 'conv-1', resumedFrom: 'conv-1'),
      );
      await emit(tester, messageCompleted(messageId: 'n1', text: 'continuing', seq: 2));

      expect(
        tester.getTopLeft(find.text('the build')).dy,
        lessThan(tester.getTopLeft(find.text('continuing')).dy),
      );
    });

    testWidgets('says it is reading, in a line, above whatever is on screen', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.gate = Completer<void>();

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      sessions.emit(arrivalOf(messageDelta(messageId: 'n1', delta: 'live', seq: 3)));
      await tester.pump();
      await tester.pump();

      expect(find.text(l10n.sessionHistoryLoading), findsOneWidget);
      expect(find.text('live'), findsOneWidget);

      history.gate!.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('S-17 · a transcript that could not be read says why, and reads it again', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.failure = const ServerFailure(
        code: 'CLAUDE_UNAVAILABLE',
        messageKey: 'transcript.error.claudeUnavailable',
        traceId: 'trace-8',
      );

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      sessions.emit(arrivalOf(messageDelta(messageId: 'n1', delta: 'still live', seq: 3)));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsOneWidget);
      expect(find.text('still live'), findsOneWidget);

      history.failure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsNothing);
      expect(find.text('the build'), findsOneWidget);
    });

    testWidgets('a failed transcript with nothing live leaves no empty state beside it', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.failure = const ServerFailure(
        code: 'CLAUDE_TIMEOUT',
        messageKey: 'transcript.error.claudeTimeout',
        traceId: 'trace-8',
      );

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorClaudeTimeout), findsOneWidget);
      expect(find.text(l10n.sessionEmptyTitle), findsNothing);
    });
  });

  testWidgets('a first prompt that could not leave waits in this session’s box', (
    WidgetTester tester,
  ) async {
    fakes();
    sessions.accepts = false;
    final ProviderContainer container = ProviderContainer(
      overrides: overrides(ConnectionStatus.ready),
    );
    addTearDown(container.dispose);
    container.read(firstPromptsProvider.notifier).send('session-1', 'meant to be sent');

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: SessionPage(sessionId: 'session-1'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.widget<TextField>(box()).controller?.text, 'meant to be sent');
  });

  testWidgets('S-36 · leaving the screen detaches', (WidgetTester tester) async {
    await pumpSession(tester);
    expect(sessions.unfollows, 0);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();

    expect(sessions.unfollows, greaterThan(0));
  });

  testWidgets('S-119 · the screen meets the tap-target and label guidelines', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pumpSession(tester);
    await emit(tester, messageCompleted(messageId: 'm1', text: 'hello', seq: 1));

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });
}
