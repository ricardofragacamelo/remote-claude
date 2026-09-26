/// One tool, running on the user's own machine.
///
/// The **exact** input is shown, never a summary of it. Somebody watching a command run on their
/// laptop is entitled to see the command — that is the whole proposition of the product, and a
/// card that paraphrased it would be asking for trust it has not earned.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The card of one invocation.
class ToolCard extends StatelessWidget {
  const ToolCard({required this.tool, super.key});

  /// What is running, or what ran.
  final ToolExecution tool;

  @override
  Widget build(BuildContext context) => Card(
    child: ContentColumn(
      children: <Widget>[
        _Heading(tool: tool),
        const SizedBox(height: Tokens.spaceSm),
        Text('${tool.input}', style: identifierStyle(context)),
        if (tool.output.isNotEmpty) _Output(output: tool.output),
        if (tool.summary != null) NoteLine(tool.summary!),
      ],
    ),
  );
}

/// What the tool is, and how it is going.
class _Heading extends StatelessWidget {
  const _Heading({required this.tool});

  final ToolExecution tool;

  @override
  Widget build(BuildContext context) {
    final TextTheme text = Theme.of(context).textTheme;
    final AppLocalizations l10n = AppLocalizations.of(context);

    final String status = switch (tool.status) {
      ToolStatus.running => l10n.sessionToolStatusRunning,
      ToolStatus.succeeded => l10n.sessionToolStatusSucceeded,
      ToolStatus.failed => l10n.sessionToolStatusFailed,
      ToolStatus.denied => l10n.sessionToolStatusDenied,
    };

    return Row(
      children: <Widget>[
        Expanded(child: Text(tool.toolName, style: text.titleSmall)),
        Text(status, style: text.labelMedium),
      ],
    );
  }
}

/// Everything the tool has printed so far.
class _Output extends StatelessWidget {
  const _Output({required this.output});

  final String output;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Tokens.spaceSm),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          AppLocalizations.of(context).sessionToolOutputLabel,
          style: Theme.of(context).textTheme.labelSmall,
        ),
        Text(output, style: identifierStyle(context)),
      ],
    ),
  );
}
