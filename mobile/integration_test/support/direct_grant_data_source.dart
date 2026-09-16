/// Signing in against the **real** provider, without a browser.
///
/// This is the one piece of the flow an automated run cannot do for real. The app signs in through
/// the operating system's external tab — `ASWebAuthenticationSession` or Custom Tabs — and no test
/// harness can drive that: the tab belongs to the system, not to the app. The web suite covers the
/// redirect half in a real browser (`e2e/specs/vertical-slice.spec.ts`); what this end proves is
/// everything after it, against the same running backend.
///
/// So the authorization step is exchanged for a **direct grant** against the same Keycloak realm,
/// on a client enabled for it and used by nothing else (`remote-claude-e2e`). Every layer above
/// stays real: the repository, the credential store, the use cases, the controller, the socket.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/auth/data/datasources/oidc_auth_data_source.dart';

/// Client of the local realm that accepts a password grant. Automated tests only.
const String directGrantClientId = 'remote-claude-e2e';

/// [OidcAuthDataSource] that asks the provider for tokens with a username and a password.
class DirectGrantDataSource implements OidcAuthDataSource {
  DirectGrantDataSource({
    required this._config,
    required this._username,
    required this._password,
    HttpClient? http,
  }) : _http = http ?? HttpClient();

  final AppConfig _config;
  final String _username;
  final String _password;
  final HttpClient _http;

  @override
  Future<TokenResponse> authorize() => _token(<String, String>{
    'grant_type': 'password',
    'username': _username,
    'password': _password,
  });

  @override
  Future<TokenResponse> refresh(String refreshToken) =>
      _token(<String, String>{'grant_type': 'refresh_token', 'refresh_token': refreshToken});

  @override
  Future<void> endSession(String? idToken) async {
    // Nothing to end: a direct grant opens no browser session at the provider.
  }

  /// @throws [HttpException] with the provider's own answer, so a misconfigured realm says so
  Future<TokenResponse> _token(Map<String, String> form) async {
    final Uri endpoint = Uri.parse('${_config.oidcIssuer}/protocol/openid-connect/token');
    final HttpClientRequest request = await _http.postUrl(endpoint);

    request.headers.contentType = ContentType('application', 'x-www-form-urlencoded');
    request.write(
      Uri(
        queryParameters: <String, String>{
          ...form,
          'client_id': directGrantClientId,
          'scope': _config.oidcScopes,
        },
      ).query,
    );

    final HttpClientResponse response = await request.close();
    final String body = await response.transform(utf8.decoder).join();

    if (response.statusCode != HttpStatus.ok) {
      throw HttpException('the provider refused the grant (${response.statusCode}): $body');
    }

    final Map<String, Object?> payload = jsonDecode(body) as Map<String, Object?>;

    return TokenResponse(
      payload['access_token'] as String?,
      payload['refresh_token'] as String?,
      DateTime.now().add(Duration(seconds: payload['expires_in']! as int)),
      payload['id_token'] as String?,
      payload['token_type'] as String?,
      _config.scopeList,
      const <String, dynamic>{},
    );
  }
}

/// The credential store, in memory.
///
/// `flutter_secure_storage` is a platform channel with no implementation in a test host, and what
/// this run is about is the round trip rather than where the Keychain puts a string. The secure
/// store's own behaviour is covered by `mobile/test/unit/core/storage/`.
class MemoryCredentialStore implements CredentialStore {
  final Map<String, String> _values = <String, String>{};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> clear() async => _values.clear();
}
