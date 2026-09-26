/// Where the connection stands, in words, announced as it changes.
///
/// Visible on purpose, and on every screen that can act: approving a permission while believing
/// you are online, and not being, is the worst failure this app has
/// (docs/architecture/mobile/03-state-and-data.md).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The name of one connection state, translated.
String connectionLabel(AppLocalizations l10n, ConnectionStatus status) => switch (status) {
  ConnectionStatus.idle => l10n.connectionStatusIdle,
  ConnectionStatus.connecting => l10n.connectionStatusConnecting,
  ConnectionStatus.ready => l10n.connectionStatusReady,
  ConnectionStatus.reconnecting => l10n.connectionStatusReconnecting,
  ConnectionStatus.closed => l10n.connectionStatusClosed,
};

/// Reads a status stream as a status.
///
/// A stream that failed is reported as [ConnectionStatus.closed] rather than as an error state:
/// from where the person sits those are the same thing, and "closed" is the one of the two that
/// says what it means for them.
ConnectionStatus connectionOf(AsyncValue<ConnectionStatus> status) =>
    status.hasError ? ConnectionStatus.closed : status.value ?? ConnectionStatus.idle;

/// One line saying where the connection is.
class ConnectionLine extends ConsumerWidget {
  const ConnectionLine({super.key, this.style});

  /// How to draw it. The caller decides, because the line sits in headers and in bodies.
  final TextStyle? style;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ConnectionStatus status = connectionOf(ref.watch(connectionStatusProvider));

    return Semantics(
      liveRegion: true,
      child: Text(
        connectionLabel(l10n, status),
        style: style ?? Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}
