/// The registration of this installation, fixed by the test.
///
/// Every screen that shows the approval banner reads `deviceControllerProvider`, and the real one
/// reaches the auth feature, the HTTP client and the secure store to answer. A test about a
/// **screen** says what the answer is and moves on.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/features/device/device.dart';

/// A device in a given state, which is what most screens need it to be.
RegisteredDevice aRegisteredDevice({
  DeviceStatus status = DeviceStatus.approved,
  String id = 'dev_1',
  String name = 'android 14',
  bool pushEnabled = false,
}) => RegisteredDevice(id: id, name: name, status: status, pushEnabled: pushEnabled);

/// Overrides the controller with one that answers [value] and asks nobody anything.
Override deviceControllerAnswering(AsyncValue<RegisteredDevice?> value) =>
    deviceControllerProvider.overrideWith(() => StubDeviceController(value));

/// A controller whose answer the test chose.
class StubDeviceController extends DeviceController {
  StubDeviceController(this._value);

  final AsyncValue<RegisteredDevice?> _value;

  @override
  Future<RegisteredDevice?> build() async {
    final AsyncValue<RegisteredDevice?> value = _value;

    if (value is AsyncError<RegisteredDevice?>) {
      throw value.error;
    }

    if (value is AsyncLoading<RegisteredDevice?>) {
      // Never settles: that is what "still registering" actually looks like.
      return Completer<RegisteredDevice?>().future;
    }

    return value.value;
  }
}
