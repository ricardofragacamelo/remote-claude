/// Configuration of the build, validated before anything else runs.
///
/// Flutter has no `.env` at runtime: everything comes from `--dart-define`, which is baked into
/// the binary. Nothing here is secret — an OIDC `client_id` is public by definition for a public
/// client — but a missing value has to stop the app from starting instead of surfacing as a blank
/// screen on somebody's phone.
library;

import 'package:equatable/equatable.dart';

/// Every value this build is compiled with, and the only list of them.
///
/// `String.fromEnvironment` is resolved at **compile time**, so the names have to be written out
/// literally — a loop over a list of names would read nothing. Written out twice they drift, which
/// is why the entry point and the end-to-end run share this one.
const Map<String, String> appDefines = <String, String>{
  'RC_API_URL': String.fromEnvironment('RC_API_URL'),
  'RC_WS_URL': String.fromEnvironment('RC_WS_URL'),
  'RC_OIDC_ISSUER': String.fromEnvironment('RC_OIDC_ISSUER'),
  'RC_OIDC_CLIENT_ID': String.fromEnvironment('RC_OIDC_CLIENT_ID'),
  'RC_OIDC_SCOPES': String.fromEnvironment('RC_OIDC_SCOPES'),
  'RC_OIDC_REDIRECT_URL': String.fromEnvironment('RC_OIDC_REDIRECT_URL'),
  'RC_APP_VERSION': String.fromEnvironment('RC_APP_VERSION'),
};

/// Raised when the build was compiled without a value the app cannot invent.
///
/// It lists **every** problem at once. Reporting the first one only turns one bad build into as
/// many rebuild cycles as there are missing variables.
class ConfigurationError extends Error {
  ConfigurationError(this.problems);

  /// One line per variable, saying what is wrong with it.
  final List<String> problems;

  @override
  String toString() =>
      'ConfigurationError: the build is missing configuration\n  - ${problems.join('\n  - ')}';
}

/// The values the app needs to exist.
class AppConfig extends Equatable {
  const AppConfig({
    required this.apiBaseUrl,
    required this.wsUrl,
    required this.oidcIssuer,
    required this.oidcClientId,
    required this.oidcScopes,
    required this.oidcRedirectUrl,
    required this.appVersion,
  });

  /// Reads a map of defines, failing with every problem at once.
  ///
  /// @throws [ConfigurationError] when a value is absent, empty or not the shape it claims
  factory AppConfig.from(Map<String, String> defines) {
    final List<String> problems = <String>[];

    String required(String key, {String? scheme}) {
      final String value = defines[key]?.trim() ?? '';

      if (value.isEmpty) {
        problems.add('$key is required and was empty');
        return '';
      }

      if (scheme != null && !value.startsWith(scheme)) {
        problems.add('$key must start with "$scheme", got "$value"');
      }

      return value;
    }

    final AppConfig config = AppConfig(
      apiBaseUrl: required('RC_API_URL', scheme: 'http'),
      wsUrl: required('RC_WS_URL', scheme: 'ws'),
      oidcIssuer: required('RC_OIDC_ISSUER', scheme: 'http'),
      oidcClientId: required('RC_OIDC_CLIENT_ID'),
      oidcScopes: required('RC_OIDC_SCOPES'),
      oidcRedirectUrl: required('RC_OIDC_REDIRECT_URL'),
      appVersion: required('RC_APP_VERSION'),
    );

    if (problems.isNotEmpty) {
      throw ConfigurationError(problems);
    }

    return config;
  }

  /// Base URL of the backend's HTTP API.
  final String apiBaseUrl;

  /// URL of the WebSocket gateway.
  final String wsUrl;

  /// Issuer of the tokens. Changing it changes identity providers; no code knows its name.
  final String oidcIssuer;

  /// Public client of this app. Public clients hold no secret — that is what PKCE replaces.
  final String oidcClientId;

  /// Space-separated scopes requested at sign-in.
  final String oidcScopes;

  /// Deep link the provider sends the system browser back to.
  final String oidcRedirectUrl;

  /// Version of this build, reported in the handshake and in every log line.
  final String appVersion;

  /// Scopes as `flutter_appauth` wants them.
  List<String> get scopeList =>
      oidcScopes.split(' ').where((String scope) => scope.isNotEmpty).toList(growable: false);

  @override
  List<Object?> get props => <Object?>[
    apiBaseUrl,
    wsUrl,
    oidcIssuer,
    oidcClientId,
    oidcScopes,
    oidcRedirectUrl,
    appVersion,
  ];
}
