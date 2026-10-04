/// Undoing what the session wrote on disk, with the reach said before anything is touched.
///
/// Two steps, because confirmation without the list is confirmation without information: first the
/// points the files can go back to, then — for the one chosen — exactly which files go back
/// (restored or deleted), which stay and why, which are already there, and to which point (S-38).
/// Only then the button, and only while the session is idle and the device connected: the backend
/// refuses an undo during a turn (S-43), and the sheet says so before anybody taps.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/rewind_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Opens the undo of [sessionId] over the session screen — on the point of the prompt that said
/// [label], when it came from one (plan 10, B-24): its reach first, then the button.
Future<void> showRewindSheet(BuildContext context, String sessionId, {String? label}) =>
    showSessionSheet<void>(context, RewindSheet(sessionId: sessionId, label: label));

/// The undo of one session.
///
/// A closed session reads nothing: undo is not available there by policy (S-39), and asking the
/// backend for the points of a session that is gone would only answer "not found".
class RewindSheet extends ConsumerWidget {
  const RewindSheet({required this.sessionId, super.key, this.label});

  final String sessionId;

  /// What the prompt it was opened from said — the label of its point.
  final String? label;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final SessionStatus status = ref.watch(
      liveSessionControllerProvider(sessionId).select((LiveSession s) => s.conversation.status),
    );

    return SessionSheet(
      title: l10n.sessionUndoTitle,
      description: l10n.sessionUndoDescription,
      child: status == SessionStatus.closed
          ? ContentColumn(children: <Widget>[Text(l10n.sessionUndoClosed)])
          : _Points(sessionId: sessionId, status: status, label: label),
    );
  }
}

/// The points, and the step the person is on.
class _Points extends ConsumerStatefulWidget {
  const _Points({required this.sessionId, required this.status, this.label});

  final String sessionId;
  final SessionStatus status;
  final String? label;

  @override
  ConsumerState<_Points> createState() => _PointsState();
}

class _PointsState extends ConsumerState<_Points> {
  /// The point being confirmed. Local to the sheet: it is where the person is looking, not data.
  String? _selected;

  /// The person went back to the list: the point of the prompt the sheet opened from is no longer
  /// chosen for them.
  bool _backedOut = false;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final RewindControllerProvider provider = rewindControllerProvider(widget.sessionId);
    final RewindController controller = ref.read(provider.notifier);
    final ConnectionStatus connection = connectionOf(ref.watch(connectionStatusProvider));

    // Why the button would do nothing, said before anybody taps it.
    final String? blocked = connection != ConnectionStatus.ready
        ? l10n.sessionUndoOffline
        : widget.status != SessionStatus.idle
        ? l10n.sessionUndoBusy
        : null;

    void back() {
      controller.dismiss();
      setState(() {
        _selected = null;
        _backedOut = true;
      });
    }

    return LoadedView<RewindBoard>(
      value: ref.watch(provider),
      labels: LoadedLabels(
        loading: l10n.sessionUndoLoading,
        emptyTitle: l10n.sessionUndoEmptyTitle,
        emptyDescription: l10n.sessionUndoEmptyBody,
      ),
      isEmpty: (RewindBoard board) => board.checkpoints.isEmpty && board.outcome == null,
      onRetry: controller.retry,
      builder: (RewindBoard board) {
        final RewindOutcome? outcome = board.outcome;
        final Checkpoint? chosen = board.checkpoints
            .where(
              (Checkpoint point) =>
                  point.promptId == _selected ||
                  (_selected == null &&
                      !_backedOut &&
                      widget.label != null &&
                      point.label == widget.label),
            )
            .firstOrNull;

        if (outcome != null) {
          return _Outcome(outcome: outcome, incomplete: board.incomplete, onBack: back);
        }

        if (chosen != null) {
          return _Confirmation(
            checkpoint: chosen,
            board: board,
            blocked: blocked,
            onConfirm: () => controller.rewind(chosen.promptId),
            onBack: back,
          );
        }

        return _PointList(
          board: board,
          onPick: (String promptId) => setState(() => _selected = promptId),
        );
      },
    );
  }
}

/// Every point, newest first.
class _PointList extends StatelessWidget {
  const _PointList({required this.board, required this.onPick});

  final RewindBoard board;
  final void Function(String promptId) onPick;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Failure? stale = board.refreshFailure;

    return ListView(
      children: <Widget>[
        if (stale != null) _Padded(FailureLine(failure: stale)),
        for (final Checkpoint point in board.checkpoints)
          ListTile(
            title: Text(point.label ?? l10n.sessionUndoUntitled),
            subtitle: Text(_when(context, point.at)),
            trailing: Text(l10n.sessionUndoFileCount(point.fileCount)),
            onTap: () => onPick(point.promptId),
          ),
      ],
    );
  }
}

/// The reach of one point, and the button — which says why when it would do nothing.
class _Confirmation extends StatelessWidget {
  const _Confirmation({
    required this.checkpoint,
    required this.board,
    required this.blocked,
    required this.onConfirm,
    required this.onBack,
  });

  final Checkpoint checkpoint;
  final RewindBoard board;

  /// Why the session cannot be undone right now, or `null` when it can.
  final String? blocked;

  final VoidCallback onConfirm;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Failure? refusal = board.refusal;
    final Failure? stale = board.refreshFailure;
    final String? reason = blocked;
    final bool canConfirm = checkpoint.canRevert && reason == null && !board.isPending;

    return ListView(
      children: <Widget>[
        _Padded(
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                l10n.sessionUndoConfirmTitle(checkpoint.label ?? l10n.sessionUndoUntitled),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              NoteLine(_when(context, checkpoint.at)),
            ],
          ),
        ),
        if (stale != null) _Padded(FailureLine(failure: stale)),
        _FileGroup(
          heading: l10n.sessionUndoGoesBack,
          files: <(String, String?)>[
            for (final RevertedFile file in checkpoint.toRevert)
              (
                file.path,
                file.action == RevertAction.restore
                    ? l10n.sessionUndoRestore
                    : l10n.sessionUndoDelete,
              ),
          ],
        ),
        _PreservedGroup(files: checkpoint.toPreserve),
        _UnchangedGroup(paths: checkpoint.unchanged),
        _Padded(
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (!checkpoint.canRevert) NoteLine(l10n.sessionUndoNothingToRevert),
              if (reason != null) NoteLine(reason),
              if (board.wasNotSent) NoteLine(l10n.sessionUndoNotSent),
              if (refusal != null) FailureLine(failure: refusal),
              const SizedBox(height: Tokens.spaceMd),
              FilledButton(
                onPressed: canConfirm ? onConfirm : null,
                child: Text(board.isPending ? l10n.sessionUndoPending : l10n.sessionUndoConfirm),
              ),
              TextButton(onPressed: onBack, child: Text(l10n.sessionUndoBack)),
            ],
          ),
        ),
      ],
    );
  }
}

/// What the undo did, file by file — never a boolean.
class _Outcome extends StatelessWidget {
  const _Outcome({required this.outcome, required this.incomplete, required this.onBack});

  final RewindOutcome outcome;

  /// What the session said after an undo that could not put every file back.
  final Failure? incomplete;

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Failure? said = incomplete;

    return ListView(
      children: <Widget>[
        _Padded(
          Semantics(
            liveRegion: true,
            child: Text(l10n.sessionUndoDoneTitle, style: Theme.of(context).textTheme.titleMedium),
          ),
        ),
        if (said != null) _Padded(FailureLine(failure: said)),
        _FileGroup(
          heading: l10n.sessionUndoReverted,
          files: <(String, String?)>[
            for (final RevertedFile file in outcome.reverted)
              (
                file.path,
                file.action == RevertAction.restore
                    ? l10n.sessionUndoRestored
                    : l10n.sessionUndoDeleted,
              ),
          ],
        ),
        _FileGroup(
          heading: l10n.sessionUndoFailed,
          files: <(String, String?)>[for (final String path in outcome.failed) (path, null)],
        ),
        _PreservedGroup(files: outcome.preserved),
        _UnchangedGroup(paths: outcome.unchanged),
        _Padded(TextButton(onPressed: onBack, child: Text(l10n.sessionUndoBack))),
      ],
    );
  }
}

/// The files that stay, each with why.
class _PreservedGroup extends StatelessWidget {
  const _PreservedGroup({required this.files});

  final List<PreservedFile> files;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return _FileGroup(
      heading: l10n.sessionUndoStays,
      files: <(String, String?)>[
        for (final PreservedFile file in files) (file.path, _reason(l10n, file.reason)),
      ],
    );
  }

  static String _reason(AppLocalizations l10n, PreserveReason reason) => switch (reason) {
    PreserveReason.modifiedOutside => l10n.sessionUndoReasonModifiedOutside,
    PreserveReason.notRestorable => l10n.sessionUndoReasonNotRestorable,
    PreserveReason.unsafePath => l10n.sessionUndoReasonUnsafePath,
    PreserveReason.noBaseline => l10n.sessionUndoReasonNoBaseline,
    PreserveReason.other => l10n.sessionUndoReasonOther,
  };
}

/// The files already the way they were.
class _UnchangedGroup extends StatelessWidget {
  const _UnchangedGroup({required this.paths});

  final List<String> paths;

  @override
  Widget build(BuildContext context) => _FileGroup(
    heading: AppLocalizations.of(context).sessionUndoAlready,
    files: <(String, String?)>[for (final String path in paths) (path, null)],
  );
}

/// One group of files under a heading: each path exactly, and what happens to it. Nothing when the
/// group is empty — a heading over nothing reads as a list that failed to load.
class _FileGroup extends StatelessWidget {
  const _FileGroup({required this.heading, required this.files});

  final String heading;

  /// Each path, and the sentence under it when there is one.
  final List<(String, String?)> files;

  @override
  Widget build(BuildContext context) {
    if (files.isEmpty) {
      return const SizedBox.shrink();
    }

    return _Padded(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SheetHeading(heading),
          for (final (String path, String? detail) in files) ...<Widget>[
            // The whole path, never shortened: it is the person's own disk.
            NoteLine(path, style: identifierStyle(context)),
            if (detail != null) NoteLine(detail),
          ],
        ],
      ),
    );
  }
}

/// A block of the sheet, with the sheet's padding around it.
class _Padded extends StatelessWidget {
  const _Padded(this.child);

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd, vertical: Tokens.spaceSm),
    child: child,
  );
}

/// When a turn began, in the locale of the app and the time zone of the phone.
String _when(BuildContext context, DateTime at) {
  final MaterialLocalizations dates = MaterialLocalizations.of(context);
  final DateTime local = at.toLocal();

  return AppLocalizations.of(context).sessionUndoPointAt(
    dates.formatMediumDate(local),
    dates.formatTimeOfDay(TimeOfDay.fromDateTime(local)),
  );
}
