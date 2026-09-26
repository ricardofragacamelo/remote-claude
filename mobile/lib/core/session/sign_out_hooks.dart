/// Work that has to happen while the signed-in credential still exists — before signing out takes
/// it away.
///
/// In `core/` because the arrow cannot point the other way. Forgetting this phone's push token is
/// the device feature's job, and it is a call to the backend that needs the credential; the auth
/// feature is what signs out, and the device feature already imports auth — auth importing device
/// back would close a cycle. So the device feature registers a step here, and signing out runs
/// whatever is registered ([D-23](../../../../docs/plans/02-mobile-approval/decisions.md#d-23--a-ordem-do-logout)).
library;

import 'dart:async';

import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'sign_out_hooks.g.dart';

/// One step. It may fail: the sign-out goes on regardless.
typedef SignOutStep = Future<void> Function();

/// How long one step may take before the sign-out stops waiting for it.
///
/// Short on purpose. A sign-out that hangs for the full request timeout because the phone is
/// between networks is a sign-out somebody gives up on — with the credential still on the device.
const Duration signOutStepTimeout = Duration(seconds: 5);

/// The steps, by name.
class SignOutHooks {
  final Map<String, SignOutStep> _steps = <String, SignOutStep>{};

  /// Registers [step] under [name], replacing whatever was there.
  void register(String name, SignOutStep step) => _steps[name] = step;

  /// Forgets the step under [name].
  void unregister(String name) => _steps.remove(name);

  /// Runs every step, and never throws.
  ///
  /// A failing step is a `warn` and nothing more (S-88): a sign-out that does not complete without
  /// a network leaves the credential on the phone, which is the worst of the outcomes.
  Future<void> run(AppLogger logger) async {
    for (final MapEntry<String, SignOutStep> step in _steps.entries.toList(growable: false)) {
      try {
        await step.value().timeout(signOutStepTimeout);
      } on Object catch (error) {
        logger.warn(
          'sign-out step failed',
          op: LogOp.authToken,
          fields: <String, Object?>{'step': step.key, 'err': error.runtimeType.toString()},
        );
      }
    }
  }
}

/// The one registry.
@Riverpod(keepAlive: true)
SignOutHooks signOutHooks(Ref ref) => SignOutHooks();
