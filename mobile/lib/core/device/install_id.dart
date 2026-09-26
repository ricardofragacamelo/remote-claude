/// Which installation of the app this is.
///
/// The OIDC token proves *who*; this proves *where from*. It is minted here, on first run, and
/// kept in the operating system's secure store — deliberately **not** an identifier of the device,
/// which survives an uninstall and is therefore a privacy problem. This one goes with the app, and
/// a reinstall shows up as a new device with the old one still in the list to be revoked
/// ([D-01](../../../../docs/plans/02-mobile-approval/decisions.md)).
///
/// It lives in `core/` and is held synchronously, for the same reason the credential is: the
/// socket handshake and the HTTP client need it on every call, and neither may reach into a
/// feature.
library;

import 'dart:math';

import 'package:remote_claude/core/storage/credential_store.dart';

/// How many random bytes an installation id carries. 16 is a UUID's worth of entropy.
const int installIdBytes = 16;

/// Mints one, from a cryptographically secure source.
///
/// `Random.secure()` rather than a plugin: the value only has to be unguessable and unique inside
/// one account, and a dependency that has to be built for two platforms to produce 32 hex
/// characters would be a dependency to keep up to date for ever.
String mintInstallId([Random? random]) {
  final Random source = random ?? Random.secure();

  return List<String>.generate(
    installIdBytes,
    (_) => source.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

/// What the transport reads.
abstract interface class InstallIdSource {
  /// The installation id, or `null` before it has been loaded.
  String? get installId;
}

/// The one installation identity of the app.
class DeviceIdentity implements InstallIdSource {
  DeviceIdentity(this._store, [this._random]);

  final CredentialStore _store;

  /// Where the entropy comes from. A test passes a seeded one; nothing else passes anything.
  final Random? _random;

  String? _installId;

  @override
  String? get installId => _installId;

  /// Reads the stored id, minting and storing one the first time.
  ///
  /// Idempotent, and deliberately so: it runs at every start, and a second run has to give the
  /// same answer or every launch would look like a new device.
  Future<String> ensure() async {
    final String? stored = await _store.read(DeviceKeys.installId);

    if (stored != null && stored.isNotEmpty) {
      _installId = stored;
      return stored;
    }

    final String minted = mintInstallId(_random);
    await _store.write(DeviceKeys.installId, minted);
    _installId = minted;

    return minted;
  }
}
