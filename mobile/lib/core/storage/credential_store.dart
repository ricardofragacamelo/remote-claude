/// Where the credential lives between launches.
///
/// The operating system's secure store — Keychain on iOS, EncryptedSharedPreferences on
/// Android — and never `SharedPreferences`, which is clear text in a file, readable on a rooted
/// or jailbroken device and in a backup. See docs/architecture/mobile/07-auth.md.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// What the auth feature needs from storage.
abstract interface class CredentialStore {
  /// The value stored under [key], or `null`.
  Future<String?> read(String key);

  /// Stores [value] under [key].
  Future<void> write(String key, String value);

  /// Forgets everything this app stored. What logging out does first.
  Future<void> clear();
}

/// The keys this app stores. Named here so nothing writes a credential under an ad-hoc string.
abstract final class CredentialKeys {
  /// The access token.
  static const String accessToken = 'rc.accessToken';

  /// The refresh token. Rotated by the provider on every use.
  static const String refreshToken = 'rc.refreshToken';

  /// The ID token, kept only so logging out can tell the provider whose session to end.
  static const String idToken = 'rc.idToken';

  /// `sub` of the signed-in user.
  static const String userId = 'rc.userId';

  /// When the access token stops being accepted, as an ISO 8601 instant.
  static const String expiresAt = 'rc.expiresAt';

  /// When the access token was issued, which is what makes proactive renewal possible.
  static const String issuedAt = 'rc.issuedAt';
}

/// The store this app uses.
///
/// `first_unlock_this_device` on Apple platforms is deliberate: the credential must **not**
/// synchronise through iCloud Keychain, because every device is registered individually and
/// syncing would break that model.
const FlutterSecureStorage appSecureStorage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  aOptions: AndroidOptions(),
);

/// [CredentialStore] over `flutter_secure_storage`.
class SecureCredentialStore implements CredentialStore {
  const SecureCredentialStore([FlutterSecureStorage storage = appSecureStorage])
    : _storage = storage;

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  @override
  Future<void> clear() => _storage.deleteAll();
}
