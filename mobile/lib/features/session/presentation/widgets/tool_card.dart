/// One tool, running on the user's own machine.
///
/// A card that starts **folded**, as the web's line does (plan 22, B-32): what the tool is — its
/// name and the description the model gave the call, or its name alone — and how it is going.
/// Opened, it shows the **exact** input, never a summary of it: somebody watching a command run on
/// their laptop is entitled to see the command — that is the whole proposition of the product, and
/// a card that paraphrased it would be asking for trust it has not earned. A shell command is
/// **IN** (the command) and **OUT** (what it said: the end the timeline keeps, then the whole output,
/// asked for once).
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/providers/transcript_content_controllers.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_output_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// `mcp__server__tool`: an MCP tool, by its server and its tool.
final RegExp _mcp = RegExp(r'^mcp__(.+?)__(.+)$');

/// Whether a tool opens a subagent — whose own label already says what it was asked.
bool opensSubagent(String toolName) => toolName == 'Agent' || toolName == 'Task';

/// The label of [tool] on its line: with the description the model gave the call, the tool and that
/// description — "Bash · Run the tests" —, as the Claude Code shows it (S-111); without one, its
/// name, as before. A subagent keeps its name: its description is the subagent's own, and an MCP tool
/// says its server and its tool.
String toolLabel(AppLocalizations l10n, ToolExecution tool) {
  final String? title = tool.title;

  if (title == null || opensSubagent(tool.toolName)) {
    return tool.toolName;
  }

  final RegExpMatch? mcp = _mcp.firstMatch(tool.toolName);

  return l10n.sessionToolTitled(
    mcp == null ? tool.toolName : '${mcp.group(1)} · ${mcp.group(2)}',
    title,
  );
}

/// The command of a shell call, when its input has one.
String? commandOf(ToolExecution tool) {
  final Object? command = tool.input['command'];
  return tool.toolName == 'Bash' && command is String ? command : null;
}

/// Whether the whole output of [tool] can be asked for: it finished — a tool still running has no
/// result yet (S-116), and a refused one has only the refusal —, and it is of the main conversation,
/// the only chain the route reads.
bool hasResult(ToolExecution tool) =>
    (tool.status == ToolStatus.succeeded || tool.status == ToolStatus.failed) && !tool.isSubagent;

/// The card of one invocation.
class ToolCard extends ConsumerStatefulWidget {
  const ToolCard({required this.tool, super.key, this.decision, this.conversationId});

  /// What is running, or what ran.
  final ToolExecution tool;

  /// How the question about it was settled — the card it was, become a line (plan 10, B-20): by
  /// whom, from where, by a rule, or refused because nobody answered in time.
  final PermissionOutcome? decision;

  /// The conversation in Claude's store it belongs to — what its whole output is read from. `null`
  /// while nothing said which, and then only the end the timeline keeps is shown.
  final String? conversationId;

  @override
  ConsumerState<ToolCard> createState() => _ToolCardState();
}

class _ToolCardState extends ConsumerState<ToolCard> {
  /// Opened by a tap. Local: nobody else needs it, and it dies with the card.
  bool _open = false;

  /// The whole output was asked for. It stays asked for as long as the card lives, so folding it
  /// and opening it again asks nothing (S-113).
  bool _asked = false;

  @override
  Widget build(BuildContext context) {
    final ToolExecution tool = widget.tool;
    final String? conversationId = widget.conversationId;
    final PermissionOutcome? settled = widget.decision;

    _asked = _asked || (_open && conversationId != null && hasResult(tool));

    final AsyncValue<ToolOutput>? result = _asked && conversationId != null
        ? ref.watch(toolResultControllerProvider(conversationId, tool.toolUseId))
        : null;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _ToolLine(tool: tool, open: _open, onToggle: () => setState(() => _open = !_open)),
          if (settled != null || _open)
            Padding(
              padding: const EdgeInsets.fromLTRB(Tokens.spaceMd, 0, Tokens.spaceMd, Tokens.spaceMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (settled != null) PermissionOutcomeLine(outcome: settled),
                  if (_open)
                    _ToolDetails(
                      tool: tool,
                      said: ToolOutputView(
                        tool: tool,
                        result: result,
                        onRetry: () => ref
                            .read(
                              toolResultControllerProvider(
                                conversationId!,
                                tool.toolUseId,
                              ).notifier,
                            )
                            .retry(),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The line of the card: the fold, what the tool is, and how it is going — a target of its own,
/// whose accessible name says it whole.
class _ToolLine extends StatelessWidget {
  const _ToolLine({required this.tool, required this.open, required this.onToggle});

  final ToolExecution tool;
  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String label = toolLabel(l10n, tool);
    final String status = switch (tool.status) {
      ToolStatus.running => l10n.sessionToolStatusRunning,
      ToolStatus.succeeded => l10n.sessionToolStatusSucceeded,
      ToolStatus.failed => l10n.sessionToolStatusFailed,
      ToolStatus.denied => l10n.sessionToolStatusDenied,
    };

    // Its accessible name says it whole, with its state — the words drawn may cut it.
    return FoldLine(
      open: open,
      onToggle: onToggle,
      label: l10n.sessionToolRowLabel(label, status),
      inset: Tokens.spaceMd,
      title: Text(
        label,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.titleSmall,
      ),
      trailing: Text(status, style: theme.textTheme.labelMedium),
    );
  }
}

/// The card opened: the exact input and what the tool said — a shell command as IN and OUT.
class _ToolDetails extends StatelessWidget {
  const _ToolDetails({required this.tool, required this.said});

  final ToolExecution tool;

  /// What the tool said, drawn already.
  final Widget said;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? command = commandOf(tool);

    if (command == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            label: l10n.sessionToolRowInput,
            child: Text(_exactInput(tool.input), style: identifierStyle(context)),
          ),
          said,
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _Side(
          tag: l10n.sessionToolRowIn,
          label: l10n.sessionToolRowInput,
          child: Text(command, style: identifierStyle(context)),
        ),
        // A command still running has said nothing yet, unless it printed as it went.
        if (tool.status != ToolStatus.running || tool.output.isNotEmpty)
          _Side(tag: l10n.sessionToolRowOut, label: l10n.sessionToolRowOutput, child: said),
      ],
    );
  }

  /// The input exactly as it came, laid out to be read — never `Map.toString()`.
  static String _exactInput(Map<String, Object?> input) =>
      const JsonEncoder.withIndent('  ', _asText).convert(input);

  static Object? _asText(Object? value) => '$value';
}

/// One side of a shell call — what went in, what came out — under its tag, as the Claude Code does.
class _Side extends StatelessWidget {
  const _Side({required this.tag, required this.label, required this.child});

  final String tag;
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Tokens.spaceSm),
    child: Semantics(
      container: true,
      label: label,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: Tokens.touchTarget,
            child: ExcludeSemantics(
              child: Text(
                tag,
                style: identifierStyle(
                  context,
                )?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    ),
  );
}
