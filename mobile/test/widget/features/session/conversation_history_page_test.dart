/// One conversation of the history: the four states, the earlier pages, the cache, resuming — and
/// following it while another client writes it (plan 22, B-26).
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
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_history_repository.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/fakes/fake_transcript_content_repository.dart';
import '../../../support/fakes/fake_transcript_follow_repository.dart';
import '../../../support/pump_app.dart';

const String workspace = '/home/someone/project';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'transcript.error.claudeUnavailable',
  traceId: 'trace-17',
);

HistoryPage latest({
  bool beganElsewhere = false,
  String? nextCursor,
  ConversationActivity? activity,
  int answers = 0,
}) => HistoryPage(
  conversationId: 'conv-1',
  workspacePath: workspace,
  beganElsewhere: beganElsewhere,
  summary: 'Fix the build',
  events: historyOf(<String>[
    messageCompleted(messageId: 'm3', text: 'what broke?', role: 'user', seq: 1),
    messageCompleted(messageId: 'm4', text: 'the build', seq: 2),
    for (int index = 0; index < answers; index += 1)
      messageCompleted(messageId: 'a$index', text: 'answer number $index', seq: 3 + index),
  ]),
  nextCursor: nextCursor,
  activity: activity,
  lastMessageId: 'u-41',
);

const Failure followLimit = ServerFailure(
  code: 'TRANSCRIPT_FOLLOW_LIMIT',
  messageKey: 'transcript.error.followLimit',
  traceId: 'trace-22',
  params: <String, String>{'limit': '8', 'scope': 'connection'},
);

/// What the followed conversation gained, in the frame [seq] of the subscription `t-1`.
FollowAppended appendedOf(
  int seq, {
  List<String> lines = const <String>[],
  ConversationActivity? activity = ConversationActivity.activeElsewhere,
  bool working = false,
}) => FollowAppended(
  followId: 't-1',
  conversationId: 'conv-1',
  seq: seq,
  events: historyOf(lines),
  lastMessageId: 'u-${50 + seq}',
  activity: activity,
  working: working,
);

void main() {
  late AppLocalizations l10n;
  late FakeHistoryRepository history;
  late FakeSessionRepository sessions;
  late FakeTranscriptFollowRepository follows;
  late FakeTranscriptContentRepository content;

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
    follows = FakeTranscriptFollowRepository();
    addTearDown(follows.dispose);
    content = FakeTranscriptContentRepository();

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
        transcriptFollowRepositoryProvider.overrideWithValue(follows as TranscriptFollowRepository),
        transcriptContentRepositoryProvider.overrideWithValue(content),
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

  group('following — plan 22, B-26', () {
    /// The page open on [page], followed, and the follow answered as `t-1`.
    Future<void> pumpFollowed(WidgetTester tester, {HistoryPage? page}) async {
      await pumpHistory(tester, page: page);
      expect(follows.follows.single, ('follow-1', 'conv-1', 'u-41'));
      follows.ack('t-1', activity: page?.activity);
      await tester.pumpAndSettle();
    }

    Future<void> arrive(WidgetTester tester, FollowUpdate update) async {
      follows.emit(update);
      await tester.pumpAndSettle();
    }

    testWidgets('what the other client writes appears without reading the page again', (
      WidgetTester tester,
    ) async {
      await pumpFollowed(tester);

      await arrive(
        tester,
        appendedOf(
          1,
          lines: <String>[messageCompleted(messageId: 'm5', text: 'fixed it', seq: 3)],
        ),
      );

      expect(find.text('fixed it'), findsOneWidget);
      expect(history.reads, hasLength(1));
      await leave(tester);
    });

    testWidgets('S-96 · the notice "active in another client" comes and goes with the activity', (
      WidgetTester tester,
    ) async {
      await pumpFollowed(tester, page: latest(activity: ConversationActivity.activeElsewhere));

      expect(find.text(l10n.historyActiveElsewhereNote), findsOneWidget);

      await arrive(tester, appendedOf(1, activity: ConversationActivity.idle));
      expect(find.text(l10n.historyActiveElsewhereNote), findsNothing);

      await arrive(tester, appendedOf(2));
      expect(find.text(l10n.historyActiveElsewhereNote), findsOneWidget);
      await leave(tester);
    });

    testWidgets(
      'S-97 · continuing an active conversation asks first, and cancelling forks nothing',
      (WidgetTester tester) async {
        await pumpFollowed(tester, page: latest(activity: ConversationActivity.activeElsewhere));

        await tester.tap(find.text(l10n.historyResumeAction));
        await tester.pumpAndSettle();

        expect(find.text(l10n.sessionForkTitle), findsOneWidget);
        expect(find.text(l10n.sessionForkDescription), findsOneWidget);

        await tester.tap(find.text(l10n.sessionForkCancel));
        await tester.pumpAndSettle();

        expect(find.text(l10n.sessionForkTitle), findsNothing);
        expect(sessions.commands, isEmpty);

        await tester.tap(find.text(l10n.historyResumeAction));
        await tester.pumpAndSettle();
        await tester.tap(find.text(l10n.sessionForkConfirm));
        await tester.pump();

        expect(sessions.commands.single.$1, 'session.start');
        expect(sessions.commands.single.$2['resumeSessionId'], 'conv-1');
        await leave(tester);
      },
    );

    testWidgets('S-97 · one that nothing else is writing continues at once', (
      WidgetTester tester,
    ) async {
      await pumpFollowed(tester, page: latest(activity: ConversationActivity.activeElsewhere));
      await arrive(tester, appendedOf(1, activity: ConversationActivity.idle));

      await tester.tap(find.text(l10n.historyResumeAction));
      await tester.pump();

      expect(find.text(l10n.sessionForkTitle), findsNothing);
      expect(sessions.commands.single.$1, 'session.start');
      await leave(tester);
    });

    testWidgets(
      'S-98 · "Working in another client…" comes with working, with its help, announced',
      (WidgetTester tester) async {
        final SemanticsHandle semantics = tester.ensureSemantics();
        await pumpFollowed(tester, page: latest(activity: ConversationActivity.activeElsewhere));
        expect(find.text(l10n.historyFollowWorking), findsNothing);

        await arrive(tester, appendedOf(1, working: true));

        expect(find.text(l10n.historyFollowWorking), findsOneWidget);
        expect(
          tester.getSemantics(find.text(l10n.historyFollowWorking)),
          isSemantics(
            label: l10n.historyFollowWorking,
            hint: l10n.commonActionShowAll,
            isLiveRegion: true,
            isButton: true,
            hasTapAction: true,
          ),
        );

        await tester.tap(find.text(l10n.historyFollowWorking));
        await tester.pumpAndSettle();
        expect(find.text(l10n.historyFollowWorkingHelp), findsOneWidget);
        await tester.tapAt(const Offset(10, 10));
        await tester.pumpAndSettle();

        await arrive(tester, appendedOf(2));
        expect(find.text(l10n.historyFollowWorking), findsNothing);
        semantics.dispose();
        await leave(tester);
      },
    );

    testWidgets('S-99 · scrolled up, "N new" says what arrived and takes the reader to it', (
      WidgetTester tester,
    ) async {
      await pumpFollowed(tester, page: latest(answers: 40));
      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();

      await arrive(
        tester,
        appendedOf(
          1,
          lines: <String>[
            messageCompleted(messageId: 'n1', text: 'news', seq: 50),
            // A reply that only runs a tool is no message for whoever reads (S-84).
            toolStarted(toolUseId: 'nt', seq: 51),
            toolCompleted(toolUseId: 'nt', seq: 52),
            messageCompleted(messageId: 'n2', text: 'more news', seq: 53),
          ],
        ),
      );

      expect(find.text(l10n.historyFollowNewer(2)), findsOneWidget);
      expect(find.text('more news').hitTestable(), findsNothing);

      await tester.tap(find.text(l10n.historyFollowNewer(2)));
      await tester.pumpAndSettle();

      expect(find.text('more news').hitTestable(), findsOneWidget);
      expect(find.text(l10n.historyFollowNewer(2)), findsNothing);

      // At the end now, what comes next is followed.
      await arrive(
        tester,
        appendedOf(
          2,
          lines: <String>[messageCompleted(messageId: 'n3', text: 'latest', seq: 52)],
        ),
      );
      expect(find.text('latest').hitTestable(), findsOneWidget);
      await leave(tester);
    });

    testWidgets('S-100 · the ceiling is said in words, and the conversation stays readable', (
      WidgetTester tester,
    ) async {
      await pumpHistory(tester);

      follows.emit(FollowRefused(commandId: follows.lastCommand, failure: followLimit));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorFollowLimit('8')), findsOneWidget);
      expect(find.text('the build'), findsOneWidget);
      expect(find.text(l10n.historyResumeAction), findsOneWidget);
      await leave(tester);
    });

    testWidgets('S-93 · the background lets the conversation go, and the return follows it again', (
      WidgetTester tester,
    ) async {
      await pumpFollowed(tester);
      await arrive(tester, appendedOf(1));

      // The way a phone goes to the background, and comes back: one step at a time.
      for (final AppLifecycleState step in <AppLifecycleState>[
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(step);
      }
      await tester.pump();
      expect(follows.unfollows, <String>['t-1']);

      for (final AppLifecycleState step in <AppLifecycleState>[
        AppLifecycleState.hidden,
        AppLifecycleState.inactive,
        AppLifecycleState.resumed,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(step);
      }
      await tester.pump();
      expect(follows.follows.last, ('follow-2', 'conv-1', 'u-51'));
      await leave(tester);
    });

    testWidgets('S-95 · leaving the page lets the subscription go', (WidgetTester tester) async {
      await pumpFollowed(tester);

      GoRouter.of(tester.element(find.byType(ConversationHistoryPage))).go('/');
      await tester.pumpAndSettle();

      expect(follows.unfollows, <String>['t-1']);
      await leave(tester);
    });
  });

  testWidgets('B-32 · a tool of the conversation opens its whole output from this conversation', (
    WidgetTester tester,
  ) async {
    await pumpHistory(
      tester,
      page: HistoryPage(
        conversationId: 'conv-1',
        workspacePath: workspace,
        events: historyOf(<String>[
          toolStarted(toolUseId: 't1', seq: 1),
          toolCompleted(toolUseId: 't1', seq: 2, summary: 'a.txt'),
        ]),
      ),
    );

    await tester.tap(find.text('Bash'));
    await tester.pumpAndSettle();

    expect(content.toolReads, <(String, String)>[('conv-1', 't1')]);
    await leave(tester);
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
