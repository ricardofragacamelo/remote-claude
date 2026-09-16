import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/app_config.dart';

Map<String, String> validDefines() => <String, String>{
  'RC_API_URL': 'http://localhost:3000',
  'RC_WS_URL': 'ws://localhost:3000/ws',
  'RC_OIDC_ISSUER': 'http://localhost:8180/realms/remote-claude',
  'RC_OIDC_CLIENT_ID': 'remote-claude-mobile',
  'RC_OIDC_SCOPES': 'openid profile email offline_access',
  'RC_OIDC_REDIRECT_URL': 'com.remoteclaude://callback',
  'RC_APP_VERSION': '0.0.1',
};

void main() {
  group('AppConfig.from', () {
    test('reads a complete set of defines', () {
      final AppConfig config = AppConfig.from(validDefines());

      expect(config.apiBaseUrl, 'http://localhost:3000');
      expect(config.wsUrl, 'ws://localhost:3000/ws');
      expect(config.oidcClientId, 'remote-claude-mobile');
      expect(config.appVersion, '0.0.1');
    });

    test('splits the scopes into the list the OIDC package wants', () {
      expect(AppConfig.from(validDefines()).scopeList, <String>[
        'openid',
        'profile',
        'email',
        'offline_access',
      ]);
    });

    test('ignores the empty segments of a scope string', () {
      final Map<String, String> defines = validDefines()..['RC_OIDC_SCOPES'] = 'openid  profile ';

      expect(AppConfig.from(defines).scopeList, <String>['openid', 'profile']);
    });

    test('refuses to build when a value is missing', () {
      final Map<String, String> defines = validDefines()..remove('RC_API_URL');

      expect(() => AppConfig.from(defines), throwsA(isA<ConfigurationError>()));
    });

    test('refuses to build when a value is blank', () {
      final Map<String, String> defines = validDefines()..['RC_APP_VERSION'] = '   ';

      expect(() => AppConfig.from(defines), throwsA(isA<ConfigurationError>()));
    });

    test('refuses a websocket URL that is not one', () {
      final Map<String, String> defines = validDefines()..['RC_WS_URL'] = 'http://localhost';

      expect(() => AppConfig.from(defines), throwsA(isA<ConfigurationError>()));
    });

    test('lists every problem at once, not just the first', () {
      final Map<String, String> defines = <String, String>{};

      expect(
        () => AppConfig.from(defines),
        throwsA(
          isA<ConfigurationError>().having(
            (ConfigurationError error) => error.problems.length,
            'problems',
            7,
          ),
        ),
      );
    });

    test('says what is wrong with each value', () {
      final Map<String, String> defines = validDefines()..['RC_WS_URL'] = 'http://x';

      try {
        AppConfig.from(defines);
        fail('expected a ConfigurationError');
      } on ConfigurationError catch (error) {
        expect(error.toString(), contains('RC_WS_URL'));
        expect(error.toString(), contains('ws'));
      }
    });

    test('two configurations built from the same defines are equal', () {
      expect(AppConfig.from(validDefines()), AppConfig.from(validDefines()));
    });
  });
}
