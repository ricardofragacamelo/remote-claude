/// What the device use cases need, stated as an interface they own.
library;

import 'package:remote_claude/features/device/domain/entities/registered_device.dart';

/// The registration of this installation, against the backend.
abstract interface class DeviceRepository {
  /// Registers this installation, or updates the registration it already has.
  ///
  /// Idempotent on the backend: the same installation id moves a row rather than adding one, and
  /// it never changes the approval. It is called on every sign-in and on every push-token
  /// rotation, so it has to be the cheapest thing in the flow.
  ///
  /// @throws [Failure] never an exception of the transport
  Future<RegisteredDevice> register({required String name, String? pushToken});

  /// Where the device [deviceId] stands now, **without** registering anything.
  ///
  /// A read, not a registration: registering again would also overwrite the push token, and the
  /// reason to ask is usually a refused socket — which is as often an expired token as a revoked
  /// phone.
  ///
  /// @throws [Failure] when the backend refuses to answer, or no longer lists the device
  Future<RegisteredDevice> current(String deviceId);
}
