/// What the socket does when the app leaves the screen.
///
/// `paused` closes the socket, and that is **correct**: holding one in the background drains the
/// battery and the operating system kills it anyway. It is exactly why push notification exists.
/// On `resumed` the credential is revalidated before reconnecting, because it very probably
/// expired while the app was parked.
///
/// `lifecycle.changed` is a mandatory `op`: half of the socket and push bugs are explained by the
/// transition immediately before them.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';

/// Applies one lifecycle transition to the socket.
///
/// Separated from the listener so the rule is testable without pumping a widget.
Future<void> applyLifecycle(AppLifecycleState state, WsClient client, AppLogger logger) async {
  logger.debug(
    'lifecycle changed',
    op: LogOp.lifecycleChanged,
    fields: <String, Object?>{'state': state.name},
  );

  switch (state) {
    case AppLifecycleState.resumed:
      await client.resume();
    case AppLifecycleState.paused:
    case AppLifecycleState.detached:
      await client.suspend();
    case AppLifecycleState.inactive:
    case AppLifecycleState.hidden:
      break;
  }
}

/// Listens to the lifecycle and keeps the socket in step with it.
///
/// [client] answers the socket **of now**, or `null` when there is none: a change of address
/// replaces the socket (plan 10, B-28), and the app may have no address to talk through yet.
class SocketLifecycle {
  SocketLifecycle({required this._client, required this._logger}) {
    _listener = AppLifecycleListener(onStateChange: _onStateChange);
  }

  final WsClient? Function() _client;
  final AppLogger _logger;
  late final AppLifecycleListener _listener;

  /// Stops listening.
  void dispose() => _listener.dispose();

  void _onStateChange(AppLifecycleState state) {
    final WsClient? client = _client();

    if (client != null) {
      unawaited(applyLifecycle(state, client, _logger));
    }
  }
}

/// Asks again where this phone stands whenever the app comes back to the foreground.
///
/// What it asks is the caller's — the device feature asks only while the phone waits for approval
/// — and this only says **when**: an approval from the browser that arrived with no push (no
/// token, the provider away) still shows the moment the person looks at the phone (plan 17, D-16).
class ForegroundRecheck {
  ForegroundRecheck({required this._recheck}) {
    _listener = AppLifecycleListener(onResume: onResume);
  }

  final Future<void> Function() _recheck;
  late final AppLifecycleListener _listener;

  /// The app is back on screen.
  void onResume() => unawaited(_recheck());

  /// Stops listening.
  void dispose() => _listener.dispose();
}

/// Connects the socket of the address the app talks through — now, and again on the new address
/// whenever it changes (plan 10, B-28). With no address yet there is no socket to open.
///
/// @returns the subscription, to close when the app goes
ProviderSubscription<String?> keepConnected(ProviderContainer container) =>
    container.listen<String?>(currentOriginProvider, (String? previous, String? origin) {
      if (origin != null) {
        container.read(wsClientProvider).connect();
      }
    }, fireImmediately: true);

/// The socket of now, or `null` with no address to talk through.
WsClient? currentSocket(ProviderContainer container) =>
    container.read(hasOriginProvider) ? container.read(wsClientProvider) : null;
