/// Every address of the app, and what opens at it.
///
/// The redirect rule is tested as a pure function next door; this is about the table itself —
/// that each path builds the screen it promises, and that a notification's request actually
/// moves the app. A route that quietly changed its path would still pass a test that only
/// counted the routes.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/app.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/deep_link_controller.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/transcript.dart';
import 'package:remote_claude/features/transcript/transcript_providers.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/presentation/pages/workspace_list_page.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';

import '../../support/fakes/fake_auth_repository.dart';
import '../../support/fakes/fake_history_repository.dart';
import '../../support/fakes/fake_transcript_repository.dart';
import '../../support/fakes/fake_session_repository.dart';
import '../../support/fakes/fake_workspace_repository.dart';
import '../../support/fakes/recording_writer.dart';
import '../../support/fakes/stub_device_controller.dart';
import '../../support/fakes/stub_push_controller.dart';
import '../../support/fakes/fake_permission_repository.dart';

final DateTime _issuedAt = DateTime.now().toUtc();

/// Signed in with nothing to renew with: these are routes, not credentials. A session with a
/// refresh token schedules its proactive renewal (plan 05, S-72), and that timer would outlive the
/// widget tree — the container is disposed by `addTearDown`, which runs after the check for
/// pending timers.
AuthSession signedIn() => AuthSession(
  accessToken: 'token',
  refreshToken: null,
  userId: 'user-1',
  issuedAt: _issuedAt,
  expiresAt: _issuedAt.add(const Duration(hours: 1)),
);

void main() {
  late FakeSessionRepository sessions;
  late FakePermissionRepository permissions;
  late ProviderContainer container;

  /// Mounts the app on the **real** router, signed in.
  Future<void> pumpApp(WidgetTester tester) async {
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
    sessions = FakeSessionRepository();
    addTearDown(sessions.dispose);
    // Every request the tests open is one the server has already forgotten, so the screen settles.
    permissions = FakePermissionRepository();
    for (final String id in <String>['request-8', 'request-9']) {
      permissions.lookups[id] = () async => const LookupGone();
    }

    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
    addTearDown(logger.dispose);

    container = ProviderContainer(
      overrides: <Override>[
        ...permissionOverrides(repository: permissions),
        authRepositoryProvider.overrideWithValue(
          FakeAuthRepository(stored: signedIn()) as AuthRepository,
        ),
        sessionRepositoryProvider.overrideWithValue(sessions),
        historyRepositoryProvider.overrideWithValue(FakeHistoryRepository() as HistoryRepository),
        transcriptRepositoryProvider.overrideWithValue(
          FakeTranscriptRepository() as TranscriptRepository,
        ),
        workspaceRepositoryProvider.overrideWithValue(
          FakeWorkspaceRepository() as WorkspaceRepository,
        ),
        appLoggerProvider.overrideWithValue(logger),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(ConnectionStatus.ready),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const RemoteClaudeApp()),
    );

    await tester.pumpAndSettle();
  }

  testWidgets('the folders live at their own address', (WidgetTester tester) async {
    await pumpApp(tester);

    container.read(routerProvider).go(workspacesRoute);
    await tester.pumpAndSettle();

    expect(find.byType(WorkspaceListPage), findsOneWidget);
  });

  testWidgets('a session opens at its own address, carrying its id', (WidgetTester tester) async {
    await pumpApp(tester);

    container.read(routerProvider).go(sessionRouteFor('session-7'));
    await tester.pumpAndSettle();

    expect(tester.widget<SessionPage>(find.byType(SessionPage)).sessionId, 'session-7');
    expect(sessions.followed, contains('session-7'));
  });

  testWidgets('a permission has an address of its own, above the session it belongs to', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    container.read(routerProvider).go(permissionRouteFor('session-8', 'request-8'));
    await tester.pumpAndSettle();

    final PermissionPage page = tester.widget<PermissionPage>(find.byType(PermissionPage));
    expect((page.sessionId, page.requestId), ('session-8', 'request-8'));
    // Nested, so "back" lands on the session the request belongs to.
    expect(
      tester.widget<SessionPage>(find.byType(SessionPage, skipOffstage: false)).sessionId,
      'session-8',
    );
    // And the screen asked the server rather than trusting whoever sent it there (S-45).
    expect(permissions.lookedUp['request-8'], 1);
  });

  testWidgets('the history of a folder lives at an address that names the folder', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    container.read(routerProvider).go(historyRouteFor('/home/someone/my project'));
    await tester.pumpAndSettle();

    expect(
      tester.widget<ConversationListPage>(find.byType(ConversationListPage)).workspacePath,
      '/home/someone/my project',
    );
  });

  testWidgets('one conversation has an address of its own, above the list of its folder', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    container.read(routerProvider).go(conversationRouteFor('conv/7', '/home/someone/project'));
    await tester.pumpAndSettle();

    expect(
      tester.widget<ConversationHistoryPage>(find.byType(ConversationHistoryPage)).conversationId,
      'conv/7',
    );
    // Nested, so "back" lands on the conversations of the same folder.
    expect(
      tester
          .widget<ConversationListPage>(find.byType(ConversationListPage, skipOffstage: false))
          .workspacePath,
      '/home/someone/project',
    );

    // The conversation is kept for a while after the screen goes; let that run out.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(historyKeptFor + const Duration(seconds: 1));
  });

  testWidgets('a tap on a notification moves the app, once', (WidgetTester tester) async {
    await pumpApp(tester);

    container
        .read(deepLinkControllerProvider.notifier)
        .request(permissionRouteFor('session-9', 'request-9'));
    await tester.pumpAndSettle();

    expect(tester.widget<PermissionPage>(find.byType(PermissionPage)).requestId, 'request-9');

    // Honoured and forgotten: otherwise every rebuild would drag the app back here.
    expect(container.read(deepLinkControllerProvider), isNull);
  });
}
