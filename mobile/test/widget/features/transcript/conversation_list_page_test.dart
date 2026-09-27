/// The conversations of one workspace: the four states, the origin of each row, and the next page.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/transcript.dart';
import 'package:remote_claude/features/transcript/transcript_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/transcripts.dart';
import '../../../support/fakes/fake_transcript_repository.dart';
import '../../../support/pump_app.dart';

const String workspace = '/home/someone/project';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'transcript.error.claudeUnavailable',
  traceId: 'trace-31',
);

void main() {
  late AppLocalizations l10n;
  late FakeTranscriptRepository transcripts;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  /// Mounts the list of [workspace], with a conversation route that is a marker.
  Future<void> pumpList(
    WidgetTester tester, {
    ConversationList? first,
    ConversationList? second,
    Object? failure,
    bool waiting = false,
  }) async {
    transcripts = FakeTranscriptRepository()
      ..answer(
        workspace,
        first ??
            ConversationList(
              conversations: <ConversationSummary>[
                aConversation(),
                aConversation(
                  conversationId: 'conv-2',
                  summary: 'Began in the terminal',
                  origin: ConversationOrigin.external,
                  gitBranch: null,
                ),
              ],
            ),
      )
      ..failure = failure;
    if (second != null) {
      transcripts.answer(workspace, second, cursor: 'page-2');
    }
    if (waiting) {
      transcripts.gate = Completer<void>();
    }

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: historyRoute,
          builder: (BuildContext context, GoRouterState state) => ConversationListPage(
            workspacePath: state.uri.queryParameters[workspacePathParameter]!,
          ),
          routes: <RouteBase>[
            GoRoute(
              path: ':conversationId',
              builder: (BuildContext context, GoRouterState state) => Scaffold(
                body: Text(
                  'reading ${state.pathParameters['conversationId']} in '
                  '${state.uri.queryParameters[workspacePathParameter]}',
                ),
              ),
            ),
          ],
        ),
      ],
      initialLocation: historyRouteFor(workspace),
      overrides: <Override>[
        transcriptRepositoryProvider.overrideWithValue(transcripts as TranscriptRepository),
      ],
      pumpOnce: !waiting,
    );

    if (!waiting) {
      await tester.pumpAndSettle();
    }
  }

  group('the four states', () {
    testWidgets('says it is loading before the store answers', (WidgetTester tester) async {
      await pumpList(tester, waiting: true);
      await tester.pump();

      expect(find.text(l10n.historyListLoading), findsOneWidget);

      transcripts.gate!.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('S-17 · a failure is said in words, with its trace and a way out', (
      WidgetTester tester,
    ) async {
      await pumpList(tester, failure: unavailable);

      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsOneWidget);
      expect(find.textContaining('trace-31'), findsOneWidget);

      transcripts.failure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text('Fix the build'), findsOneWidget);
    });

    testWidgets('S-13 · a folder with nothing said in it says what to do about it', (
      WidgetTester tester,
    ) async {
      await pumpList(tester, first: const ConversationList());

      expect(find.text(l10n.historyListEmptyTitle), findsOneWidget);
      expect(find.text(l10n.historyListEmptyBody), findsOneWidget);
    });

    testWidgets('lists the conversations of the folder, newest first', (WidgetTester tester) async {
      await pumpList(tester);

      expect(find.text(workspace), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Fix the build')).dy,
        lessThan(tester.getTopLeft(find.text('Began in the terminal')).dy),
      );
      expect(find.text(l10n.historyBranch('main')), findsOneWidget);
      expect(find.textContaining('Last active'), findsNWidgets(2));
      // The list asked about this folder and no other (S-12).
      expect(transcripts.reads.single, (workspace, null));
    });
  });

  testWidgets('S-11 · every row says where the conversation began, never naming the editor', (
    WidgetTester tester,
  ) async {
    await pumpList(tester);

    expect(find.text(l10n.historyOriginOurs), findsOneWidget);
    expect(find.text(l10n.historyOriginExternal), findsOneWidget);
    expect(find.textContaining('VSCode'), findsNothing);
    expect(find.textContaining('VS Code'), findsNothing);
  });

  testWidgets('a conversation the store gives no summary is called untitled, not blank', (
    WidgetTester tester,
  ) async {
    await pumpList(
      tester,
      first: ConversationList(conversations: <ConversationSummary>[aConversation(summary: '')]),
    );

    expect(find.text(l10n.historyUntitled), findsOneWidget);
  });

  testWidgets('a tap opens that conversation, in the folder it ran in', (
    WidgetTester tester,
  ) async {
    await pumpList(tester);

    await tester.tap(find.text('Began in the terminal'));
    await tester.pumpAndSettle();

    expect(find.text('reading conv-2 in $workspace'), findsOneWidget);
  });

  group('the next page', () {
    final ConversationList first = ConversationList(
      conversations: <ConversationSummary>[aConversation()],
      nextCursor: 'page-2',
    );
    final ConversationList second = ConversationList(
      conversations: <ConversationSummary>[aConversation(conversationId: 'c-9', summary: 'Older')],
    );

    testWidgets('loads after what is on screen, and the button goes at the end', (
      WidgetTester tester,
    ) async {
      await pumpList(tester, first: first, second: second);

      await tester.tap(find.text(l10n.historyLoadMore));
      await tester.pumpAndSettle();

      expect(find.text('Fix the build'), findsOneWidget);
      expect(find.text('Older'), findsOneWidget);
      expect(find.text(l10n.historyLoadMore), findsNothing);
    });

    testWidgets('says it is loading, and takes no second tap', (WidgetTester tester) async {
      await pumpList(tester, first: first, second: second);
      transcripts.gate = Completer<void>();

      await tester.tap(find.text(l10n.historyLoadMore));
      await tester.pump();

      expect(find.text(l10n.historyLoadingMore), findsOneWidget);
      expect(
        tester
            .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, l10n.historyLoadingMore))
            .onPressed,
        isNull,
      );

      transcripts.gate!.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('a page that failed keeps the list, with the reason beside the button', (
      WidgetTester tester,
    ) async {
      await pumpList(tester, first: first, second: second);
      transcripts.failure = unavailable;

      await tester.tap(find.text(l10n.historyLoadMore));
      await tester.pumpAndSettle();

      expect(find.text('Fix the build'), findsOneWidget);
      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsOneWidget);
      expect(find.text(l10n.historyLoadMore), findsOneWidget);
    });
  });

  testWidgets('meets the tap-target and labelling guidelines', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pumpList(tester);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });
}
