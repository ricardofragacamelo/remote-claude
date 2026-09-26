/// What the user authorised in advance, and where it is taken back.
///
/// A screen of its own, as on the web: whoever approved from away has to be able to take it back
/// from away, by the same road. Symmetry between the two ends is not aesthetics — it is the
/// difference between revoking where you are and having to open the laptop
/// (docs/architecture/mobile/04-ui.md#a-tela-de-regras).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:remote_claude/features/permission/presentation/providers/rule_list_controller.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/features/permission/presentation/widgets/verbatim_box.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The rules screen.
class RulesPage extends ConsumerWidget {
  const RulesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final RuleListController controller = ref.read(ruleListControllerProvider.notifier);
    final AppLocalizations l10n = AppLocalizations.of(context);

    return AppScreen(
      title: l10n.rulesTitle,
      actions: <Widget>[
        // Rules are read, not pushed: a rule granted on another device appears when the list is
        // read again (S-20), and this is how that is asked for.
        IconButton(
          tooltip: l10n.rulesReload,
          icon: const Icon(Icons.refresh),
          onPressed: controller.reload,
        ),
      ],
      body: LoadedView<RuleBoard>(
        value: ref.watch(ruleListControllerProvider),
        labels: LoadedLabels(
          loading: l10n.rulesLoading,
          emptyTitle: l10n.rulesEmptyTitle,
          emptyDescription: l10n.rulesEmptyBody,
        ),
        isEmpty: (RuleBoard board) => board.rules.isEmpty,
        onRetry: controller.reload,
        builder: (RuleBoard board) => _Rules(board: board),
      ),
    );
  }
}

/// The loaded list, with what it is above it.
class _Rules extends ConsumerWidget {
  const _Rules({required this.board});

  final RuleBoard board;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final DateTime now = ref.watch(permissionClockProvider)();
    final RuleListController controller = ref.read(ruleListControllerProvider.notifier);

    return ListView.builder(
      itemCount: board.rules.length + 1,
      itemBuilder: (BuildContext context, int index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            child: Text(
              AppLocalizations.of(context).rulesDescription,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          );
        }

        final PermissionRule rule = board.rules[index - 1];

        return RuleTile(
          rule: rule,
          expiringSoon: rule.isExpiringSoonAt(now),
          revoking: board.revoking.contains(rule.id),
          failure: board.failedRuleId == rule.id ? board.failure : null,
          onRevoke: () => controller.revoke(rule.id),
        );
      },
    );
  }
}

/// One rule: how far it reaches, who granted it, until when — and the way to take it back.
///
/// Revoking is **direct**, with no second step: the promise is that taking an authorisation back is
/// one tap away, and it is the safe direction — the worst a stray revoke does is make Claude ask
/// again. What protects it from a double tap is that a row being revoked takes no second one.
class RuleTile extends StatelessWidget {
  const RuleTile({
    required this.rule,
    required this.expiringSoon,
    required this.revoking,
    required this.onRevoke,
    super.key,
    this.failure,
  });

  final PermissionRule rule;
  final bool expiringSoon;
  final bool revoking;

  /// Why the last revocation of this rule did not happen, when it did not.
  final Failure? failure;

  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final MaterialLocalizations dates = MaterialLocalizations.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    String date(DateTime at) => dates.formatMediumDate(at.toLocal());
    final Failure? failed = failure;

    return Semantics(
      container: true,
      label: l10n.rulesRowLabel(rule.pattern),
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd, vertical: Tokens.spaceSm),
        child: Opacity(
          opacity: rule.status == RuleStatus.expired ? 0.7 : 1,
          child: ContentColumn(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      rule.scope == PermissionScope.always
                          ? l10n.rulesScopeAlways
                          : l10n.rulesScopeProject,
                      style: theme.textTheme.titleSmall,
                    ),
                  ),
                  Text(switch (rule.status) {
                    RuleStatus.active => l10n.rulesStatusActive,
                    RuleStatus.expired => l10n.rulesStatusExpired,
                    RuleStatus.unknown => l10n.rulesStatusUnknown,
                  }, style: theme.textTheme.labelMedium),
                ],
              ),
              NoteLine(
                l10n.rulesToolDecision(
                  toolLabel(l10n, rule.toolName),
                  rule.decision == PermissionDecision.allow
                      ? l10n.rulesDecisionAllow
                      : l10n.rulesDecisionDeny,
                ),
              ),
              const SizedBox(height: Tokens.spaceSm),
              VerbatimBox(rule.pattern),
              if (rule.projectPath != null)
                NoteLine(l10n.rulesProject(rule.projectPath!), style: identifierStyle(context)),
              NoteLine(l10n.rulesGranted(rule.grantedBy, date(rule.grantedAt))),
              NoteLine(
                rule.status == RuleStatus.expired
                    ? l10n.rulesExpiredOn(date(rule.expiresAt))
                    : l10n.rulesValidUntil(date(rule.expiresAt)),
              ),
              if (expiringSoon)
                NoteLine(
                  l10n.rulesExpiringSoon(date(rule.expiresAt)),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.error,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              const SizedBox(height: Tokens.spaceSm),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton(
                  onPressed: revoking ? null : onRevoke,
                  child: Text(revoking ? l10n.rulesRevoking : l10n.rulesRevoke),
                ),
              ),
              if (failed != null)
                NoteLine(
                  translateFailure(l10n, failed),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
