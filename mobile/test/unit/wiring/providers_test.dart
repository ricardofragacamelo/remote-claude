import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/usecases/list_live_sessions.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_follow_ws_data_source.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/follow_transcript.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_content_api_data_source.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/read_transcript_content.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/read_insight.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
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
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/engines/app_temporary_files.dart';
import 'package:remote_claude/features/files/data/engines/channel_file_saver.dart';
import 'package:remote_claude/features/files/data/engines/webview_diagram_engine.dart';
import 'package:remote_claude/features/files/domain/services/diagram_queue.dart';
import 'package:remote_claude/features/files/domain/repositories/files_repository.dart';
import 'package:remote_claude/features/files/domain/usecases/download_file.dart';
import 'package:remote_claude/features/files/domain/usecases/read_folder.dart';
import 'package:remote_claude/features/files/files_providers.dart';
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
import 'package:remote_claude/features/session/data/datasources/history_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/domain/usecases/list_checkpoints.dart';
import 'package:remote_claude/features/session/domain/usecases/list_commands.dart';
import 'package:remote_claude/features/session/domain/usecases/ping_session.dart';
import 'package:remote_claude/features/session/domain/usecases/read_history.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/transcript/data/datasources/transcript_api_data_source.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/domain/usecases/list_conversations.dart';
import 'package:remote_claude/features/transcript/transcript_providers.dart';
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
BuildConfig build() => const BuildConfig(
  origins: DefinedOrigins(internal: 'http://localhost:5173'),
  realmPath: '/realms/remote-claude',
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
      appVersion: '0.0.1',
      platform: 'android',
      isRelease: false,
      writer: RecordingWriter().writer,
    );

    container = ProviderContainer(
      overrides: bootstrapOverrides(build: build(), logger: logger),
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
    expect(container.read(historyApiDataSourceProvider), isA<HistoryApiDataSource>());
    expect(container.read(historyRepositoryProvider), isA<HistoryRepository>());
    expect(container.read(readHistoryProvider), isA<ReadHistory>());
    expect(container.read(sessionApiDataSourceProvider), isA<SessionApiDataSource>());
    expect(container.read(commandRepositoryProvider), isA<CommandRepository>());
    expect(container.read(listCommandsProvider), isA<ListCommands>());
    expect(container.read(checkpointRepositoryProvider), isA<CheckpointRepository>());
    expect(container.read(listCheckpointsProvider), isA<ListCheckpoints>());
    expect(container.read(liveSessionRepositoryProvider), isA<LiveSessionRepository>());
    expect(container.read(listLiveSessionsProvider), isA<ListLiveSessions>());
    expect(
      container.read(transcriptFollowWsDataSourceProvider),
      isA<TranscriptFollowWsDataSource>(),
    );
    expect(container.read(transcriptFollowRepositoryProvider), isA<TranscriptFollowRepository>());
    expect(container.read(followTranscriptProvider), isA<FollowTranscript>());
    expect(
      container.read(transcriptContentApiDataSourceProvider),
      isA<TranscriptContentApiDataSource>(),
    );
    expect(container.read(transcriptContentRepositoryProvider), isA<TranscriptContentRepository>());
    expect(container.read(readTranscriptContentProvider), isA<ReadTranscriptContent>());
    expect(container.read(insightRepositoryProvider), isA<InsightRepository>());
    expect(container.read(readInsightProvider), isA<ReadInsight>());
  });

  test('the transcript feature assembles end to end', () {
    expect(container.read(transcriptApiDataSourceProvider), isA<TranscriptApiDataSource>());
    expect(container.read(transcriptRepositoryProvider), isA<TranscriptRepository>());
    expect(container.read(listConversationsProvider), isA<ListConversations>());
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

  test('the file browser assembles end to end, one repository per origin', () {
    expect(container.read(filesApiDataSourceProvider), isA<HttpFilesApiDataSource>());
    expect(container.read(filesRepositoryProvider), isA<FilesRepository>());
    expect(container.read(listLevelProvider), isA<ListLevel>());
    expect(container.read(readFileLimitsProvider), isA<ReadFileLimits>());
    expect(container.read(diagramEngineProvider), isA<WebViewDiagramEngine>());
    expect(container.read(fileSaverProvider), isA<ChannelFileSaver>());
    expect(container.read(temporaryFilesProvider), isA<AppTemporaryFiles>());
    expect(container.read(downloadFileProvider), isA<DownloadFile>());
    expect(container.read(diagramQueueProvider), isA<DiagramQueue>());
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
      pingRoute,
      signInRoute,
      connectionRoute,
      workspacesRoute,
      diagnosticsRoute,
      rulesRoute,
      historyRoute,
      fileViewerRoute,
      draftRoute,
    ]);

    /// The children of the top-level route at [path].
    Iterable<String> under(String path) => router.configuration.routes
        .whereType<GoRoute>()
        .firstWhere((GoRoute route) => route.path == path)
        .routes
        .whereType<GoRoute>()
        .map((GoRoute route) => route.path);

    // What is reached by link sits under the home, so "back" from it lands somewhere (B-43).
    expect(under(sessionRoute), <String>['folder', 'sessions/:sessionId']);
    // One level of a folder hangs under the roots of the picker.
    expect(under(workspacesRoute), <String>['browse']);

    // One conversation hangs under the list of its workspace, so "back" lands on that list.
    final GoRoute history = router.configuration.routes.whereType<GoRoute>().firstWhere(
      (GoRoute route) => route.path == historyRoute,
    );
    expect(history.routes.whereType<GoRoute>().map((GoRoute route) => route.path), <String>[
      ':conversationId',
    ]);

    final GoRoute live = router.configuration.routes
        .whereType<GoRoute>()
        .firstWhere((GoRoute route) => route.path == sessionRoute)
        .routes
        .whereType<GoRoute>()
        .firstWhere((GoRoute route) => route.path == 'sessions/:sessionId');

    expect(live.routes.whereType<GoRoute>().map((GoRoute route) => route.path), <String>[
      'permissions/:requestId',
    ]);
  });
}
