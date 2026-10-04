/// What the build is compiled with, and the configuration it gives on one origin (plan 10, B-28).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/connection_choice.dart';

Map<String, String> validDefines() => <String, String>{
  'RC_INTERNAL_URL': 'http://localhost:5173',
  'RC_EXTERNAL_URL': 'https://claude.example.dev',
  'RC_OIDC_REALM_PATH': '/realms/remote-claude',
  'RC_OIDC_CLIENT_ID': 'remote-claude-mobile',
  'RC_OIDC_SCOPES': 'openid profile email offline_access',
  'RC_OIDC_REDIRECT_URL': 'com.remoteclaude://callback',
  'RC_APP_VERSION': '0.0.1',
};

void main() {
  group('BuildConfig.from', () {
    test('reads a complete set of defines, the origins normalised', () {
      final BuildConfig build = BuildConfig.from(
        validDefines()..['RC_EXTERNAL_URL'] = 'https://Claude.Example.dev/',
      );

      expect(
        build.origins,
        const DefinedOrigins(
          internal: 'http://localhost:5173',
          external: 'https://claude.example.dev',
        ),
      );
      expect(build.realmPath, '/realms/remote-claude');
      expect(build.oidcClientId, 'remote-claude-mobile');
      expect(build.appVersion, '0.0.1');
    });

    test('S-104 · an empty address is a radio that is off, never an error', () {
      final BuildConfig build = BuildConfig.from(
        validDefines()
          ..['RC_INTERNAL_URL'] = ''
          ..remove('RC_EXTERNAL_URL'),
      );

      expect(build.origins, const DefinedOrigins());
    });

    test('S-121 · an internal address on the private network is compiled in, in a debug build', () {
      final BuildConfig build = BuildConfig.from(
        validDefines()..['RC_INTERNAL_URL'] = 'http://192.168.0.10:5173/',
      );

      expect(build.origins.internal, 'http://192.168.0.10:5173');
    });

    test('an address compiled in that is not an origin stops the build, saying which', () {
      try {
        BuildConfig.from(validDefines()..['RC_EXTERNAL_URL'] = 'http://203.0.113.10');
        fail('expected a ConfigurationError');
      } on ConfigurationError catch (error) {
        expect(error.toString(), contains('RC_EXTERNAL_URL'));
        expect(error.toString(), contains('plainText'));
      }
    });

    test('a realm path that is not a path stops the build', () {
      expect(
        () => BuildConfig.from(validDefines()..['RC_OIDC_REALM_PATH'] = 'realms/x'),
        throwsA(isA<ConfigurationError>()),
      );
    });

    test('lists every problem at once, not just the first', () {
      expect(
        () => BuildConfig.from(<String, String>{}),
        throwsA(
          isA<ConfigurationError>().having(
            (ConfigurationError error) => error.problems.length,
            'problems',
            5,
          ),
        ),
      );
    });

    test('a blank value is a missing one', () {
      expect(
        () => BuildConfig.from(validDefines()..['RC_APP_VERSION'] = '   '),
        throwsA(isA<ConfigurationError>()),
      );
    });

    test('two builds from the same defines are equal', () {
      expect(BuildConfig.from(validDefines()), BuildConfig.from(validDefines()));
    });
  });

  group('AppConfig.at', () {
    test('S-93 · everything derives from the one origin', () {
      final AppConfig config = AppConfig.at(
        BuildConfig.from(validDefines()),
        'https://claude.example.dev',
      );

      expect(config.apiBaseUrl, 'https://claude.example.dev/api');
      expect(config.wsUrl, 'wss://claude.example.dev/ws');
      expect(config.oidcIssuer, 'https://claude.example.dev/realms/remote-claude');
      expect(config.oidcClientId, 'remote-claude-mobile');
      expect(config.appVersion, '0.0.1');
    });

    test('splits the scopes into the list the OIDC package wants, ignoring empty segments', () {
      final AppConfig config = AppConfig.at(
        BuildConfig.from(validDefines()..['RC_OIDC_SCOPES'] = 'openid  profile '),
        'http://localhost:5173',
      );

      expect(config.scopeList, <String>['openid', 'profile']);
      expect(config.wsUrl, 'ws://localhost:5173/ws');
    });
  });
}
