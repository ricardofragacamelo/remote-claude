/// The tall sheets of the session screen — the command menu, the undo, the help — on a phone drawn
/// edge to edge.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';

import '../../../support/pump_app.dart';

void main() {
  testWidgets('the bottom of a tall sheet stays above the system navigation bar', (
    WidgetTester tester,
  ) async {
    tester.view.padding = FakeViewPadding(bottom: 48 * tester.view.devicePixelRatio);
    tester.view.viewPadding = FakeViewPadding(bottom: 48 * tester.view.devicePixelRatio);
    addTearDown(tester.view.reset);

    await tester.pumpApp(
      Builder(
        builder: (BuildContext context) => TextButton(
          onPressed: () => showSessionSheet<void>(
            context,
            const SessionSheet(
              title: 'Title',
              description: 'What it is for',
              child: Align(alignment: Alignment.bottomCenter, child: Text('bottom')),
            ),
          ),
          child: const Text('open'),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final double screen = tester.view.physicalSize.height / tester.view.devicePixelRatio;
    expect(find.text('Title'), findsOneWidget);
    expect(tester.getBottomLeft(find.text('bottom')).dy, lessThanOrEqualTo(screen - 48));
  });
}
