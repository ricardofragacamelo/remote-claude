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
    this.endDrawer,
    this.subtitle,
  });

  /// What the bar says, already translated.
  final String title;

  /// What fills the screen.
  final Widget body;

  /// What the bar offers, if anything.
  final List<Widget> actions;

  /// A second line under the title — where a screen says which of many it is: the path of a file.
  final String? subtitle;

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

  /// A second side panel, on the right, with the same rule as [drawer]: opened by its control in
  /// [actions], never by a swipe (plan 25, D-01). The side says which panel it is, and each keeps its
  /// own state.
  final Widget? endDrawer;

  @override
  Widget build(BuildContext context) {
    final Widget? end = titleEnd;

    final bool canPop = ModalRoute.of(context)?.canPop ?? false;

    return Scaffold(
      drawer: drawer,
      endDrawer: endDrawer,
      // Both edges are the system's "back" on Android: a panel opens by its button only (D-26).
      drawerEnableOpenDragGesture: false,
      endDrawerEnableOpenDragGesture: false,
      appBar: AppBar(
        leading: drawer != null && canPop ? const BackButton() : null,
        automaticallyImplyLeading: drawer == null || canPop,
        title: end == null
            ? _title(context)
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

  /// The title — and, under it, the subtitle, both cut with an ellipsis rather than wrapped.
  Widget _title(BuildContext context) {
    final String? second = subtitle;
    if (second == null) {
      return Text(title);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        Text(
          second,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
