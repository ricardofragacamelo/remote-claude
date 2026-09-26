/// What changes for the whole app when somebody signs in or out.
///
/// The app layer, because it is the one that sees every feature: signing out has to reach the
/// socket, which is `core/`, and the state of four features, none of which may import the others.
///
/// - **signed out** — the socket closes and every provider holding the previous user's data is
///   dropped. Skipping the second is how one person's session list appears for the next
///   (docs/architecture/mobile/07-auth.md#logout);
/// - **signed in** — the socket opens with the new credential (S-89). Without it the app would sit
///   with a closed socket after a sign-in, or keep the previous user's open;
/// - **refused** — a socket closed with 4401 has the device's status asked for again (S-56);
/// - **always** — the notification side of this installation is alive, whatever screen is shown.
library;

import 'dart:async';

import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'session_scope.g.dart';

/// Keeps the socket and the user-scoped state in step with who is signed in.
@Riverpod(keepAlive: true)
void sessionScope(Ref ref) {
  // A socket refused with 4401 is an expired token or a revoked phone. The token renews on its own;
  // the phone's status has to be asked for, or the screen keeps calling it approved (S-56).
  StreamSubscription<void>? rejections;
  ref.onDispose(() => rejections?.cancel());

  void connect() {
    final WsClient client = ref.read(wsClientProvider)..connect();
    rejections ??= client.rejections.listen(
      (_) => unawaited(ref.read(deviceControllerProvider.notifier).recheck()),
    );
  }

  // The notification side of this installation lives as long as the app, not as long as a screen
  // that happens to show its banner. It is what asks the operating system for the permission once
  // the device exists, registers the token, and turns a tap on a notification into navigation — a
  // phone left on the home screen that never built it would never be notified, and a tap that
  // opened the app there would go nowhere (S-54, S-67, S-68).
  ref.listen<AsyncValue<PushReach>>(pushControllerProvider, (_, _) {});

  ref.listen<AsyncValue<AuthSession?>>(authControllerProvider, (
    AsyncValue<AuthSession?>? previous,
    AsyncValue<AuthSession?> next,
  ) {
    // Undecided is not a change: a sign-in in flight still holds the previous value, and acting on
    // it would close a socket that is about to be needed.
    if (next.isLoading) {
      return;
    }

    final String? before = previous?.value?.userId;
    final String? after = next.value?.userId;

    if (before == after) {
      return;
    }

    if (after == null) {
      _signedOut(ref);
    } else {
      // A different user, without a sign-out in between, is still a change of user: the old
      // socket was authenticated as somebody else.
      if (before != null) {
        _signedOut(ref);
      }
      connect();
    }
  });
}

void _signedOut(Ref ref) {
  // Not awaited: a listener cannot be, and nothing after this depends on the close having
  // finished — the next sign-in's `connect` opens a socket of its own either way.
  unawaited(ref.read(wsClientProvider).close());

  ref
    ..invalidate(sessionStreamControllerProvider)
    ..invalidate(sessionStarterControllerProvider)
    ..invalidate(liveSessionControllerProvider)
    ..invalidate(workspaceListControllerProvider)
    ..invalidate(permissionQueueControllerProvider);
}
