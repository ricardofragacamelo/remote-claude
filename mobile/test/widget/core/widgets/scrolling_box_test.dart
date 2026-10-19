/// A box that scrolls sideways rather than wrapping — the app's pair of the web's `ScrollingPre`
/// (plan 26, B-13).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/scrolling_box.dart';

import '../../../support/pump_app.dart';

void main() {
  testWidgets('scrolls sideways: a single long line is not cut to the width it is given', (
    WidgetTester tester,
  ) async {
    final String longLine = 'x' * 500;
    await tester.pumpApp(
      SizedBox(
        width: 100,
        child: ScrollingBox(child: Text(longLine, maxLines: 1, softWrap: false)),
      ),
    );

    expect(find.text(longLine), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    final SingleChildScrollView view = tester.widget<SingleChildScrollView>(
      find.byType(SingleChildScrollView),
    );
    expect(view.scrollDirection, Axis.horizontal);
  });
}
