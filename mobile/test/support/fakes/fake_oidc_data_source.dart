/// An OIDC provider a test scripts.
library;

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/auth/data/datasources/oidc_auth_data_source.dart';

/// Answers what the test set, and records what it was asked.
class FakeOidcDataSource implements OidcAuthDataSource {
  FakeOidcDataSource({this.response});

  /// What [authorize] and [refresh] answer.
  TokenResponse? response;

  /// When set, both throw it instead.
  Object? failure;

  /// The refresh token the last [refresh] was given.
  String? lastRefreshToken;

  /// The id token hint the last [endSession] was given.
  String? lastIdTokenHint;

  /// Counters.
  int authorizations = 0;
  int refreshes = 0;
  int endSessions = 0;

  @override
  Future<TokenResponse> authorize() async {
    authorizations += 1;
    return _answer();
  }

  @override
  Future<TokenResponse> refresh(String refreshToken) async {
    refreshes += 1;
    lastRefreshToken = refreshToken;
    return _answer();
  }

  @override
  Future<void> endSession(String? idToken) async {
    endSessions += 1;
    lastIdTokenHint = idToken;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown as Exception;
    }
  }

  TokenResponse _answer() {
    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
    return response!;
  }
}

/// An in-memory credential store.
class InMemoryCredentialStore implements CredentialStore {
  /// What has been written.
  final Map<String, String> values = <String, String>{};

  /// How many times everything was cleared.
  int clears = 0;

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> clear() async {
    clears += 1;
    values.clear();
  }
}
