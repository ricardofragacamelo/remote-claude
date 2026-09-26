/// Reads the backend's device payload as a [RegisteredDevice].
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/features/device/domain/entities/registered_device.dart';

/// The status named by [raw].
///
/// An unknown value is [DeviceStatus.unknown], never an exception: an app already on a store has
/// to survive a state added after it shipped, and the screen treats not-knowing exactly as it
/// treats pending — watch, do not decide.
DeviceStatus deviceStatusFrom(String raw) => switch (raw) {
  'pending' => DeviceStatus.pending,
  'approved' => DeviceStatus.approved,
  'revoked' => DeviceStatus.revoked,
  _ => DeviceStatus.unknown,
};

/// The device in [payload], or `null` when the answer is not one.
RegisteredDevice? deviceFrom(Object? payload) {
  if (payload is! Map<String, Object?>) {
    return null;
  }

  final Object? id = payload['id'];
  final Object? name = payload['name'];
  final Object? status = payload['status'];
  final Object? pushEnabled = payload['pushEnabled'];

  if (id is! String || name is! String || status is! String) {
    return null;
  }

  return RegisteredDevice(
    id: id,
    name: name,
    status: deviceStatusFrom(status),
    pushEnabled: pushEnabled is bool && pushEnabled,
  );
}

/// The device [deviceId] in a `GET /devices` body, or `null` when it is not there.
RegisteredDevice? deviceIn(Object? body, String deviceId) {
  final Object? devices = body is Map<String, Object?> ? body['devices'] : null;

  if (devices is! List<Object?>) {
    return null;
  }

  for (final Object? entry in devices) {
    final RegisteredDevice? device = deviceFrom(entry);
    if (device != null && device.id == deviceId) {
      return device;
    }
  }

  return null;
}
