/// The quiet lines of the conversation that are not something said — a turn's own outcome, and how
/// the files went back after an undo.
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

  testWidgets('a rewind that left some files failed says so, alongside what it restored', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const RewoundRow(line: RewoundLine(seq: 1, restored: 2, kept: 1, failed: 1)),
    );

    expect(find.text(l10n.sessionRewoundFailed('2', '1', '1')), findsOneWidget);
  });

  testWidgets('a rewind with nothing failed says only what it restored and kept', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const RewoundRow(line: RewoundLine(seq: 1, restored: 2, kept: 1, failed: 0)),
    );

    expect(find.text(l10n.sessionRewoundSummary('2', '1')), findsOneWidget);
  });

  testWidgets('a partial replay says only what it still holds', (WidgetTester tester) async {
    await tester.pumpApp(const ReplayGapRow());

    expect(find.text(l10n.sessionReplayPartial), findsOneWidget);
  });
}
