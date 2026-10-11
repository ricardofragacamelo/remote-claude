/// The plan the agent proposes, to approve or to send back (plan 10, B-21; plan 08, B-22).
///
/// Reading without changing anything, the agent presents its plan as a request whose `interaction`
/// is of kind `plan` (plan 28, B-20), and the question is this card: the plan as text, and two ways
/// out — **approve**, which allows it and changes the mode to the one chosen (asking before each
/// edit, or accepting edits, of those the engine announced — plan 28, B-27), and **keep planning**,
/// which refuses it with what the person wrote as the reason that goes back to the agent. It is the
/// same `permission.resolve` as any other question, so a plan approved on another device settles
/// this card too.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/plan_interaction.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The modes an approved plan can go on in, in canonical names: asking before each edit, or
/// accepting edits. Only those the engine announced are offered.
const List<String> planModes = <String>['ask', 'acceptEdits'];

/// Of [announced], the modes an approved plan can go on in, in the order the card offers them.
List<String> planModesOf(List<String> announced) => <String>[
  for (final String mode in planModes)
    if (announced.contains(mode)) mode,
];

/// The card of one plan.
class PlanApprovalCard extends StatefulWidget {
  const PlanApprovalCard({
    required this.card,
    required this.plan,
    required this.now,
    required this.onApprove,
    required this.onKeepPlanning,
    required this.onExtend,
    super.key,
    this.modes = const <String>[],
    this.block,
    this.notice,
  });

  final PermissionCard card;

  /// The modes the session's engine announced — what the next mode is chosen among. None known, and
  /// the plan is approved without changing the mode.
  final List<String> modes;

  /// The plan, as the request's interaction carried it.
  final PlanInteraction plan;

  /// The instant the countdown is computed against.
  final DateTime now;

  /// Why nothing can be answered right now, or `null` when it can.
  final AnswerBlock? block;

  /// What happened to the last tap, when it did not do what it looked like it would.
  final String? notice;

  /// The plan is approved, to go on in [mode] — `null` when no mode it can go on in was announced.
  final void Function(String? mode) onApprove;

  /// The plan goes back, with [comment] for the agent.
  final void Function(String comment) onKeepPlanning;
  final VoidCallback onExtend;

  @override
  State<PlanApprovalCard> createState() => _PlanApprovalCardState();
}

class _PlanApprovalCardState extends State<PlanApprovalCard> {
  /// The mode chosen, and what to change — local: they only live while the card is on screen.
  /// `null` until somebody picks one: the first offered is the one meant.
  String? _picked;
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
    final String? notice = widget.notice;
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<String> offered = planModesOf(widget.modes);
    final String? mode = offered.contains(_picked) ? _picked : offered.firstOrNull;

    return Semantics(
      container: true,
      liveRegion: true,
      label: l10n.permissionPlanLabel(agentNameIn(context, card.request.engine)),
      child: Card(
        child: ContentColumn(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(l10n.permissionPlanTitle, style: theme.textTheme.titleSmall),
            const SizedBox(height: Tokens.spaceSm),
            // The plan, whole and selectable. It is prose, not a command: no monospace.
            SelectableText(widget.plan.markdown, style: theme.textTheme.bodyMedium),
            const SizedBox(height: Tokens.spaceSm),
            PermissionCountdown(remaining: card.request.remainingAt(widget.now)),
            const SizedBox(height: Tokens.spaceSm),
            // One mode to go on in is no choice: the plan goes on in it, and nothing asks which.
            if (offered.length > 1) ...<Widget>[
              Text(l10n.permissionPlanModeLegend, style: theme.textTheme.labelMedium),
              RadioGroup<String>(
                groupValue: mode,
                onChanged: (String? picked) => setState(() => _picked = picked ?? _picked),
                child: Column(
                  children: <Widget>[
                    for (final String each in offered)
                      RadioListTile<String>(
                        value: each,
                        title: Text(_modeName(l10n, each)),
                        contentPadding: EdgeInsets.zero,
                      ),
                  ],
                ),
              ),
            ],
            FilledButton(
              onPressed: answerable ? () => widget.onApprove(mode) : null,
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
      mode == 'acceptEdits' ? l10n.permissionPlanModeAcceptEdits : l10n.permissionPlanModeAsk;
}
