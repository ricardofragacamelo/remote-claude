/// Registering this installation. One use case, one thing it does.
library;

import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

/// Tells the backend which installation this is, and learns whether it may decide anything.
///
/// It runs right after a successful sign-in, because that is the first moment there is a
/// credential to register under — and because the screen has to show the pending state from the
/// first frame rather than after somebody taps a disabled button.
class RegisterDevice {
  const RegisterDevice(this._devices);

  final DeviceRepository _devices;

  Future<RegisteredDevice> call({required String name, String? pushToken}) =>
      _devices.register(name: name, pushToken: pushToken);
}
