/// Following a link of a file — markdown or PDF — by the rule for content nobody reviewed
/// (plan 25, B-20, B-24).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/widgets/confirm_dialog.dart';
import 'package:remote_claude/features/files/domain/services/resolve_relative_link.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';
import 'package:url_launcher/url_launcher.dart';

/// Follows [href], found in the file at [from] of [folder]: another file opens in the viewer; a
/// place outside the app, after the person confirms the address; anything else does not open, and
/// says why.
Future<void> followLink(
  BuildContext context, {
  required String folder,
  required String from,
  required String href,
  String? sessionId,
}) async {
  switch (resolveLink(from, href)) {
    case FileLink(:final String path):
      await context.push<void>(viewerRouteFor(folder, path, sessionId: sessionId));
    case OutsideLink(:final Uri address):
      if (await _confirmed(context, address)) {
        await launchUrl(address, mode: LaunchMode.externalApplication);
      }
    case Refused(:final RefusedLink reason):
      if (context.mounted) {
        final AppLocalizations l10n = AppLocalizations.of(context);
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          SnackBar(
            content: Text(
              reason == RefusedLink.outsideFolder
                  ? l10n.markdownLinkOutside
                  : l10n.markdownLinkRefused,
            ),
          ),
        );
      }
  }
}

/// Asks before leaving the app, showing exactly where to (S-89) — the way out first.
Future<bool> _confirmed(BuildContext context, Uri address) async {
  final AppLocalizations l10n = AppLocalizations.of(context);
  final bool? open = await showDialog<bool>(
    context: context,
    builder: (BuildContext dialog) => ConfirmDialog(
      title: l10n.markdownLinkConfirm,
      body: address.toString(),
      keep: MaterialLocalizations.of(dialog).cancelButtonLabel,
      confirm: l10n.markdownLinkOpen,
    ),
  );
  return open ?? false;
}
