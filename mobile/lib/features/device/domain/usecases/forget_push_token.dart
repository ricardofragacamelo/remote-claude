/// Telling the backend to stop notifying this phone. What signing out does before anything else.
library;

import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

/// Registers this installation again **without** a push token.
///
/// The backend's registration updates what the app tells it, the token included, and never the
/// approval: a registration without one is how it forgets the one it had. Skipping this on sign-out
/// leaves the phone receiving permission notifications for an account it has left
/// (docs/architecture/mobile/07-auth.md#logout).
class ForgetPushToken {
  const ForgetPushToken(this._devices);

  final DeviceRepository _devices;

  Future<void> call({required String name}) async {
    await _devices.register(name: name);
  }
}
