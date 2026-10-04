/// How full the context window is: the ring on the bar, and the sheet with Compact (plan 10, B-14).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/insight_controllers.dart';
import 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart';
import 'package:remote_claude/features/session/presentation/widgets/context_ring.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_insight_repository.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;
  late FakeInsightRepository insight;
  late FakeSessionRepository sessions;
  late int compacts;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() {
    insight = FakeInsightRepository();
    sessions = FakeSessionRepository();
    compacts = 0;
  });

  tearDown(() => sessions.dispose());

  Future<void> pump(WidgetTester tester, {bool isCompacting = false}) => tester.pumpApp(
    Consumer(
      builder: (BuildContext context, WidgetRef ref, Widget? _) => ChoiceChipButton(
        choice: contextChoice(
          context,
          sessionId: 's-1',
          use: ref.watch(sessionContextControllerProvider('s-1')),
          onCompact: () => compacts += 1,
          isCompacting: isCompacting,
        ),
      ),
    ),
    overrides: <Override>[
      insightRepositoryProvider.overrideWithValue(insight as InsightRepository),
      sessionRepositoryProvider.overrideWithValue(sessions),
    ],
  );

  testWidgets('S-43 · the ring says how full the window is, named in full', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pump(tester);
    await tester.pumpAndSettle();

    final CircularProgressIndicator ring = tester.widget(find.byType(CircularProgressIndicator));
    expect(ring.value, 0.25);
    expect(
      find.bySemanticsLabel(
        l10n.composerChoice(l10n.contextLabel('25'), l10n.contextPercentage('25')),
      ),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('S-43 · the sheet: the window, the categories by name, and Compact', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(ChoiceChipButton));
    await tester.pumpAndSettle();

    expect(find.text(l10n.contextWindow('50,000', '200,000')), findsOneWidget);
    expect(find.text(l10n.contextMessages), findsOneWidget);
    // A category this build has no words for keeps the installation's name.
    expect(find.text('Something new'), findsOneWidget);
    expect(find.text(l10n.contextNear), findsNothing);

    await tester.tap(find.text(l10n.contextCompact));
    await tester.pumpAndSettle();
    expect(compacts, 1);
    expect(find.text(l10n.contextCompact), findsNothing);
  });

  testWidgets('S-43 · at the threshold the ring and the sheet warn', (WidgetTester tester) async {
    insight.context = const ContextUse(totalTokens: 170000, maxTokens: 200000, percentage: 85);
    await pump(tester);
    await tester.pumpAndSettle();

    final ThemeData theme = Theme.of(tester.element(find.byType(ChoiceChipButton)));
    final CircularProgressIndicator ring = tester.widget(find.byType(CircularProgressIndicator));
    expect(ring.color, theme.colorScheme.error);

    await tester.tap(find.byType(ChoiceChipButton));
    await tester.pumpAndSettle();
    expect(find.text(l10n.contextNear), findsOneWidget);
  });

  testWidgets('S-44 · while compacting, Compact cannot be asked again', (
    WidgetTester tester,
  ) async {
    await pump(tester, isCompacting: true);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(ChoiceChipButton));
    await tester.pumpAndSettle();

    expect(find.text(l10n.contextCompacting), findsOneWidget);
    await tester.tap(find.text(l10n.contextCompacting));
    expect(compacts, 0);
  });

  testWidgets('S-45 · a measure that could not be read: no ring, an icon in its place, and why', (
    WidgetTester tester,
  ) async {
    insight.contextFailure = const ServerFailure(
      code: 'CLAUDE_TIMEOUT',
      messageKey: 'session.error.claudeTimeout',
      traceId: 't',
    );
    await pump(tester);
    await tester.pumpAndSettle();

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byIcon(Icons.data_usage), findsOneWidget);

    await tester.tap(find.byType(ChoiceChipButton));
    await tester.pumpAndSettle();
    expect(find.textContaining(l10n.contextUnavailable), findsOneWidget);
    expect(find.textContaining(l10n.sessionErrorClaudeTimeout), findsOneWidget);

    insight.contextFailure = null;
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();
    expect(find.text(l10n.contextWindow('50,000', '200,000')), findsOneWidget);
  });

  testWidgets('while it is read, the place of the ring waits', (WidgetTester tester) async {
    insight.gate = Completer<void>();
    await pump(tester);

    expect(find.byIcon(Icons.hourglass_empty), findsOneWidget);
    await tester.tap(find.byType(ChoiceChipButton));
    await tester.pumpAndSettle();
    expect(find.text(l10n.contextLoading), findsWidgets);

    insight.gate!.complete();
    await tester.pumpAndSettle();
  });

  test('every category the CLI names has a name here', () async {
    final AppLocalizations en = await englishCatalogue();
    expect(
      <String>[
        'systemPrompt',
        'systemTools',
        'mcpTools',
        'messages',
        'memoryFiles',
        'skills',
        'freeSpace',
        'autocompactBuffer',
        'buffer',
      ].map((String id) => categoryName(en, ContextCategory(id: id, name: id, tokens: 0))).toSet(),
      hasLength(8),
    );
  });
}
