/// The one markdown renderer of the app (plan 26, B-07).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/markdown/safe_markdown.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async => l10n = await englishCatalogue());

  testWidgets('headings, emphasis, lists, a table, a quote and inline code are drawn', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const SafeMarkdown(
        data:
            '# Title\n\n*em* and **strong**\n\n- one\n- two\n\n> a quote\n\n'
            '`inline`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
      ),
    );

    expect(find.text('Title'), findsOneWidget);
    expect(find.textContaining('em', findRichText: true), findsWidgets);
    expect(find.textContaining('one', findRichText: true), findsWidgets);
    expect(find.textContaining('a quote', findRichText: true), findsOneWidget);
    expect(find.textContaining('inline', findRichText: true), findsOneWidget);
    expect(find.byType(Table), findsOneWidget);
  });

  testWidgets('a fenced code block draws through CodeBlock', (WidgetTester tester) async {
    await tester.pumpApp(const SafeMarkdown(data: '```dart\nfinal a = 1;\n```\n'));

    expect(find.textContaining('final a = 1;', findRichText: true), findsOneWidget);
  });

  testWidgets('S-18 · embedded HTML is shown as text, and no element comes of it', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const SafeMarkdown(
        data:
            'Before\n\n<script>alert(1)</script>\n\n'
            'Inline <img src=x onerror="alert(1)"> text.\n\n<div onclick="x()">block</div>\n',
      ),
    );

    expect(find.textContaining('<script>alert(1)</script>', findRichText: true), findsOneWidget);
    expect(find.textContaining('<img src=x onerror', findRichText: true), findsOneWidget);
    expect(
      find.textContaining('<div onclick="x()">block</div>', findRichText: true),
      findsOneWidget,
    );
    expect(find.byType(Image), findsNothing);
  });

  group('links — S-19', () {
    testWidgets('a relative link calls onRelativeLink with the resolved path and anchor', (
      WidgetTester tester,
    ) async {
      (String, String?)? called;
      await tester.pumpApp(
        SafeMarkdown(
          data: 'See [the plan](../plans/x.md#top).\n',
          from: 'docs/guide/index.md',
          onRelativeLink: (String path, {String? anchor, int? line}) => called = (path, anchor),
        ),
      );

      await tester.tap(find.textContaining('the plan', findRichText: true));
      await tester.pump();

      expect(called, ('docs/plans/x.md', 'top'));
    });

    testWidgets('a relative link with no onRelativeLink does nothing', (WidgetTester tester) async {
      await tester.pumpApp(const SafeMarkdown(data: 'See [it](x.md).\n'));

      await tester.tap(find.textContaining('it', findRichText: true));
      await tester.pump();

      expect(tester.takeException(), isNull);
    });

    testWidgets('an https link asks before leaving the app', (WidgetTester tester) async {
      await tester.pumpApp(const SafeMarkdown(data: '[site](https://example.com)\n'));

      await tester.tap(find.textContaining('site', findRichText: true));
      await tester.pumpAndSettle();

      expect(find.text(l10n.markdownLinkConfirm), findsOneWidget);
    });

    testWidgets('a javascript: link does not open, and says so', (WidgetTester tester) async {
      await tester.pumpApp(const SafeMarkdown(data: '[js](javascript:alert(1))\n'));

      await tester.tap(find.textContaining('js', findRichText: true));
      await tester.pump();

      expect(find.text(l10n.markdownLinkRefused), findsOneWidget);
    });
  });

  group('images — S-20', () {
    testWidgets('a remote image is never loaded: its words and address stand in its place', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        const SafeMarkdown(data: '![tracker](https://tracker.example.com/p.gif)\n'),
      );

      expect(find.byType(Image), findsNothing);
      expect(
        find.text(l10n.markdownRemoteImage('tracker — https://tracker.example.com/p.gif')),
        findsOneWidget,
      );
    });

    testWidgets('a relative image is resolved by the caller, through imageResolver', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        SafeMarkdown(
          data: '![a shot](img/shot.png)\n',
          from: 'docs/a.md',
          imageResolver: (BuildContext context, String path, String alt) => Text('resolved:$path'),
        ),
      );

      expect(find.text('resolved:docs/img/shot.png'), findsOneWidget);
    });

    testWidgets('a relative image with no imageResolver shows its words', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(const SafeMarkdown(data: '![a shot](img/shot.png)\n'));

      expect(find.text(l10n.markdownRemoteImage('a shot — img/shot.png')), findsOneWidget);
    });
  });

  testWidgets('the balloon is selectable', (WidgetTester tester) async {
    await tester.pumpApp(const SafeMarkdown(data: 'Some words.\n'));

    expect(find.byType(SelectionArea), findsOneWidget);
  });

  group('a file-path-like run of text — plan 26, B-10', () {
    (String path, String? anchor, int? line)? called;
    void onRelativeLink(String path, {String? anchor, int? line}) => called = (path, anchor, line);

    setUp(() => called = null);

    testWidgets('a match in plain text becomes a tappable link, with its line', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        SafeMarkdown(
          data: 'see src/x.ts:42 for it',
          fileLinkOf: (String text) => text == 'src/x.ts:42' ? ('src/x.ts', 42) : null,
          onRelativeLink: onRelativeLink,
        ),
      );

      await tester.tap(find.textContaining('src/x.ts:42', findRichText: true));
      await tester.pump();

      expect(called, ('src/x.ts', null, 42));
    });

    testWidgets('text that does not match stays exactly as it was', (WidgetTester tester) async {
      await tester.pumpApp(
        SafeMarkdown(
          data: 'nothing of src/x.ts here',
          fileLinkOf: (String _) => null,
          onRelativeLink: onRelativeLink,
        ),
      );

      expect(find.textContaining('nothing of src/x.ts here', findRichText: true), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a whole inline code that names a file becomes a link too', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        SafeMarkdown(
          data: '`src/x.ts`',
          fileLinkOf: (String text) => text == 'src/x.ts' ? ('src/x.ts', null) : null,
          onRelativeLink: onRelativeLink,
        ),
      );

      await tester.tap(find.textContaining('src/x.ts', findRichText: true));
      await tester.pump();

      expect(called, ('src/x.ts', null, null));
    });

    testWidgets('an inline code that names no file keeps its default style', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(SafeMarkdown(data: '`plain code`', fileLinkOf: (String _) => null));

      expect(find.textContaining('plain code', findRichText: true), findsOneWidget);
    });
  });
}
