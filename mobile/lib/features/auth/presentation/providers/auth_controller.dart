/// Who is signed in, and the two things a screen can do about it.
///
/// It is also the one place that pushes the credential into the transport: `core/` never imports
/// `features/`, so the arrow has to point this way.
library;

import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
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

  /// Clears the credential here, at the provider, and in the transport.
  Future<void> signOut() async {
    final AuthSession? current = state.value;
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
