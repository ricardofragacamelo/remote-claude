/// The shape every screen of this app has.
///
/// A title, whatever the screen offers in its bar, and a body inside a `SafeArea`. Written once
/// because the decision "every screen keeps out of the notch" is a decision about the product,
/// not about each screen — and because three pages that each spell out the same `Scaffold` are
/// three chances for one of them to forget the `SafeArea`. The duplication gate objected the
/// moment there was a second one.
library;

import 'package:flutter/material.dart';

/// A screen with a title and a body.
class AppScreen extends StatelessWidget {
  const AppScreen({
    required this.title,
    required this.body,
    super.key,
    this.actions = const <Widget>[],
    this.bottom,
  });

  /// What the bar says, already translated.
  final String title;

  /// What fills the screen.
  final Widget body;

  /// What the bar offers, if anything.
  final List<Widget> actions;

  /// A strip under the bar — where a screen says where it stands.
  final PreferredSizeWidget? bottom;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title), actions: actions, bottom: bottom),
    body: SafeArea(child: body),
  );
}
