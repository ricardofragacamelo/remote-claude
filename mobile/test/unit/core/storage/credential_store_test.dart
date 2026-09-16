import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/storage/credential_store.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  test('writes and reads back', () async {
    const CredentialStore store = SecureCredentialStore();

    await store.write(CredentialKeys.accessToken, 'token');

    expect(await store.read(CredentialKeys.accessToken), 'token');
  });

  test('a key nobody wrote reads as null', () async {
    expect(await const SecureCredentialStore().read(CredentialKeys.refreshToken), isNull);
  });

  test('clearing forgets everything this app stored', () async {
    const CredentialStore store = SecureCredentialStore();
    await store.write(CredentialKeys.accessToken, 'token');
    await store.write(CredentialKeys.refreshToken, 'refresh');

    await store.clear();

    expect(await store.read(CredentialKeys.accessToken), isNull);
    expect(await store.read(CredentialKeys.refreshToken), isNull);
  });

  test('the credential keys are distinct — nothing overwrites anything else', () {
    expect(<String>{
      CredentialKeys.accessToken,
      CredentialKeys.refreshToken,
      CredentialKeys.idToken,
      CredentialKeys.userId,
      CredentialKeys.expiresAt,
      CredentialKeys.issuedAt,
    }, hasLength(6));
  });

  test('the Apple keychain item does not synchronise between devices', () {
    // Each device is registered individually; an iCloud-synced credential would break that.
    expect(appSecureStorage.iOptions.accessibility, KeychainAccessibility.first_unlock_this_device);
  });
}
