import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/storage/credential_store.dart';

import '../../../support/fakes/fake_credential_store.dart';

void main() {
  late FakeCredentialStore store;

  setUp(() {
    store = FakeCredentialStore();
  });

  group('mintInstallId', () {
    test('is 32 hexadecimal characters — a UUID worth of entropy, without the plugin', () {
      expect(mintInstallId(), matches(RegExp(r'^[0-9a-f]{32}$')));
    });

    test('pads a byte below sixteen, so every id is the same length', () {
      expect(mintInstallId(Random(1)), hasLength(installIdBytes * 2));
    });

    test('does not answer the same thing twice', () {
      expect(mintInstallId(), isNot(mintInstallId()));
    });
  });

  group('DeviceIdentity', () {
    test('has nothing before it is loaded — the transport sends no header then', () {
      expect(DeviceIdentity(store).installId, isNull);
    });

    test('mints one on first run and stores it in the secure store', () async {
      final DeviceIdentity identity = DeviceIdentity(store);

      final String minted = await identity.ensure();

      expect(store.values[DeviceKeys.installId], minted);
      expect(identity.installId, minted);
    });

    test('answers the same thing every time — every launch is not a new device', () async {
      final DeviceIdentity identity = DeviceIdentity(store);
      final String first = await identity.ensure();

      expect(await identity.ensure(), first);
      expect(await DeviceIdentity(store).ensure(), first);
      expect(store.writes, 1);
    });

    test('reads back the one that was already there', () async {
      store.values[DeviceKeys.installId] = 'already-here';

      expect(await DeviceIdentity(store).ensure(), 'already-here');
      expect(store.writes, 0);
    });

    test('mints a new one when the stored value is empty', () async {
      store.values[DeviceKeys.installId] = '';

      expect(await DeviceIdentity(store).ensure(), isNotEmpty);
    });

    // A logout that reset it would register a brand new device on the next sign-in — one more
    // row for somebody to approve, every time. It goes with the app, not with the session.
    test('survives a logout', () async {
      final String before = await DeviceIdentity(store).ensure();
      await store.write(CredentialKeys.accessToken, 'token');

      await store.clear();

      expect(store.values[CredentialKeys.accessToken], isNull);
      expect(await DeviceIdentity(store).ensure(), before);
    });
  });
}
