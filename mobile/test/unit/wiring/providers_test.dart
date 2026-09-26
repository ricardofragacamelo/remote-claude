import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/device/device_identity_provider.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/notifications/platform_push_gateway.dart';
import 'package:remote_claude/core/notifications/push_providers.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/core/session/sign_out_hooks.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/auth/domain/usecases/renew_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/restore_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_in.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_out.dart';
import 'package:remote_claude/features/device/data/datasources/device_api_data_source.dart';
import 'package:remote_claude/features/device/device_providers.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';
import 'package:remote_claude/features/device/domain/usecases/forget_push_token.dart';
import 'package:remote_claude/features/device/domain/usecases/register_device.dart';
import 'package:remote_claude/features/permission/data/datasources/device_lock_data_source.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_api_data_source.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_rule_api_data_source.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';
import 'package:remote_claude/features/permission/domain/usecases/gate_approval.dart';
import 'package:remote_claude/features/permission/domain/usecases/list_rules.dart';
import 'package:remote_claude/features/permission/domain/usecases/revoke_rule.dart';
import 'package:remote_claude/features/permission/domain/usecases/watch_permissions.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/domain/usecases/ping_session.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/domain/usecases/list_workspaces.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';

import '../../support/fakes/recording_writer.dart';

/// The wiring of the real container.
///
/// Every provider is built for real, with only the two things a running process supplies —
/// configuration and the logger — overridden. A container that cannot assemble itself is a
/// failure nobody would see until the app was launched on a device.
AppConfig config() => const AppConfig(
  apiBaseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000/ws',
  oidcIssuer: 'http://localhost:8180/realms/remote-claude',
  oidcClientId: 'remote-claude-mobile',
  oidcScopes: 'openid profile email offline_access',
  oidcRedirectUrl: 'com.remoteclaude://callback',
  appVersion: '0.0.1',
);

void main() {
  late AppLogger logger;
  late ProviderContainer container;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues(<String, String>{});

    logger = buildLogger(
      config: config(),
      platform: 'android',
      isRelease: false,
      writer: RecordingWriter().writer,
    );

    container = ProviderContainer(
      overrides: bootstrapOverrides(config: config(), logger: logger),
    );
  });

  tearDown(() async {
    container.dispose();
    await logger.dispose();
  });

  test('the transport assembles from the configuration of the build', () {
    expect(container.read(traceIdsProvider), isA<TraceIds>());
    expect(container.read(credentialsProvider), isA<Credentials>());
    expect(container.read(apiClientProvider), isA<ApiClient>());
  });

  test('there is exactly one socket, and one credential holder', () {
    expect(container.read(wsClientProvider), same(container.read(wsClientProvider)));
    expect(container.read(credentialsProvider), same(container.read(credentialsProvider)));
  });

  test('the socket starts idle — nothing connects just by being built', () async {
    final WsClient client = container.read(wsClientProvider);

    expect(client.status, ConnectionStatus.idle);
    expect(await client.statuses.first, ConnectionStatus.idle);
  });

  test('the credential store is the operating system one', () {
    expect(container.read(credentialStoreProvider), isA<SecureCredentialStore>());
    expect(container.read(credentialStoreProvider), isA<CredentialStore>());
  });

  test('the auth feature assembles end to end', () {
    expect(container.read(authRepositoryProvider), isA<AuthRepository>());
    expect(container.read(signInProvider), isA<SignIn>());
    expect(container.read(restoreSessionProvider), isA<RestoreSession>());
    expect(container.read(renewSessionProvider), isA<RenewSession>());
    expect(container.read(signOutProvider), isA<SignOut>());
  });

  test('there is exactly one installation identity', () {
    expect(container.read(deviceIdentityProvider), isA<DeviceIdentity>());
    expect(container.read(deviceIdentityProvider), same(container.read(deviceIdentityProvider)));
  });

  test('the device feature assembles end to end', () {
    expect(container.read(deviceApiDataSourceProvider), isA<DeviceApiDataSource>());
    expect(container.read(deviceRepositoryProvider), isA<DeviceRepository>());
    expect(container.read(registerDeviceProvider), isA<RegisterDevice>());
    expect(container.read(forgetPushTokenProvider), isA<ForgetPushToken>());
  });

  test('the device this build runs on has a name and a platform', () {
    expect(container.read(deviceNameProvider), isNotEmpty);
    expect(container.read(devicePlatformProvider), isNotEmpty);
  });

  test('the session feature assembles end to end', () {
    expect(container.read(sessionWsDataSourceProvider), isA<SessionWsDataSource>());
    expect(container.read(sessionRepositoryProvider), isA<SessionRepository>());
    expect(container.read(watchSessionProvider), isA<WatchSession>());
    expect(container.read(pingSessionProvider), isA<PingSession>());
    expect(container.read(driveSessionProvider), isA<DriveSession>());
  });

  test('the permission feature assembles end to end, with the real lock and store', () {
    expect(container.read(permissionApiDataSourceProvider), isA<PermissionApiDataSource>());
    expect(container.read(permissionRepositoryProvider), isA<PermissionRepository>());
    expect(container.read(permissionRuleApiDataSourceProvider), isA<PermissionRuleApiDataSource>());
    expect(container.read(permissionRuleRepositoryProvider), isA<PermissionRuleRepository>());
    expect(container.read(listRulesProvider), isA<ListRules>());
    expect(container.read(revokeRuleProvider), isA<RevokeRule>());
    expect(container.read(watchPermissionsProvider), isA<WatchPermissions>());
    expect(container.read(lookupPermissionProvider), isA<LookupPermission>());
    expect(container.read(approvalLockProvider), isA<LocalAuthApprovalLock>());
    expect(container.read(approvalPreferencesProvider), isA<SecureApprovalPreferences>());
    expect(container.read(gateApprovalProvider), isA<GateApproval>());
    expect(container.read(approvalLockSettingProvider), isA<ApprovalLockSetting>());
    expect(container.read(permissionClockProvider)().isUtc, isFalse);
  });

  test('there is one sign-out registry', () {
    expect(container.read(signOutHooksProvider), same(container.read(signOutHooksProvider)));
  });

  test('the workspace feature assembles end to end', () {
    expect(container.read(workspaceApiDataSourceProvider), isA<WorkspaceApiDataSource>());
    expect(container.read(workspaceRepositoryProvider), isA<WorkspaceRepository>());
    expect(container.read(listWorkspacesProvider), isA<ListWorkspaces>());
  });

  test('there is exactly one notification transport, and it is the platform one', () {
    // The real gateway, built for real: it is the only place the app can learn that a build has
    // no transport, and a container that could not assemble it would fail on a device.
    expect(container.read(pushGatewayProvider), isA<PlatformPushGateway>());
    expect(container.read(pushGatewayProvider), same(container.read(pushGatewayProvider)));
  });

  test('the connection status is readable before anything connected', () async {
    // The listener is what keeps an autoDispose stream provider alive long enough to answer.
    final ProviderSubscription<AsyncValue<ConnectionStatus>> subscription = container.listen(
      connectionStatusProvider,
      (AsyncValue<ConnectionStatus>? previous, AsyncValue<ConnectionStatus> next) {},
    );
    addTearDown(subscription.close);

    expect(await container.read(connectionStatusProvider.future), ConnectionStatus.idle);
  });

  test('the router assembles, with every screen addressable by its own path', () {
    final GoRouter router = container.read(routerProvider);

    // The paths and not the count: a notification opens one of these by address, and a route
    // that quietly changed its path would still pass a test that only counted them.
    final List<String> paths = router.configuration.routes
        .whereType<GoRoute>()
        .map((GoRoute route) => route.path)
        .toList();

    expect(paths, <String>[
      sessionRoute,
      signInRoute,
      workspacesRoute,
      rulesRoute,
      '/sessions/:sessionId',
    ]);

    final GoRoute live = router.configuration.routes.whereType<GoRoute>().firstWhere(
      (GoRoute route) => route.path == '/sessions/:sessionId',
    );

    expect(live.routes.whereType<GoRoute>().map((GoRoute route) => route.path), <String>[
      'permissions/:requestId',
    ]);
  });
}
