/// The operating system's lock screen, and the owner's preference about it.
///
/// `local_auth` stops existing here: nothing above this file knows what a `LocalAuthException` is,
/// and every way the prompt can fail becomes the same answer — **not** a yes.
library;

import 'package:local_auth/local_auth.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';

/// Where the preference is stored.
///
/// Not a credential, so it is not in `CredentialKeys.all` and a logout does not reset it: whether
/// this phone asks for a fingerprint is a property of the phone, not of the account on it.
const String approvalLockKey = 'rc.approvalLockRequired';

/// [ApprovalLock] over `local_auth`.
class LocalAuthApprovalLock implements ApprovalLock {
  LocalAuthApprovalLock({required this._logger, LocalAuthentication? auth})
    : _auth = auth ?? LocalAuthentication();

  final AppLogger _logger;
  final LocalAuthentication _auth;

  /// Biometrics **or** a PIN, pattern or password: either is a lock.
  @override
  Future<bool> isAvailable() async {
    try {
      final bool supported = await _auth.isDeviceSupported();
      _logger.debug(
        'device lock checked',
        op: LogOp.deviceLock,
        fields: <String, Object?>{'available': supported},
      );
      return supported;
    } on Exception catch (error) {
      // A platform that cannot say is a platform on which nobody can prove they own the phone.
      _logger.warn(
        'device lock could not be checked',
        op: LogOp.deviceLock,
        fields: <String, Object?>{'err': error.runtimeType.toString()},
      );
      return false;
    }
  }

  /// `biometricOnly: false` is the rule written as an argument: biometrics that are missing or
  /// refused fall back to the device PIN, never to approving without asking (S-44).
  @override
  Future<LockVerdict> confirm(String reason) async {
    _logger.debug('device lock asked', op: LogOp.deviceLock);

    try {
      final bool confirmed = await _auth.authenticate(
        localizedReason: reason,
        persistAcrossBackgrounding: true,
      );

      _logger.debug(
        'device lock answered',
        op: LogOp.deviceLock,
        fields: <String, Object?>{'confirmed': confirmed},
      );

      return confirmed ? LockVerdict.confirmed : LockVerdict.refused;
    } on Exception catch (error) {
      _logger.warn(
        'device lock could not be shown',
        op: LogOp.deviceLock,
        fields: <String, Object?>{'err': error.runtimeType.toString()},
      );
      return LockVerdict.refused;
    }
  }
}

/// [ApprovalPreferences] in the operating system's secure store.
///
/// The secure store rather than a second storage dependency for one boolean. On by default: an
/// absent value, or anything but the literal `false`, asks.
class SecureApprovalPreferences implements ApprovalPreferences {
  const SecureApprovalPreferences(this._store);

  final CredentialStore _store;

  @override
  Future<bool> lockRequired() async => await _store.read(approvalLockKey) != 'false';

  @override
  Future<void> setLockRequired({required bool required}) =>
      _store.write(approvalLockKey, '$required');
}
