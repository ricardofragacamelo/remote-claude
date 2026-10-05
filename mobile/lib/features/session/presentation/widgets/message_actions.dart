/// What can be done from a prompt of the conversation (plan 10, B-24, D-09): edit it and send it
/// again, fork from before it, and put the files back to before its turn.
///
/// The phone has no hover: pressing and holding the prompt opens the three in a sheet, and the same
/// three are custom actions of the message for a screen reader, which offers them without pressing
/// and holding anything (S-84, R-08). With a turn running the undo is there, off, saying why; a
/// session that ended has no undo, and no action for it (S-83).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// What the screen does with a prompt.
class PromptActions {
  const PromptActions({required this.onEdit, required this.onFork, this.onUndo, this.undoBlocked});

  /// Puts its text in the box, to send again from before it.
  final void Function(StreamMessage prompt) onEdit;

  /// Sends it again, unchanged, from before it.
  final void Function(StreamMessage prompt) onFork;

  /// Opens the undo of its turn — `null` once the session ended: there is no undo to offer.
  final void Function(StreamMessage prompt)? onUndo;

  /// Why the undo cannot be done right now — a turn running — or `null` when it can.
  final String? undoBlocked;

  /// The actions of [prompt], in order: what each says, its icon, and what it does — `null` for
  /// the undo while it cannot be done. The undo is not there at all once the session ended.
  List<(String, IconData, VoidCallback?)> of(AppLocalizations l10n, StreamMessage prompt) {
    final void Function(StreamMessage prompt)? undo = onUndo;
    final String? blocked = undoBlocked;

    return <(String, IconData, VoidCallback?)>[
      (l10n.sessionMessageEdit, Icons.edit_outlined, () => onEdit(prompt)),
      (l10n.sessionMessageForkFrom, Icons.call_split, () => onFork(prompt)),
      if (undo != null)
        (
          blocked ?? l10n.sessionMessageUndo,
          Icons.history_toggle_off,
          blocked == null ? () => undo(prompt) : null,
        ),
    ];
  }
}

/// A prompt of the person, with its actions on a long press and in its semantics.
class PromptHold extends StatelessWidget {
  const PromptHold({required this.prompt, required this.actions, required this.child, super.key});

  final StreamMessage prompt;
  final PromptActions actions;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    // The prompt's own words are the node's label, on the node that holds its actions: the bubble
    // is a card, a node of its own, and a node that acts with no label is a button a screen reader
    // cannot name (`labeledTapTargetGuideline`, found by the e2e of plan 10, S-119).
    return Semantics(
      label: prompt.text,
      excludeSemantics: true,
      hint: l10n.sessionMessageHold,
      customSemanticsActions: <CustomSemanticsAction, VoidCallback>{
        for (final (String label, IconData _, VoidCallback? run) in actions.of(l10n, prompt))
          CustomSemanticsAction(label: label): ?run,
      },
      child: GestureDetector(
        onLongPress: () => unawaited(
          showSheet(
            context,
            (BuildContext sheet) => PromptActionsSheet(prompt: prompt, actions: actions),
          ),
        ),
        child: child,
      ),
    );
  }
}

/// The three actions of a prompt, in a sheet.
class PromptActionsSheet extends StatelessWidget {
  const PromptActionsSheet({required this.prompt, required this.actions, super.key});

  final StreamMessage prompt;
  final PromptActions actions;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ListTile(
            title: Text(l10n.sessionMessageActions, style: Theme.of(context).textTheme.titleMedium),
          ),
          for (final (String label, IconData icon, VoidCallback? run) in actions.of(l10n, prompt))
            ListTile(
              enabled: run != null,
              leading: Icon(icon),
              title: Text(label),
              // Closes the sheet first: what the action opens goes over the screen, not over it.
              onTap: run == null
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      run();
                    },
            ),
        ],
      ),
    );
  }
}
