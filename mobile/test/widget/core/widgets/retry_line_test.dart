/// A message and, when there is something to do about it, a button to ask again.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/retry_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('with a retry, the message and "try again" both show, and the button works', (
    WidgetTester tester,
  ) async {
    bool tapped = false;
    await tester.pumpApp(RetryLine(message: 'it failed', onRetry: () => tapped = true));

    expect(find.text('it failed'), findsOneWidget);
    expect(find.text(l10n.commonActionRetry), findsOneWidget);

    await tester.tap(find.text(l10n.commonActionRetry));
    expect(tapped, isTrue);
  });

  testWidgets('with no retry, only the message shows', (WidgetTester tester) async {
    await tester.pumpApp(const RetryLine(message: 'nothing to do about it'));

    expect(find.text('nothing to do about it'), findsOneWidget);
    expect(find.text(l10n.commonActionRetry), findsNothing);
  });

  testWidgets('without emphasis, the message is drawn as a quieter note, not a failure', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(const RetryLine(message: 'just so you know', emphasis: false));

    final ThemeData theme = Theme.of(tester.element(find.text('just so you know')));
    final Text text = tester.widget(find.text('just so you know'));
    expect(text.style?.color, theme.colorScheme.onSurfaceVariant);
  });
}
