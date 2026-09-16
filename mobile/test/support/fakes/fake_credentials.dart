/// A credential source a test controls.
library;

import 'package:remote_claude/core/network/credentials.dart';

/// Answers whatever the test set, and counts renewals.
class FakeCredentials implements CredentialSource {
  FakeCredentials({this.accessToken = 'token', this.locale = 'en', this.renewal});

  @override
  String? accessToken;

  @override
  String locale;

  /// What [renew] answers. `null` means renewal failed.
  String? renewal;

  /// How many times [renew] was called.
  int renewals = 0;

  @override
  Future<String?> renew() async {
    renewals += 1;
    accessToken = renewal;
    return renewal;
  }
}
