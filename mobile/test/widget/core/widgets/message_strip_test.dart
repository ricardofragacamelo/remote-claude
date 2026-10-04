/// An explanation squeezed to a line, which opens whole (plan 10, B-07).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/message_banner.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('one line, and a tap opens the whole explanation with its action', (
    WidgetTester tester,
  ) async {
    int acted = 0;
    await tester.pumpApp(
      MessageStrip(
        line: 'the line',
        message: BannerMessage(
          icon: Icons.info,
          emphasis: true,
          title: 'The title',
          body: 'The whole body of it',
          actionLabel: 'Do it',
          onAction: () => acted += 1,
        ),
      ),
    );

    expect(find.text('the line'), findsOneWidget);
    expect(find.text('The whole body of it'), findsNothing);
    expect(tester.widget<Text>(find.text('the line')).maxLines, 1);

    await tester.tap(find.text('the line'));
    await tester.pumpAndSettle();

    expect(find.byType(MessageBanner), findsOneWidget);
    expect(find.text('The whole body of it'), findsOneWidget);
    await tester.tap(find.text('Do it'));
    expect(acted, 1);
  });

  testWidgets('without a line it says the title, and names what a tap does', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await tester.pumpApp(
      const MessageStrip(
        message: BannerMessage(icon: Icons.info, title: 'The title', body: 'b'),
      ),
    );

    expect(find.text('The title'), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(MessageStrip)),
      isSemantics(hint: l10n.commonActionShowAll, isButton: true, hasTapAction: true),
    );
    semantics.dispose();
  });

  testWidgets('a strip with an action and no tap is not a button', (WidgetTester tester) async {
    int pressed = 0;
    await tester.pumpApp(
      TextStrip(
        icon: Icons.info,
        text: 'plain',
        action: TextButton(onPressed: () => pressed += 1, child: const Text('act')),
      ),
    );

    await tester.tap(find.text('act'));
    expect(pressed, 1);
    expect(find.byIcon(Icons.chevron_right), findsNothing);
  });
}
