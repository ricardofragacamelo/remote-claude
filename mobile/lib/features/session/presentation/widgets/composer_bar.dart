/// The bar under the prompt box: `/` · mode · model · effort · context · send or stop.
///
/// Whether the choices fit is **measured**, not guessed from a breakpoint (D-06): each chip's text is
/// laid out with the person's own text scale, and when the bar is narrower than what it holds, the
/// model, the effort and the context move to a `⋯` of the bar. `/`, the mode and send/stop never
/// leave it — they are what a turn cannot be written without.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Room between two controls of the bar.
const double barGap = 4;

/// The padding and the icon of a chip, around its text.
const double _chipChrome = Tokens.spaceMd * 2 + 18 + Tokens.spaceSm;

/// One choice of the bar: what it is called, what it is set to, and what a tap opens.
class ComposerChoice {
  const ComposerChoice({
    required this.label,
    required this.value,
    required this.onOpen,
    this.icon,
    this.leading,
    this.warn = false,
    this.compact = false,
  });

  /// What the choice is — "Mode", "Model". Already translated.
  final String label;

  /// What it is set to. Already translated, or the installation's own name for it.
  final String value;

  /// Opens the sheet where it is changed — or, for a choice that cannot change, says why.
  final VoidCallback onOpen;

  final IconData? icon;

  /// Drawn in the place of [icon] — the ring of the context.
  final Widget? leading;

  /// Drawn in a warning tone, with its icon: never only a colour.
  final bool warn;

  /// Only its icon on the bar, its name in the `Semantics` — the ring of the context.
  final bool compact;

  /// How wide its chip is with [style] at [scaler].
  double widthWith(TextStyle? style, TextScaler scaler) {
    if (compact) {
      return Tokens.touchTarget;
    }

    final TextPainter painter = TextPainter(
      text: TextSpan(text: value, style: style),
      textScaler: scaler,
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    final double width = painter.width + _chipChrome;
    painter.dispose();

    return width < Tokens.touchTarget ? Tokens.touchTarget : width;
  }
}

/// The bar.
class ComposerBar extends StatelessWidget {
  const ComposerBar({
    required this.mode,
    required this.choices,
    required this.actions,
    super.key,
    this.onSlash,
  });

  final ComposerChoice mode;

  /// What may go to the overflow: the model, the effort and the context.
  final List<ComposerChoice> choices;

  /// Send, stop, or both — at the end, always.
  final List<Widget> actions;

  /// Opens the commands. Without it the `/` is there and disabled, with its name.
  final VoidCallback? onSlash;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextStyle? style = Theme.of(context).textTheme.labelLarge;
    final TextScaler scaler = MediaQuery.textScalerOf(context);

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final bool fits = barFits(
          width: constraints.maxWidth,
          fixed: 1 + actions.length,
          chips: <ComposerChoice>[mode, ...choices],
          style: style,
          scaler: scaler,
        );

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: barGap),
          child: Row(
            children: <Widget>[
              IconButton(
                tooltip: l10n.composerSlash,
                icon: const Icon(Icons.terminal),
                onPressed: onSlash,
              ),
              // The chips in a space of their own, where the mode is the only thing that gives:
              // beside a `Spacer`, the free space was split in half between the two, and the mode
              // was squeezed below its icon with the bar still "fitting" (plan 10, S-116).
              Expanded(
                child: Row(
                  children: <Widget>[
                    Flexible(child: ChoiceChipButton(choice: mode)),
                    if (fits)
                      for (final ComposerChoice choice in choices)
                        Padding(
                          padding: const EdgeInsetsDirectional.only(start: barGap),
                          child: ChoiceChipButton(choice: choice),
                        )
                    else if (choices.isNotEmpty)
                      IconButton(
                        tooltip: l10n.composerMore,
                        icon: const Icon(Icons.more_horiz),
                        onPressed: () => unawaited(_openMore(context, l10n)),
                      ),
                  ],
                ),
              ),
              ...actions,
            ],
          ),
        );
      },
    );
  }

  /// The choices that did not fit, as a sheet of their own — each opening its own sheet.
  Future<void> _openMore(BuildContext context, AppLocalizations l10n) => showSheet(
    context,
    (BuildContext sheet) => ListView(
      shrinkWrap: true,
      children: <Widget>[
        for (final ComposerChoice choice in choices)
          ListTile(
            leading: choice.leading ?? Icon(choice.icon),
            title: Text(choice.label),
            subtitle: Text(choice.value),
            onTap: () {
              Navigator.of(sheet).pop();
              choice.onOpen();
            },
          ),
      ],
    ),
  );
}

/// Whether [chips] and [fixed] icon buttons fit in [width], each separated by [barGap].
bool barFits({
  required double width,
  required int fixed,
  required List<ComposerChoice> chips,
  required TextStyle? style,
  required TextScaler scaler,
}) {
  final double needed = chips.fold(
    fixed * Tokens.touchTarget + (fixed + chips.length) * barGap,
    (double sum, ComposerChoice chip) => sum + chip.widthWith(style, scaler),
  );

  return needed <= width;
}

/// One choice on the bar: its icon and what it is set to, named in full for a screen reader.
class ChoiceChipButton extends StatelessWidget {
  const ChoiceChipButton({required this.choice, super.key});

  final ComposerChoice choice;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color colour = choice.warn ? theme.colorScheme.error : theme.colorScheme.onSurface;
    final String name = AppLocalizations.of(context).composerChoice(choice.label, choice.value);
    final Widget leading = choice.leading ?? Icon(choice.icon, size: 18, color: colour);

    return Semantics(
      button: true,
      label: name,
      excludeSemantics: true,
      onTap: choice.onOpen,
      child: Tooltip(
        message: name,
        child: InkWell(
          borderRadius: BorderRadius.circular(Tokens.radius),
          onTap: choice.onOpen,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: Tokens.touchTarget,
              minWidth: Tokens.touchTarget,
            ),
            child: choice.compact
                ? Center(child: leading)
                : Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        leading,
                        const SizedBox(width: Tokens.spaceSm),
                        Flexible(
                          child: Text(
                            choice.value,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelLarge?.copyWith(color: colour),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
