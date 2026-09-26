/// Whether notifications can reach this installation, fixed by the test.
///
/// Every screen that shows the reach banner reads `pushControllerProvider`, and the real one asks
/// the platform and re-registers the device to answer. A test about a **screen** says what the
/// answer is and moves on.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/features/device/device.dart';

/// Overrides the controller with one that answers [value] and asks nobody anything.
Override pushControllerAnswering(AsyncValue<PushReach> value) =>
    pushControllerProvider.overrideWith(() => StubPushController(value));

/// A controller whose answer the test chose, and which records what it was asked to do.
class StubPushController extends PushController {
  StubPushController(this._value);

  final AsyncValue<PushReach> _value;

  /// How many times the settings screen was asked for.
  int settingsOpened = 0;

  /// How many times the permission was re-read.
  int rechecks = 0;

  @override
  Future<PushReach> build() async {
    final AsyncValue<PushReach> value = _value;

    if (value is AsyncError<PushReach>) {
      throw value.error;
    }

    if (value is AsyncLoading<PushReach>) {
      // Never settles: that is what "still working it out" actually looks like.
      return Completer<PushReach>().future;
    }

    return value.value!;
  }

  @override
  Future<void> openSettings() async => settingsOpened += 1;

  @override
  Future<void> recheck() async => rechecks += 1;
}

/// A reach in a given state.
PushReach aReach({
  PushPermission permission = PushPermission.granted,
  bool rotationFailed = false,
}) => PushReach(permission: permission, rotationFailed: rotationFailed);
