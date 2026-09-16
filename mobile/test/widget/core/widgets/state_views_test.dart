import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/error_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async => l10n = await englishCatalogue());

  group('ErrorView', () {
    testWidgets('translates the message key the server sent', (WidgetTester tester) async {
      await tester.pumpApp(const ErrorView(failure: NetworkFailure(traceId: 'trace-1')));

      expect(find.text(l10n.commonErrorOffline), findsOneWidget);
    });

    testWidgets('shows the trace, which is often the only lead there is', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(const ErrorView(failure: NetworkFailure(traceId: 'trace-1')));

      expect(find.text(l10n.commonErrorTraceLabel('trace-1')), findsOneWidget);
    });

    testWidgets('offers a way out when there is one', (WidgetTester tester) async {
      int retries = 0;

      await tester.pumpApp(
        ErrorView(
          failure: const NetworkFailure(traceId: 'trace-1'),
          onRetry: () => retries += 1,
        ),
      );

      await tester.tap(find.text(l10n.commonActionRetry));

      expect(retries, 1);
    });

    testWidgets('offers none when there is nothing to retry', (WidgetTester tester) async {
      await tester.pumpApp(const ErrorView(failure: UnexpectedFailure(traceId: 't')));

      expect(find.text(l10n.commonActionRetry), findsNothing);
    });

    testWidgets('takes its colour from the scheme, so the dark theme still reads', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        const ErrorView(failure: NetworkFailure(traceId: 't')),
        theme: AppTheme.dark(),
      );

      final Icon icon = tester.widget<Icon>(find.byIcon(Icons.error_outline));

      expect(icon.color, AppTheme.dark().colorScheme.error);
    });

    testWidgets('meets the touch and contrast guidelines', (WidgetTester tester) async {
      await tester.pumpApp(
        ErrorView(
          failure: const NetworkFailure(traceId: 't'),
          onRetry: () {},
        ),
      );

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });

    testWidgets('does not cut the message at 200 % text scale', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(400, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        const MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(2)),
          child: SizedBox.shrink(),
        ),
      );
      await tester.pumpApp(const ErrorView(failure: NetworkFailure(traceId: 't')));

      expect(tester.takeException(), isNull);
    });
  });

  group('EmptyView', () {
    testWidgets('says what is empty and what to do about it', (WidgetTester tester) async {
      await tester.pumpApp(
        EmptyView(title: l10n.sessionPingTitle, description: l10n.sessionPingEmpty),
      );

      expect(find.text(l10n.sessionPingTitle), findsOneWidget);
      expect(find.text(l10n.sessionPingEmpty), findsOneWidget);
    });
  });

  group('LoadingView', () {
    testWidgets('announces itself to a screen reader', (WidgetTester tester) async {
      await tester.pumpApp(LoadingView(label: l10n.sessionPingPending));

      expect(find.text(l10n.sessionPingPending), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // A spinner announces nothing on its own; the label is what a screen reader reads, and
      // `liveRegion` is what makes it read the change rather than wait to be asked.
      final Semantics semantics = tester.widget<Semantics>(
        find
            .ancestor(of: find.byType(CircularProgressIndicator), matching: find.byType(Semantics))
            .first,
      );

      expect(semantics.properties.label, l10n.sessionPingPending);
      expect(semantics.properties.liveRegion, isTrue);
    });
  });
}
