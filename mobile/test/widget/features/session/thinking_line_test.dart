/// Thinking, as a line of its own (plan 10, B-05; the live and closed texts of B-19).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/thinking_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('S-59 · thinking while it arrives, and what it thought only when opened', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ThinkingLine(
        thinking: ThinkingEntry(messageId: 'm', index: 0, text: 'the log says'),
      ),
    );

    expect(find.text(l10n.thinkingLive), findsOneWidget);
    expect(find.text('the log says'), findsNothing);

    await tester.tap(find.text(l10n.thinkingLive));
    await tester.pump();
    expect(find.text('the log says'), findsOneWidget);

    await tester.tap(find.text(l10n.thinkingLive));
    await tester.pump();
    expect(find.text('the log says'), findsNothing);
  });

  testWidgets('closed, it says how long it thought when the stream measured it', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ThinkingLine(
        thinking: ThinkingEntry(
          messageId: 'm',
          index: 0,
          text: 'done',
          isComplete: true,
          startedAt: '2026-09-14T12:00:00Z',
          endedAt: '2026-09-14T12:00:12Z',
        ),
      ),
    );

    expect(find.text(l10n.thinkingTook('12')), findsOneWidget);
  });

  testWidgets('S-61 · from the history it says it thought, never 0 s', (WidgetTester tester) async {
    await tester.pumpApp(
      const ThinkingLine(
        thinking: ThinkingEntry(messageId: 'm', index: 0, text: 'x', isComplete: true),
      ),
    );

    expect(find.text(l10n.thinkingDone), findsOneWidget);
  });

  testWidgets('S-61 · a redacted thinking says it existed, and opens to say nothing was shown', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ThinkingLine(
        thinking: ThinkingEntry(messageId: 'm', index: 0, isComplete: true, isRedacted: true),
      ),
    );

    expect(find.text(l10n.thinkingHidden), findsOneWidget);
    await tester.tap(find.text(l10n.thinkingHidden));
    await tester.pump();
    expect(find.text(l10n.thinkingNothingShown), findsOneWidget);
  });

  testWidgets('its target meets the tap guideline', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await tester.pumpApp(
      const ThinkingLine(thinking: ThinkingEntry(messageId: 'm', index: 0, isComplete: true)),
    );

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    semantics.dispose();
  });
}
