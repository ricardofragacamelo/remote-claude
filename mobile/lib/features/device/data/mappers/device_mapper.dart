/// Reads the backend's device payload as a [RegisteredDevice] (plan 28, B-48).
///
/// Read by the generated types of the contract — after checking the shape first: the generated
/// readers assert their fields, which is right for a frame this app built and wrong for an answer
/// from the network (`mobile/lib/core/network/contracts/frame_codec.dart`). A field the contract
/// requires but this build does not carry into the entity (`platform`, `registeredAt`…) is
/// normalised to a safe value rather than costing the whole device.
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
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

bool _looksLikeDevice(Map<String, Object?> payload) =>
    payload['id'] is String && payload['name'] is String && payload['status'] is String;

/// [payload], with the fields the contract requires but this build never reads coerced to a value
/// that reads rather than throws — a device missing `pushEnabled` is read as not having it, never
/// as an unreadable device.
Map<String, Object?> _normalized(Map<String, Object?> payload) => <String, Object?>{
  ...payload,
  'platform': payload['platform'] is String ? payload['platform'] : '',
  'appVersion': payload['appVersion'] is String ? payload['appVersion'] : '',
  'locale': payload['locale'] is String ? payload['locale'] : '',
  'pushEnabled': payload['pushEnabled'] == true,
  'registeredAt': payload['registeredAt'] is String ? payload['registeredAt'] : '',
  'lastSeenAt': payload['lastSeenAt'] is String ? payload['lastSeenAt'] : '',
};

RegisteredDevice _deviceFrom({
  required String id,
  required String name,
  required String statusRaw,
  required bool pushEnabled,
}) => RegisteredDevice(
  id: id,
  name: name,
  status: deviceStatusFrom(statusRaw),
  pushEnabled: pushEnabled,
);

/// The device in [payload], or `null` when the answer is not one.
RegisteredDevice? deviceFrom(Object? payload) {
  if (payload is! Map<String, Object?> || !_looksLikeDevice(payload)) {
    return null;
  }

  final wire.DevicePayload body = wire.DevicePayload.fromJson(_normalized(payload));

  return _deviceFrom(
    id: body.id,
    name: body.name,
    statusRaw: body.status,
    pushEnabled: body.pushEnabled,
  );
}

/// The device [deviceId] in a `GET /devices` body, or `null` when it is not there.
RegisteredDevice? deviceIn(Object? body, String deviceId) {
  final Object? devices = body is Map<String, Object?> ? body['devices'] : null;

  if (devices is! List<Object?>) {
    return null;
  }

  final List<Object?> validRows = devices
      .where((Object? row) => row is Map<String, Object?> && _looksLikeDevice(row))
      .map((Object? row) => _normalized(row! as Map<String, Object?>))
      .toList(growable: false);

  final wire.DeviceListPayload list = wire.DeviceListPayload.fromJson(<String, Object?>{
    'devices': validRows,
  });

  for (final wire.Device device in list.devices) {
    if (device.id == deviceId) {
      return _deviceFrom(
        id: device.id,
        name: device.name,
        statusRaw: device.status,
        pushEnabled: device.pushEnabled,
      );
    }
  }

  return null;
}
