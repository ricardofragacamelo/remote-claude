/// The one question before a yes leaves this phone: is the person holding it its owner?
library;

import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';

/// What the gate decided.
enum ApprovalGate {
  /// The yes may go.
  open,

  /// The owner did not confirm. Nothing is sent, and the card stays (S-43).
  refused,

  /// The device has no lock at all, so it may not approve — whatever the preference says
  /// ([D-07](../../../../../docs/plans/02-mobile-approval/decisions.md#d-07--quando-o-aparelho-não-tem-barreira),
  /// [D-25](../../../../../docs/plans/02-mobile-approval/decisions.md#d-25--o-que-a-chave-desliga)).
  noLock,
}

/// Guards an approval behind the device's lock.
///
/// The order of the three checks is the rule:
///
/// 1. **a device with no lock never approves**, and the preference cannot change that. Otherwise a
///    phone with no PIN would approve after one tap on a switch, and D-07 would be a suggestion;
/// 2. **the owner may choose not to be asked** — biometrics are "on by default, and can be turned
///    off";
/// 3. **only a confirmation opens.** Anything the prompt answers other than a confirmation keeps
///    the yes here (S-43, S-44).
///
/// Refusing is never gated: it is the safe answer, and a barrier in front of it only delays "no".
class GateApproval {
  const GateApproval(this._lock, this._preferences);

  final ApprovalLock _lock;
  final ApprovalPreferences _preferences;

  Future<ApprovalGate> call(String reason) async {
    if (!await _lock.isAvailable()) {
      return ApprovalGate.noLock;
    }

    if (!await _preferences.lockRequired()) {
      return ApprovalGate.open;
    }

    return switch (await _lock.confirm(reason)) {
      LockVerdict.confirmed => ApprovalGate.open,
      LockVerdict.refused => ApprovalGate.refused,
    };
  }
}

/// Reads and changes whether approvals ask for the device lock.
class ApprovalLockSetting {
  const ApprovalLockSetting(this._lock, this._preferences);

  final ApprovalLock _lock;
  final ApprovalPreferences _preferences;

  /// Whether each approval asks.
  Future<bool> isRequired() => _preferences.lockRequired();

  /// Whether this device can approve at all — the reason the screen gives when it cannot.
  Future<bool> hasLock() => _lock.isAvailable();

  /// Turns the prompt on or off.
  Future<void> change({required bool required}) => _preferences.setLockRequired(required: required);
}
