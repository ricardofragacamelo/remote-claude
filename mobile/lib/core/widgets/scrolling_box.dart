/// A box of text that scrolls horizontally rather than wrapping — the app's pair of the web's
/// `ScrollingPre`: a command, a JSON blob, a terminal's output, kept on its own lines rather than
/// broken to fit, reachable by keyboard for the same reason the web's own `tabIndex={0}` is
/// (plan 26, B-13).
library;

import 'package:flutter/material.dart';

/// [child] inside a box that scrolls sideways. [child] itself must not wrap — a `Text` or
/// `SelectableText` already does not, once its width is unbounded, which this box's own scroll
/// axis gives it.
class ScrollingBox extends StatelessWidget {
  const ScrollingBox({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => Focus(
    child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: child),
  );
}
