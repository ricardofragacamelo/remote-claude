/// Asking the backend where this installation stands, without changing anything about it.
library;

import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

/// Reads the status of the device [call] is given.
///
/// What a refused socket calls for: the refusal is either a token that expired — renewed on its
/// own — or a phone revoked while the app was open, and only the backend can say which (S-56).
class CheckDevice {
  const CheckDevice(this._devices);

  final DeviceRepository _devices;

  Future<RegisteredDevice> call(String deviceId) => _devices.current(deviceId);
}
