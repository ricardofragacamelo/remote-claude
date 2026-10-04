/// One live session of a folder, as the folder screen lists it (plan 10, B-42).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/widgets/date_and_time.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The word for [status] — the web's words, so both ends say the same thing.
String liveStatusLabel(AppLocalizations l10n, SessionStatus? status) => switch (status) {
  SessionStatus.starting => l10n.liveStatusStarting,
  SessionStatus.idle => l10n.liveStatusIdle,
  SessionStatus.thinking => l10n.liveStatusThinking,
  SessionStatus.running => l10n.liveStatusRunning,
  SessionStatus.waitingPermission => l10n.liveStatusWaiting,
  SessionStatus.closed => l10n.liveStatusClosed,
  null => l10n.liveStatusUnknown,
};

/// What it is doing and on which model, since when, where below the folder, from where, and how
/// many questions of it wait — said in words and icons, never by colour alone.
class LiveSessionTile extends StatelessWidget {
  const LiveSessionTile({
    required this.session,
    required this.folder,
    required this.onTap,
    super.key,
  });

  final LiveSessionSummary session;

  /// The folder the screen is about, so a session below it says where.
  final String folder;

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? below = _below();
    final String? origin = switch (session.openedFrom) {
      SessionOrigin.web => l10n.folderOpenedFromWeb,
      SessionOrigin.mobile => l10n.folderOpenedFromMobile,
      SessionOrigin.unknown => null,
    };
    final Color warning = Theme.of(context).colorScheme.tertiary;

    return ListTile(
      leading: Icon(session.openedFrom == SessionOrigin.web ? Icons.computer : Icons.phone_android),
      title: Text(l10n.folderSessionDetails(liveStatusLabel(l10n, session.status), session.model)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(l10n.folderSessionStarted(dateAndTime(context, session.startedAt))),
          if (below != null) Text(l10n.folderSessionBelow(below)),
          if (origin != null) Text(origin),
          if (session.pendingPermissions > 0)
            Row(
              children: <Widget>[
                Icon(Icons.warning_amber, size: 16, color: warning),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    l10n.foldersPending(session.pendingPermissions),
                    style: TextStyle(color: warning, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
        ],
      ),
      isThreeLine: true,
      onTap: onTap,
    );
  }

  /// The subfolder it runs in, relative to [folder], or `null` when it is the folder itself.
  String? _below() {
    final String path = session.workspacePath;

    if (path == folder || !path.startsWith(folder)) {
      return null;
    }

    final String rest = path.substring(folder.length);
    return rest.startsWith('/') ? rest.substring(1) : rest;
  }
}
