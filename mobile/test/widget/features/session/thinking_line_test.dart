/// Thinking, as a line of its own (plan 10, B-05; the live and closed texts of B-19) — and as the
/// Claude Code shows it (plan 22, B-31: D-14, D-15).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/features/session/presentation/widgets/thinking_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

/// A thinking that stopped: [text] when the model showed it, bounded by [atMost] when read from the
/// history.
ThinkingEntry stopped({String text = '', Duration? atMost, bool isRedacted = false}) =>
    ThinkingEntry(
      messageId: 'm',
      index: 0,
      text: text,
      isComplete: true,
      isRedacted: isRedacted,
      atMost: atMost,
    );

/// A thinking the stream measured at [took].
ThinkingEntry measured(Duration took, {Duration? atMost}) {
  final DateTime from = DateTime.utc(2026, 10, 7, 12);

  return ThinkingEntry(
    messageId: 'm',
    index: 0,
    text: 'x',
    isComplete: true,
    startedAt: from.toIso8601String(),
    endedAt: from.add(took).toIso8601String(),
    atMost: atMost,
  );
}

void main() {
  late AppLocalizations l10n;
  late AppLocalizations pt;

  setUpAll(() async {
    l10n = await englishCatalogue();
    pt = await AppLocalizations.delegate.load(const Locale('pt'));
  });

  testWidgets(
    'S-59 · "Thinking…" while it arrives, what it thought in view (D-15), folded by a tap',
    (WidgetTester tester) async {
      await tester.pumpApp(
        const ThinkingLine(
          thinking: ThinkingEntry(messageId: 'm', index: 0, text: 'the log says'),
        ),
      );

      expect(find.text(l10n.thinkingLive), findsOneWidget);
      expect(find.text('the log says'), findsOneWidget);

      await tester.tap(find.text(l10n.thinkingLive));
      await tester.pump();
      expect(find.text('the log says'), findsNothing);

      await tester.tap(find.text(l10n.thinkingLive));
      await tester.pump();
      expect(find.text('the log says'), findsOneWidget);
    },
  );

  testWidgets('S-101 · omitted: "Thought", folded — never the notice of absence; opened, that the '
      'model did not show it', (WidgetTester tester) async {
    await tester.pumpApp(ThinkingLine(thinking: stopped()));

    expect(find.text(l10n.thinkingDone), findsOneWidget);
    expect(find.text(l10n.thinkingHidden), findsNothing);
    expect(find.text(l10n.thinkingNothingShown), findsNothing);
    expect(
      tester.getSemantics(find.byType(FoldLine)),
      isSemantics(
        label: l10n.thinkingDone,
        isButton: true,
        hasExpandedState: true,
        isExpanded: false,
        hasTapAction: true,
      ),
    );

    await tester.tap(find.text(l10n.thinkingDone));
    await tester.pump();

    expect(find.text(l10n.thinkingNothingShown), findsOneWidget);
  });

  testWidgets('S-102 · summarised: the text in view, quieter than an answer, under "Thought"', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(ThinkingLine(thinking: stopped(text: 'Weighing the two options')));

    expect(find.text(l10n.thinkingDone), findsOneWidget);
    final Text said = tester.widget<Text>(find.text('Weighing the two options'));
    final ThemeData theme = Theme.of(tester.element(find.byType(ThinkingLine)));
    expect(said.style?.fontStyle, FontStyle.italic);
    expect(said.style?.color, theme.colorScheme.onSurfaceVariant);

    await tester.tap(find.text(l10n.thinkingDone));
    await tester.pump();
    expect(find.text('Weighing the two options'), findsNothing);
  });

  testWidgets('S-103 · redacted: says it was hidden, folded, and opens to say nothing was shown', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      ThinkingLine(thinking: stopped(isRedacted: true, atMost: const Duration(seconds: 4))),
    );

    expect(find.text(l10n.thinkingHidden), findsOneWidget);
    expect(find.text(l10n.thinkingNothingShown), findsNothing);

    await tester.tap(find.text(l10n.thinkingHidden));
    await tester.pump();
    expect(find.text(l10n.thinkingNothingShown), findsOneWidget);
  });

  testWidgets('S-104 · from the history, how long at most — in both languages', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(ThinkingLine(thinking: stopped(atMost: const Duration(seconds: 7))));
    expect(find.text('Thought for up to 7 s'), findsOneWidget);

    await tester.pumpApp(
      ThinkingLine(thinking: stopped(atMost: const Duration(seconds: 7))),
      locale: const Locale('pt'),
    );
    expect(find.text('Pensou por até 7 s'), findsOneWidget);
  });

  testWidgets('S-107 · closed, it says how long it thought when the stream measured it', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(ThinkingLine(thinking: measured(const Duration(seconds: 12))));

    expect(find.text(l10n.thinkingTook('12')), findsOneWidget);
  });

  test('what the stream measured wins over what the history bounds', () {
    expect(
      thinkingTitle(l10n, measured(const Duration(seconds: 2), atMost: const Duration(seconds: 9))),
      'Thought for 2 s',
    );
  });

  test('S-106 · without the instants, only that it thought — never "0 s"', () {
    expect(thinkingTitle(l10n, stopped(text: 'x')), l10n.thinkingDone);
    expect(thinkingTitle(l10n, stopped()), l10n.thinkingDone);
  });

  group('S-105 · rounded as the web rounds it, in minutes from one', () {
    final Map<int, String> history = <int, String>{
      0: 'Thought for up to 0 s',
      499: 'Thought for up to 0 s',
      500: 'Thought for up to 1 s',
      59499: 'Thought for up to 59 s',
      59500: 'Thought for up to 1 min 00 s',
      60000: 'Thought for up to 1 min 00 s',
      125000: 'Thought for up to 2 min 05 s',
    };

    for (final MapEntry<int, String> each in history.entries) {
      test('${each.key} ms of the history', () {
        expect(thinkingTitle(l10n, stopped(atMost: Duration(milliseconds: each.key))), each.value);
      });
    }

    final Map<int, String> stream = <int, String>{
      400: 'Thought for 0 s',
      59000: 'Thought for 59 s',
      61000: 'Thought for 1 min 01 s',
    };

    for (final MapEntry<int, String> each in stream.entries) {
      test('${each.key} ms of the stream', () {
        expect(thinkingTitle(l10n, measured(Duration(milliseconds: each.key))), each.value);
      });
    }

    test('in Portuguese too', () {
      expect(
        thinkingTitle(pt, stopped(atMost: const Duration(seconds: 125))),
        'Pensou por até 2 min 05 s',
      );
      expect(thinkingTitle(pt, measured(const Duration(seconds: 61))), 'Pensou por 1 min 01 s');
    });
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
