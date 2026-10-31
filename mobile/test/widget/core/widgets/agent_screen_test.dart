/// `AgentPage`: the one screen an engine extension may add, and its empty shell before one does
/// (plan 28, D-15).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/agent_screen.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async => l10n = await englishCatalogue());

  tearDown(() => agentScreenBody = null);

  testWidgets('says nothing of its own is there yet, before any engine registers a screen', (
    WidgetTester tester,
  ) async {
    agentScreenBody = null;
    await tester.pumpApp(const AgentPage());

    expect(find.text(l10n.agentScreenEmptyTitle), findsOneWidget);
    expect(find.text(l10n.agentScreenEmptyBody), findsOneWidget);
  });

  testWidgets('renders whatever the registered engine put in the slot', (
    WidgetTester tester,
  ) async {
    agentScreenBody = (BuildContext context) => const Text('the engine’s own screen');
    await tester.pumpApp(const AgentPage());

    expect(find.text('the engine’s own screen'), findsOneWidget);
    expect(find.text(l10n.agentScreenEmptyTitle), findsNothing);
  });
}
