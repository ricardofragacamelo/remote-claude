/// The server's answer about one request, and the owner's lock preference.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/usecases/gate_approval.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'permission_lookup_controller.g.dart';

/// Never asked again on its own.
///
/// Riverpod retries a failed provider by default, and here that would be wrong twice over: the
/// failures that reach this far are the ones retrying does not change — somebody else's request
/// (`PERMISSION_NOT_OWNED`), a body this build cannot read — and the screen already offers the
/// person a retry of their own, which is where the decision to ask again belongs.
Duration? _neverRetry(int retryCount, Object error) => null;

/// Where one request stands, as the server says — what a notification's screen waits for.
///
/// Asked once per opening, and never answered from the notification (S-45). Opening the same link
/// twice asks twice and sends nothing: asking is all an opening does (S-47).
@Riverpod(retry: _neverRetry)
Future<PermissionLookup> permissionLookup(Ref ref, String sessionId, String requestId) =>
    ref.watch(lookupPermissionProvider)(sessionId, requestId);

/// What the screen needs to know about the lock before it offers a yes.
class ApprovalLockState extends Equatable {
  const ApprovalLockState({required this.isRequired, required this.hasLock});

  /// Whether each approval asks for biometrics or the PIN.
  final bool isRequired;

  /// Whether this phone has any lock. Without one it does not approve (D-07).
  final bool hasLock;

  @override
  List<Object?> get props => <Object?>[isRequired, hasLock];
}

/// The lock preference of this phone.
@Riverpod(keepAlive: true)
class ApprovalLockController extends _$ApprovalLockController {
  @override
  Future<ApprovalLockState> build() async {
    final ApprovalLockSetting setting = ref.watch(approvalLockSettingProvider);

    return ApprovalLockState(
      isRequired: await setting.isRequired(),
      hasLock: await setting.hasLock(),
    );
  }

  /// Turns the prompt on or off. The rule of D-07 does not move with it (D-25).
  Future<void> change({required bool required}) async {
    await ref.read(approvalLockSettingProvider).change(required: required);
    ref.invalidateSelf();
    await future;
  }
}
