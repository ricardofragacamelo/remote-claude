/// Configuration of the build, validated before anything else runs.
///
/// Flutter has no `.env` at runtime: everything comes from `--dart-define`, which is baked into
/// the binary — the addresses the build offers among it. Which of them the app talks through is the
/// person's choice, stored on the phone (plan 10, F5). Nothing here is secret — an OIDC `client_id` is public by definition for a public
/// client — but a missing value has to stop the app from starting instead of surfacing as a blank
/// screen on somebody's phone.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_origin.dart';

/// Every value this build is compiled with, and the only list of them.
///
/// `String.fromEnvironment` is resolved at **compile time**, so the names have to be written out
/// literally — a loop over a list of names would read nothing. Written out twice they drift, which
/// is why the entry point and the end-to-end run share this one.
const Map<String, String> appDefines = <String, String>{
  'RC_INTERNAL_URL': String.fromEnvironment('RC_INTERNAL_URL'),
  'RC_EXTERNAL_URL': String.fromEnvironment('RC_EXTERNAL_URL'),
  'RC_OIDC_REALM_PATH': String.fromEnvironment('RC_OIDC_REALM_PATH'),
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

/// What this build was compiled with: the addresses it offers and the login's fixed parts.
///
/// The addresses are **origins** — the API, the socket and the issuer all derive from the one the
/// person chose (D-13) — and each may be empty: an empty one is a radio of the address screen that
/// is off (D-12). What must exist does, or the app does not start.
class BuildConfig extends Equatable {
  const BuildConfig({
    required this.origins,
    required this.realmPath,
    required this.oidcClientId,
    required this.oidcScopes,
    required this.oidcRedirectUrl,
    required this.appVersion,
  });

  /// Reads a map of defines, failing with every problem at once.
  ///
  /// @throws [ConfigurationError] when a value is absent, empty or not the shape it claims
  factory BuildConfig.from(Map<String, String> defines) {
    final _Defines read = _Defines(defines);

    final BuildConfig config = BuildConfig(
      origins: DefinedOrigins(
        internal: read.origin('RC_INTERNAL_URL'),
        external: read.origin('RC_EXTERNAL_URL'),
      ),
      realmPath: read.path('RC_OIDC_REALM_PATH'),
      oidcClientId: read.required('RC_OIDC_CLIENT_ID'),
      oidcScopes: read.required('RC_OIDC_SCOPES'),
      oidcRedirectUrl: read.required('RC_OIDC_REDIRECT_URL'),
      appVersion: read.required('RC_APP_VERSION'),
    );

    if (read.problems.isNotEmpty) {
      throw ConfigurationError(read.problems);
    }

    return config;
  }

  /// The internal and the external address, as far as this build defines them.
  final DefinedOrigins origins;

  /// Where the realm sits on any origin — `/realms/<realm>`.
  final String realmPath;

  final String oidcClientId;
  final String oidcScopes;
  final String oidcRedirectUrl;
  final String appVersion;

  @override
  List<Object?> get props => <Object?>[
    origins,
    realmPath,
    oidcClientId,
    oidcScopes,
    oidcRedirectUrl,
    appVersion,
  ];
}

/// Reads defines one by one, keeping every problem for the end.
class _Defines {
  _Defines(this._values);

  final Map<String, String> _values;

  /// One line per variable that is wrong, saying how.
  final List<String> problems = <String>[];

  String _raw(String key) => _values[key]?.trim() ?? '';

  /// A value that must be there.
  String required(String key) {
    final String value = _raw(key);

    if (value.isEmpty) {
      problems.add('$key is required and was empty');
    }

    return value;
  }

  /// A path that must be there and start with `/`.
  String path(String key) {
    final String value = required(key);

    if (value.isNotEmpty && !value.startsWith('/')) {
      problems.add('$key must start with "/", got "$value"');
    }

    return value;
  }

  /// An origin, normalised — or `null`, empty: a radio that is off (D-12).
  String? origin(String key) {
    final String value = _raw(key);
    final OriginCheck? check = value.isEmpty ? null : checkOrigin(value);

    if (check is InvalidOrigin) {
      problems.add('$key is not an origin the app may use (${check.problem.name}): "$value"');
    }

    return check is ValidOrigin ? check.origin : null;
  }
}

/// The values the app needs to talk to the server: the build's, laid over one origin.
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

  /// [build] talking through [origin]: the API, the socket and the issuer all derive from it.
  factory AppConfig.at(BuildConfig build, String origin) {
    final ConnectionEndpoints endpoints = ConnectionEndpoints.of(origin, build.realmPath);

    return AppConfig(
      apiBaseUrl: endpoints.api,
      wsUrl: endpoints.socket,
      oidcIssuer: endpoints.issuer,
      oidcClientId: build.oidcClientId,
      oidcScopes: build.oidcScopes,
      oidcRedirectUrl: build.oidcRedirectUrl,
      appVersion: build.appVersion,
    );
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
