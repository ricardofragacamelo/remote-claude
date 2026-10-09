/// The menu of the session — the `⋯` of the bar (plan 10, B-16): what is done to the whole session,
/// and seldom. End it — its owner's alone, and asked first (09 · D-10) —, undo what it wrote, copy
/// its id, the conversations of its folder — which left the bar for the files' panel (plan 25,
/// D-02) —; and what is the screen's: the permission rules and the help. In the draft, there is no
/// session yet, and only the screen's two are there (S-51).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/widgets/confirm_dialog.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/owned_sessions.dart';
import 'package:remote_claude/features/session/presentation/widgets/rewind_sheet.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_help.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Copies the id of [sessionId] to the clipboard, and says whether it went.
///
/// A clipboard the platform refuses is said with the id in the sentence, so it can still be read
/// out and typed — never a silent nothing.
Future<void> copySessionId(BuildContext context, String sessionId) async {
  final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
  final AppLocalizations l10n = AppLocalizations.of(context);
  final ProviderContainer container = ProviderScope.containerOf(context, listen: false);

  try {
    await Clipboard.setData(ClipboardData(text: sessionId));
    messenger.showSnackBar(SnackBar(content: Text(l10n.sessionMenuCopied)));
  } on PlatformException catch (error) {
    container
        .read(appLoggerProvider)
        .warn(
          'the clipboard refused the session id',
          op: 'session.copyId',
          fields: <String, Object?>{'sessionId': sessionId, 'platformError': error.code},
        );
    messenger.showSnackBar(SnackBar(content: Text(l10n.sessionMenuCopyFailed(sessionId))));
  }
}

/// The `⋯` of the bar. [sessionId] is `null` in the draft.
class SessionMenuButton extends StatelessWidget {
  const SessionMenuButton({super.key, this.sessionId, this.folder});

  final String? sessionId;

  /// The folder the session runs in — `null` until it is known, and the history waits for it.
  final String? folder;

  @override
  Widget build(BuildContext context) => IconButton(
    icon: const Icon(Icons.more_vert),
    tooltip: AppLocalizations.of(context).sessionMenuOpen,
    onPressed: () => unawaited(
      showSheet(
        context,
        (BuildContext sheet) => SessionMenu(sessionId: sessionId, folder: folder, screen: context),
      ),
    ),
  );
}

/// The items of the menu, in a sheet.
class SessionMenu extends StatelessWidget {
  const SessionMenu({required this.screen, super.key, this.sessionId, this.folder});

  /// The session on screen — `null` in the draft.
  final String? sessionId;

  /// The folder of the session — `null` while it is not known.
  final String? folder;

  /// The screen the menu opened over — where what an item opens goes, once the sheet is gone.
  final BuildContext screen;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? session = sessionId;

    /// Closes the menu, then does [then] on the screen.
    VoidCallback after(void Function() then) => () {
      Navigator.of(context).pop();
      then();
    };

    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (session != null) ...<Widget>[
            _EndItem(
              sessionId: session,
              onEnd: after(() => unawaited(confirmEnd(screen, session))),
            ),
            ListTile(
              leading: const Icon(Icons.history_toggle_off),
              title: Text(l10n.sessionMenuUndo),
              onTap: after(() => unawaited(showRewindSheet(screen, session))),
            ),
            ListTile(
              leading: const Icon(Icons.copy),
              title: Text(l10n.sessionMenuCopyId),
              onTap: after(() => unawaited(copySessionId(screen, session))),
            ),
            _HistoryItem(
              folder: folder,
              onOpen: (String at) => after(() => unawaited(screen.push(historyRouteFor(at))))(),
            ),
            const Divider(),
          ],
          ListTile(
            leading: const Icon(Icons.rule),
            title: Text(l10n.sessionMenuRules),
            // Pushed, not gone to: "back" from the rules lands on this conversation, as it was.
            onTap: after(() => unawaited(screen.push(rulesRoute))),
          ),
          ListTile(
            leading: const Icon(Icons.help_outline),
            title: Text(l10n.sessionMenuHelp),
            onTap: after(() => unawaited(showSessionHelp(screen))),
          ),
        ],
      ),
    );
  }
}

/// "End session": its owner's alone, and only while it runs — otherwise off, saying why (S-50).
class _EndItem extends ConsumerWidget {
  const _EndItem({required this.sessionId, required this.onEnd});

  final String sessionId;
  final VoidCallback onEnd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool owned = ref.watch(ownedSessionsProvider).contains(sessionId);
    final bool ended =
        ref.watch(
          liveSessionControllerProvider(
            sessionId,
          ).select((LiveSession live) => live.conversation.status),
        ) ==
        SessionStatus.closed;
    final String? why = ended
        ? l10n.sessionMenuEndEnded
        : owned
        ? null
        : l10n.sessionMenuEndNotOwner;
    final Color danger = Theme.of(context).colorScheme.error;

    return ListTile(
      enabled: why == null,
      leading: Icon(Icons.power_settings_new, color: why == null ? danger : null),
      title: Text(l10n.sessionMenuEnd, style: why == null ? TextStyle(color: danger) : null),
      subtitle: why == null ? null : Text(why),
      onTap: onEnd,
    );
  }
}

/// Asks before ending [sessionId] (09 · D-10), and ends it once the person confirms — once,
/// however often they press (S-49).
Future<void> confirmEnd(BuildContext context, String sessionId) async {
  final ProviderContainer container = ProviderScope.containerOf(context, listen: false);
  final bool? confirmed = await showDialog<bool>(
    context: context,
    builder: (BuildContext _) => EndDialog(sessionId: sessionId),
  );

  if (confirmed ?? false) {
    container.read(liveSessionControllerProvider(sessionId).notifier).close();
  }
}

/// "End this session?": what goes with it, and the way out first, where the focus starts.
///
/// A session another client ends while the question is up closes the question: there is nothing
/// left to end, and nothing is sent (S-52).
class EndDialog extends ConsumerWidget {
  const EndDialog({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    ref.listen<SessionStatus>(
      liveSessionControllerProvider(
        sessionId,
      ).select((LiveSession live) => live.conversation.status),
      (SessionStatus? previous, SessionStatus next) {
        // Only while the question is still the route on top: confirmed, it is already leaving, and
        // the close it asked for arrives while it animates out — a second pop then took the
        // session's own screen away (found by the e2e of plan 10, S-119).
        if (next == SessionStatus.closed && (ModalRoute.of(context)?.isCurrent ?? false)) {
          Navigator.of(context).pop(false);
        }
      },
    );

    return ConfirmDialog(
      title: l10n.sessionCloseTitle,
      body: l10n.sessionCloseDescription,
      keep: l10n.sessionCloseKeep,
      confirm: l10n.sessionCloseConfirm,
      destructive: true,
    );
  }
}

/// The conversations of the session's folder — pushed, not gone to: "back" returns to this
/// conversation with its scroll and its box (S-48). Off, saying why, while the folder is not known.
class _HistoryItem extends StatelessWidget {
  const _HistoryItem({required this.folder, required this.onOpen});

  final String? folder;
  final void Function(String folder) onOpen;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? at = folder;

    return ListTile(
      leading: const Icon(Icons.history),
      title: Text(l10n.sessionHistoryOpen),
      subtitle: at == null ? Text(l10n.sessionHistoryUnknown) : null,
      enabled: at != null,
      onTap: at == null ? null : () => onOpen(at),
    );
  }
}
