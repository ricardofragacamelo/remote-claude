/// Whether this installation may decide anything, and how the screen learns it.
///
/// The controller is the only layer that knows both sides: the widget above, the use case below.
library;

import 'package:remote_claude/core/session/sign_out_hooks.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/device/device_providers.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/domain/usecases/forget_push_token.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'device_controller.g.dart';

/// The registration of this installation, or `null` while nobody is signed in.
///
/// It registers as soon as there is a credential to register under, and not a moment later: the
/// screen has to be able to say "waiting for approval" on its first frame, rather than after
/// somebody has tapped a control that does nothing.
///
/// A failure lands in the state as an error rather than being thrown at the widget. It is not
/// fatal — a device that could not register watches sessions exactly as a pending one does — so
/// the banner renders the failure and the rest of the app carries on.
/// The name of the sign-out step that stops this phone being notified.
const String pushTokenStep = 'device.pushToken';

@Riverpod(keepAlive: true)
class DeviceController extends _$DeviceController {
  @override
  Future<RegisteredDevice?> build() async {
    // `.future` and not the `AsyncValue`: restoring the session from the secure store is itself
    // asynchronous, and reading the value while that is still in flight answers `null` — which
    // would be read as "nobody is signed in" and would skip the registration of somebody who is.
    final AuthSession? session = await ref.watch(authControllerProvider.future);

    if (session == null) {
      return null;
    }

    // Registered while somebody is signed in, and run by signing out **before** the credential
    // goes: forgetting the push token is a call to the backend, and it needs that credential
    // ([D-23](../../../../../docs/plans/02-mobile-approval/decisions.md#d-23--a-ordem-do-logout)).
    final SignOutHooks hooks = ref.watch(signOutHooksProvider);
    final String name = ref.watch(deviceNameProvider);
    final ForgetPushToken forget = ref.watch(forgetPushTokenProvider);
    hooks.register(pushTokenStep, () => forget(name: name));
    ref.onDispose(() => hooks.unregister(pushTokenStep));

    return ref.watch(registerDeviceProvider)(name: name);
  }

  /// Asks the backend where this installation stands, after the socket was refused.
  ///
  /// A refusal whose reason is that the phone was **revoked** lands here as the status — or, when
  /// the backend will not even answer a revoked phone, as the failure — and either way the banner
  /// says it, instead of "approved" about a phone that can no longer decide (S-56).
  Future<void> recheck() async {
    final RegisteredDevice? known = state.value;

    if (known == null) {
      return;
    }

    state = await AsyncValue.guard<RegisteredDevice?>(
      () async => ref.read(checkDeviceProvider)(known.id),
    );
  }

  /// Registers again, with the push token the provider has just handed over.
  ///
  /// Re-sending is the normal path rather than the exceptional one: the provider rotates the token
  /// without asking, and a token that dies quietly is approval-from-away silently ceasing to
  /// arrive ([D-13](../../../../../docs/plans/02-mobile-approval/decisions.md)).
  /// @returns whether the registration went through
  ///
  /// Answering rather than throwing, and answering rather than only setting the state: the
  /// failure is kept here for the banner to render, and the caller — the push side — needs to
  /// know too, because a token that could not be registered is approval-from-away that stops
  /// arriving with nothing on screen to say so (S-74).
  Future<bool> refresh({String? pushToken}) async {
    state = await AsyncValue.guard<RegisteredDevice?>(
      () async => ref.read(registerDeviceProvider)(
        name: ref.read(deviceNameProvider),
        pushToken: pushToken,
      ),
    );

    return !state.hasError;
  }
}
