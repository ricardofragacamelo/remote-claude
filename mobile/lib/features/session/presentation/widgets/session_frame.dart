/// The frame of every conversation on a phone — the draft and the session alike (plan 10, B-06):
/// the strips of state on top, the conversation — the **only** thing that scrolls —, and the
/// composer anchored at the bottom, with what belongs above the box over it.
///
/// Above the keyboard by construction: the screen's `Scaffold` resizes its body to what the
/// keyboard leaves, the `AppBar` stays where it is, and what gives up the height is the
/// conversation, never the box (R-02).
library;

import 'package:flutter/material.dart';

/// The most of the height the strips of one side take before they scroll among themselves. Each is
/// a line; this only matters when many show at once, at a large font, on a small phone — and then
/// the conversation and the box keep their room (S-24).
const double stripShare = 0.2;

/// Strips, the conversation, and the dock.
class SessionFrame extends StatelessWidget {
  const SessionFrame({
    required this.body,
    required this.composer,
    super.key,
    this.top = const <Widget>[],
    this.aboveBox = const <Widget>[],
  });

  /// Where the connection, the history and this phone stand — one line each.
  final List<Widget> top;

  /// The conversation, or what stands in its place.
  final Widget body;

  /// Why the session ended, the queue, a refusal — one line each, over the box.
  final List<Widget> aboveBox;

  final Widget composer;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (BuildContext context, BoxConstraints constraints) {
      final double most = constraints.maxHeight * stripShare;

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _Strips(strips: top, most: most),
          Expanded(child: body),
          _Strips(strips: aboveBox, most: most),
          composer,
        ],
      );
    },
  );
}

/// One side's strips, held to [most] of the height.
class _Strips extends StatelessWidget {
  const _Strips({required this.strips, required this.most});

  final List<Widget> strips;
  final double most;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: BoxConstraints(maxHeight: most),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: strips,
      ),
    ),
  );
}
