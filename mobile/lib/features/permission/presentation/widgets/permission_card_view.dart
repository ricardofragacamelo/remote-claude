/// One question, and the answers to it.
///
/// The screen with the most rules of the whole project, because it is the one that authorises a
/// command on somebody's machine from a phone in their pocket (docs/architecture/mobile/04-ui.md):
///
/// - **the command is shown exactly** — monospaced, scrollable, never truncated, at any text size
///   (S-39, S-85). Somebody is authorising *this* to run;
/// - **risk is legible at a glance, and not only by colour**: a destructive request has the error
///   colour of the scheme, an icon and a sentence (S-40);
/// - **refusal is the easiest target** when the server leans that way (S-42), and a destructive
///   yes takes two deliberate steps (S-41) — as does every yes that persists a rule, whatever the
///   risk, because the second step is where the reach of "don't ask again" is said in full (S-65);
/// - **silence refuses**, so the countdown is always on screen, next to the way to buy more time.
///
/// Presentational: it knows nothing about the socket, the device or the lock. Whoever mounts it
/// decides what is blocked and why, and it says so in words — a control that is off with no reason
/// is a security rule that looks like a bug.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/presentation/widgets/verbatim_box.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Why the answers of a card are off, when they are.
enum AnswerBlock {
  /// This phone may watch and may not decide — pending, revoked, or not registered.
  device,

  /// There is no connection, and an answer sent now would go nowhere.
  offline,

  /// The socket has not re-delivered the question yet, and an answer needs it.
  connecting,
}

/// The card of one permission request.
class PermissionCardView extends StatefulWidget {
  const PermissionCardView({
    required this.card,
    required this.now,
    required this.onAnswer,
    required this.onDisarm,
    required this.onExtend,
    super.key,
    this.block,
    this.canApprove = true,
    this.notice,
    this.onOpenRules,
  });

  final PermissionCard card;

  /// The instant the countdown is computed against.
  final DateTime now;

  /// Why nothing can be answered right now, or `null` when it can.
  final AnswerBlock? block;

  /// `false` on a phone with no lock at all: it may refuse and may not approve (D-07).
  final bool canApprove;

  /// What happened to the last tap, when it did not do what it looked like it would.
  final String? notice;

  final void Function(PermissionDecision decision, PermissionScope scope) onAnswer;
  final VoidCallback onDisarm;
  final VoidCallback onExtend;

  /// Opens the rules screen — one of the two ways in to it (D-04). Absent, the second step says
  /// the rule is revocable without offering the way.
  final VoidCallback? onOpenRules;

  @override
  State<PermissionCardView> createState() => _PermissionCardViewState();
}

class _PermissionCardViewState extends State<PermissionCardView> {
  /// The scope of the yes waiting for its second step. Local to the widget: it only lives between
  /// two taps on this card.
  PermissionScope _armed = PermissionScope.once;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final PermissionCard card = widget.card;
    final PermissionRequest request = card.request;
    final bool destructive = request.riskHint == RiskHint.destructive;

    return Semantics(
      container: true,
      liveRegion: true,
      label: l10n.permissionCardLabel(request.toolName),
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Tokens.radius),
          side: BorderSide(
            color: destructive ? scheme.error : scheme.outlineVariant,
            width: destructive ? 2 : 1,
          ),
        ),
        child: ContentColumn(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            _Heading(request: request),
            const SizedBox(height: Tokens.spaceSm),
            _Command(command: request.command),
            const SizedBox(height: Tokens.spaceSm),
            _Countdown(remaining: request.remainingAt(widget.now)),
            const SizedBox(height: Tokens.spaceMd),
            if (card.phase == CardPhase.confirming)
              _Confirmation(
                destructive: destructive,
                reach: _armed.isPersisted ? request.rule : null,
                scope: _armed,
                enabled: widget.block == null && widget.canApprove,
                onConfirm: () => widget.onAnswer(PermissionDecision.allow, _armed),
                onCancel: widget.onDisarm,
                onOpenRules: widget.onOpenRules,
              )
            else
              _Answers(
                request: request,
                refuseEnabled: _answerable,
                approveEnabled: _answerable && widget.canApprove,
                onRefuse: () => widget.onAnswer(PermissionDecision.deny, PermissionScope.once),
                onApprove: (PermissionScope scope) {
                  setState(() => _armed = scope);
                  widget.onAnswer(PermissionDecision.allow, scope);
                },
              ),
            _Extension(
              extendable: card.isExtendable,
              enabled: widget.block == null && card.phase != CardPhase.sending,
              onExtend: widget.onExtend,
            ),
            ..._reasons(l10n, scheme),
          ],
        ),
      ),
    );
  }

  bool get _answerable =>
      widget.block == null && widget.card.isAnswerable && widget.card.phase == CardPhase.idle;

  List<Widget> _reasons(AppLocalizations l10n, ColorScheme scheme) {
    final TextStyle? style = Theme.of(context).textTheme.bodySmall;
    final String? notice = widget.notice;

    return <Widget>[
      if (widget.card.phase == CardPhase.sending) NoteLine(l10n.permissionSending, style: style),
      if (widget.block != null)
        NoteLine(switch (widget.block!) {
          AnswerBlock.device => l10n.permissionDeviceBlocked,
          AnswerBlock.offline => l10n.permissionOffline,
          AnswerBlock.connecting => l10n.permissionConnecting,
        }, style: style),
      if (!widget.canApprove) ...<Widget>[
        NoteLine(
          l10n.permissionNoLockTitle,
          style: style?.copyWith(color: scheme.error, fontWeight: FontWeight.bold),
        ),
        NoteLine(l10n.permissionNoLockBody, style: style),
      ],
      if (notice != null) NoteLine(notice, style: style?.copyWith(color: scheme.error)),
    ];
  }
}

/// What the tool is, and how dangerous — in words and an icon, never in colour alone.
class _Heading extends StatelessWidget {
  const _Heading({required this.request});

  final PermissionRequest request;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color colour = request.riskHint == RiskHint.destructive
        ? theme.colorScheme.error
        : theme.colorScheme.primary;
    final AppLocalizations l10n = AppLocalizations.of(context);

    final (IconData icon, String risk) = switch (request.riskHint) {
      RiskHint.read => (Icons.visibility_outlined, l10n.permissionRiskRead),
      RiskHint.write => (Icons.edit_outlined, l10n.permissionRiskWrite),
      RiskHint.destructive => (Icons.warning_amber_rounded, l10n.permissionRiskDestructive),
    };

    return Row(
      children: <Widget>[
        Icon(icon, color: colour),
        const SizedBox(width: Tokens.spaceSm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(toolLabel(l10n, request.toolName), style: theme.textTheme.titleSmall),
              Text(risk, style: theme.textTheme.labelMedium?.copyWith(color: colour)),
            ],
          ),
        ),
      ],
    );
  }
}

/// The words this build has for a tool, and a fallback for the ones it has none for.
///
/// A switch rather than a key built at runtime: a generated catalogue is what makes a missing key a
/// compile error, and a key assembled from a string is a key nobody can check.
String toolLabel(AppLocalizations l10n, String toolName) => switch (toolName) {
  'Bash' => l10n.permissionToolBash,
  'Write' => l10n.permissionToolWrite,
  'Edit' => l10n.permissionToolEdit,
  'MultiEdit' => l10n.permissionToolMultiEdit,
  'NotebookEdit' => l10n.permissionToolNotebookEdit,
  'Read' => l10n.permissionToolRead,
  'WebFetch' => l10n.permissionToolWebFetch,
  _ => l10n.permissionToolUnknown(toolName),
};

/// Exactly what will run: monospaced, scrollable both ways, never cut.
class _Command extends StatelessWidget {
  const _Command({required this.command});

  final String command;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: <Widget>[
      Text(
        AppLocalizations.of(context).permissionCommandLabel,
        style: Theme.of(context).textTheme.labelSmall,
      ),
      const SizedBox(height: Tokens.spaceSm),
      VerbatimBox(command),
    ],
  );
}

/// How long is left before silence refuses.
class _Countdown extends StatelessWidget {
  const _Countdown({required this.remaining});

  final Duration remaining;

  @override
  Widget build(BuildContext context) => Row(
    children: <Widget>[
      const Icon(Icons.timer_outlined, size: Tokens.spaceMd),
      const SizedBox(width: Tokens.spaceSm),
      Expanded(
        child: Text(
          AppLocalizations.of(
            context,
          ).permissionRemaining((remaining.inMilliseconds / 1000).ceil()),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
    ],
  );
}

/// Refusal first and largest; every yes spelled out with what it reaches.
class _Answers extends StatelessWidget {
  const _Answers({
    required this.request,
    required this.refuseEnabled,
    required this.approveEnabled,
    required this.onRefuse,
    required this.onApprove,
  });

  final PermissionRequest request;
  final bool refuseEnabled;
  final bool approveEnabled;
  final VoidCallback onRefuse;
  final void Function(PermissionScope scope) onApprove;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextStyle? hint = Theme.of(context).textTheme.bodySmall;
    final VoidCallback? refuse = refuseEnabled ? onRefuse : null;
    final Widget refusal = Text(l10n.permissionDeny);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // The server leans towards "no" (`defaultToNo`), so "no" is the full-width, filled target and
        // every yes is a smaller, outlined one below it (S-42).
        if (request.defaultToNo)
          FilledButton(onPressed: refuse, child: refusal)
        else
          OutlinedButton(onPressed: refuse, child: refusal),
        const SizedBox(height: Tokens.spaceMd),
        Wrap(
          spacing: Tokens.spaceSm,
          runSpacing: Tokens.spaceSm,
          children: <Widget>[
            for (final PermissionScope scope in request.scopes)
              _ScopeChoice(
                label: switch (scope) {
                  PermissionScope.once => l10n.permissionScopeOnce,
                  PermissionScope.session => l10n.permissionScopeSession,
                  PermissionScope.project => l10n.permissionScopeProject,
                  PermissionScope.always => l10n.permissionScopeAlways,
                },
                hint: switch (scope) {
                  PermissionScope.once => l10n.permissionScopeOnceHint,
                  PermissionScope.session => l10n.permissionScopeSessionHint,
                  PermissionScope.project => l10n.permissionScopeProjectHint(
                    ruleLifetime(l10n, request.rule),
                  ),
                  PermissionScope.always => l10n.permissionScopeAlwaysHint(
                    ruleLifetime(l10n, request.rule),
                  ),
                },
                hintStyle: hint,
                onPressed: approveEnabled ? () => onApprove(scope) : null,
              ),
          ],
        ),
      ],
    );
  }
}

/// One yes, and what it means.
class _ScopeChoice extends StatelessWidget {
  const _ScopeChoice({
    required this.label,
    required this.hint,
    required this.hintStyle,
    required this.onPressed,
  });

  final String label;
  final String hint;
  final TextStyle? hintStyle;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: <Widget>[
      OutlinedButton(onPressed: onPressed, child: Text(label)),
      Text(hint, style: hintStyle),
    ],
  );
}

/// How long a rule lives, in the words a person reads it in: days, or hours when less than one.
String ruleLifetime(AppLocalizations l10n, RuleOffer? rule) {
  final Duration lifetime = rule?.lifetime ?? Duration.zero;

  return lifetime.inDays >= 1
      ? l10n.permissionRuleDays(lifetime.inDays)
      : l10n.permissionRuleHours(lifetime.inHours < 1 ? 1 : lifetime.inHours);
}

/// The deliberate second step of a yes that needs one.
///
/// For a destructive yes, the warning. For a persisted one, the reach in full — which command,
/// where, for how long — with no euphemism and no acronym (S-17), and the way to the rules that take
/// it back. A destructive yes that also persists says both.
class _Confirmation extends StatelessWidget {
  const _Confirmation({
    required this.destructive,
    required this.reach,
    required this.scope,
    required this.enabled,
    required this.onConfirm,
    required this.onCancel,
    required this.onOpenRules,
  });

  final bool destructive;

  /// The rule the yes would grant, when it persists one.
  final RuleOffer? reach;

  final PermissionScope scope;
  final bool enabled;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final VoidCallback? onOpenRules;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color danger = theme.colorScheme.error;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final RuleOffer? rule = reach;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (destructive)
          Text(
            l10n.permissionConfirmTitle,
            style: theme.textTheme.titleSmall?.copyWith(color: danger),
          ),
        if (rule != null) ...<Widget>[
          Text(l10n.permissionPersistTitle, style: theme.textTheme.titleSmall),
          const SizedBox(height: Tokens.spaceSm),
          Text(
            scope == PermissionScope.always
                ? l10n.permissionPersistAlways(ruleLifetime(l10n, rule))
                : l10n.permissionPersistProject(ruleLifetime(l10n, rule)),
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: Tokens.spaceSm),
          VerbatimBox(rule.pattern),
          NoteLine(l10n.permissionPersistRevocable),
          if (onOpenRules != null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: onOpenRules,
                icon: const Icon(Icons.rule),
                label: Text(l10n.permissionPersistOpenRules),
              ),
            ),
        ],
        const SizedBox(height: Tokens.spaceSm),
        // Going back is the larger target here too: the accident this step exists for is a tap.
        FilledButton(onPressed: onCancel, child: Text(l10n.permissionConfirmCancel)),
        const SizedBox(height: Tokens.spaceSm),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(foregroundColor: destructive ? danger : null),
            onPressed: enabled ? onConfirm : null,
            child: Text(
              rule != null ? l10n.permissionPersistConfirm : l10n.permissionConfirmAction,
            ),
          ),
        ),
      ],
    );
  }
}

/// More time, or the reason there is no more.
class _Extension extends StatelessWidget {
  const _Extension({required this.extendable, required this.enabled, required this.onExtend});

  final bool extendable;
  final bool enabled;
  final VoidCallback onExtend;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    if (!extendable) {
      return NoteLine(l10n.permissionExtendExhausted);
    }

    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: TextButton.icon(
        onPressed: enabled ? onExtend : null,
        icon: const Icon(Icons.more_time),
        label: Text(l10n.permissionExtend),
      ),
    );
  }
}
