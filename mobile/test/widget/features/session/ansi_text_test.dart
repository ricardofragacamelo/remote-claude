/// The terminal's output drawn by role — the widget itself, not just `ansiSegments` (plan 26,
/// B-15). `ansiSegments` is covered on its own in the unit test next to it; this is what the theme
/// actually paints, and what a copy actually carries.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/presentation/widgets/ansi_text.dart';

import '../../../support/pump_app.dart';

List<TextSpan> _spansOf(WidgetTester tester) {
  final SelectableText widget = tester.widget<SelectableText>(find.byType(SelectableText));

  return widget.textSpan!.children!.cast<TextSpan>();
}

void main() {
  testWidgets('S-54 · each tone is the theme’s own token, bold is the theme’s own weight', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(const AnsiText('\x1B[31ma\x1B[1;32mb\x1B[39mc'));
    final ColorScheme colours = Theme.of(tester.element(find.byType(AnsiText))).colorScheme;

    final List<TextSpan> spans = _spansOf(tester);

    expect(spans.map((TextSpan s) => s.text), <String>['a', 'b', 'c']);
    expect(spans[0].style?.color, colours.error);
    expect(spans[0].style?.fontWeight, isNot(FontWeight.bold));
    expect(spans[1].style?.color, colours.secondary);
    expect(spans[1].style?.fontWeight, FontWeight.bold);
    // 39 cleared the colour, but the sequence carried no 22: bold still holds.
    expect(spans[2].style?.color, colours.onSurface);
    expect(spans[2].style?.fontWeight, FontWeight.bold);
  });

  testWidgets('S-56 · what a copy carries is the words, never the escape sequences', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const AnsiText('\x1B[32m✓ 12 passed\x1B[0m\x1B]0;title\x07, \x1B[31m1 failed\x1B[0m'),
    );

    final EditableText copied = tester.widget<EditableText>(find.byType(EditableText));

    expect(copied.controller.text, '✓ 12 passed, 1 failed');
  });

  testWidgets('plain text with no escape at all is one span, styled plainly', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(const AnsiText('nothing special'));

    final List<TextSpan> spans = _spansOf(tester);

    expect(spans, hasLength(1));
    expect(spans.single.text, 'nothing special');
    expect(
      spans.single.style?.color,
      Theme.of(tester.element(find.byType(AnsiText))).colorScheme.onSurface,
    );
  });
}
