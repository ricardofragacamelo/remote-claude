/// The limits stack, and the provider's administration — plan 05, F4.
///
/// The limits stack is a second backend of the same run, sharing its database and its provider,
/// with the limits tightened: a ceiling of two sessions, twenty seconds idle, twenty frames a
/// second (`LIMITS_STACK` in `scripts/lib/stack.mjs`). The app is pointed at it by configuration,
/// exactly as an installation would be — the same build, another address.
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:remote_claude/core/config/app_config.dart';

import 'direct_grant_data_source.dart';
import 'e2e_environment.dart';

/// The app's configuration, pointed at the limits stack instead of the main one.
///
/// @throws [ConfigurationError] when the run compiled no limits stack in — the live run has none
AppConfig limitsConfig() => AppConfig.from(<String, String>{
  ...appDefines,
  'RC_API_URL': const String.fromEnvironment('RC_LIMITS_API_URL'),
  'RC_WS_URL': const String.fromEnvironment('RC_LIMITS_WS_URL'),
});

/// The expiry of an access token, read from its own claims.
DateTime expiryOf(String accessToken) {
  final String claims = accessToken.split('.')[1];
  final Map<String, Object?> payload =
      jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(claims))))
          as Map<String, Object?>;

  return DateTime.fromMillisecondsSinceEpoch((payload['exp']! as int) * 1000);
}

/// Ends [sessionId] from [browser], attached first so the socket is told it closed.
///
/// Every scenario here ends what it opened: the next one counts slots, and a session left behind
/// would be a slot it cannot have.
Future<void> endOnLimits(BrowserSocket browser, String sessionId) async {
  browser.attach(sessionId);
  await browser.closeSession(sessionId);
}

/// What the suite's own provider is told to do, for the two scenarios no door of the product
/// reaches.
///
/// The provider is the Keycloak of `infra/keycloak`, brought up by the run and gone after it —
/// never a real one. Each change is undone by the test that made it.
class ProviderAdmin {
  ProviderAdmin()
    : _dio = Dio(BaseOptions(baseUrl: const String.fromEnvironment('RC_KEYCLOAK_URL')));

  final Dio _dio;

  /// The realm of the suite, as `infra/keycloak/realm-remote-claude.json` names it.
  static const String _realm = 'remote-claude';

  /// The attribute that overrides the realm's access token lifespan for one client, in seconds.
  static const String _lifespan = 'access.token.lifespan';

  /// Makes the access tokens of the app's test client live [seconds], and answers the undo.
  ///
  /// The client is the one the direct grant signs in with — the only one this end uses.
  Future<Future<void> Function()> shortenTokens(int seconds) async {
    final Map<String, Object?> client = await _client(directGrantClientId);
    final Map<String, Object?> attributes =
        (client['attributes'] as Map<String, Object?>?) ?? <String, Object?>{};
    final Object? before = attributes[_lifespan];

    Future<void> write(String value) async => _dio.put<Object?>(
      '/admin/realms/$_realm/clients/${client['id']}',
      data: <String, Object?>{
        ...client,
        'attributes': <String, Object?>{...attributes, _lifespan: value},
      },
      options: await _authorised(),
    );

    await write('$seconds');

    // An empty value is how the administration clears an override: the realm's lifespan applies.
    return () => write((before as String?) ?? '');
  }

  /// Ends every session [username] has at the provider, the way an administrator cuts somebody
  /// off — the offline ones included. The app asks for `offline_access`, and an offline refresh
  /// token outlives the user's sessions: only revoking the grant of each client ends it.
  Future<void> endSessionsOf(String username) async {
    final Response<List<Object?>> users = await _dio.get<List<Object?>>(
      '/admin/realms/$_realm/users',
      queryParameters: <String, Object?>{'username': username, 'exact': true},
      options: await _authorised(),
    );
    final String userId = (users.data!.single! as Map<String, Object?>)['id']! as String;

    await _dio.post<Object?>(
      '/admin/realms/$_realm/users/$userId/logout',
      options: await _authorised(),
    );

    final Response<List<Object?>> consents = await _dio.get<List<Object?>>(
      '/admin/realms/$_realm/users/$userId/consents',
      options: await _authorised(),
    );
    for (final Object? consent in consents.data!) {
      final String clientId = (consent! as Map<String, Object?>)['clientId']! as String;
      await _dio.delete<Object?>(
        '/admin/realms/$_realm/users/$userId/consents/$clientId',
        options: await _authorised(),
      );
    }
  }

  Future<Map<String, Object?>> _client(String clientId) async {
    final Response<List<Object?>> clients = await _dio.get<List<Object?>>(
      '/admin/realms/$_realm/clients',
      queryParameters: <String, Object?>{'clientId': clientId},
      options: await _authorised(),
    );

    return clients.data!.single! as Map<String, Object?>;
  }

  /// An administrator's token, from the master realm.
  Future<Options> _authorised() async {
    final Response<Map<String, Object?>> token = await _dio.post<Map<String, Object?>>(
      '/realms/master/protocol/openid-connect/token',
      data: <String, String>{
        'grant_type': 'password',
        'client_id': 'admin-cli',
        'username': const String.fromEnvironment('RC_KEYCLOAK_ADMIN'),
        'password': const String.fromEnvironment('RC_KEYCLOAK_ADMIN_PASSWORD'),
      },
      options: Options(contentType: Headers.formUrlEncodedContentType),
    );

    return Options(
      headers: <String, Object?>{'authorization': 'Bearer ${token.data!['access_token']}'},
    );
  }
}
