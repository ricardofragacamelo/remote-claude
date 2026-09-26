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

  test('clearing forgets every credential this app stored', () async {
    const CredentialStore store = SecureCredentialStore();
    for (final String key in CredentialKeys.all) {
      await store.write(key, 'value');
    }

    await store.clear();

    for (final String key in CredentialKeys.all) {
      expect(await store.read(key), isNull, reason: key);
    }
  });

  // A logout that reset the installation id would register a brand new device on the next
  // sign-in — one more row for somebody to approve, every time. It goes with the app, not with
  // the session (D-01).
  test('clearing keeps the installation id, which is not a credential', () async {
    const CredentialStore store = SecureCredentialStore();
    await store.write(DeviceKeys.installId, 'install-1');
    await store.write(CredentialKeys.accessToken, 'token');

    await store.clear();

    expect(await store.read(DeviceKeys.installId), 'install-1');
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

  // The list is what `clear` iterates, so a key added to the class and not to the list is a
  // credential that survives a logout.
  test('every credential key is in the list that clearing walks', () {
    expect(CredentialKeys.all, <String>{
      CredentialKeys.accessToken,
      CredentialKeys.refreshToken,
      CredentialKeys.idToken,
      CredentialKeys.userId,
      CredentialKeys.expiresAt,
      CredentialKeys.issuedAt,
    });
    expect(CredentialKeys.all, isNot(contains(DeviceKeys.installId)));
  });

  test('the Apple keychain item does not synchronise between devices', () {
    // Each device is registered individually; an iCloud-synced credential would break that.
    expect(appSecureStorage.iOptions.accessibility, KeychainAccessibility.first_unlock_this_device);
  });
}
