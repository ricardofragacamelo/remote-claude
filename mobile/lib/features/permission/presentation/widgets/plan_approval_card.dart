/// The plan Claude proposes, to approve or to send back (plan 10, B-21; plan 08, B-22).
///
/// In plan mode Claude presents its plan with `ExitPlanMode`, and the question is this card: the plan
/// as text, and two ways out — **approve**, which allows it and changes the mode to the one chosen
/// (asking before each edit, or accepting edits), and **keep planning**, which refuses it with what
/// the person wrote as the reason that goes back to Claude. It is the same `permission.resolve` as
/// any other question, so a plan approved on another device settles this card too.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The modes an approved plan can go on in: asking before each edit, or accepting edits.
const List<String> planModes = <String>['default', 'acceptEdits'];

/// The tool whose question is a plan to approve.
const String planTool = 'ExitPlanMode';

/// The card of one plan.
class PlanApprovalCard extends StatefulWidget {
  const PlanApprovalCard({
    required this.card,
    required this.now,
    required this.onApprove,
    required this.onKeepPlanning,
    required this.onExtend,
    super.key,
    this.block,
    this.notice,
  });

  final PermissionCard card;

  /// The instant the countdown is computed against.
  final DateTime now;

  /// Why nothing can be answered right now, or `null` when it can.
  final AnswerBlock? block;

  /// What happened to the last tap, when it did not do what it looked like it would.
  final String? notice;

  /// The plan is approved, to go on in [mode].
  final void Function(String mode) onApprove;

  /// The plan goes back, with [comment] for Claude.
  final void Function(String comment) onKeepPlanning;
  final VoidCallback onExtend;

  @override
  State<PlanApprovalCard> createState() => _PlanApprovalCardState();
}

class _PlanApprovalCardState extends State<PlanApprovalCard> {
  /// The mode chosen, and what to change — local: they only live while the card is on screen.
  String _mode = planModes.first;
  final TextEditingController _comment = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final PermissionCard card = widget.card;
    final bool answerable =
        widget.block == null && card.isAnswerable && card.phase == CardPhase.idle;
    final Object? plan = card.request.input['plan'];
    final String? notice = widget.notice;
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Semantics(
      container: true,
      liveRegion: true,
      label: l10n.permissionPlanLabel,
      child: Card(
        child: ContentColumn(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(l10n.permissionPlanTitle, style: theme.textTheme.titleSmall),
            const SizedBox(height: Tokens.spaceSm),
            // The plan, whole and selectable. It is prose, not a command: no monospace.
            SelectableText(plan is String ? plan : '', style: theme.textTheme.bodyMedium),
            const SizedBox(height: Tokens.spaceSm),
            PermissionCountdown(remaining: card.request.remainingAt(widget.now)),
            const SizedBox(height: Tokens.spaceSm),
            Text(l10n.permissionPlanModeLegend, style: theme.textTheme.labelMedium),
            RadioGroup<String>(
              groupValue: _mode,
              onChanged: (String? mode) => setState(() => _mode = mode ?? _mode),
              child: Column(
                children: <Widget>[
                  for (final String mode in planModes)
                    RadioListTile<String>(
                      value: mode,
                      title: Text(_modeName(l10n, mode)),
                      contentPadding: EdgeInsets.zero,
                    ),
                ],
              ),
            ),
            FilledButton(
              onPressed: answerable ? () => widget.onApprove(_mode) : null,
              child: Text(l10n.permissionPlanApprove),
            ),
            const SizedBox(height: Tokens.spaceMd),
            TextField(
              controller: _comment,
              minLines: 2,
              maxLines: 6,
              decoration: InputDecoration(
                labelText: l10n.permissionPlanCommentLabel,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: Tokens.spaceSm),
            OutlinedButton(
              onPressed: answerable ? () => widget.onKeepPlanning(_comment.text) : null,
              child: Text(l10n.permissionPlanKeepPlanning),
            ),
            CardFooter(
              card: card,
              blocked: widget.block != null,
              notice: notice,
              onExtend: widget.onExtend,
            ),
          ],
        ),
      ),
    );
  }

  static String _modeName(AppLocalizations l10n, String mode) =>
      mode == 'acceptEdits' ? l10n.permissionPlanModeAcceptEdits : l10n.permissionPlanModeDefault;
}
