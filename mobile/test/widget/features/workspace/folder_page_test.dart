/// One folder: new session, open sessions, history — plan 10, B-42 and B-43.
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
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/providers/folder_tree_controller.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/transcript.dart';
import 'package:remote_claude/features/transcript/transcript_providers.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/files.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/fakes/fake_transcript_repository.dart';
import '../../../support/fakes/recording_writer.dart';
import '../../../support/pump_app.dart';

const String folder = '/w/a';

/// The live sessions of the folder, read as many times as asked — or a failure.
class CountingLiveSessions implements LiveSessionRepository {
  CountingLiveSessions(this.sessions);

  List<LiveSessionSummary> sessions;
  Failure? failure;
  int reads = 0;

  @override
  Future<List<LiveSessionSummary>> list(String workspacePath) async {
    reads += 1;
    final Failure? refusal = failure;
    if (refusal != null) {
      throw refusal;
    }
    return sessions;
  }
}

LiveSessionSummary aLive({
  String id = 's-1',
  String path = folder,
  SessionOrigin from = SessionOrigin.web,
  int pending = 0,
  SessionStatus? status = SessionStatus.running,
}) => LiveSessionSummary(
  sessionId: id,
  workspacePath: path,
  status: status,
  model: 'opus',
  permissionMode: 'default',
  startedAt: DateTime.utc(2026, 10, 4, 9),
  openedFrom: from,
  pendingPermissions: pending,
);

ConversationSummary aConversation(String id, {String summary = 'fix the build'}) =>
    ConversationSummary(
      conversationId: id,
      origin: ConversationOrigin.ours,
      cwd: folder,
      lastModified: DateTime.utc(2026, 10, 3),
      summary: summary,
    );

void main() {
  late AppLocalizations l10n;
  late CountingLiveSessions live;
  late FakeTranscriptRepository history;
  final FakeFilesRepository files = FakeFilesRepository()
    ..levels[''] = <FileEntry>[aFolder('docs'), aFile('README.md')]
    ..levels['docs'] = <FileEntry>[aFile('docs/a.md')];

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  GoRoute marker(String path, String said) => GoRoute(
    path: path,
    builder: (BuildContext context, GoRouterState state) =>
        Scaffold(body: Text('$said ${state.pathParameters.values.join()}${state.uri.query}')),
  );

  Future<void> pumpFolder(
    WidgetTester tester, {
    List<LiveSessionSummary>? sessions,
    List<ConversationSummary> conversations = const <ConversationSummary>[],
    Object? historyFailure,
    ConnectionStatus connection = ConnectionStatus.ready,
  }) async {
    live = CountingLiveSessions(sessions ?? <LiveSessionSummary>[aLive()]);
    history = FakeTranscriptRepository()
      ..answer(folder, ConversationList(conversations: conversations))
      ..failure = historyFailure;

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: folderRoute,
          builder: (BuildContext context, GoRouterState state) =>
              const FolderPage(workspacePath: folder),
        ),
        marker(draftRoute, 'draft'),
        marker('/sessions/:sessionId', 'session'),
        GoRoute(
          path: historyRoute,
          builder: (BuildContext context, GoRouterState state) =>
              Scaffold(body: Text('history ${state.uri.query}')),
          routes: <RouteBase>[marker(':conversationId', 'conversation')],
        ),
      ],
      initialLocation: folderRouteFor(folder),
      overrides: <Override>[
        liveSessionRepositoryProvider.overrideWithValue(live as LiveSessionRepository),
        transcriptRepositoryProvider.overrideWithValue(history as TranscriptRepository),
        filesRepositoryProvider.overrideWithValue(files),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
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

  // S-156
  testWidgets('S-156 · a live session says how it stands, where, from where, and what waits', (
    WidgetTester tester,
  ) async {
    await pumpFolder(
      tester,
      sessions: <LiveSessionSummary>[
        aLive(path: '$folder/api', pending: 2),
        aLive(id: 's-2', from: SessionOrigin.mobile, status: null),
      ],
    );

    expect(find.text(l10n.folderSessionDetails(l10n.liveStatusRunning, 'opus')), findsOneWidget);
    expect(find.text(l10n.folderSessionDetails(l10n.liveStatusUnknown, 'opus')), findsOneWidget);
    expect(find.text(l10n.folderSessionBelow('api')), findsOneWidget);
    expect(find.text(l10n.folderOpenedFromWeb), findsOneWidget);
    expect(find.text(l10n.folderOpenedFromMobile), findsOneWidget);
    expect(find.text(l10n.foldersPending(2)), findsOneWidget);
  });

  // S-158
  testWidgets('S-158 · a tap on a live session opens it', (WidgetTester tester) async {
    await pumpFolder(tester);

    await tester.tap(find.text(l10n.folderSessionDetails(l10n.liveStatusRunning, 'opus')));
    await tester.pumpAndSettle();

    expect(find.text('session s-1'), findsOneWidget);
  });

  // S-157, and S-19 of plan 05 moved here: a draft starts no session.
  testWidgets('S-157 · New session opens the draft of the folder', (WidgetTester tester) async {
    await pumpFolder(tester);

    await tester.tap(find.text(l10n.folderNewSession));
    await tester.pumpAndSettle();

    expect(find.textContaining('draft'), findsOneWidget);
    expect(find.textContaining('w%2Fa'), findsOneWidget);
  });

  testWidgets('S-157 · without a connection, New session is off and says why', (
    WidgetTester tester,
  ) async {
    await pumpFolder(tester, connection: ConnectionStatus.reconnecting);

    final FilledButton button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed, isNull);
    expect(find.text(l10n.folderNewSessionOffline), findsOneWidget);
  });

  // S-160
  testWidgets('S-160 · no session open says so, with New session in view', (
    WidgetTester tester,
  ) async {
    await pumpFolder(tester, sessions: const <LiveSessionSummary>[]);

    expect(find.text(l10n.folderNoOpenSessions), findsOneWidget);
    expect(find.text(l10n.folderNewSession), findsOneWidget);
  });

  // S-159, and D-03 of plan 04 moved here: the history is one tap from the folder.
  testWidgets('S-159 · the history shows its newest conversations and the way to all of them', (
    WidgetTester tester,
  ) async {
    await pumpFolder(
      tester,
      conversations: <ConversationSummary>[
        aConversation('c-1'),
        aConversation('c-2', summary: ''),
      ],
    );

    expect(find.text('fix the build'), findsOneWidget);
    expect(find.text(l10n.historyUntitled), findsOneWidget);

    await tester.tap(find.text('fix the build'));
    await tester.pumpAndSettle();
    expect(find.textContaining('conversation c-1'), findsOneWidget);
    GoRouter.of(tester.element(find.textContaining('conversation c-1'))).pop();
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.folderHistorySeeAll));
    await tester.pumpAndSettle();
    expect(find.textContaining('history'), findsOneWidget);
  });

  testWidgets('S-159 · a history that fails does not hide the open sessions', (
    WidgetTester tester,
  ) async {
    await pumpFolder(tester, historyFailure: const NetworkFailure(traceId: 'trace-h'));

    expect(find.textContaining('trace-h'), findsOneWidget);
    expect(find.text(l10n.folderSessionDetails(l10n.liveStatusRunning, 'opus')), findsOneWidget);
  });

  testWidgets('S-159 · open sessions that fail do not hide the history, and retry', (
    WidgetTester tester,
  ) async {
    live = CountingLiveSessions(<LiveSessionSummary>[]);
    await pumpFolder(tester, conversations: <ConversationSummary>[aConversation('c-1')]);
    live.failure = const NetworkFailure(traceId: 'trace-s');
    await tester.drag(find.byType(ListView).first, const Offset(0, 300));
    await tester.pumpAndSettle();

    expect(find.textContaining('trace-s'), findsOneWidget);
    expect(find.text('fix the build'), findsOneWidget);

    live.failure = null;
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();
    expect(find.text(l10n.folderSessionDetails(l10n.liveStatusRunning, 'opus')), findsOneWidget);
  });

  // S-161
  testWidgets('S-161 · coming back from a session reads the list again, without doubling it', (
    WidgetTester tester,
  ) async {
    await pumpFolder(tester);
    final int before = live.reads;

    await tester.tap(find.text(l10n.folderSessionDetails(l10n.liveStatusRunning, 'opus')));
    await tester.pumpAndSettle();
    GoRouter.of(tester.element(find.text('session s-1'))).pop();
    await tester.pumpAndSettle();

    expect(live.reads, before + 1);
    expect(find.text(l10n.folderSessionDetails(l10n.liveStatusRunning, 'opus')), findsOneWidget);
  });

  testWidgets('the help is one tap away', (WidgetTester tester) async {
    await pumpFolder(tester);

    await tester.tap(find.byTooltip(l10n.folderHelpOpen));
    await tester.pumpAndSettle();

    expect(find.text(l10n.folderHelpBody), findsOneWidget);
  });

  // S-155 · a folder that cannot be asked about says why, in words, where its sessions would be.
  testWidgets('S-155 · a folder gone from the computer says so, translated, with a retry', (
    WidgetTester tester,
  ) async {
    live = CountingLiveSessions(<LiveSessionSummary>[]);
    await pumpFolder(tester);
    live.failure = const ServerFailure(
      code: 'WORKSPACE_NOT_FOUND',
      messageKey: 'workspace.error.notFound',
      traceId: 't',
    );
    await tester.drag(find.byType(ListView).first, const Offset(0, 300));
    await tester.pumpAndSettle();

    expect(find.text(l10n.workspaceErrorNotFound), findsOneWidget);
    expect(find.text(l10n.commonActionRetry), findsOneWidget);
  });

  group('the files of the folder, without a session — plan 25, B-13', () {
    testWidgets('S-44 · the folder screen has the same button, which opens the same panel', (
      WidgetTester tester,
    ) async {
      await pumpFolder(tester);

      await tester.tap(find.byTooltip(l10n.filesPanelOpen));
      await tester.pumpAndSettle();

      expect(find.byType(Drawer), findsOneWidget);
      expect(
        find.descendant(of: find.byType(Drawer), matching: find.text('README.md')),
        findsOneWidget,
      );
    });

    testWidgets(
      'S-45 · the panel is the folder\'s: a level opened elsewhere is the one shown here',
      (WidgetTester tester) async {
        await pumpFolder(tester);
        final ProviderContainer container = ProviderScope.containerOf(
          tester.element(find.byType(FolderPage)),
        );
        await container.read(folderTreeControllerProvider(folder).notifier).open('docs');

        await tester.tap(find.byTooltip(l10n.filesPanelOpen));
        await tester.pumpAndSettle();

        expect(
          find.descendant(of: find.byType(Drawer), matching: find.text('a.md')),
          findsOneWidget,
        );
      },
    );
  });
}
