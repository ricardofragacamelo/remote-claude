/// The states of the session screen, each a line (plan 10, B-07): above the conversation, where
/// the connection and the history stand; above the box, why the session ended, what waits in the
/// queue and why the last send was refused. None of them pushes the composer off the screen, and
/// one that says more than a line opens whole on a tap.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Where the connection stands, when it is not where it should be — and nothing when it is.
class ConnectionStrip extends StatelessWidget {
  const ConnectionStrip({required this.status, super.key});

  final ConnectionStatus status;

  @override
  Widget build(BuildContext context) {
    if (status == ConnectionStatus.ready) {
      return const SizedBox.shrink();
    }

    final String said = connectionLabel(AppLocalizations.of(context), status);

    return MessageStrip(
      message: BannerMessage(
        icon: status == ConnectionStatus.closed ? Icons.cloud_off : Icons.sync,
        emphasis: status == ConnectionStatus.closed || status == ConnectionStatus.throttled,
        title: said,
        body: said,
      ),
    );
  }
}

/// Where reading what was said before stands: reading, or failed with the way to read it again.
class HistoryStrip extends StatelessWidget {
  const HistoryStrip({required this.isLoading, required this.onRetry, super.key, this.failure});

  final bool isLoading;
  final Failure? failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Failure? failed = failure;

    if (failed != null) {
      // Said above whatever did arrive, with the way to ask again — never in place of the live
      // conversation (S-17).
      return TextStrip(
        icon: Icons.error_outline,
        emphasis: true,
        text: translateFailure(l10n, failed),
        action: TextButton(onPressed: onRetry, child: Text(l10n.commonActionRetry)),
      );
    }

    if (!isLoading) {
      return const SizedBox.shrink();
    }

    return Semantics(
      label: l10n.sessionHistoryLoading,
      liveRegion: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          TextStrip(icon: Icons.history, text: l10n.sessionHistoryLoading),
          const LinearProgressIndicator(),
        ],
      ),
    );
  }
}

/// Why the session ended, and that sending resumes it — above the box, which stays active
/// (09 · D-05).
class EndedStrip extends StatelessWidget {
  const EndedStrip({required this.ending, super.key});

  final SessionEnding ending;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String reason = endingReason(l10n, ending.reason);

    return MessageStrip(
      line: '$reason ${l10n.sessionEndedResumes}',
      message: BannerMessage(
        icon: Icons.stop_circle_outlined,
        title: reason,
        body: l10n.sessionEndedResumes,
      ),
    );
  }
}

/// Why a session ended, in a sentence.
String endingReason(AppLocalizations l10n, SessionCloseReason reason) => switch (reason) {
  SessionCloseReason.closedByUser => l10n.sessionClosedByUser,
  SessionCloseReason.completed => l10n.sessionClosedCompleted,
  SessionCloseReason.failed => l10n.sessionClosedFailed,
  SessionCloseReason.auditUnavailable => l10n.sessionClosedAuditUnavailable,
  SessionCloseReason.shutdown => l10n.sessionClosedShutdown,
  SessionCloseReason.idleTimeout => l10n.sessionClosedIdleTimeout,
};

/// Why a send — or a cancel — was refused, until the person closes it. The text stays in the box.
///
/// With [action], the strip offers that instead of closing — the plain resume, when the CLI refused
/// the point of a fork (S-82).
class RefusalStrip extends StatelessWidget {
  const RefusalStrip({required this.failure, required this.onClose, super.key, this.action});

  final Failure failure;
  final VoidCallback onClose;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return TextStrip(
      icon: Icons.error_outline,
      emphasis: true,
      text: translateFailure(l10n, failure),
      action:
          action ??
          IconButton(
            tooltip: l10n.composerRefusalClose,
            icon: const Icon(Icons.close),
            onPressed: onClose,
          ),
    );
  }
}

/// "Editing a message", while a prompt is being edited to be sent again from before it (B-24) —
/// tapping it says what sending does; the button leaves the edit.
class EditingStrip extends StatelessWidget {
  const EditingStrip({required this.onCancel, super.key});

  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return TextStrip(
      icon: Icons.edit_outlined,
      text: '${l10n.sessionEditEditing} · ${l10n.sessionEditExplain}',
      action: TextButton(onPressed: onCancel, child: Text(l10n.sessionEditCancel)),
    );
  }
}

/// A real reason nothing can be sent — the connection gone, held by the server — above the box
/// (09 · D-07). An empty box is not one: that is said on the send button alone.
class BlockedStrip extends StatelessWidget {
  const BlockedStrip({required this.reason, super.key});

  final String reason;

  @override
  Widget build(BuildContext context) => TextStrip(
    icon: Icons.block,
    emphasis: true,
    text: AppLocalizations.of(context).composerBlocked(reason),
  );
}

/// The prompts waiting for the running turn, each with the way to take it out (plan 10, B-13).
class QueueStrip extends StatelessWidget {
  const QueueStrip({required this.queue, required this.onCancel, super.key});

  final List<QueuedPrompt> queue;
  final void Function(String queueId) onCancel;

  @override
  Widget build(BuildContext context) {
    if (queue.isEmpty) {
      return const SizedBox.shrink();
    }

    final AppLocalizations l10n = AppLocalizations.of(context);

    return Semantics(
      container: true,
      label: l10n.queueTitle,
      hint: l10n.queueDescription,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final (int index, QueuedPrompt prompt) in queue.indexed)
            TextStrip(
              icon: Icons.schedule,
              text:
                  '${l10n.queuePosition('${index + 1}')} · ${prompt.preview} · ${_from(l10n, prompt.promptedBy)}',
              action: IconButton(
                tooltip: l10n.queueCancel('${index + 1}'),
                icon: const Icon(Icons.close),
                onPressed: () => onCancel(prompt.queueId),
              ),
            ),
          const SizedBox(height: Tokens.spaceSm),
        ],
      ),
    );
  }

  static String _from(AppLocalizations l10n, String promptedBy) => switch (promptedBy) {
    'web' => l10n.queueFromWeb,
    'mobile' => l10n.queueFromMobile,
    _ => l10n.queueFromOther,
  };
}
