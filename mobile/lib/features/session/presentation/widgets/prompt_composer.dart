/// Where a turn is written.
///
/// It clears **only when the command left**. A composer that empties on a socket that was not
/// ready is the worst of the three outcomes: the person watches their prompt disappear, believes
/// it was sent, and waits for an answer that was never asked for (S-76).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The prompt field and its send button.
class PromptComposer extends StatefulWidget {
  const PromptComposer({required this.onSend, required this.isEnabled, super.key});

  /// Sends one turn. Answers whether the command left.
  final bool Function(String text) onSend;

  /// Whether anything may be sent at all.
  final bool isEnabled;

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
        Row(
          children: <Widget>[
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
