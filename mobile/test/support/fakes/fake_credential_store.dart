/// A credential store in memory, so a test can see exactly what survived a logout.
library;

import 'package:remote_claude/core/storage/credential_store.dart';

/// [CredentialStore] over a map.
class FakeCredentialStore implements CredentialStore {
  FakeCredentialStore([Map<String, String>? initial]) : values = <String, String>{...?initial};

  /// Everything currently stored.
  final Map<String, String> values;

  /// How many times something was written, so a test can assert a read did not write.
  int writes = 0;

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    writes += 1;
    values[key] = value;
  }

  @override
  Future<void> clear() async {
    // Key by key, exactly as the real store does: the installation id is not a credential and
    // has to survive a logout.
    for (final String key in CredentialKeys.all) {
      values.remove(key);
    }
  }
}
