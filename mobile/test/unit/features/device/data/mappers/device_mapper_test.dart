import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/device/data/mappers/device_mapper.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';

const Map<String, Object?> payload = <String, Object?>{
  'id': 'dev_1',
  'name': 'Pixel 8',
  'platform': 'android',
  'appVersion': '1.0.0',
  'locale': 'pt-BR',
  'status': 'pending',
  'pushEnabled': true,
  'registeredAt': '2026-09-18T10:00:00.000Z',
  'lastSeenAt': '2026-09-18T10:00:00.000Z',
  'approvedAt': null,
  'revokedAt': null,
};

void main() {
  group('deviceStatusFrom', () {
    test('reads the three states the backend has', () {
      expect(deviceStatusFrom('pending'), DeviceStatus.pending);
      expect(deviceStatusFrom('approved'), DeviceStatus.approved);
      expect(deviceStatusFrom('revoked'), DeviceStatus.revoked);
    });

    // An app already on a store has to survive a state added after it shipped, and the safe
    // reading of "I do not know what this is" is the same as pending: watch, do not decide.
    test('reads anything else as unknown rather than throwing', () {
      expect(deviceStatusFrom('quarantined'), DeviceStatus.unknown);
      expect(deviceStatusFrom(''), DeviceStatus.unknown);
    });
  });

  group('deviceFrom', () {
    test('reads the payload as the device it describes', () {
      final RegisteredDevice? device = deviceFrom(payload);

      expect(device, isNotNull);
      expect(device!.id, 'dev_1');
      expect(device.name, 'Pixel 8');
      expect(device.status, DeviceStatus.pending);
      expect(device.pushEnabled, isTrue);
    });

    test('answers null for something that is not a device', () {
      expect(deviceFrom(null), isNull);
      expect(deviceFrom('a string'), isNull);
      expect(deviceFrom(<String, Object?>{}), isNull);
    });

    test('answers null when a field it needs is the wrong shape', () {
      expect(deviceFrom(<String, Object?>{...payload, 'id': 7}), isNull);
      expect(deviceFrom(<String, Object?>{...payload, 'name': null}), isNull);
      expect(deviceFrom(<String, Object?>{...payload, 'status': 3}), isNull);
    });

    test('reads a missing pushEnabled as false, never as true', () {
      final Map<String, Object?> without = <String, Object?>{...payload}..remove('pushEnabled');

      expect(deviceFrom(without)?.pushEnabled, isFalse);
    });

    test('ignores a key it has never heard of', () {
      expect(deviceFrom(<String, Object?>{...payload, 'somethingNew': 1}), isNotNull);
    });
  });

  group('RegisteredDevice', () {
    test('only an approved device decides', () {
      RegisteredDevice at(DeviceStatus status) =>
          RegisteredDevice(id: 'dev_1', name: 'Pixel 8', status: status, pushEnabled: true);

      expect(at(DeviceStatus.approved).canDecide, isTrue);
      expect(at(DeviceStatus.pending).canDecide, isFalse);
      expect(at(DeviceStatus.revoked).canDecide, isFalse);
      expect(at(DeviceStatus.unknown).canDecide, isFalse);
    });

    test('compares by value, so a rebuild is not a change', () {
      const RegisteredDevice one = RegisteredDevice(
        id: 'dev_1',
        name: 'Pixel 8',
        status: DeviceStatus.pending,
        pushEnabled: true,
      );

      expect(
        one,
        const RegisteredDevice(
          id: 'dev_1',
          name: 'Pixel 8',
          status: DeviceStatus.pending,
          pushEnabled: true,
        ),
      );
    });
  });

  group('deviceIn', () {
    test('finds the device by its id in the list', () {
      expect(
        deviceIn(<String, Object?>{
          'devices': <Object?>[
            'not a device',
            <String, Object?>{'id': 'dev_2', 'name': 'b', 'status': 'pending'},
          ],
        }, 'dev_2')?.status,
        DeviceStatus.pending,
      );
    });

    test('answers null when it is not listed, or the body is not a list', () {
      expect(deviceIn(<String, Object?>{'devices': <Object?>[]}, 'dev_1'), isNull);
      expect(deviceIn(<String, Object?>{'devices': 'x'}, 'dev_1'), isNull);
      expect(deviceIn('x', 'dev_1'), isNull);
    });
  });
}
