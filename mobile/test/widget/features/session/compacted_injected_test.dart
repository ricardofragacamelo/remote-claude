/// The compaction's own "see summary", and what the agent injected, never a message bubble —
/// plan 27, F6 · B-21.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_lines.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('without a summary, the line is plain and folds nothing', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(const CompactedLine(line: CompactionLine(seq: 1, trigger: 'manual')));

    expect(find.text(l10n.sessionCompactedManual), findsOneWidget);
    expect(find.text(l10n.sessionCompactedSummary), findsNothing);
  });

  testWidgets('"see summary" opens the compaction summary in markdown', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const CompactedLine(
        line: CompactionLine(seq: 1, trigger: 'auto', summary: '# what changed'),
      ),
    );

    expect(find.text(l10n.sessionCompactedSummary), findsOneWidget);
    expect(find.text('what changed'), findsNothing);

    await tester.tap(find.text(l10n.sessionCompactedSummary));
    await tester.pumpAndSettle();

    expect(find.text('what changed'), findsOneWidget);
  });

  testWidgets('an injected skill body names it, "x loaded"', (WidgetTester tester) async {
    await tester.pumpApp(
      const InjectedRow(
        line: InjectedLine(messageId: 's1', injectedKind: 'instructions', name: 'pr-reviewer'),
      ),
    );

    expect(find.text(l10n.sessionInjectedInstructions('pr-reviewer')), findsOneWidget);
  });

  testWidgets('injected content of a kind this build has no specific line for reads generically', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const InjectedRow(
        line: InjectedLine(messageId: 's1', injectedKind: 'other'),
      ),
    );

    expect(find.text(l10n.sessionInjectedOther), findsOneWidget);
  });
}
