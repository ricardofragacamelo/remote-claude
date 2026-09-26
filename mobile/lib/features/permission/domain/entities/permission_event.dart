/// What the stream says about permissions, in the app's own words.
///
/// Pure Dart. The wire stops at `data/`, and the queue is a function of these — which is what lets
/// every rule of it be tested without a socket, a frame or a widget.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// Why an extension was refused.
enum ExtensionRefusal {
  /// The configured ceiling was reached. The countdown stops being extendable, and says so.
  ceiling,

  /// The request was already over. Nothing to show: the settlement arrives on its own.
  over,
}

/// One thing that happened to the permissions of a session.
sealed class PermissionEvent extends Equatable {
  const PermissionEvent();
}

/// The server asked — or asked again, after a reconnect republished what is still open.
final class PermissionAsked extends PermissionEvent {
  const PermissionAsked({required this.request, required this.frameId});

  final PermissionRequest request;

  /// The `id` of the `request` frame. The answer names it in `correlationId`.
  final String frameId;

  @override
  List<Object?> get props => <Object?>[request, frameId];
}

/// A request left the queue, however it was settled.
final class PermissionSettled extends PermissionEvent {
  const PermissionSettled(this.outcome);

  final PermissionOutcome outcome;

  @override
  List<Object?> get props => <Object?>[outcome];
}

/// Somebody — here or on another screen — bought more time.
final class PermissionDeadlineMoved extends PermissionEvent {
  const PermissionDeadlineMoved({
    required this.requestId,
    required this.expiresAt,
    required this.remainingExtensions,
  });

  final String requestId;
  final DateTime expiresAt;

  /// How many are left before the configured ceiling.
  final int remainingExtensions;

  @override
  List<Object?> get props => <Object?>[requestId, expiresAt, remainingExtensions];
}

/// The server refused an extension this phone asked for.
final class PermissionExtensionRefused extends PermissionEvent {
  const PermissionExtensionRefused({required this.requestId, required this.refusal});

  final String requestId;
  final ExtensionRefusal refusal;

  @override
  List<Object?> get props => <Object?>[requestId, refusal];
}

/// The replay buffer no longer holds what was missed: start again.
final class PermissionFeedReset extends PermissionEvent {
  const PermissionFeedReset();

  @override
  List<Object?> get props => const <Object?>[];
}
