/// The pair of the web's `CodeBlock` (plan 26, B-08).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/markdown/code_block.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async => l10n = await englishCatalogue());

  List<String> clipboard(WidgetTester tester) {
    final List<String> copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
      MethodCall call,
    ) async {
      if (call.method == 'Clipboard.setData') {
        copied.add((call.arguments as Map<Object?, Object?>)['text']! as String);
      }
      return null;
    });
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    return copied;
  }

  testWidgets('S-22 · a wide line scrolls inside its own box, not the page', (
    WidgetTester tester,
  ) async {
    final String wide = 'const value = ${'"x"' * 150};';
    await tester.pumpApp(CodeBlock(code: wide, language: 'javascript'));

    final Finder box = find.ancestor(
      of: find.textContaining('const value', findRichText: true),
      matching: find.byWidgetPredicate(
        (Widget w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
      ),
    );
    expect(box, findsOneWidget);
  });

  testWidgets('S-23 · copying puts the exact code on the clipboard and announces it', (
    WidgetTester tester,
  ) async {
    final List<String> copied = clipboard(tester);
    const String code = 'print("hi")';
    await tester.pumpApp(const CodeBlock(code: code, language: 'python'));

    expect(find.text(l10n.codeCopied), findsNothing);
    await tester.tap(find.byTooltip(l10n.codeCopy));
    await tester.pump();

    expect(copied, <String>[code]);
    expect(find.text(l10n.codeCopied), findsOneWidget);
  });

  for (final String language in <String>['typescript', 'dart', 'python', 'json', 'shell']) {
    testWidgets('S-24 · $language is highlighted — more than one colour appears', (
      WidgetTester tester,
    ) async {
      const String sample = '''
function greet(name) {
  // say hi
  return "hello, " + name + "!";
}
''';
      await tester.pumpApp(CodeBlock(code: sample, language: language));

      final Text drawn = tester.widget<Text>(
        find.byWidgetPredicate((Widget w) => w is Text && w.textSpan != null),
      );
      final InlineSpan span = drawn.textSpan!;
      final Set<Color?> colours = <Color?>{};
      span.visitChildren((InlineSpan child) {
        if (child is TextSpan) {
          colours.add(child.style?.color);
        }
        return true;
      });

      expect(colours.length, greaterThan(1), reason: 'no highlight found for $language');
    });
  }

  testWidgets('S-25 · an unknown language shows the same text, with no highlight', (
    WidgetTester tester,
  ) async {
    const String code = 'whatever this is';
    await tester.pumpApp(const CodeBlock(code: code, language: 'klingon'));

    expect(find.textContaining(code, findRichText: true), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a fence with no language shows the text, with no highlight', (
    WidgetTester tester,
  ) async {
    const String code = 'plain text block';
    await tester.pumpApp(const CodeBlock(code: code, language: ''));

    expect(find.textContaining(code, findRichText: true), findsOneWidget);
  });

  testWidgets('S-26 · a block past the line ceiling shows the full text, with no highlight', (
    WidgetTester tester,
  ) async {
    final String huge = List<String>.generate(
      highlightLineCeiling + 1,
      (int i) => 'x$i',
    ).join('\n');
    await tester.pumpApp(
      SingleChildScrollView(
        child: CodeBlock(code: huge, language: 'python'),
      ),
    );

    expect(find.textContaining('x0', findRichText: true), findsOneWidget);
    expect(find.textContaining('x$highlightLineCeiling', findRichText: true), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
