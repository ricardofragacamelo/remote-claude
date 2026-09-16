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
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/ws_client.dart';

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
class SocketLifecycle {
  SocketLifecycle({required this._client, required this._logger}) {
    _listener = AppLifecycleListener(onStateChange: _onStateChange);
  }

  final WsClient _client;
  final AppLogger _logger;
  late final AppLifecycleListener _listener;

  /// Stops listening.
  void dispose() => _listener.dispose();

  void _onStateChange(AppLifecycleState state) =>
      unawaited(applyLifecycle(state, _client, _logger));
}
