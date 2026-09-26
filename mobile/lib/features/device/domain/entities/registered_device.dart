/// This installation, as the backend sees it.
///
/// Pure Dart: no `flutter/*`, no `dio`. That is what makes the rule below testable without a
/// widget or a network. See docs/architecture/mobile/01-architecture.md.
library;

import 'package:equatable/equatable.dart';

/// Where this device is in its life, as the backend reports it.
///
/// A value the app does not know is read as [unknown] rather than throwing: an app already on a
/// store has to survive a state added after it shipped, and the safe reading of "I do not know
/// what this is" is the same as pending — watch, do not decide.
enum DeviceStatus {
  /// Registered, waiting for somebody to approve it from the browser.
  pending,

  /// May answer a permission request.
  approved,

  /// Was approved and is not any more. Terminal.
  revoked,

  /// A status this build does not know.
  unknown,
}

/// The registration of this installation.
class RegisteredDevice extends Equatable {
  const RegisteredDevice({
    required this.id,
    required this.name,
    required this.status,
    required this.pushEnabled,
  });

  /// The backend's id for this device, which the devices screen acts on.
  final String id;

  /// What the person sees in the approval list.
  final String name;

  final DeviceStatus status;

  /// Whether the backend holds a push token for this installation.
  final bool pushEnabled;

  /// Whether this device may answer a permission request.
  ///
  /// The asymmetry this expresses is the point of the whole phase: a device that cannot decide can
  /// still **watch** a session, and the screen says why the controls are off. A disabled button
  /// with no reason is a security rule that looks like a bug
  /// (docs/architecture/mobile/07-auth.md).
  bool get canDecide => status == DeviceStatus.approved;

  @override
  List<Object?> get props => <Object?>[id, name, status, pushEnabled];
}
