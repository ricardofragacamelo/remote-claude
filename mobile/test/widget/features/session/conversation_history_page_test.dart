/// One conversation of the history: the four states, the earlier pages, the cache — and resuming.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_history_repository.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/pump_app.dart';

const String workspace = '/home/someone/project';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'transcript.error.claudeUnavailable',
  traceId: 'trace-17',
);

HistoryPage latest({bool beganElsewhere = false, String? nextCursor}) => HistoryPage(
  conversationId: 'conv-1',
  workspacePath: workspace,
  beganElsewhere: beganElsewhere,
  summary: 'Fix the build',
  events: historyOf(<String>[
    messageCompleted(messageId: 'm3', text: 'what broke?', role: 'user', seq: 1),
    messageCompleted(messageId: 'm4', text: 'the build', seq: 2),
  ]),
  nextCursor: nextCursor,
);

void main() {
  late AppLocalizations l10n;
  late FakeHistoryRepository history;
  late FakeSessionRepository sessions;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  /// Mounts the conversation, with a session route that is a marker, and a way back out.
  Future<void> pumpHistory(
    WidgetTester tester, {
    HistoryPage? page,
    Object? failure,
    bool waiting = false,
    ConnectionStatus connection = ConnectionStatus.ready,
  }) async {
    history = FakeHistoryRepository()
      ..answer(page ?? latest())
      ..failure = failure;
    if (waiting) {
      history.gate = Completer<void>();
    }
    sessions = FakeSessionRepository();
    addTearDown(sessions.dispose);

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState state) =>
              const Scaffold(body: Text('elsewhere')),
        ),
        GoRoute(
          path: '$historyRoute/:conversationId',
          builder: (BuildContext context, GoRouterState state) =>
              ConversationHistoryPage(conversationId: state.pathParameters['conversationId']!),
        ),
        GoRoute(
          path: '/sessions/:sessionId',
          builder: (BuildContext context, GoRouterState state) =>
              Scaffold(body: Text('continued in ${state.pathParameters['sessionId']}')),
        ),
      ],
      initialLocation: conversationRouteFor('conv-1', workspace),
      overrides: <Override>[
        historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
        sessionRepositoryProvider.overrideWithValue(sessions),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
      ],
      pumpOnce: !waiting,
    );

    if (!waiting) {
      await tester.pumpAndSettle();
    }
  }

  /// Leaves the screen and lets the cache window run out, so no timer outlives the test.
  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(historyKeptFor + const Duration(seconds: 1));
  }

  group('the four states', () {
    testWidgets('says it is loading before the store answers', (WidgetTester tester) async {
      await pumpHistory(tester, waiting: true);
      await tester.pump();

      expect(find.text(l10n.historyConversationLoading), findsOneWidget);
      // Resuming needs to know where the conversation ran, which nothing has said yet.
      expect(find.text(l10n.historyResumeAction), findsNothing);

      history.gate!.complete();
      await tester.pumpAndSettle();
      await leave(tester);
    });

    testWidgets('S-17 · a failure is said in words, and the retry reads it again', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester, failure: unavailable);

      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsOneWidget);
      expect(find.textContaining('trace-17'), findsOneWidget);

      history.failure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text('the build'), findsOneWidget);
      await leave(tester);
    });

    testWidgets('a conversation with nothing in it says what to do, and can still be resumed', (
      WidgetTester tester,
    ) async {
      await pumpHistory(
        tester,
        page: const HistoryPage(conversationId: 'conv-1', workspacePath: workspace),
      );

      expect(find.text(l10n.historyConversationEmptyTitle), findsOneWidget);
      expect(find.text(l10n.historyConversationEmptyBody), findsOneWidget);
      expect(find.text(l10n.historyResumeAction), findsOneWidget);
      await leave(tester);
    });

    testWidgets('shows what was said, with the same view the live session uses', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);

      expect(find.text('Fix the build'), findsOneWidget);
      expect(find.byType(ConversationView), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('what broke?')).dy,
        lessThan(tester.getTopLeft(find.text('the build')).dy),
      );
      await leave(tester);
    });
  });

  group('earlier messages', () {
    testWidgets('are put in front of what is on screen, until there are none', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester, page: latest(nextCursor: 'm3'));
      history.answer(
        HistoryPage(
          conversationId: 'conv-1',
          workspacePath: workspace,
          events: historyOf(<String>[messageCompleted(messageId: 'm1', text: 'first', seq: 1)]),
        ),
        cursor: 'm3',
      );

      await tester.tap(find.text(l10n.historyLoadEarlier));
      await tester.pumpAndSettle();

      expect(history.reads.last, ('conv-1', 'm3'));
      expect(
        tester.getTopLeft(find.text('first')).dy,
        lessThan(tester.getTopLeft(find.text('what broke?')).dy),
      );
      expect(find.text(l10n.historyLoadEarlier), findsNothing);
      await leave(tester);
    });

    testWidgets('that failed keep what is on screen, with the reason beside the button', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester, page: latest(nextCursor: 'm3'));
      history.failure = unavailable;

      await tester.tap(find.text(l10n.historyLoadEarlier));
      await tester.pumpAndSettle();

      expect(find.text('the build'), findsOneWidget);
      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsOneWidget);
      expect(find.text(l10n.historyLoadEarlier), findsOneWidget);
      await leave(tester);
    });

    testWidgets('say they are loading, and take no second tap', (WidgetTester tester) async {
      await pumpHistory(tester, page: latest(nextCursor: 'm3'));
      history.gate = Completer<void>();

      await tester.tap(find.text(l10n.historyLoadEarlier));
      await tester.pump();

      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, l10n.historyLoadingMore))
            .onPressed,
        isNull,
      );

      history.gate!.complete();
      await tester.pumpAndSettle();
      await leave(tester);
    });
  });

  testWidgets('S-16 · opening the same conversation again reads it once', (
    WidgetTester tester,
  ) async {
    await pumpHistory(tester);
    expect(history.reads, hasLength(1));

    final GoRouter router = GoRouter.of(tester.element(find.byType(ConversationHistoryPage)));
    router.go('/');
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 5));
    router.go(conversationRouteFor('conv-1', workspace));
    await tester.pumpAndSettle();

    expect(find.text('the build'), findsOneWidget);
    expect(history.reads, hasLength(1));
    await leave(tester);
  });

  group('resuming', () {
    testWidgets('B-10 · continues the conversation in the folder it ran in', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);

      await tester.tap(find.text(l10n.historyResumeAction));
      await tester.pump();

      expect(sessions.commands.single.$1, 'session.start');
      expect(
        sessions.commands.single.$2,
        equals(<String, Object?>{'workspacePath': workspace, 'resumeSessionId': 'conv-1'}),
      );
      expect(find.text(l10n.historyResumePending), findsOneWidget);
      await leave(tester);
    });

    testWidgets('moves to the session that continues it, once it answers', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);

      await tester.tap(find.text(l10n.historyResumeAction));
      await tester.pump();
      sessions.emit(
        arrivalOf(
          sessionStarted(sessionId: 'session-5', claudeSessionId: 'conv-1', resumedFrom: 'conv-1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('continued in session-5'), findsOneWidget);
      await leave(tester);
    });

    testWidgets('S-24 · a conversation already live is joined, and the screen moves to it', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);

      await tester.tap(find.text(l10n.historyResumeAction));
      await tester.pump();
      sessions.emit(const SessionJoined(sessionId: 'session-2', claudeSessionId: 'conv-1'));
      await tester.pumpAndSettle();

      expect(find.text('continued in session-2'), findsOneWidget);
      await leave(tester);
    });

    testWidgets('S-26 · a refusal is said in words, and the button is back', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);

      await tester.tap(find.text(l10n.historyResumeAction));
      await tester.pump();
      sessions.emit(
        const CommandRefused(
          commandId: 'command-1',
          failure: ServerFailure(
            code: 'SESSION_LIMIT_REACHED',
            messageKey: 'session.error.limitReached',
            traceId: 't',
            params: <String, String>{'limit': '4'},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionErrorLimitReached('4')), findsOneWidget);
      expect(find.text(l10n.historyResumeAction), findsOneWidget);
      await leave(tester);
    });

    testWidgets('a socket that is not ready disables it, and says why', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester, connection: ConnectionStatus.reconnecting);

      expect(find.text(l10n.historyResumeOffline), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, l10n.historyResumeAction))
            .onPressed,
        isNull,
      );
      await leave(tester);
    });

    testWidgets('a command that could not leave says so instead of waiting', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);
      sessions.accepts = false;

      await tester.tap(find.text(l10n.historyResumeAction));
      await tester.pump();

      expect(find.text(l10n.historyResumeNotSent), findsOneWidget);
      await leave(tester);
    });

    testWidgets('D-04 · a conversation begun elsewhere says, before anything, what resuming does', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester, page: latest(beganElsewhere: true));

      expect(find.text(l10n.historyExternalNote), findsOneWidget);
      await leave(tester);
    });

    testWidgets('a conversation of ours needs no such note', (WidgetTester tester) async {
      await pumpHistory(tester);

      expect(find.text(l10n.historyExternalNote), findsNothing);
      await leave(tester);
    });
  });

  testWidgets('meets the tap-target and labelling guidelines', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pumpHistory(tester, page: latest(nextCursor: 'm3', beganElsewhere: true));

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
    await leave(tester);
  });
}
