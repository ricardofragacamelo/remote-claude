/// Whether approval-from-away can actually reach this installation.
///
/// Four behaviours live here, and each one exists because of a way the product goes quiet without
/// anything failing:
///
/// * **when the permission is asked for** — after the device is registered, never in the app's
///   first second. A prompt shown before the person knows what the app is, is a prompt they deny;
///   asking once the phone is in the approval list gives the question a reason (S-68).
/// * **the token rotation** — the transport changes the token on its own schedule, and a rotation
///   nobody re-registers is approval silently ceasing to arrive
///   ([D-13](../../../../../docs/plans/02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado), S-73).
/// * **the tap** — it opens the request's deep link, and it is logged, because it is the first
///   step of a trail that ends in a command running on somebody's machine (S-70).
/// * **the withdrawal** — a silent message takes down a notification whose question is over. A
///   notification for an action that no longer exists is the fastest way to teach somebody to
///   ignore the app's notifications (S-71).
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/navigation/deep_link_controller.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/core/notifications/push_providers.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/presentation/providers/device_controller.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'push_controller.g.dart';

/// What the app knows about its own reachability.
class PushReach extends Equatable {
  const PushReach({required this.permission, this.rotationFailed = false});

  /// Where this installation stands with the operating system.
  final PushPermission permission;

  /// A token rotation that could not be re-registered.
  ///
  /// Kept in the state rather than only logged. It is the exact condition D-13 is about — the
  /// approval stops arriving and nobody is told — so it has to be something the UI *can* show,
  /// even while it is a `warn` and not a failure (S-74).
  final bool rotationFailed;

  /// Whether a notification would actually reach this phone.
  bool get isReachable => permission == PushPermission.granted && !rotationFailed;

  @override
  List<Object?> get props => <Object?>[permission, rotationFailed];
}

/// The notification side of this installation.
@Riverpod(keepAlive: true)
class PushController extends _$PushController {
  @override
  Future<PushReach> build() async {
    // The device first, and `.future` rather than the value: asking the operating system for a
    // permission before there is anywhere to send the token would spend the one prompt Android
    // gives us on a question we could not have acted on (S-68).
    final RegisteredDevice? device = await ref.watch(deviceControllerProvider.future);

    if (device == null) {
      return const PushReach(permission: PushPermission.notAsked);
    }

    final PushGateway gateway = ref.watch(pushGatewayProvider);

    _listen(gateway);

    final PushPermission current = await gateway.permission();
    final PushPermission permission = current == PushPermission.notAsked
        ? await gateway.request()
        : current;

    if (permission == PushPermission.granted) {
      await _register(await gateway.token());
    }

    return PushReach(permission: permission);
  }

  /// Asks again, after the user has been to the operating system's settings.
  ///
  /// Not a second prompt — Android shows that at most twice, and a third call would do nothing
  /// visible. This re-reads where the permission actually stands, which is what changes when
  /// somebody comes back from the settings screen having turned it on.
  Future<void> recheck() async {
    final PushGateway gateway = ref.read(pushGatewayProvider);
    final PushPermission permission = await gateway.permission();

    state = AsyncValue<PushReach>.data(PushReach(permission: permission));

    if (permission == PushPermission.granted) {
      await _register(await gateway.token());
    }
  }

  /// Takes the user to the operating system's notification settings.
  Future<void> openSettings() => ref.read(pushGatewayProvider).openSettings();

  void _listen(PushGateway gateway) {
    final List<StreamSubscription<Object?>> subscriptions = <StreamSubscription<Object?>>[
      gateway.tokens.listen(_onToken),
      gateway.arrivals.listen(_onArrival),
      gateway.openings.listen(_onOpening),
    ];

    ref.onDispose(() {
      for (final StreamSubscription<Object?> subscription in subscriptions) {
        unawaited(subscription.cancel());
      }
    });
  }

  /// A rotation. The registration is re-sent without anybody being asked to do anything.
  void _onToken(String token) {
    _log().info(
      'push token minted',
      op: LogOp.pushToken,
      fields: <String, Object?>{'tokenTail': pushTokenTail(token)},
    );

    unawaited(_register(token));
  }

  void _onArrival(PushArrival arrival) {
    _log().debug(
      'push received',
      op: LogOp.pushReceived,
      fields: <String, Object?>{
        'sessionId': arrival.sessionId,
        'requestId': arrival.requestId,
        'withdrawal': arrival.isWithdrawal,
      },
    );

    if (arrival.isWithdrawal) {
      unawaited(ref.read(pushGatewayProvider).withdraw(arrival.requestId));
    }
  }

  /// The tap. It navigates, and it never renders from the payload.
  ///
  /// The screen it opens revalidates against the server: the notification may have been sitting
  /// in the tray while the request expired or somebody else answered it, and a card drawn from
  /// the payload would offer a decision that no longer exists (S-45…S-47, R-04).
  void _onOpening(PushArrival arrival) {
    _log().info(
      'push opened',
      op: LogOp.pushOpened,
      fields: <String, Object?>{'sessionId': arrival.sessionId, 'requestId': arrival.requestId},
    );

    ref
        .read(deepLinkControllerProvider.notifier)
        .request(permissionRouteFor(arrival.sessionId, arrival.requestId));
  }

  /// Re-registers this installation under [token].
  ///
  /// A failure here is a `warn` and a flag in the state, never an exception thrown at a widget:
  /// the phone keeps working, the socket keeps working, and the one thing that stopped is the
  /// notification — which is precisely the failure that has to be visible somewhere (S-74).
  Future<void> _register(String? token) async {
    if (token == null) {
      return;
    }

    final bool registered = await ref
        .read(deviceControllerProvider.notifier)
        .refresh(pushToken: token);

    if (!registered) {
      _log().warn(
        'push token could not be registered',
        op: LogOp.pushToken,
        fields: <String, Object?>{
          'tokenTail': pushTokenTail(token),
          'error': '${ref.read(deviceControllerProvider).error}',
        },
      );
    }

    _settle(rotationFailed: !registered);
  }

  void _settle({required bool rotationFailed}) {
    final PushReach? current = state.value;

    if (current != null) {
      state = AsyncValue<PushReach>.data(
        PushReach(permission: current.permission, rotationFailed: rotationFailed),
      );
    }
  }

  AppLogger _log() => ref.read(appLoggerProvider);
}
