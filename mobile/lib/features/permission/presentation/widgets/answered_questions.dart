/// A question of Claude, once it is over — read-only (plan 24, B-19): each question with the option
/// chosen marked, the others faded, and the free answer in words. Refused, it says why; out of time,
/// that nothing was sent. Of a session answered elsewhere, the questions and what the CLI said.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// How a question ended, as far as this screen knows: answered, refused, out of time — or answered
/// where no record of ours was kept (D-13).
enum QuestionEnd { answered, declined, expired, unknown }

/// The questions, and what was answered.
class AnsweredQuestions extends StatelessWidget {
  const AnsweredQuestions({
    required this.interaction,
    required this.end,
    super.key,
    this.answers,
    this.reason,
    this.summary,
  });

  final QuestionInteraction interaction;
  final QuestionEnd end;
  final List<QuestionAnswer>? answers;

  /// Why it was refused, on [QuestionEnd.declined].
  final String? reason;

  /// What the CLI said, when there is no record of the answers.
  final String? summary;

  @override
  Widget build(BuildContext context) {
    final String? cliSaid = summary;
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? said = switch (end) {
      QuestionEnd.declined => l10n.permissionQuestionDeclined(reason ?? ''),
      QuestionEnd.expired => l10n.permissionQuestionExpired,
      QuestionEnd.unknown => l10n.permissionQuestionAnsweredElsewhere,
      QuestionEnd.answered => null,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (said != null)
          Text(
            said,
            style: theme.textTheme.bodySmall?.copyWith(
              color: end == QuestionEnd.declined ? theme.colorScheme.error : null,
            ),
          ),
        for (final Question question in interaction.questions)
          _Answered(
            question: question,
            answer: answers
                ?.where((QuestionAnswer each) => each.questionId == question.id)
                .firstOrNull,
          ),
        if (end == QuestionEnd.unknown && cliSaid != null && cliSaid.isNotEmpty)
          Text(cliSaid, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

/// One question: its header and text, and its options — the chosen ones marked, the rest faded.
class _Answered extends StatelessWidget {
  const _Answered({required this.question, required this.answer});

  final Question question;
  final QuestionAnswer? answer;

  @override
  Widget build(BuildContext context) {
    final String? other = answer?.other;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: Tokens.spaceSm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            question.header.isEmpty ? question.prompt : '${question.header} · ${question.prompt}',
            style: theme.textTheme.bodySmall,
          ),
          for (final QuestionOption option in question.options)
            _Choice(label: option.label, chosen: answer?.selected.contains(option.label) ?? false),
          if (other != null)
            _Choice(label: l10n.permissionQuestionOtherAnswer(other), chosen: true),
        ],
      ),
    );
  }
}

/// One option: marked when chosen, faded when not — and said so to a screen reader.
class _Choice extends StatelessWidget {
  const _Choice({required this.label, required this.chosen});

  final String label;
  final bool chosen;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: chosen,
    child: Opacity(
      opacity: chosen ? 1 : 0.5,
      child: Row(
        children: <Widget>[
          Icon(chosen ? Icons.check : Icons.remove, size: Tokens.spaceMd),
          const SizedBox(width: Tokens.spaceSm),
          Expanded(
            child: Text(label, style: chosen ? const TextStyle(fontWeight: FontWeight.w600) : null),
          ),
        ],
      ),
    ),
  );
}

/// How a settled question ended: answered; refused by the deadline, which is nobody's; or refused.
/// How a question the history carries ended — unknown with no record of it here (plan 24, B-22).
QuestionEnd questionEndOfRecord(RecordedQuestion recorded) => switch (recorded.outcome) {
  QuestionOutcome.answered => QuestionEnd.answered,
  QuestionOutcome.declined => QuestionEnd.declined,
  QuestionOutcome.expired => QuestionEnd.expired,
  null => QuestionEnd.unknown,
};

QuestionEnd questionEndOf(PermissionOutcome outcome) => outcome.decision == PermissionDecision.allow
    ? QuestionEnd.answered
    : outcome.expired
    ? QuestionEnd.expired
    : QuestionEnd.declined;
