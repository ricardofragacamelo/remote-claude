/// A question of Claude (`AskUserQuestion`), answered from the phone (plan 24, B-18).
///
/// The card of the web, laid out for a narrow screen (docs/architecture/mobile/04-ui.md):
///
/// - **one question per step** — "Question 2 of 3", Back and Next, the answered ones marked —,
///   because tabs do not fit a phone;
/// - a **single choice** is a radio, and choosing one that is not the last goes on by itself, with
///   Back always in view (D-24); a **multiple** one is a checkbox, and stays;
/// - **"Other"** is always the last option, and opens a field with the focus; marked and empty, it is
///   no answer;
/// - the option Claude **recommends** is marked, never chosen for the person (D-23);
/// - **"See preview"** opens a sheet with the option's preview, monospaced (D-21);
/// - **"Send answers"** waits for every question (D-04); **"Don't answer"** refuses, with a reason the
///   person may leave empty (D-15).
///
/// No lock and no second step: answering a question authorises nothing (D-11), and the server says
/// it reads nothing (`riskHint: read`). Presentational: the draft lives in the queue, by request.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The value of "Other" among the radios of a single choice — no label of Claude's can be it.
const String _otherValue = '\u0000other';

/// The card of one question of Claude.
class QuestionCard extends StatefulWidget {
  const QuestionCard({
    required this.card,
    required this.interaction,
    required this.draft,
    required this.now,
    required this.onDraft,
    required this.onSubmit,
    required this.onDecline,
    required this.onExtend,
    super.key,
    this.block,
    this.notice,
  });

  final PermissionCard card;
  final QuestionInteraction interaction;

  /// What was chosen so far — kept by the queue, so a reconnect never loses it.
  final QuestionDraft draft;

  /// The instant the countdown is computed against.
  final DateTime now;

  /// Why nothing can be answered right now, or `null` when it can.
  final AnswerBlock? block;

  /// What happened to the last tap, when it did not do what it looked like it would.
  final String? notice;

  final void Function(QuestionDraft draft) onDraft;
  final void Function(List<QuestionAnswer> answers) onSubmit;

  /// Not answering, with what the person wrote — empty when they wrote nothing.
  final void Function(String reason) onDecline;
  final VoidCallback onExtend;

  @override
  State<QuestionCard> createState() => _QuestionCardState();
}

class _QuestionCardState extends State<QuestionCard> {
  /// "Don't answer" was tapped: the reason is asked for. Local — it dies with the card.
  bool _declining = false;

  @override
  Widget build(BuildContext context) {
    final PermissionCard card = widget.card;
    final QuestionInteraction interaction = widget.interaction;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    final bool answerable =
        widget.block == null && card.isAnswerable && card.phase == CardPhase.idle;
    final String? notice = widget.notice;

    return Semantics(
      container: true,
      liveRegion: true,
      label: l10n.permissionQuestionLabel,
      child: Card(
        child: ContentColumn(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(l10n.permissionToolAskUserQuestion, style: theme.textTheme.titleSmall),
            const SizedBox(height: Tokens.spaceSm),
            if (interaction.malformed) Text(l10n.permissionQuestionMalformed),
            if (_declining || interaction.malformed)
              _DeclineForm(
                enabled: answerable,
                canGoBack: !interaction.malformed,
                onConfirm: widget.onDecline,
                onBack: () => setState(() => _declining = false),
              )
            else ...<Widget>[
              _Step(
                interaction: interaction,
                draft: widget.draft,
                enabled: answerable,
                onDraft: widget.onDraft,
              ),
              const SizedBox(height: Tokens.spaceSm),
              FilledButton(
                onPressed: answerable && widget.draft.allAnswered(interaction)
                    ? () => widget.onSubmit(widget.draft.answersOf(interaction))
                    : null,
                child: Text(l10n.permissionQuestionSubmit),
              ),
              OutlinedButton(
                onPressed: answerable ? () => setState(() => _declining = true) : null,
                child: Text(l10n.permissionQuestionDecline),
              ),
            ],
            const SizedBox(height: Tokens.spaceSm),
            CardFooter(
              card: card,
              blocked: widget.block != null,
              notice: notice,
              onExtend: widget.onExtend,
              remaining: card.request.remainingAt(widget.now),
            ),
          ],
        ),
      ),
    );
  }
}

/// The question on screen: where it is among the others, its text, its options, and the way between
/// them.
class _Step extends StatelessWidget {
  const _Step({
    required this.interaction,
    required this.draft,
    required this.enabled,
    required this.onDraft,
  });

  final QuestionInteraction interaction;
  final QuestionDraft draft;
  final bool enabled;
  final void Function(QuestionDraft draft) onDraft;

  @override
  Widget build(BuildContext context) {
    final int total = interaction.questions.length;
    final int step = draft.step.clamp(0, total - 1);
    final Question question = interaction.questions[step];
    final bool last = step == total - 1;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme text = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (total > 1)
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  l10n.permissionQuestionProgress(step + 1, total),
                  style: text.labelMedium,
                ),
              ),
              if (draft.isAnswered(question))
                // Its own node: inside the card's, the mark would only lengthen the card's label.
                Semantics(
                  container: true,
                  label: l10n.permissionQuestionAnswered,
                  child: Icon(
                    Icons.check_circle,
                    size: Tokens.spaceMd,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
            ],
          ),
        if (question.header.isNotEmpty)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Chip(label: Text(question.header), visualDensity: VisualDensity.compact),
          ),
        SelectableText(question.prompt, style: text.bodyLarge),
        const SizedBox(height: Tokens.spaceSm),
        _Options(
          question: question,
          draft: draft,
          enabled: enabled,
          // A single choice that is not the last goes on by itself (D-24).
          onDraft: (QuestionDraft next, {bool advance = false}) =>
              onDraft(advance && !last ? next.onStep(step + 1) : next),
        ),
        Row(
          children: <Widget>[
            // Always in view, so a choice that moved on by itself can be taken back.
            OutlinedButton(
              onPressed: step > 0 ? () => onDraft(draft.onStep(step - 1)) : null,
              child: Text(l10n.permissionQuestionBack),
            ),
            const Spacer(),
            if (!last)
              OutlinedButton(
                onPressed: () => onDraft(draft.onStep(step + 1)),
                child: Text(l10n.permissionQuestionNext),
              ),
          ],
        ),
      ],
    );
  }
}

/// The options of a question, and "Other" last: radios on a single choice, checkboxes on a multiple.
class _Options extends StatelessWidget {
  const _Options({
    required this.question,
    required this.draft,
    required this.enabled,
    required this.onDraft,
  });

  final Question question;
  final QuestionDraft draft;
  final bool enabled;
  final void Function(QuestionDraft draft, {bool advance}) onDraft;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<String> chosen = draft.chosenOf(question);
    final String? other = draft.otherOf(question);
    final Widget otherField = other == null
        ? const SizedBox.shrink()
        : _OtherField(
            key: ValueKey<String>('other-${question.id}'),
            value: other,
            enabled: enabled,
            onChanged: (String text) => onDraft(draft.writeOther(question, text)),
          );

    if (question.multiSelect) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final QuestionOption option in question.options)
            CheckboxListTile(
              value: chosen.contains(option.label),
              onChanged: enabled ? (_) => onDraft(draft.choose(question, option.label)) : null,
              title: _OptionTitle(option: option),
              subtitle: option.description.isEmpty ? null : Text(option.description),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
          CheckboxListTile(
            value: other != null,
            onChanged: enabled ? (_) => onDraft(draft.toggleOther(question)) : null,
            title: Text(l10n.permissionQuestionOther),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          otherField,
        ],
      );
    }

    return RadioGroup<String>(
      groupValue: other != null ? _otherValue : chosen.firstOrNull,
      onChanged: (String? value) {
        if (!enabled || value == null) {
          return;
        }
        if (value == _otherValue) {
          onDraft(draft.toggleOther(question));
        } else {
          onDraft(draft.choose(question, value), advance: true);
        }
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final QuestionOption option in question.options)
            RadioListTile<String>(
              value: option.label,
              enabled: enabled,
              title: _OptionTitle(option: option),
              subtitle: _OptionSubtitle(option: option),
              contentPadding: EdgeInsets.zero,
            ),
          RadioListTile<String>(
            value: _otherValue,
            enabled: enabled,
            title: Text(l10n.permissionQuestionOther),
            contentPadding: EdgeInsets.zero,
          ),
          otherField,
        ],
      ),
    );
  }
}

/// The label of an option, exact — and marked when Claude recommends it.
class _OptionTitle extends StatelessWidget {
  const _OptionTitle({required this.option});

  final QuestionOption option;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    if (!isRecommended(option.label)) {
      return Text(option.label);
    }

    return Wrap(
      spacing: Tokens.spaceSm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: <Widget>[
        Text(option.label, style: const TextStyle(fontWeight: FontWeight.w600)),
        DecoratedBox(
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(Tokens.spaceSm),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm),
            child: Text(
              AppLocalizations.of(context).permissionQuestionRecommended,
              style: theme.textTheme.labelSmall,
            ),
          ),
        ),
      ],
    );
  }
}

/// The description of an option of a single choice, and the way to its preview when it has one.
class _OptionSubtitle extends StatelessWidget {
  const _OptionSubtitle({required this.option});

  final QuestionOption option;

  @override
  Widget build(BuildContext context) {
    final String? preview = option.preview;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (option.description.isNotEmpty) Text(option.description),
        if (preview != null)
          TextButton(
            onPressed: () => _showPreview(context, option.label, preview),
            child: Text(AppLocalizations.of(context).permissionQuestionSeePreview),
          ),
      ],
    );
  }
}

/// The preview of an option, in a sheet: monospaced and selectable, never rendered as HTML (D-21).
Future<void> _showPreview(BuildContext context, String label, String preview) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext sheet) {
        final ThemeData theme = Theme.of(sheet);

        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(
                  AppLocalizations.of(sheet).permissionQuestionPreview,
                  style: theme.textTheme.titleSmall,
                ),
                Text(label, style: theme.textTheme.labelMedium),
                const SizedBox(height: Tokens.spaceSm),
                SelectableText(
                  preview,
                  style: theme.textTheme.bodyMedium?.copyWith(fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
        );
      },
    );

/// The field of the free answer, with the focus as soon as it opens.
class _OtherField extends StatefulWidget {
  const _OtherField({
    required this.value,
    required this.enabled,
    required this.onChanged,
    super.key,
  });

  final String value;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  State<_OtherField> createState() => _OtherFieldState();
}

class _OtherFieldState extends State<_OtherField> {
  late final TextEditingController _text = TextEditingController(text: widget.value);

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return TextField(
      controller: _text,
      enabled: widget.enabled,
      autofocus: true,
      maxLength: 2000,
      onChanged: widget.onChanged,
      decoration: InputDecoration(
        labelText: l10n.permissionQuestionOther,
        hintText: l10n.permissionQuestionOtherPlaceholder,
        border: const OutlineInputBorder(),
      ),
    );
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }
}

/// Not answering: a reason the person may leave empty, and the way back to the questions.
class _DeclineForm extends StatefulWidget {
  const _DeclineForm({
    required this.enabled,
    required this.canGoBack,
    required this.onConfirm,
    required this.onBack,
  });

  final bool enabled;
  final bool canGoBack;
  final void Function(String reason) onConfirm;
  final VoidCallback onBack;

  @override
  State<_DeclineForm> createState() => _DeclineFormState();
}

class _DeclineFormState extends State<_DeclineForm> {
  final TextEditingController _reason = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        TextField(
          controller: _reason,
          enabled: widget.enabled,
          autofocus: widget.canGoBack,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(
            labelText: l10n.permissionQuestionDeclineReason,
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: Tokens.spaceSm),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: scheme.error,
            foregroundColor: scheme.onError,
          ),
          onPressed: widget.enabled ? () => widget.onConfirm(_reason.text) : null,
          child: Text(
            widget.canGoBack
                ? l10n.permissionQuestionDeclineConfirm
                : l10n.permissionQuestionDecline,
          ),
        ),
        if (widget.canGoBack)
          OutlinedButton(onPressed: widget.onBack, child: Text(l10n.permissionQuestionDeclineBack)),
      ],
    );
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }
}
