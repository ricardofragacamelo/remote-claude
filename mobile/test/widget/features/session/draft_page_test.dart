/// The draft: a folder opened to talk about, with no session behind it until the first send
/// (plan 10, B-08, D-05).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_insight_repository.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/fakes/stub_push_controller.dart';
import '../../../support/pump_app.dart';

const String folder = '/home/someone/project';

void main() {
  late AppLocalizations l10n;
  late FakeSessionRepository sessions;
  late FakeInsightRepository insight;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpDraft(
    WidgetTester tester, {
    ConnectionStatus connection = ConnectionStatus.ready,
    double width = 900,
    bool fromTheFolders = false,
  }) async {
    tester.view.physicalSize = Size(width, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    sessions = FakeSessionRepository();
    addTearDown(sessions.dispose);

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState state) => Scaffold(
            body: TextButton(
              onPressed: () => context.push(draftRouteFor(folder)),
              child: const Text('the folders'),
            ),
          ),
        ),
        GoRoute(
          path: draftRoute,
          builder: (BuildContext context, GoRouterState state) =>
              DraftPage(workspacePath: state.uri.queryParameters[workspacePathParameter]!),
        ),
        GoRoute(
          path: '/sessions/:sessionId',
          builder: (BuildContext context, GoRouterState state) =>
              Scaffold(body: Text('opened ${state.pathParameters['sessionId']}')),
        ),
      ],
      initialLocation: fromTheFolders ? '/' : draftRouteFor(folder),
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(sessions),
        insightRepositoryProvider.overrideWithValue(insight as InsightRepository),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
      ],
    );
    await tester.pumpAndSettle();
  }

  setUp(() => insight = FakeInsightRepository());

  Future<void> send(WidgetTester tester, String text) async {
    await tester.enterText(find.byType(TextField), text);
    await tester.pump();
    await tester.tap(find.byTooltip(l10n.sessionPromptAction));
    await tester.pumpAndSettle();
  }

  testWidgets('S-19 · the draft teaches, reads the folder’s catalogue, and opens nothing', (
    WidgetTester tester,
  ) async {
    await pumpDraft(tester);

    expect(find.text(l10n.draftDescription), findsOneWidget);
    expect(find.text(l10n.draftCommands), findsOneWidget);
    expect(find.text(folder), findsOneWidget);
    expect(insight.asked, <String>['catalog:$folder']);
    expect(sessions.commands, isEmpty);
    // The installation's default until something is chosen.
    expect(find.text(l10n.modelDefault), findsOneWidget);
    expect(find.text(l10n.modeDefault), findsOneWidget);
  });

  testWidgets('S-19 · S-116 · the first send opens the session with the choices, and moves there', (
    WidgetTester tester,
  ) async {
    await pumpDraft(tester);

    await tester.tap(find.text(l10n.modelDefault));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Opus'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.effortDefault));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.effortHigh));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.modeDefault));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.modePlan));
    await tester.pumpAndSettle();

    await send(tester, 'fix the build');

    expect(sessions.commands.single.$2, <String, Object?>{
      'workspacePath': folder,
      'model': 'opus',
      'permissionMode': 'plan',
      'effort': 'high',
    });
    // The text stays while the session opens, and the box says what it waits for.
    expect(find.byTooltip(l10n.draftStarting), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'fix the build');

    sessions.emit(arrivalOf(sessionStarted(sessionId: 'session-7', correlationId: 'command-1')));
    await tester.pumpAndSettle();

    expect(sessions.commands.last.$2, <String, Object?>{
      'sessionId': 'session-7',
      'text': 'fix the build',
    });
    expect(find.text('opened session-7'), findsOneWidget);
  });

  testWidgets('S-20 · two taps on send open one session', (WidgetTester tester) async {
    await pumpDraft(tester);

    await tester.enterText(find.byType(TextField), 'once');
    await tester.pump();
    await tester.tap(find.byTooltip(l10n.sessionPromptAction));
    await tester.pump();
    await tester.tap(find.byTooltip(l10n.draftStarting));
    await tester.pumpAndSettle();

    expect(sessions.commands, hasLength(1));
  });

  testWidgets('S-21 · a catalogue that was refused says why, and the send uses the defaults', (
    WidgetTester tester,
  ) async {
    insight.catalogFailure = const ServerFailure(
      code: 'SESSION_LIMIT_REACHED',
      messageKey: 'session.error.limitReached',
      traceId: 't',
      params: <String, String>{'limit': '2'},
    );
    await pumpDraft(tester);

    expect(find.text(l10n.draftCatalogFailed(l10n.sessionErrorLimitReached('2'))), findsOneWidget);

    await tester.tap(find.text(l10n.modelDefault));
    await tester.pumpAndSettle();
    expect(find.text(l10n.modelsFailed(l10n.sessionErrorLimitReached('2'))), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await send(tester, 'anyway');
    expect(sessions.commands.single.$2, <String, Object?>{'workspacePath': folder});
  });

  testWidgets('a catalogue that is not a failure still says it could not be read', (
    WidgetTester tester,
  ) async {
    insight.catalogFailure = StateError('broken');
    await pumpDraft(tester);

    expect(find.text(l10n.draftCatalogFailed(l10n.commonErrorUnexpected)), findsOneWidget);
  });

  testWidgets('a folder whose installation lists no model says the default is used', (
    WidgetTester tester,
  ) async {
    insight.catalog = const InstallationCatalog();
    await pumpDraft(tester);

    expect(find.text(l10n.draftDefaultModel), findsOneWidget);
  });

  testWidgets('S-22 · another command’s session on the same socket does not move the draft', (
    WidgetTester tester,
  ) async {
    await pumpDraft(tester);
    await send(tester, 'mine');

    sessions.emit(arrivalOf(sessionStarted(sessionId: 'other', correlationId: 'command-42')));
    await tester.pumpAndSettle();

    expect(find.text('opened other'), findsNothing);
    expect(find.byType(DraftPage), findsOneWidget);
  });

  testWidgets('S-18 · a start refused for the ceiling says why above the box, and keeps the text', (
    WidgetTester tester,
  ) async {
    await pumpDraft(tester);
    await send(tester, 'keep me');

    sessions.emit(
      const CommandRefused(
        commandId: 'command-1',
        failure: ServerFailure(
          code: 'SESSION_LIMIT_REACHED',
          messageKey: 'session.error.limitReached',
          traceId: 't',
          params: <String, String>{'limit': '2'},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionErrorLimitReached('2')), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'keep me');

    await tester.tap(find.byTooltip(l10n.composerRefusalClose));
    await tester.pumpAndSettle();
    expect(find.text(l10n.sessionErrorLimitReached('2')), findsNothing);
  });

  testWidgets('a start the socket did not take says so, and keeps the text', (
    WidgetTester tester,
  ) async {
    await pumpDraft(tester);
    sessions.accepts = false;

    await send(tester, 'not lost');

    expect(find.text(l10n.sessionPromptRefused), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'not lost');
  });

  testWidgets('a socket that is gone: nothing can be sent, and the reason is above the box', (
    WidgetTester tester,
  ) async {
    await pumpDraft(tester, connection: ConnectionStatus.closed);

    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    expect(find.text(l10n.composerBlocked(l10n.connectionStatusClosed)), findsOneWidget);
  });

  testWidgets('B-12 · a / opens the commands of the folder’s installation', (
    WidgetTester tester,
  ) async {
    insight.catalog = const InstallationCatalog(
      commands: CommandMenu(commands: <SlashCommand>[SlashCommand(name: 'init')]),
    );
    await pumpDraft(tester);

    await tester.enterText(find.byType(TextField), '/');
    await tester.pumpAndSettle();
    expect(find.text('/init'), findsOneWidget);

    await tester.tap(find.text('/init'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, '/init ');
    expect(sessions.commands, isEmpty);
  });

  testWidgets('S-22 · leaving the draft leaves nothing open', (WidgetTester tester) async {
    await pumpDraft(tester, fromTheFolders: true);
    await tester.tap(find.text('the folders'));
    await tester.pumpAndSettle();
    expect(find.byType(DraftPage), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();

    expect(find.text('the folders'), findsOneWidget);
    expect(sessions.commands, isEmpty);
  });
}
