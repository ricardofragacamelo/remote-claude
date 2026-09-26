/// A device repository a test scripts.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

/// What one call to [DeviceRepository.register] was given.
class RegistrationCall {
  const RegistrationCall(this.name, this.pushToken);

  final String name;
  final String? pushToken;
}

/// Answers what the test set, and records what it was asked to do.
class FakeDeviceRepository implements DeviceRepository {
  FakeDeviceRepository({this.produced});

  /// What [register] answers.
  RegisteredDevice? produced;

  /// When set, [register] throws it instead.
  Failure? failure;

  /// Every registration, in order.
  final List<RegistrationCall> registrations = <RegistrationCall>[];

  @override
  Future<RegisteredDevice> register({required String name, String? pushToken}) async {
    registrations.add(RegistrationCall(name, pushToken));

    final Failure? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return produced!;
  }

  /// What [current] answers; the registration's answer when unset.
  RegisteredDevice? checkedAs;

  /// How many times the status was asked for.
  int checks = 0;

  @override
  Future<RegisteredDevice> current(String deviceId) async {
    checks += 1;

    final Failure? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return checkedAs ?? produced!;
  }
}
