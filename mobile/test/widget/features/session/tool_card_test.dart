/// One tool, running on somebody's own machine.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

ToolExecution tool({ToolStatus status = ToolStatus.running, String output = '', String? summary}) =>
    ToolExecution(
      toolUseId: 't1',
      toolName: 'Bash',
      input: const <String, Object?>{'command': 'rm -rf /tmp/scratch'},
      status: status,
      output: output,
      summary: summary,
    );

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('shows the exact command, never a summary of it', (WidgetTester tester) async {
    await tester.pumpApp(ToolCard(tool: tool()));

    // The whole proposition of the product: a card that paraphrased the command would be asking
    // for trust it has not earned.
    expect(find.textContaining('rm -rf /tmp/scratch'), findsOneWidget);
  });

  testWidgets('shows what the tool printed, once it has printed anything', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(ToolCard(tool: tool()));
    expect(find.text(l10n.sessionToolOutputLabel), findsNothing);

    await tester.pumpApp(ToolCard(tool: tool(output: 'two files removed')));

    expect(find.text(l10n.sessionToolOutputLabel), findsOneWidget);
    expect(find.text('two files removed'), findsOneWidget);
  });

  testWidgets('shows the summary when the outcome carried one', (WidgetTester tester) async {
    await tester.pumpApp(
      ToolCard(
        tool: tool(status: ToolStatus.succeeded, summary: 'removed 2 files'),
      ),
    );

    expect(find.text('removed 2 files'), findsOneWidget);
  });

  testWidgets('names each outcome the contract carries', (WidgetTester tester) async {
    final Map<ToolStatus, String> expected = <ToolStatus, String>{
      ToolStatus.running: l10n.sessionToolStatusRunning,
      ToolStatus.succeeded: l10n.sessionToolStatusSucceeded,
      ToolStatus.failed: l10n.sessionToolStatusFailed,
      ToolStatus.denied: l10n.sessionToolStatusDenied,
    };

    for (final MapEntry<ToolStatus, String> entry in expected.entries) {
      await tester.pumpApp(ToolCard(tool: tool(status: entry.key)));

      expect(find.text(entry.value), findsOneWidget, reason: entry.key.name);
    }
  });
}
