/// The shape every screen of this app has.
///
/// A title, whatever the screen offers in its bar, and a body inside a `SafeArea`. Written once
/// because the decision "every screen keeps out of the notch" is a decision about the product,
/// not about each screen — and because three pages that each spell out the same `Scaffold` are
/// three chances for one of them to forget the `SafeArea`. The duplication gate objected the
/// moment there was a second one.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// A screen with a title and a body.
class AppScreen extends StatelessWidget {
  const AppScreen({
    required this.title,
    required this.body,
    super.key,
    this.actions = const <Widget>[],
    this.bottom,
    this.titleEnd,
    this.drawer,
  });

  /// What the bar says, already translated.
  final String title;

  /// What fills the screen.
  final Widget body;

  /// What the bar offers, if anything.
  final List<Widget> actions;

  /// A strip under the bar — where a screen says where it stands.
  final PreferredSizeWidget? bottom;

  /// What stands right after the title, sharing its room — where a screen says how it stands. Both
  /// give way before the actions do: at a large font, a title that pushed the actions off the bar
  /// would take away what the screen offers.
  final Widget? titleEnd;

  /// A side panel, opened by a control the screen puts in [actions] — never by the leading slot,
  /// which keeps "back": both edge swipes are the system's back gesture on Android, so the panel
  /// cannot rely on a swipe, and a screen that lost its way back would trap the person (plan 10,
  /// D-26).
  final Widget? drawer;

  @override
  Widget build(BuildContext context) {
    final Widget? end = titleEnd;

    final bool canPop = ModalRoute.of(context)?.canPop ?? false;

    return Scaffold(
      drawer: drawer,
      appBar: AppBar(
        leading: drawer != null && canPop ? const BackButton() : null,
        automaticallyImplyLeading: drawer == null || canPop,
        title: end == null
            ? Text(title)
            : Row(
                children: <Widget>[
                  Flexible(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: Tokens.spaceSm),
                  Flexible(child: end),
                ],
              ),
        actions: actions,
        bottom: bottom,
      ),
      body: SafeArea(child: body),
    );
  }
}
