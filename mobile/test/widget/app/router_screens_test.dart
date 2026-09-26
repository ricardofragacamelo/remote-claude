/// Every address of the app, and what opens at it.
///
/// The redirect rule is tested as a pure function next door; this is about the table itself —
/// that each path builds the screen it promises, and that a notification's request actually
/// moves the app. A route that quietly changed its path would still pass a test that only
/// counted the routes.
library;

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
import 'package:remote_claude/features/session/presentation/pages/session_page.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/presentation/pages/workspace_list_page.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';

import '../../support/fakes/fake_auth_repository.dart';
import '../../support/fakes/fake_session_repository.dart';
import '../../support/fakes/fake_workspace_repository.dart';
import '../../support/fakes/recording_writer.dart';
import '../../support/fakes/stub_device_controller.dart';
import '../../support/fakes/stub_push_controller.dart';
import '../../support/fakes/fake_permission_repository.dart';

final DateTime _issuedAt = DateTime.now().toUtc();

AuthSession signedIn() => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
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
