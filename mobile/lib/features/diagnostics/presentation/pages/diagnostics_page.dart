/// What a person can look at, and switch on, when something is not working — plan 05, B-11.
///
/// Three facts and one switch: where the connection is, whether this installation holds a
/// credential, which build this is — and `debug` logging, which a release build otherwise never
/// writes. Reproducing an intermittent permission bug on a phone
/// needs it, and publishing a new build to investigate is not workable
/// (docs/architecture/mobile/05-logging.md).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/features/diagnostics/presentation/providers/debug_logging_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The diagnostics screen.
class DiagnosticsPage extends StatelessWidget {
  const DiagnosticsPage({super.key});

  @override
  Widget build(BuildContext context) => AppScreen(
    title: AppLocalizations.of(context).diagnosticsTitle,
    actions: <Widget>[
      // The round trip of the walking skeleton, which was the first screen until the folders
      // home took its place (plan 10, D-27): a check of the socket, so it lives with the checks.
      IconButton(
        tooltip: AppLocalizations.of(context).sessionPingTitle,
        icon: const Icon(Icons.swap_vert),
        onPressed: () => unawaited(context.push(pingRoute)),
      ),
    ],
    body: const SingleChildScrollView(child: _Diagnostics()),
  );
}

/// The facts, and the switch.
class _Diagnostics extends ConsumerWidget {
  const _Diagnostics();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final DebugLogging controller = ref.read(debugLoggingProvider.notifier);
    final bool debugOn = ref.watch(debugLoggingProvider);
    final bool signedIn = ref.watch(credentialsProvider).accessToken != null;
    final String version = ref.watch(appConfigProvider).appVersion;
    final AppLocalizations l10n = AppLocalizations.of(context);

    return ContentColumn(
      children: <Widget>[
        _Fact(label: l10n.diagnosticsConnectionLabel, child: const ConnectionLine()),
        _Fact(
          label: l10n.diagnosticsCredentialLabel,
          child: Text(
            signedIn ? l10n.diagnosticsCredentialPresent : l10n.diagnosticsCredentialAbsent,
          ),
        ),
        _Fact(label: l10n.diagnosticsVersionLabel, child: Text(version)),
        const SizedBox(height: Tokens.spaceMd),
        SwitchListTile(
          title: Text(l10n.diagnosticsDebugLabel),
          subtitle: Text(
            controller.canSwitch ? l10n.diagnosticsDebugDescription : l10n.diagnosticsDebugAlwaysOn,
          ),
          value: debugOn,
          onChanged: controller.canSwitch ? (bool on) => controller.request(on: on) : null,
        ),
      ],
    );
  }
}

/// One fact: what it is, and what it says.
class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        child,
      ],
    ),
  );
}
