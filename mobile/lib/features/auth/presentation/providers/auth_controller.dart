/// Who is signed in, and the two things a screen can do about it.
///
/// It is also the one place that pushes the credential into the transport: `core/` never imports
/// `features/`, so the arrow has to point this way.
library;

import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/session/sign_out_hooks.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'auth_controller.g.dart';

/// The signed-in session, or `null`.
@Riverpod(keepAlive: true)
class AuthController extends _$AuthController {
  @override
  Future<AuthSession?> build() async {
    final Credentials credentials = ref.watch(credentialsProvider);

    // Renewal is wired in without the transport learning what a refresh token is. The holder
    // deduplicates, so several calls noticing the expiry at once become one exchange.
    credentials.setRenewer(_renew);

    return _publish(await ref.watch(restoreSessionProvider)());
  }

  /// Opens the provider in the system's external tab.
  ///
  /// A failure lands in the state as an error rather than being thrown at the widget: the screen
  /// has one place to render it, and `AsyncValue` already carries it.
  Future<void> signIn() async {
    state = const AsyncValue<AuthSession?>.loading();
    state = await AsyncValue.guard(() async => _publish(await ref.read(signInProvider)()));
  }

  /// Signs out, in the one order that works
  /// ([D-23](../../../../../docs/plans/02-mobile-approval/decisions.md#d-23--a-ordem-do-logout)).
  ///
  /// 1. **what needs the credential runs first** — forgetting the push token is a call to the
  ///    backend, and after the next step there is nothing left to make it with. A failure there is
  ///    a `warn` and never a reason not to sign out (S-88);
  /// 2. the secure store is cleared and the provider's session ended;
  /// 3. the transport forgets the token — and the app layer, seeing nobody signed in, closes the
  ///    socket and drops every provider holding the previous user's data.
  ///
  /// The steps run **before** the state moves, and that order is load-bearing: whoever registered
  /// a step watches this provider, and a state change rebuilds it — its `onDispose` would take the
  /// step away before it ran.
  Future<void> signOut() async {
    final AuthSession? current = state.value;
    await ref.read(signOutHooksProvider).run(ref.read(appLoggerProvider));
    state = const AsyncValue<AuthSession?>.loading();
    state = await AsyncValue.guard(() async {
      await ref.read(signOutProvider)(current);
      return _publish(null);
    });
  }

  Future<String?> _renew() async {
    final AuthSession? current = state.value;
    if (current == null) {
      return null;
    }

    try {
      final AuthSession renewed = await ref.read(renewSessionProvider)(current);
      state = AsyncValue<AuthSession?>.data(_publish(renewed));
      return renewed.accessToken;
    } on Object catch (error, stackTrace) {
      // Refresh failed: the credential goes, and so does the session. No silent recovery.
      state = AsyncValue<AuthSession?>.error(error, stackTrace);
      _publish(null);
      return null;
    }
  }

  AuthSession? _publish(AuthSession? session) {
    ref.read(credentialsProvider).setAccessToken(session?.accessToken);

    final LogContext context = ref.read(appLoggerProvider).context;
    ref
        .read(appLoggerProvider)
        .updateContext(
          LogContext(
            appVersion: context.appVersion,
            platform: context.platform,
            sessionId: context.sessionId,
            connectionId: context.connectionId,
            route: context.route,
            userId: session?.userId,
            deviceId: context.deviceId,
          ),
        );

    return session;
  }
}
