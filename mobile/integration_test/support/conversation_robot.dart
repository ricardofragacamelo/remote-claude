/// Finding and opening a row of the conversation screen — shared by every integration test that
/// drives it, so the same gesture is written once (plan 26, B-29; plan 27, F8 · B-26).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/features/session/session.dart';

import 'e2e_environment.dart';
import 'session_robot.dart';
import 'signed_in_app.dart';

/// The fixture tag a prompt sent through the scripted backend replays, turned into the actual
/// prompt text — "a control of the fake and of nothing else" (the e2e playwright suite's own
/// phrase for the same tag, `e2e/fixtures/live-session.ts`).
String turnOf(String fixture) => 'do the work [fixture:$fixture]';

/// [target], inside the conversation on screen.
Finder inTheConversation(Finder target) =>
    find.descendant(of: find.byType(ConversationView), matching: target);

/// Opens the folded row whose own title is [rowLabel] — the one tap target of the whole line
/// (`FoldLine`'s `InkWell`), scrolled into view first.
Future<void> openFoldRow(WidgetTester tester, SessionRobot robot, Finder rowLabel) async {
  await robot.seeInConversation(inTheConversation(rowLabel));
  final Finder icon = find.descendant(
    of: find.ancestor(of: rowLabel, matching: find.byType(FoldLine)).first,
    matching: find.byIcon(Icons.expand_more),
  );
  await tester.tap(icon.first);
  await tester.pumpAndSettle();
}

/// How many turns [sessionId] has ended, as the app has it.
int turnsOf(SignedInApp app, String sessionId) =>
    app.conversationOf(sessionId).entries.whereType<TurnSummary>().length;

/// Leaves the live screen of [sessionId] for its history — the backend's own `historicalEvents`
/// rebuilds the screen from the transcript (plan 27, F5), never a second live recording.
Future<void> reopenFromHistory(WidgetTester tester, SignedInApp app, String sessionId) async {
  final ConversationKey key = app.conversationOf(sessionId).facts.conversation!;
  final String workspace = app.conversationOf(sessionId).facts.workspacePath!;
  app.container.read(routerProvider).go(conversationRouteFor(key, workspace));
  await pumpUntil(tester, () => find.byType(ConversationHistoryPage).evaluate().isNotEmpty);
  await tester.pumpAndSettle();
}
