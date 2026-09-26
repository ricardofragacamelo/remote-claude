/// The barrier between a phone that is unlocked in somebody's pocket and a command running on
/// their machine.
///
/// Complementary to the two-step confirmation, never a substitute for it: one protects against the
/// accidental tap, the other against the device in the wrong hands
/// (docs/architecture/mobile/07-auth.md#biometria).
library;

/// How asking the owner of the device went.
enum LockVerdict {
  /// The owner proved it, with biometrics or with the device PIN.
  confirmed,

  /// Anything else: cancelled, failed, locked out, or the prompt could not be shown. All of it is
  /// the same answer — **not** a yes.
  refused,
}

/// The operating system's lock screen, as the app can use it.
abstract interface class ApprovalLock {
  /// Whether this device has any lock at all — biometrics, or at least a PIN, pattern or password.
  Future<bool> isAvailable();

  /// Asks the owner, with biometrics when there are any and the device PIN otherwise.
  ///
  /// Biometrics that are unavailable or refused fall back to the PIN, **never** to approving
  /// without asking (S-44). [reason] is what the system prompt says, already translated.
  Future<LockVerdict> confirm(String reason);
}

/// Whether the owner wants to be asked before each approval.
abstract interface class ApprovalPreferences {
  /// On unless somebody turned it off.
  Future<bool> lockRequired();

  /// Turns the prompt on or off.
  Future<void> setLockRequired({required bool required});
}
