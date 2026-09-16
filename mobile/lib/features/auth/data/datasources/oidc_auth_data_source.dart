/// The OIDC flow, in the system's external tab.
///
/// Authorization Code with PKCE, because a mobile app is a **public** client and holds no
/// secret. `flutter_appauth` generates the verifier, its S256 challenge and the `state`, and
/// validates the reply — which is the reason to use it rather than to hand-roll the flow.
///
/// The external user agent is deliberate and not configurable here: an embedded `WebView` does
/// not share the operating system's session, lets the app read what is typed into it, and is
/// grounds for rejection in a store review. See docs/architecture/mobile/07-auth.md.
library;

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:remote_claude/core/config/app_config.dart';

/// What the repository needs from the provider.
abstract interface class OidcAuthDataSource {
  /// Opens the provider and exchanges the code.
  Future<TokenResponse> authorize();

  /// Exchanges a refresh token for a new pair.
  Future<TokenResponse> refresh(String refreshToken);

  /// Ends the session at the provider.
  Future<void> endSession(String? idToken);
}

/// [OidcAuthDataSource] over `flutter_appauth`.
class AppAuthDataSource implements OidcAuthDataSource {
  const AppAuthDataSource({required this._config, this._appAuth = const FlutterAppAuth()});

  final AppConfig _config;
  final FlutterAppAuth _appAuth;

  @override
  Future<TokenResponse> authorize() => _appAuth.authorizeAndExchangeCode(
    AuthorizationTokenRequest(
      _config.oidcClientId,
      _config.oidcRedirectUrl,
      issuer: _config.oidcIssuer,
      scopes: _config.scopeList,
      // ASWebAuthenticationSession on iOS, Custom Tabs on Android. Never a WebView.
      externalUserAgent: ExternalUserAgent.asWebAuthenticationSession,
      allowInsecureConnections: _config.oidcIssuer.startsWith('http://'),
    ),
  );

  @override
  Future<TokenResponse> refresh(String refreshToken) => _appAuth.token(
    TokenRequest(
      _config.oidcClientId,
      _config.oidcRedirectUrl,
      issuer: _config.oidcIssuer,
      scopes: _config.scopeList,
      refreshToken: refreshToken,
      allowInsecureConnections: _config.oidcIssuer.startsWith('http://'),
    ),
  );

  @override
  Future<void> endSession(String? idToken) => _appAuth.endSession(
    EndSessionRequest(
      idTokenHint: idToken,
      issuer: _config.oidcIssuer,
      postLogoutRedirectUrl: _config.oidcRedirectUrl,
      allowInsecureConnections: _config.oidcIssuer.startsWith('http://'),
    ),
  );
}
