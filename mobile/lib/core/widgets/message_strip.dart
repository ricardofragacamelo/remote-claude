/// One explanation squeezed to one line, which opens whole in a sheet.
///
/// The session screen has room for one scrolling thing, the conversation, so what the phone may do
/// and whether a notification can reach it are a line each there, never a card that pushes the
/// composer (plan 10, B-07). The line says enough to notice; a tap gives the whole explanation, with
/// its action, in the shape every explanation of this app uses.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/message_banner.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Opens [builder] in a sheet from the bottom, the shape every sheet of the session screen has:
/// inside the safe area, with a handle, as tall as what it holds.
Future<void> showSheet(BuildContext context, WidgetBuilder builder) => showModalBottomSheet<void>(
  context: context,
  useSafeArea: true,
  showDragHandle: true,
  isScrollControlled: true,
  builder: builder,
);

/// What an explanation says, before anybody decides how much room it gets.
class BannerMessage {
  const BannerMessage({
    required this.icon,
    required this.title,
    required this.body,
    this.emphasis = false,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String body;

  /// Whether it is a state the person has to act on.
  final bool emphasis;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// The whole explanation, as a card.
  MessageBanner banner() => MessageBanner(
    icon: icon,
    title: title,
    body: body,
    emphasis: emphasis,
    actionLabel: actionLabel,
    onAction: onAction,
  );
}

/// One line of [message], that opens it whole.
class MessageStrip extends StatelessWidget {
  const MessageStrip({required this.message, super.key, this.line});

  final BannerMessage message;

  /// What the line says, when it is not the title alone.
  final String? line;

  @override
  Widget build(BuildContext context) => TextStrip(
    icon: message.icon,
    text: line ?? message.title,
    emphasis: message.emphasis,
    onTap: () => unawaited(
      showSheet(
        context,
        (BuildContext context) => SingleChildScrollView(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          child: message.banner(),
        ),
      ),
    ),
  );
}

/// A line of state: an icon and one line of text that ends in an ellipsis rather than wrapping,
/// announced as it changes. With [onTap], a tap opens the rest; with [action], a button does the one
/// thing the line is about.
class TextStrip extends StatelessWidget {
  const TextStrip({
    required this.icon,
    required this.text,
    super.key,
    this.emphasis = false,
    this.onTap,
    this.action,
  });

  final IconData icon;
  final String text;
  final bool emphasis;
  final VoidCallback? onTap;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final VoidCallback? tap = onTap;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color colour = emphasis ? scheme.error : scheme.onSurfaceVariant;
    final TextTheme typography = Theme.of(context).textTheme;

    final Widget line = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: Tokens.touchTarget),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
        child: Row(
          children: <Widget>[
            Icon(icon, size: Tokens.spaceMd + 2, color: colour),
            const SizedBox(width: Tokens.spaceSm),
            Expanded(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: typography.bodySmall?.copyWith(color: colour),
              ),
            ),
            ?action,
            if (tap != null) Icon(Icons.chevron_right, color: colour),
          ],
        ),
      ),
    );

    return Semantics(
      container: true,
      liveRegion: true,
      button: tap != null,
      hint: tap == null ? null : AppLocalizations.of(context).commonActionShowAll,
      child: tap == null ? line : InkWell(onTap: tap, child: line),
    );
  }
}
