import 'package:flutter_appauth_platform_interface/flutter_appauth_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/features/auth/data/datasources/oidc_auth_data_source.dart';

/// Stands in for the platform channel, so the request this app builds can be inspected.
class _RecordingPlatform extends FlutterAppAuthPlatform with MockPlatformInterfaceMixin {
  AuthorizationTokenRequest? authorization;
  TokenRequest? tokenRequest;
  EndSessionRequest? endSessionRequest;

  @override
  Future<AuthorizationTokenResponse> authorizeAndExchangeCode(
    AuthorizationTokenRequest request,
  ) async {
    authorization = request;
    return AuthorizationTokenResponse(
      'access',
      'refresh',
      DateTime.utc(2026, 9, 14, 13),
      'id',
      'Bearer',
      <String>['openid'],
      null,
      null,
    );
  }

  @override
  Future<TokenResponse> token(TokenRequest request) async {
    tokenRequest = request;
    return TokenResponse('access', 'refresh', null, 'id', 'Bearer', <String>['openid'], null);
  }

  @override
  Future<EndSessionResponse> endSession(EndSessionRequest request) async {
    endSessionRequest = request;
    return EndSessionResponse('state');
  }
}

AppConfig config({String issuer = 'https://login.example.com'}) => AppConfig(
  apiBaseUrl: 'https://api.example.com',
  wsUrl: 'wss://api.example.com/ws',
  oidcIssuer: issuer,
  oidcClientId: 'remote-claude-mobile',
  oidcScopes: 'openid profile offline_access',
  oidcRedirectUrl: 'com.remoteclaude://callback',
  appVersion: '0.0.1',
);

void main() {
  late _RecordingPlatform platform;

  setUp(() {
    platform = _RecordingPlatform();
    FlutterAppAuthPlatform.instance = platform;
  });

  test('opens the system tab, never an embedded WebView', () async {
    await AppAuthDataSource(config: config()).authorize();

    expect(platform.authorization!.externalUserAgent, ExternalUserAgent.asWebAuthenticationSession);
  });

  test('asks for the code with the client, the deep link and the scopes of the build', () async {
    await AppAuthDataSource(config: config()).authorize();

    final AuthorizationTokenRequest request = platform.authorization!;
    expect(request.clientId, 'remote-claude-mobile');
    expect(request.redirectUrl, 'com.remoteclaude://callback');
    expect(request.issuer, 'https://login.example.com');
    expect(request.scopes, <String>['openid', 'profile', 'offline_access']);
  });

  test('is a public client — there is no secret to send', () async {
    await AppAuthDataSource(config: config()).authorize();

    expect(platform.authorization!.clientSecret, isNull);
  });

  test('refuses plain HTTP unless the issuer itself is plain HTTP', () async {
    await AppAuthDataSource(config: config()).authorize();
    expect(platform.authorization!.allowInsecureConnections, isFalse);

    await AppAuthDataSource(config: config(issuer: 'http://localhost:8180/realms/x')).authorize();
    expect(platform.authorization!.allowInsecureConnections, isTrue);
  });

  test('exchanges a refresh token at the token endpoint', () async {
    await AppAuthDataSource(config: config()).refresh('the-refresh-token');

    expect(platform.tokenRequest!.refreshToken, 'the-refresh-token');
    expect(platform.tokenRequest!.clientId, 'remote-claude-mobile');
  });

  test('ends the session at the provider with the id token as the hint', () async {
    await AppAuthDataSource(config: config()).endSession('the-id-token');

    expect(platform.endSessionRequest!.idTokenHint, 'the-id-token');
    expect(platform.endSessionRequest!.postLogoutRedirectUrl, 'com.remoteclaude://callback');
  });
}
