import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/auth/domain/usecases/renew_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/restore_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_in.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_out.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/ping_session.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:remote_claude/features/session/session_providers.dart';

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

  test('the session feature assembles end to end', () {
    expect(container.read(sessionWsDataSourceProvider), isA<SessionWsDataSource>());
    expect(container.read(sessionRepositoryProvider), isA<SessionRepository>());
    expect(container.read(watchSessionProvider), isA<WatchSession>());
    expect(container.read(pingSessionProvider), isA<PingSession>());
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

  test('the router assembles, with both routes addressable', () {
    final GoRouter router = container.read(routerProvider);

    expect(router.configuration.routes, hasLength(2));
  });
}
