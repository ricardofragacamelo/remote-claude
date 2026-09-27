/// Where a turn is written.
///
/// It clears **only when the command left**. A composer that empties on a socket that was not
/// ready is the worst of the three outcomes: the person watches their prompt disappear, believes
/// it was sent, and waits for an answer that was never asked for (S-76).
///
/// The command menu opens from here, and only **fills** the box: what is sent is whatever the box
/// holds, typed or picked. The menu is discovery, not a boundary (D-05), so a menu that could not
/// be read changes nothing about sending (S-31).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The prompt field, the command menu and the send button.
class PromptComposer extends StatefulWidget {
  const PromptComposer({
    required this.onSend,
    required this.isEnabled,
    super.key,
    this.onOpenCommands,
    this.failure,
  });

  /// Sends one turn. Answers whether the command left.
  final bool Function(String text) onSend;

  /// Whether anything may be sent at all.
  final bool isEnabled;

  /// Opens the command menu and answers what to put in the box, or `null` for nothing. Without
  /// it, there is no menu to open.
  final Future<String?> Function()? onOpenCommands;

  /// Why the server refused the last prompt, when it did — said here, beside what was typed.
  final Failure? failure;

  @override
  State<PromptComposer> createState() => _PromptComposerState();
}

class _PromptComposerState extends State<PromptComposer> {
  final TextEditingController _controller = TextEditingController();
  bool _refused = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Future<String?> Function()? openCommands = widget.onOpenCommands;
    final Failure? failure = widget.failure;

    return ContentColumn(
      children: <Widget>[
        if (_refused)
          Padding(
            padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
            child: Semantics(
              liveRegion: true,
              child: Text(
                l10n.sessionPromptRefused,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),
        if (failure != null)
          Padding(
            padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
            child: FailureLine(failure: failure),
          ),
        Row(
          children: <Widget>[
            if (openCommands != null)
              IconButton(
                icon: const Icon(Icons.terminal),
                tooltip: l10n.sessionCommandsOpen,
                onPressed: widget.isEnabled ? () => unawaited(_pick(openCommands)) : null,
              ),
            Expanded(
              child: TextField(
                controller: _controller,
                enabled: widget.isEnabled,
                minLines: 1,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: l10n.sessionPromptHint,
                  border: const OutlineInputBorder(),
                ),
                onSubmitted: (String _) => _send(),
              ),
            ),
            const SizedBox(width: Tokens.spaceSm),
            FilledButton(
              onPressed: widget.isEnabled ? _send : null,
              child: Text(l10n.sessionPromptAction),
            ),
          ],
        ),
      ],
    );
  }

  /// Puts what the menu answered in the box, with the cursor after it — ready for the argument.
  Future<void> _pick(Future<String?> Function() openCommands) async {
    final String? text = await openCommands();

    if (text == null || !mounted) {
      return;
    }

    _controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }

  void _send() {
    final String text = _controller.text.trim();

    if (text.isEmpty) {
      return;
    }

    final bool sent = widget.onSend(text);

    setState(() => _refused = !sent);

    if (sent) {
      _controller.clear();
    }
  }
}
